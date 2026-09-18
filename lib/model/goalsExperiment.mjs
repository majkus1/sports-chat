/**
 * Eksperyment: czy cechy „pod gole" ratują rynki sumy goli i BTTS?
 *
 * PYTANIE. Backtest (`backtest.mjs`) pokazał, że Dixon-Coles przegrywa ze stałą w „powyżej
 * 2,5 gola" i „obie strzelą" — model dobrze rozdziela, KTO jest lepszy, ale nie ILE padnie
 * goli. Zanim zapłacimy zapytaniami do API-Football po statystyki meczów wszystkich lig,
 * sprawdzamy ZA DARMO na 11 ligach z football-data.co.uk (te same archiwa, z których
 * bierzemy kursy zamknięcia), czy strzały, strzały celne i tempo drużyn w ogóle pomagają.
 *
 * DANE. Wyłącznie CSV z football-data.co.uk: wynik, strzały (HS/AS), strzały celne
 * (HST/AST), rożne (HC/AC) i kursy zamknięcia „2,5 gola" (Pinnacle). Bez klucza API, bez
 * bazy. Identyfikator drużyny to jej nazwa w archiwum — spójna między sezonami i ligami,
 * więc historia spadkowicza idzie za nim do niższej ligi.
 *
 * PROTOKÓŁ. Chronologicznie, jak produkcja: każda cecha meczu liczona WYŁĄCZNIE z meczów
 * rozegranych wcześniej; Dixon-Coles per liga przeliczany co `--refit-days`; regresja
 * logistyczna przeliczana co `--lr-refit-days` na wszystkich wcześniejszych meczach.
 * Ocena na meczach od `--test-start`. Wszystkie warianty oceniane na TYM SAMYM zbiorze:
 * obie drużyny z co najmniej `MIN_HIST` meczami historii i działającym modelem ligi.
 *
 * WARIANTY (osobno dla „powyżej 2,5" i „obie strzelą"):
 *   A  stała: częstość w lidze z ostatnich ~380 meczów             (to, co dziś bije DC)
 *   B  Dixon-Coles surowy                                          (to, co dziś liczymy)
 *   C  regresja na [stała, DC]                                     (DC tylko skalibrowany)
 *   D  C + średnie gole strzelone/stracone obu drużyn z ostatnich 10 meczów
 *   E  D + strzały i strzały celne (za i przeciw) z ostatnich 10 meczów — pełny wariant
 *   M  rynek: kurs zamknięcia Pinnacle po zdjęciu marży (tylko „2,5"; sufit, nie cel)
 *
 * MIARY. Brier i log loss (mniej = lepiej), statystyka t sparowanej różnicy Briera wobec
 * stałej, kalibracja w kubełkach dla wariantu E oraz „widok produktu": ile typów wystawiłaby
 * polityka (`MIN_PROBABILITY`, `MIN_LIFT` wobec stałej) i jaka byłaby ich trafność.
 *
 * URUCHOMIENIE (bez klucza API, ~1 min, ~60 plików CSV z internetu, buforowane):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/goalsExperiment.mjs
 *   --seasons=2021,2022,2023,2024,2025,2026  --test-start=2024-07-01
 *   --refit-days=14  --lr-refit-days=30  --leagues=39,140  --cache=<katalog na CSV>
 *   --emit=lib/model/goalsCalibrationData.js zapisz regresje „powyżej 2,5" (warianty D i E)
 *                                            douczone na WSZYSTKICH meczach — do produkcji
 *
 * Cechy, regresja i jej zastosowanie są w `goalsCalibration.js` — tym samym pliku, którego
 * używa produkcja. Eksperyment nie ma prawa liczyć cech inaczej niż `lib/model/goals.js`.
 *
 * Kod wyjścia 0, gdy wariant E bije stałą istotnie (t > 2) w KTÓRYMŚ z rynków; 2 w przeciwnym razie.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const { fitRatings, expectedGoals } = await import('@/lib/model/ratings');
const { predictMarkets } = await import('@/lib/model/dixonColes');
const { MIN_PROBABILITY, MIN_LIFT } = await import('@/lib/picks/policy');
const { parseCsv, parseDate, closingOdds, demargin, FOOTBALL_DATA_CODES, footballDataUrl } = await import(
	'./marketData.mjs'
);
const {
	MIN_HIST, LEAGUE_WINDOW, MIN_LEAGUE_SAMPLE, FEATURE_NAMES,
	teamProfile, leagueReference, featureVector, fitLogistic, applyCalibration, logit,
} = await import('@/lib/model/goalsCalibration');

/* ---------------------------------------------------------------- parametry */

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}

