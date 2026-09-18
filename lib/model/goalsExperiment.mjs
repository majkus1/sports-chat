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

/** Ile meczów historii musi mieć KAŻDA z drużyn, żeby mecz wszedł do oceny. */
const MIN_HIST = 6;
/** Okno średnich kroczących drużyny. */
const WINDOW = 10;
/** Okno stałej ligowej — mniej więcej sezon. */
const LEAGUE_WINDOW = 380;
/** Minimalna liczba meczów ligi przed pierwszym dopasowaniem Dixona-Colesa. */
const MIN_LEAGUE_MATCHES = 120;
/** Regularyzacja L2 regresji logistycznej (na cechach standaryzowanych). */
const L2 = 0.05;

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

/** Średnie z ostatnich `WINDOW` meczów drużyny: gole i strzały za i przeciw. */
function profil(historia) {
	const ost = historia.slice(-WINDOW);
	const pole = (k) => srednia(ost.map((h) => h[k]).filter((v) => v !== null));
	return {
		n: historia.length,
		gf: pole('gf'),
		ga: pole('ga'),
		sf: pole('sf'),
		sa: pole('sa'),
		stf: pole('stf'),
		sta: pole('sta'),
	};
}

const logit = (p) => Math.log(Math.max(p, 1e-6) / Math.max(1 - p, 1e-6));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * Wektory cech dla wariantów C, D, E. Cechy drużyn są WZGLĘDEM ligi (różnica od średniej
 * ligowej z tego samego okna), żeby jedna regresja działała na 11 ligach o różnym tempie.
 */
function cechy(m, lg, dcP, h, a) {
	const rel = (v, base) => (v === null || base === null ? 0 : v - base);
	const c = [logit(lg.rate), logit(dcP)];
	const d = [
		...c,
		rel(h.gf, lg.gf),
		rel(h.ga, lg.gf),
		rel(a.gf, lg.gf),
		rel(a.ga, lg.gf),
	];
	const e = [
		...d,
		rel(h.sf, lg.sf),
		rel(h.sa, lg.sf),
		rel(a.sf, lg.sf),
		rel(a.sa, lg.sf),
		rel(h.stf, lg.stf),
		rel(h.sta, lg.stf),
		rel(a.stf, lg.stf),
		rel(a.sta, lg.stf),
	];
	return { C: c, D: d, E: e };
}

/* ---------------------------------------------------------------- regresja logistyczna */

function rozwiazUklad(A, b) {
	const n = b.length;
	const M = A.map((row, i) => [...row, b[i]]);
	for (let col = 0; col < n; col += 1) {
		let piv = col;
		for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
		[M[col], M[piv]] = [M[piv], M[col]];
		const p = M[col][col] || 1e-12;
		for (let r = 0; r < n; r += 1) {
			if (r === col) continue;
			const f = M[r][col] / p;
			if (!f) continue;
			for (let k = col; k <= n; k += 1) M[r][k] -= f * M[col][k];
		}
	}
	return M.map((row, i) => row[n] / (row[i] || 1e-12));
}

/** Regresja logistyczna z L2 (Newton/IRLS) na cechach standaryzowanych; zwraca predyktor. */
function uczRegresje(X, y) {
	const n = X.length;
	if (n < 200) return null;
	const d = X[0].length;
	const mean = new Array(d).fill(0);
	const sd = new Array(d).fill(0);
	for (const row of X) for (let j = 0; j < d; j += 1) mean[j] += row[j] / n;
	for (const row of X) for (let j = 0; j < d; j += 1) sd[j] += (row[j] - mean[j]) ** 2 / n;
	for (let j = 0; j < d; j += 1) sd[j] = Math.sqrt(sd[j]) || 1;
	const Z = X.map((row) => [1, ...row.map((v, j) => (v - mean[j]) / sd[j])]);

	const w = new Array(d + 1).fill(0);
	for (let it = 0; it < 30; it += 1) {
		const grad = new Array(d + 1).fill(0);
		const H = Array.from({ length: d + 1 }, () => new Array(d + 1).fill(0));
		for (let i = 0; i < n; i += 1) {
			const z = Z[i];
			let s = 0;
			for (let j = 0; j <= d; j += 1) s += w[j] * z[j];
			const p = sigmoid(s);
			const r = y[i] - p;
			const wt = p * (1 - p);
			for (let j = 0; j <= d; j += 1) {
				grad[j] += r * z[j];
				for (let k = 0; k <= d; k += 1) H[j][k] += wt * z[j] * z[k];
			}
		}
		for (let j = 1; j <= d; j += 1) {
			grad[j] -= L2 * n * w[j];
			H[j][j] += L2 * n;
		}
		const krok = rozwiazUklad(H, grad);
		let zmiana = 0;
		for (let j = 0; j <= d; j += 1) {
			w[j] += krok[j];
			zmiana = Math.max(zmiana, Math.abs(krok[j]));
		}
		if (zmiana < 1e-6) break;
	}
	return (x) => {
		let s = w[0];
		for (let j = 0; j < d; j += 1) s += w[j + 1] * ((x[j] - mean[j]) / sd[j]);
		return sigmoid(s);
	};
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

/** Stała ligowa i średnie ligowe z ostatnich ~380 meczów — z meczów sprzed `kiedy`. */
function stalaLigi(leagueId, kiedy) {
	const dane = (ligaMecze.get(leagueId) || []).filter((x) => x.t < kiedy).slice(-LEAGUE_WINDOW);
	if (dane.length < 60) return null;
	const sr = (k) => srednia(dane.map((x) => x[k]).filter((v) => v !== null));
	return {
		over25: srednia(dane.map((x) => x.over25)),
		btts: srednia(dane.map((x) => x.btts)),
		gf: (sr('hg') + sr('ag')) / 2,
		sf: sr('hs') !== null && sr('as') !== null ? (sr('hs') + sr('as')) / 2 : null,
		stf: sr('hst') !== null && sr('ast') !== null ? (sr('hst') + sr('ast')) / 2 : null,
	};
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
		const h = profil(hHist);
		const a = profil(aHist);
		const X = {
			over25: cechy(m, { ...lg, rate: lg.over25 }, dc.over25, h, a),
			btts: cechy(m, { ...lg, rate: lg.btts }, dc.btts, h, a),
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
	for (const w of ['B', 'C', 'E']) {
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
process.exit(sukces ? 0 : 2);
