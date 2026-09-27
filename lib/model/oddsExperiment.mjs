/**
 * Eksperyment: typy modelu przy kursie ≥ 1,50 — historycznie, na archiwach football-data.
 *
 * PYTANIE. Czy zakładka „typy powyżej 1,50" miałaby sens? Tryb cienia (`oddsShadow.js`)
 * odpowie na żywych danych za kilka tygodni; archiwa pozwalają zapytać od razu, na kilku
 * tysiącach meczów z 11 lig.
 *
 * PROTOKÓŁ. Chronologicznie, jak produkcja: Dixon-Coles per liga przeliczany co `--refit-days`
 * wyłącznie na meczach rozegranych wcześniej; plakietka z tego samego progu polityki
 * (`hintFromMarkets` = gałąź modelu z `evaluateMarkets`); obie drużyny z co najmniej
 * `MIN_PLAYED` meczami w sezonie. Zakład wybiera się po kursie OTWARCIA średniej rynku
 * (football-data zbiera go w piątek na weekend i we wtorek na środek tygodnia — tyle, ile
 * widziałby czytelnik zakładki rano). Rozliczenie po tym samym kursie, a obok: Bet365,
 * zamknięcie Pinnacle, polski podatek 12% i CLV (otwarcie wobec zamknięcia średniej).
 *
 * CZEGO TU NIE MA. „Powyżej 2,5 gola" wymaga kalibracji cechami drużyn — archiwum nie odtworzy
 * jej bez przecieku, więc ten rynek mierzy dopiero tryb cienia. „Drużyna strzeli" nie ma
 * kursów w archiwum. Podwójna szansa ma kursy SZACOWANE z 1X2 (`doubleChanceFrom1x2`).
 *
 * URUCHOMIENIE (bez klucza API i bez bazy; ~60 plików CSV, buforowane):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/oddsExperiment.mjs
 *   --seasons=2021,2022,2023,2024,2025,2026  --test-start=2023-07-01  --refit-days=14
 *   --leagues=39,140  --min-odds=1.5  --cache=<katalog na CSV>
 *
 * TO JEST NARZĘDZIE POMIARU. Nic stąd nie trafia do produkcji, promptów ani interfejsu.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const { fitRatings, expectedGoals } = await import('@/lib/model/ratings');
const { predictMarkets } = await import('@/lib/model/dixonColes');
const { MIN_PLAYED } = await import('@/lib/picks/policy');
const { parseCsv, parseDate, FOOTBALL_DATA_CODES, footballDataUrl } = await import('./marketData.mjs');
const { RULES, betFor, summarize, hintFromMarkets, doubleChanceFrom1x2, PL_TAX } = await import('@/lib/model/oddsShadow');

/* ---------------------------------------------------------------- parametry */

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}

const SEASONS = String(arg('seasons', '2021,2022,2023,2024,2025,2026'))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const TEST_START = new Date(`${arg('test-start', '2023-07-01')}T00:00:00Z`).getTime();
const REFIT_DAYS = Number(arg('refit-days', 14));
const MIN_ODDS = Number(arg('min-odds', 1.5));
const LEAGUES = String(arg('leagues', ''))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const CACHE_DIR = arg('cache', path.join(os.tmpdir(), 'czat-football-data'));

/** Minimalna liczba meczów ligi przed pierwszym dopasowaniem — jak w `goalsExperiment.mjs`. */
const MIN_LEAGUE_MATCHES = 120;

const ligi = (LEAGUES.length ? LEAGUES : [...FOOTBALL_DATA_CODES.keys()]).filter((id) => FOOTBALL_DATA_CODES.has(id));

/* ---------------------------------------------------------------- dane */