const SEASONS = String(arg('seasons', '2021,2022,2023,2024,2025,2026'))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const TEST_START = new Date(`${arg('test-start', '2024-07-01')}T00:00:00Z`).getTime();
const REFIT_DAYS = Number(arg('refit-days', 14));
const LR_REFIT_DAYS = Number(arg('lr-refit-days', 30));
const LEAGUES = String(arg('leagues', ''))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const CACHE_DIR = arg('cache', path.join(os.tmpdir(), 'czat-football-data'));
const EMIT = arg('emit', '');

/** Minimalna liczba meczów ligi przed pierwszym dopasowaniem Dixona-Colesa. */
const MIN_LEAGUE_MATCHES = 120;

const ligi = (LEAGUES.length ? LEAGUES : [...FOOTBALL_DATA_CODES.keys()]).filter((id) =>
	FOOTBALL_DATA_CODES.has(id)
);

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

function wierszNaMecz(row, leagueId, season) {
	const date = parseDate(row.Date);
	const hg = liczba(row.FTHG);
	const ag = liczba(row.FTAG);
	if (!date || !row.HomeTeam || !row.AwayTeam || hg === null || ag === null) return null;
	const odds = closingOdds(row);
	const o25 = odds?.over25 ? demargin([odds.over25.over, odds.over25.under]) : null;
	return {
		leagueId,
		season,
		date,
		t: new Date(`${date}T12:00:00Z`).getTime(),
		home: row.HomeTeam.trim(),
		away: row.AwayTeam.trim(),
		hg,
		ag,
		hs: liczba(row.HS),
		as: liczba(row.AS),
		hst: liczba(row.HST),
		ast: liczba(row.AST),
		over25: hg + ag > 2.5 ? 1 : 0,
		btts: hg > 0 && ag > 0 ? 1 : 0,
		marketOver25: o25 ? o25[0] : null,
	};
}

async function wczytaj() {
	const mecze = [];
	const bledy = [];
	for (const leagueId of ligi) {
		for (const season of SEASONS) {
			const url = footballDataUrl(leagueId, season);
			try {
				const rows = parseCsv(await pobierz(url));
				for (const row of rows) {
					const m = wierszNaMecz(row, leagueId, season);
					if (m) mecze.push(m);
				}
			} catch (error) {
				bledy.push(`${url}: ${error.message}`);
			}
		}
	}
	// Chronologicznie; w obrębie dnia kolejność nie ma znaczenia dla cech (liczymy z dni < t).
	mecze.sort((a, b) => a.t - b.t || a.leagueId - b.leagueId);
	return { mecze, bledy };
}

/* ---------------------------------------------------------------- cechy */

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Wektory cech dla wariantów C, D, E — D i E to DOKŁADNIE `goals` i `shots` z produkcji
 * (`featureVector`), C to ich pierwsze dwie składowe (stała i DC). BTTS używa tych samych
 * cech z własną stałą i własnym logitem DC; to porównanie, nie kandydat do produkcji.
 */
function cechy(league, dcP, h, a) {
	const e = featureVector('shots', { league: { ...league }, dcOver: dcP, home: h, away: a });
	const d = featureVector('goals', { league: { ...league }, dcOver: dcP, home: h, away: a });
	return { C: e.slice(0, 2), D: d, E: e };
}

/* ---------------------------------------------------------------- regresja logistyczna */

/** Regresja z `goalsCalibration.js`; zwraca predyktor albo `null` przy zbyt małej próbie. */
function uczRegresje(X, y) {
	const params = fitLogistic(X, y);
	return params ? (x) => applyCalibration(params, x) : null;
}

/* ---------------------------------------------------------------- miary */

const brier = (p, y) => (p - y) ** 2;
const logLoss = (p, y) => {
	const q = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
	return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
};
const f = (x, n = 4) => (x === null || x === undefined || Number.isNaN(x) ? '   —  ' : x.toFixed(n));

