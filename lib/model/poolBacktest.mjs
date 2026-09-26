/**
 * Backtest pul łączonych (`pools.js`) — puchary europejskie i reprezentacje.
 *
 * PYTANIE. Czy model sił drużyn liczony na wspólnej puli (liga + puchary, albo wszystkie
 * rozgrywki reprezentacji) przewiduje mecze pucharowe i reprezentacyjne lepiej niż zwykłe
 * częstości? Dla pojedynczych rozgrywek odpowiedź była „nie" (Liga Mistrzów 1,0859 wobec
 * 1,0205) i dlatego te rozgrywki były wyłączone.
 *
 * PROTOKÓŁ jak w `backtest.mjs`: chronologicznie, model przeliczany co `--refit-days` na
 * meczach rozegranych WCZEŚNIEJ, ocena na meczach po `--split`. Te same funkcje co produkcja
 * (`rowsToPoolMatches`, `fitPoolModel`, `poolModelView`, polityka typów). Częstości 1X2
 * liczone z meczów tych samych rozgrywek sprzed daty prognozy.
 *
 * KOSZT. Odpowiedzi dostawcy trafiają do katalogu `--cache`, więc powtórny przebieg jest
 * darmowy. Pierwszy: `europe` ~50 zapytań, `international` ~45.
 *
 * URUCHOMIENIE (na serwerze):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/poolBacktest.mjs --pool=europe
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/poolBacktest.mjs --pool=international
 *   opcje: --split=2025-07-01  --refit-days=14  --cache=/tmp/pool-cache
 *
 * Kod wyjścia 0, gdy model bije częstości istotnie (t > 2) na całości; 2 w przeciwnym razie.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

dotenv.config({ path: '.env.local' });

const { footballRequest } = await import('@/lib/football/client');
const { POOLS, rowsToPoolMatches, fitPoolModel, poolModelView } = await import('@/lib/model/pools');
const { expectedGoals } = await import('@/lib/model/ratings');
const { predictMarkets } = await import('@/lib/model/dixonColes');
const { meetsPolicy, liftFor } = await import('@/lib/picks/policy');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');
const { MAX_PROBABILITY } = await import('@/lib/reports/service');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}
const POOL = POOLS[arg('pool', 'europe')];
if (!POOL) {
	console.error('Nieznana pula. Użyj --pool=europe albo --pool=international.');
	process.exit(1);
}
const SPLIT = new Date(`${arg('split', '2025-07-01')}T00:00:00Z`).getTime();
const REFIT_DAYS = Number(arg('refit-days', 14));
const CACHE_DIR = arg('cache', path.join(os.tmpdir(), 'czat-pool-cache'));

/* ---------------------------------------------------------------- dane (cache na dysku) */

let zapytan = 0;
async function zapytaj(endpoint, params) {
	await fs.mkdir(CACHE_DIR, { recursive: true });
	const plik = path.join(CACHE_DIR, `${endpoint.replace(/\//g, '_')}_${Object.entries(params).map(([k, v]) => `${k}-${v}`).join('_')}.json`);
	try {
		return JSON.parse(await fs.readFile(plik, 'utf8'));
	} catch {
		/* brak w cache */
	}
	// Limit minutowy dostawcy (plan darmowy: kilka zapytań na minutę) — czekamy i ponawiamy.
	let dane;
	for (let proba = 0; ; proba += 1) {
		try {
			dane = await footballRequest(endpoint, params);
			break;
		} catch (error) {
			if (error.status !== 429 || proba >= 3) throw error;
			await new Promise((r) => setTimeout(r, 61_000));
		}
	}
	zapytan += 1;
	await fs.writeFile(plik, JSON.stringify(dane));
	return dane;
}

async function sezony(leagueId) {
	if (POOL.id === 'europe') return [2024, 2025];
	const opis = (await zapytaj('leagues', { id: leagueId }))?.[0];
	return (opis?.seasons || []).map((s) => Number(s.year)).filter((y) => y >= 2020 && y <= 2026);
}