async function pobierz(url) {
	await fs.mkdir(CACHE_DIR, { recursive: true });
	const plik = path.join(CACHE_DIR, url.split('/').slice(-2).join('_'));
	try {
		return await fs.readFile(plik, 'utf8');
	} catch {
		/* brak w buforze — pobieramy */
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const text = await res.text();
	await fs.writeFile(plik, text);
	return text;
}

const liczba = (v) => {
	const n = Number(String(v ?? '').trim());
	return Number.isFinite(n) ? n : null;
};
const kurs = (v) => {
	const n = liczba(v);
	return n !== null && n > 1 ? n : null;
};

/** Trójka 1X2 z kolumn o danym przedrostku, z podwójną szansą szacowaną z niej. */
function zestaw(row, h, d, a) {
	const home = kurs(row[h]);
	const draw = kurs(row[d]);
	const away = kurs(row[a]);
	if (!home || !draw || !away) return null;
	return { home, draw, away, ...doubleChanceFrom1x2({ home, draw, away }) };
}

function wierszNaMecz(row, leagueId, season) {
	const date = parseDate(row.Date);
	const hg = liczba(row.FTHG);
	const ag = liczba(row.FTAG);
	if (!date || !row.HomeTeam || !row.AwayTeam || hg === null || ag === null) return null;
	return {
		leagueId,
		season,
		date,
		t: new Date(`${date}T12:00:00Z`).getTime(),
		home: row.HomeTeam.trim(),
		away: row.AwayTeam.trim(),
		hg,
		ag,
		kursy: {
			avgOpen: zestaw(row, 'AvgH', 'AvgD', 'AvgA'),
			avgClose: zestaw(row, 'AvgCH', 'AvgCD', 'AvgCA'),
			b365Open: zestaw(row, 'B365H', 'B365D', 'B365A'),
			pinClose: zestaw(row, 'PSCH', 'PSCD', 'PSCA'),
		},
	};
}

async function wczytaj() {
	const mecze = [];
	const bledy = [];
	for (const leagueId of ligi) {
		for (const season of SEASONS) {
			const url = footballDataUrl(leagueId, season);
			try {
				for (const row of parseCsv(await pobierz(url))) {
					const m = wierszNaMecz(row, leagueId, season);
					if (m) mecze.push(m);
				}
			} catch (error) {
				bledy.push(`${url}: ${error.message}`);
			}
		}
	}
	mecze.sort((a, b) => a.t - b.t || a.leagueId - b.leagueId);
	return { mecze, bledy };
}

/* ---------------------------------------------------------------- przebieg */

const { mecze, bledy } = await wczytaj();
console.log(`Mecze: ${mecze.length} z ${ligi.length} lig, sezony ${SEASONS.join(', ')}.`);
for (const b of bledy) console.log(`  pominięto: ${b}`);

const ligaMecze = new Map();
const modele = new Map();
const rozegrane = new Map(); // `${leagueId}:${season}:${druzyna}` -> liczba meczów

function modelLigi(leagueId, kiedy) {
	const wpis = modele.get(leagueId);
	if (wpis && kiedy < wpis.waznyDo) return wpis.model;
	const waznyDo = kiedy + REFIT_DAYS * 86_400_000;
	const dane = (ligaMecze.get(leagueId) || []).filter((x) => x.t < kiedy);
	const model =
		dane.length < MIN_LEAGUE_MATCHES
			? null
			: fitRatings(
					dane.map((x) => ({ homeId: x.home, awayId: x.away, homeGoals: x.hg, awayGoals: x.ag, date: x.date })),
					{ referenceDate: new Date(kiedy) }
				);
	modele.set(leagueId, { model, waznyDo });
	return model;
}

const rekordy = [];
for (const m of mecze) {
	const kh = `${m.leagueId}:${m.season}:${m.home}`;
	const ka = `${m.leagueId}:${m.season}:${m.away}`;
	if (m.t >= TEST_START && m.kursy.avgOpen) {
		const model = modelLigi(m.leagueId, m.t);
		const eg = model ? expectedGoals(model, m.home, m.away) : null;
		if (eg?.known && (rozegrane.get(kh) ?? 0) >= MIN_PLAYED && (rozegrane.get(ka) ?? 0) >= MIN_PLAYED) {
			const r = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);
			const markets = {
				home: r.matchWinner.home,
				draw: r.matchWinner.draw,
				away: r.matchWinner.away,
				dc1X: r.doubleChance['1X'],
				dcX2: r.doubleChance.X2,
				homeScores: r.teamGoals.home[0.5].over,
				awayScores: r.teamGoals.away[0.5].over,
				over25: null,
			};
			rekordy.push({
				m,
				markets,
				hint: hintFromMarkets(markets),
				odds: { open: m.kursy.avgOpen, close: m.kursy.avgClose },
				result: { home: m.hg, away: m.ag },
			});
		}
	}
	// Dopiero teraz mecz trafia do historii — prognoza powyżej nie mogła go widzieć.
	ligaMecze.set(m.leagueId, [...(ligaMecze.get(m.leagueId) || []), m]);
	rozegrane.set(kh, (rozegrane.get(kh) ?? 0) + 1);
	rozegrane.set(ka, (rozegrane.get(ka) ?? 0) + 1);
}

/* ---------------------------------------------------------------- raport */