function tStat(diffs) {
	const n = diffs.length;
	if (n < 2) return null;
	const m = srednia(diffs);
	const v = diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1);
	return v > 0 ? m / Math.sqrt(v / n) : null;
}

/* ---------------------------------------------------------------- przebieg */

const { mecze, bledy } = await wczytaj();
console.log(`Mecze: ${mecze.length} z ${ligi.length} lig, sezony ${SEASONS.join(', ')}.`);
for (const b of bledy) console.log(`  pominięto: ${b}`);

const historia = new Map(); // drużyna -> [{gf, ga, sf, sa, stf, sta}]
const ligaMecze = new Map(); // leagueId -> mecze rozegrane (do DC i do stałej)
const modeleDC = new Map(); // leagueId -> { model, waznyDo }
let dopasowanDC = 0;

function modelLigi(leagueId, kiedy) {
	const wpis = modeleDC.get(leagueId);
	if (wpis && kiedy < wpis.waznyDo) return wpis.model;
	const waznyDo = kiedy + REFIT_DAYS * 86_400_000;
	const dane = (ligaMecze.get(leagueId) || []).filter((x) => x.t < kiedy);
	if (dane.length < MIN_LEAGUE_MATCHES) {
		modeleDC.set(leagueId, { model: null, waznyDo });
		return null;
	}
	const model = fitRatings(
		dane.map((x) => ({ homeId: x.home, awayId: x.away, homeGoals: x.hg, awayGoals: x.ag, date: x.date })),
		{ referenceDate: new Date(kiedy) }
	);
	dopasowanDC += 1;
	modeleDC.set(leagueId, { model, waznyDo });
	return model;
}

/** Odniesienia ligowe z meczów sprzed `kiedy` — tym samym rachunkiem, co produkcja. */
function stalaLigi(leagueId, kiedy) {
	const dane = (ligaMecze.get(leagueId) || []).filter((x) => x.t < kiedy).slice(-LEAGUE_WINDOW);
	const ref = leagueReference(dane);
	if (!ref) return null;
	// BTTS ma własną stałą (liczoną tym samym rachunkiem co produkcja) — reszta odniesień jest wspólna.
	return { ...ref, over25: ref.rate, btts: ref.bttsRate };
}

// Regresje: osobno na cel; przeliczane co LR_REFIT_DAYS na wszystkich meczach z cechami.
const cele = ['over25', 'btts'];
const warianty = ['C', 'D', 'E'];
const regresje = { waznyDo: 0, modele: {} };
const uczace = []; // { over25, btts, X: {C, D, E}-per-cel }

function regresjeNaDzien(kiedy) {
	if (kiedy < regresje.waznyDo) return regresje.modele;
	regresje.waznyDo = kiedy + LR_REFIT_DAYS * 86_400_000;
	const modele = {};
	for (const cel of cele) {
		modele[cel] = {};
		const y = uczace.map((u) => u[cel]);
		for (const w of warianty) {
			modele[cel][w] = uczRegresje(
				uczace.map((u) => u.X[cel][w]),
				y
			);
		}
	}
	regresje.modele = modele;
	return modele;
}

const oceny = []; // wiersze zbioru testowego z prognozami wszystkich wariantów

for (const m of mecze) {
	const hHist = historia.get(m.home) || [];
	const aHist = historia.get(m.away) || [];
	const lg = stalaLigi(m.leagueId, m.t);
	const model = modelLigi(m.leagueId, m.t);

	let wiersz = null;
	if (lg && model && hHist.length >= MIN_HIST && aHist.length >= MIN_HIST) {
		const eg = expectedGoals(model, m.home, m.away);
		const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);
		const dc = { over25: rynki.totalGoals[2.5].over, btts: rynki.btts.yes };
		const h = teamProfile(hHist);
		const a = teamProfile(aHist);
		const X = {
			over25: cechy({ ...lg, rate: lg.over25 }, dc.over25, h, a),
			btts: cechy({ ...lg, rate: lg.btts }, dc.btts, h, a),
		};
		wiersz = { m, lg, dc, X, eg };

		if (m.t >= TEST_START) {
			const modele = regresjeNaDzien(m.t);
			const prog = {};
			for (const cel of cele) {
				prog[cel] = { A: lg[cel], B: dc[cel] };
				for (const w of warianty) {
					const r = modele[cel]?.[w];
					prog[cel][w] = r ? r(X[cel][w]) : null;
				}
			}
			oceny.push({ m, lg, prog });
		}
		uczace.push({ over25: m.over25, btts: m.btts, X });
	}

	// Dopiero teraz mecz trafia do historii — cechy powyżej nie mogły go widzieć.
	const hRow = { gf: m.hg, ga: m.ag, sf: m.hs, sa: m.as, stf: m.hst, sta: m.ast };
	const aRow = { gf: m.ag, ga: m.hg, sf: m.as, sa: m.hs, stf: m.ast, sta: m.hst };
	historia.set(m.home, [...hHist, hRow]);
	historia.set(m.away, [...aHist, aRow]);
	ligaMecze.set(m.leagueId, [...(ligaMecze.get(m.leagueId) || []), m]);
}