// Rozgrywki oceniane: `predicts`; pobieramy też te, których pula nie uczy się (puchary krajowe).
const doPobrania = [...new Set([...POOL.fit, ...POOL.predicts])];
const fitSet = new Set(POOL.fit);
const wszystkie = [];
const ocenianeSurowe = [];
for (const leagueId of doPobrania) {
	for (const s of await sezony(leagueId)) {
		let rows;
		try {
			rows = await zapytaj('fixtures', { league: leagueId, season: s });
		} catch (error) {
			console.log(`  pominięto ${leagueId}/${s}: ${error.message}`);
			continue;
		}
		const mecze = rowsToPoolMatches(POOL, leagueId, rows);
		if (fitSet.has(leagueId)) wszystkie.push(...mecze);
		if (POOL.predicts.has(leagueId)) ocenianeSurowe.push(...mecze);
	}
}
const unikalne = (lista) => {
	const seen = new Set();
	return lista.filter((m) => (seen.has(m.fixtureId) ? false : (seen.add(m.fixtureId), true))).sort((a, b) => a.t - b.t);
};
const pula = unikalne(wszystkie);
const oceniane = unikalne(ocenianeSurowe).filter((m) => m.t >= SPLIT);
console.log(`Pula ${POOL.id}: ${pula.length} meczów do nauki, ${oceniane.length} do oceny po ${new Date(SPLIT).toISOString().slice(0, 10)}. Nowych zapytań: ${zapytan}.`);

/* ---------------------------------------------------------------- przebieg */

const wynik = (m) => (m.homeGoals > m.awayGoals ? 'home' : m.homeGoals < m.awayGoals ? 'away' : 'draw');
const ll = (p, w) => -Math.log(Math.max(1e-9, p[w]));
const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f = (x, n = 4) => (x === null || x === undefined || Number.isNaN(x) ? '   —  ' : x.toFixed(n));
function tStat(d) {
	if (d.length < 2) return null;
	const m = srednia(d);
	const v = d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1);
	return v > 0 ? m / Math.sqrt(v / d.length) : null;
}

let model = null;
let waznyDo = 0;
const WYBIERZ = {
	home: (r) => r.matchWinner.home,
	away: (r) => r.matchWinner.away,
	'1X': (r) => r.doubleChance['1X'],
	X2: (r) => r.doubleChance.X2,
	homeScores: (r) => r.teamGoals.home[0.5].over,
	awayScores: (r) => r.teamGoals.away[0.5].over,
};
const ZASZLO = {
	home: (m) => m.homeGoals > m.awayGoals,
	away: (m) => m.awayGoals > m.homeGoals,
	'1X': (m) => m.homeGoals >= m.awayGoals,
	X2: (m) => m.awayGoals >= m.homeGoals,
	homeScores: (m) => m.homeGoals > 0,
	awayScores: (m) => m.awayGoals > 0,
};