const pct = (x, n = 1) => (x === null || x === undefined || Number.isNaN(x) ? '  —  ' : `${(100 * x).toFixed(n)}%`);
const znak = (x) => (x === null || x === undefined ? '  —  ' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`);

console.log(
	`\nZbiór testowy od ${new Date(TEST_START).toISOString().slice(0, 10)}: ${rekordy.length} meczów z prognozą i kursami` +
		` (${rekordy.filter((r) => r.hint).length} z plakietką modelu). Próg kursu: ${MIN_ODDS}.`
);
console.log(`Zwrot = średni zysk na zakład o stawce 1; „po podatku" = wygrana × ${1 - PL_TAX} (12% od stawki w Polsce).`);

/** Zakłady reguły z kursami alternatywnymi tego samego meczu i selekcji. */
function zaklady(rule, zbior = rekordy) {
	const out = [];
	for (const r of zbior) {
		const b = betFor(r, rule, { minOdds: MIN_ODDS });
		if (!b) continue;
		out.push({
			...b,
			season: r.m.season,
			b365: r.m.kursy.b365Open?.[b.selection] ?? null,
			pin: r.m.kursy.pinClose?.[b.selection] ?? null,
		});
	}
	return out;
}

const werdykty = {};
for (const [rule, { label }] of Object.entries(RULES)) {
	const bets = zaklady(rule);
	const s = summarize(bets);
	console.log(`\n=== ${label} ===`);
	if (!s.n) {
		console.log('  brak zakładów');
		continue;
	}
	const b365 = summarize(bets.filter((b) => b.b365).map((b) => ({ ...b, odds: b.b365, closeOdds: null })));
	const pin = summarize(bets.filter((b) => b.pin).map((b) => ({ ...b, odds: b.pin, closeOdds: null })));
	const przedzial = s.roiSe ? `±${(196 * s.roiSe).toFixed(1)} pkt (95%)` : '';
	console.log(
		`  zakładów ${s.n}, średni kurs ${s.avgOdds.toFixed(2)} | model obiecywał ${pct(s.promised)}, ` +
			`trafione ${pct(s.hitRate)}, próg opłacalności (1/kurs) ${pct(s.implied)}`
	);
	console.log(
		`  zwrot: średnia rynku ${znak(s.roi)} ${przedzial} | po podatku PL ${znak(s.roiTaxed)} | ` +
			`Bet365 ${znak(b365.roi)} | zamknięcie Pinnacle ${znak(pin.roi)}`
	);
	console.log(`  CLV: kurs spadał do zamknięcia w ${pct(s.clvShare)} zakładów, średnio ${znak(s.clv)} (n=${s.clvN})`);

	const sezony = [...new Set(bets.map((b) => b.season))].sort();
	console.log(
		'  po sezonach: ' +
			sezony
				.map((sez) => {
					const x = summarize(bets.filter((b) => b.season === sez));
					return `${sez}/${String(sez + 1).slice(-2)} n=${x.n} traf. ${pct(x.hitRate, 0)} zwrot ${znak(x.roi)}`;
				})
				.join(' · ')
	);
	if (rule === 'hint' || rule === 'edge10') {
		const sel = [...new Set(bets.map((b) => b.selection))];
		console.log(
			'  po selekcjach: ' +
				sel
					.map((k) => {
						const x = summarize(bets.filter((b) => b.selection === k));
						return `${k} n=${x.n} obiecane ${pct(x.promised, 0)} traf. ${pct(x.hitRate, 0)} zwrot ${znak(x.roi)}`;
					})
					.join(' · ')
		);
	}
	werdykty[rule] = s;
}

// Dla porównania: plakietki modelu bez progu kursu — to, co już dziś pokazujemy.
const bezProgu = summarize(rekordy.map((r) => betFor(r, 'hint', { minOdds: 1.0001 })).filter(Boolean));
console.log(
	`\nOdniesienie — wszystkie plakietki bez progu kursu: n=${bezProgu.n}, obiecane ${pct(bezProgu.promised)}, ` +
		`trafione ${pct(bezProgu.hitRate)}, zwrot ${znak(bezProgu.roi)}, po podatku ${znak(bezProgu.roiTaxed)}`
);

const h = werdykty.hint;
if (h?.n) {
	const plus = h.roi - 1.96 * (h.roiSe ?? 0) > 0;
	const minus = h.roi + 1.96 * (h.roiSe ?? 0) < 0;
	console.log(
		`\nWERDYKT (plakietka, kurs ≥ ${MIN_ODDS}): ` +
			(plus ? 'zwrot istotnie DODATNI.' : minus ? 'zwrot istotnie UJEMNY.' : 'zwrot nieodróżnialny od zera przy tej próbie.') +
			` Trafność ${pct(h.hitRate)} wobec obietnicy ${pct(h.promised)}.`
	);
}