/* ---------------------------------------------------------------- raport */

const pelne = oceny.filter((o) => cele.every((cel) => warianty.every((w) => o.prog[cel][w] !== null)));
console.log(
	`\nZbiór testowy od ${new Date(TEST_START).toISOString().slice(0, 10)}: ${pelne.length} meczów ` +
		`(${oceny.length - pelne.length} bez regresji na starcie), dopasowań DC: ${dopasowanDC}.`
);

const nazwy = {
	A: 'A  stała ligowa',
	B: 'B  Dixon-Coles surowy',
	C: 'C  regresja [stała, DC]',
	D: 'D  C + gole 10 meczów',
	E: 'E  D + strzały i celne',
};

let sukces = false;

for (const cel of cele) {
	const y = pelne.map((o) => o.m[cel]);
	const etykieta = cel === 'over25' ? 'POWYŻEJ 2,5 GOLA' : 'OBIE STRZELĄ (BTTS)';
	console.log(`\n=== ${etykieta} — n = ${pelne.length}, częstość ${f(srednia(y), 3)} ===`);
	console.log('wariant                     Brier    log loss   t wobec A');
	const brierA = pelne.map((o, i) => brier(o.prog[cel].A, y[i]));
	for (const w of ['A', 'B', 'C', 'D', 'E']) {
		const ps = pelne.map((o) => o.prog[cel][w]);
		const b = ps.map((p, i) => brier(p, y[i]));
		const t = w === 'A' ? null : tStat(brierA.map((v, i) => v - b[i]));
		if (w === 'E' && t !== null && t > 2) sukces = true;
		console.log(`${nazwy[w].padEnd(27)} ${f(srednia(b))}   ${f(srednia(ps.map((p, i) => logLoss(p, y[i]))))}   ${t === null ? '   —' : f(t, 2).padStart(6)}`);
	}

	if (cel === 'over25') {
		const zRynkiem = pelne.filter((o) => o.m.marketOver25 !== null);
		if (zRynkiem.length) {
			const yM = zRynkiem.map((o) => o.m.over25);
			const linia = (nazwa, ps) =>
				console.log(
					`${nazwa.padEnd(27)} ${f(srednia(ps.map((p, i) => brier(p, yM[i]))))}   ${f(srednia(ps.map((p, i) => logLoss(p, yM[i]))))}`
				);
			console.log(`--- na ${zRynkiem.length} meczach z kursem zamknięcia Pinnacle ---`);
			linia('A  stała ligowa', zRynkiem.map((o) => o.prog.over25.A));
			linia('E  pełny wariant', zRynkiem.map((o) => o.prog.over25.E));
			linia('M  rynek (Pinnacle)', zRynkiem.map((o) => o.m.marketOver25));
		}
	}

	// Kalibracja wariantu E: czy 65% znaczy 65%.
	console.log('--- kalibracja E (kubełki prognozy) ---');
	const kubelki = [0, 0.35, 0.45, 0.55, 0.65, 0.75, 1.01];
	for (let k = 0; k < kubelki.length - 1; k += 1) {
		const w = pelne.filter((o) => o.prog[cel].E >= kubelki[k] && o.prog[cel].E < kubelki[k + 1]);
		if (!w.length) continue;
		const sr = srednia(w.map((o) => o.prog[cel].E));
		const obs = srednia(w.map((o) => o.m[cel]));
		console.log(`  ${(kubelki[k] * 100).toFixed(0).padStart(3)}–${Math.min(kubelki[k + 1] * 100, 100).toFixed(0).padEnd(3)}%  n=${String(w.length).padStart(5)}  prognoza ${f(sr, 3)}  zaszło ${f(obs, 3)}  różnica ${f(obs - sr, 3)}`);
	}

	// Widok produktu: typy po polityce (próg i przewaga wobec stałej), obie strony rynku.
	console.log(`--- typy po polityce (≥${MIN_PROBABILITY}% i ≥${MIN_LIFT} pkt nad stałą) ---`);
	for (const w of ['B', 'C', 'D', 'E']) {
		for (const strona of ['tak', 'nie']) {
			const wybrane = pelne
				.map((o) => {
					const p = strona === 'tak' ? o.prog[cel][w] : 1 - o.prog[cel][w];
					const base = strona === 'tak' ? o.lg[cel] : 1 - o.lg[cel];
					const traf = strona === 'tak' ? o.m[cel] : 1 - o.m[cel];
					return { p, base, traf };
				})
				.filter((x) => x.p * 100 >= MIN_PROBABILITY && (x.p - x.base) * 100 >= MIN_LIFT);
			const opis = `${w} ${cel === 'over25' ? (strona === 'tak' ? 'powyżej 2,5' : 'poniżej 2,5') : strona === 'tak' ? 'obie strzelą' : 'nie obie'}`;
			if (!wybrane.length) {
				console.log(`  ${opis.padEnd(18)} 0 typów`);
				continue;
			}
			console.log(
				`  ${opis.padEnd(18)} ${String(wybrane.length).padStart(4)} typów  śr. prognoza ${f(srednia(wybrane.map((x) => x.p)), 3)}  trafność ${f(srednia(wybrane.map((x) => x.traf)), 3)}  stała tych meczów ${f(srednia(wybrane.map((x) => x.base)), 3)}`
			);
		}
	}
}