const wiersze = [];
let bezPrognozy = 0;
for (const m of oceniane) {
	if (m.t >= waznyDo) {
		model = fitPoolModel(POOL, pula, { referenceDate: new Date(m.t) });
		waznyDo = m.t + REFIT_DAYS * 86_400_000;
	}
	const widok = poolModelView(POOL, m.leagueId, model);
	const eg = widok ? expectedGoals(widok, m.homeId, m.awayId) : null;
	if (!eg?.known) {
		bezPrognozy += 1;
		continue;
	}
	const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, widok.rho);
	// Częstości z meczów TYCH SAMYCH rozgrywek sprzed tej daty (min. 30), inaczej z całej puli.
	const przed = ocenianeSurowe.filter((x) => x.leagueId === m.leagueId && x.t < m.t);
	const baza = przed.length >= 30 ? przed : pula.filter((x) => x.t < m.t).slice(-2000);
	const cz = { home: 0, draw: 0, away: 0 };
	for (const x of baza) cz[wynik(x)] += 1;
	const n = baza.length || 1;
	const freq = { home: cz.home / n, draw: cz.draw / n, away: cz.away / n };

	// Typy po polityce — dokładnie jak w produkcji (norma z tabeli, próg, sufit 92%).
	const typy = [];
	for (const [klucz, wybierz] of Object.entries(WYBIERZ)) {
		const p = Math.round(100 * wybierz(rynki));
		if (p > MAX_PROBABILITY) continue;
		const normalized = SELECTION_SHAPES[klucz].normalized;
		if (!meetsPolicy(normalized, p).ok) continue;
		const { base, lift } = liftFor(normalized, p);
		typy.push({ klucz, p, base, lift, trafil: ZASZLO[klucz](m) ? 1 : 0 });
	}
	typy.sort((a, b) => b.lift - a.lift);

	wiersze.push({
		leagueId: m.leagueId,
		w: wynik(m),
		llModel: ll(rynki.matchWinner, wynik(m)),
		llFreq: ll(freq, wynik(m)),
		typ: typy[0] || null,
	});
}

const pokrycie = oceniane.length ? wiersze.length / oceniane.length : 0;
console.log(`Prognoz: ${wiersze.length} (${(100 * pokrycie).toFixed(0)}% meczów), bez prognozy (drużyna nieznana puli): ${bezPrognozy}.`);
if (!wiersze.length) process.exit(2);

console.log('\n=== 1X2: log loss (mniej = lepiej) ===');
console.log('rozgrywki       n     model     częstości   różnica    t');
const grupy = new Map([['RAZEM', wiersze]]);
for (const w of wiersze) grupy.set(w.leagueId, [...(grupy.get(w.leagueId) || []), w]);
let sukces = false;
for (const [nazwa, lista] of grupy) {
	if (lista.length < 15 && nazwa !== 'RAZEM') continue;
	const lm = srednia(lista.map((x) => x.llModel));
	const lf = srednia(lista.map((x) => x.llFreq));
	const t = tStat(lista.map((x) => x.llFreq - x.llModel));
	if (nazwa === 'RAZEM' && t !== null && t > 2) sukces = true;
	console.log(`${String(nazwa).padEnd(12)} ${String(lista.length).padStart(5)}   ${f(lm)}    ${f(lf)}    ${f(lf - lm)}   ${t === null ? '—' : f(t, 2)}`);
}

console.log('\n=== Typy po polityce (najlepszy na mecz, jak plakietka) ===');
const typy = wiersze.map((w) => w.typ).filter(Boolean);
if (!typy.length) {
	console.log('  brak typów przechodzących próg');
} else {
	const wg = new Map();
	for (const t of typy) wg.set(t.klucz, [...(wg.get(t.klucz) || []), t]);
	for (const [klucz, lista] of [...wg.entries()].sort((a, b) => b[1].length - a[1].length)) {
		console.log(`  ${klucz.padEnd(11)} n=${String(lista.length).padStart(4)}  obiecane ${f(srednia(lista.map((x) => x.p / 100)), 3)}  trafiło ${f(srednia(lista.map((x) => x.trafil)), 3)}  norma ${f(srednia(lista.map((x) => x.base / 100)), 3)}`);
	}
	console.log(`  razem       n=${String(typy.length).padStart(4)}  obiecane ${f(srednia(typy.map((x) => x.p / 100)), 3)}  trafiło ${f(srednia(typy.map((x) => x.trafil)), 3)}  norma ${f(srednia(typy.map((x) => x.base / 100)), 3)}`);
}

console.log(
	sukces
		? '\nWERDYKT: pula bije częstości istotnie — prognozy dla tych rozgrywek mają pokrycie.'
		: '\nWERDYKT: brak istotnej przewagi nad częstościami — pulę trzeba wyłączyć albo poprawić.'
);
process.exit(sukces ? 0 : 2);