console.log(
	sukces
		? '\nWERDYKT: pełny wariant bije stałą istotnie w co najmniej jednym rynku — warto sięgnąć po statystyki reszty lig.'
		: '\nWERDYKT: cechy pod gole nie dają istotnej przewagi nad stałą — nie warto płacić za statystyki reszty lig w tej postaci.'
);
/*
 * Regresje do produkcji: douczone na WSZYSTKICH meczach z cechami (nie tylko sprzed testu),
 * bo produkcja ma korzystać z całej dostępnej historii. Pomiar wyżej jest uczciwy, bo był
 * chronologiczny; ten zapis jest już tylko dopasowaniem końcowym na tym, co się sprawdziło.
 */
if (EMIT) {
	/*
	 * Dwa cele. `over25` idzie do typów; `btts` WYŁĄCZNIE do kafelka „obie strzelą" w analizie —
	 * skalibrowany bije stałą (t = 3,5), więc jako opis charakteru meczu jest uczciwszy niż
	 * surowa macierz albo ocena modelu językowego, ale typów z niego nie ma (README).
	 */
	const markets = {};
	for (const cel of cele) {
		const y = uczace.map((u) => u[cel]);
		markets[cel] = {};
		for (const [wariant, klucz] of [['goals', 'D'], ['shots', 'E']]) {
			const params = fitLogistic(uczace.map((u) => u.X[cel][klucz]), y);
			markets[cel][wariant] = { features: FEATURE_NAMES[wariant], ...params };
		}
	}
	const zapis = {
		trainedAt: new Date().toISOString().slice(0, 10),
		source: 'football-data.co.uk',
		leagues: ligi,
		seasons: SEASONS,
		matches: uczace.length,
		markets,
	};
	// Moduł JS, nie JSON: import JSON-a w gołym Node wymaga atrybutu importu, którego bundler
	// Next.js nie rozumie tak samo — a ten plik czytają testy i produkcja.
	const naglowek =
		'/* PLIK GENEROWANY — nie edytować ręcznie. Regresje „powyżej 2,5 gola" (typ) i „obie strzelą" (kafelek);\n' +
		' * odtworzenie: node --experimental-loader ./test/helpers/alias.mjs lib/model/goalsExperiment.mjs --emit=lib/model/goalsCalibrationData.js */\n';
	await fs.writeFile(EMIT, `${naglowek}export default ${JSON.stringify(zapis, null, '\t')};\n`);
	console.log(`\nZapisano regresje (${uczace.length} meczów) do ${EMIT}.`);
}

process.exit(sukces ? 0 : 2);
