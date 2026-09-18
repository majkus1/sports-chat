/**
 * Kalibracja rynku „powyżej 2,5 gola" — cechy, regresja i jej zastosowanie. Czysty rachunek.
 *
 * DLACZEGO OSOBNA WARSTWA. Dixon-Coles liczy sumę goli z tej samej macierzy co zwycięzcę,
 * ale w rynku 2,5 gola przegrywał ze stałą (backtest: Brier 0,2487 wobec 0,2479). Eksperyment
 * na 19 692 meczach z football-data.co.uk (`goalsExperiment.mjs`) pokazał przyczynę: nie brak
 * informacji, tylko nadmiar pewności. Ta sama prognoza przepuszczona przez regresję logistyczną
 * ze stałą ligową bije stałą istotnie (t = 6,3), a średnie gole i strzały obu drużyn z ostatnich
 * dziesięciu meczów potrajają liczbę typów po polityce przy trafności 72–75 %.
 *
 * JEDNO ŹRÓDŁO CECH. Ten plik importuje zarówno eksperyment (uczenie i pomiar), jak i produkcja
 * (`goals.js`). Regresja zapisana w `goalsCalibration.json` ma sens tylko z DOKŁADNIE tym
 * wektorem cech, w tej kolejności i z tymi samymi odniesieniami ligowymi — dwie kopie tej
 * funkcji rozjechałyby się cicho i model liczyłby bzdury z pełnym przekonaniem.
 *
 * DWA WARIANTY, BO STRZAŁY DOCHODZĄ STOPNIOWO. `goals` używa wyłącznie wyników (dostępne dla
 * każdej ligi od razu z terminarza), `shots` dokłada strzały i strzały celne z ostatnich meczów
 * (dla lig, dla których zebraliśmy statystyki meczów). Produkcja wybiera wariant per mecz:
 * `shots`, gdy obie drużyny mają dość meczów ze statystykami, inaczej `goals`.
 */

/** Okno średnich kroczących drużyny. */
export const WINDOW = 10;
/** Ile meczów historii musi mieć KAŻDA z drużyn, żeby prognoza w ogóle powstała. */
export const MIN_HIST = 6;
/** Ile z ostatnich `WINDOW` meczów musi mieć strzały, żeby użyć wariantu `shots`. */
export const MIN_SHOT_MATCHES = 6;
/** Okno stałej ligowej i średnich ligowych — mniej więcej sezon. */
export const LEAGUE_WINDOW = 380;
/** Minimalna liczba meczów w oknie ligowym, poniżej której stała jest szumem. */
export const MIN_LEAGUE_SAMPLE = 60;
/** Regularyzacja L2 na cechach standaryzowanych. */
export const L2 = 0.05;

export const VARIANTS = ['goals', 'shots'];

/** Nazwy cech w kolejności wektora — do pliku z regresją i do testów. */
export const FEATURE_NAMES = {
	goals: ['lgLogit', 'dcLogit', 'hGf', 'hGa', 'aGf', 'aGa'],
	shots: [
		'lgLogit', 'dcLogit', 'hGf', 'hGa', 'aGf', 'aGa',
		'hSf', 'hSa', 'aSf', 'aSa', 'hStf', 'hSta', 'aStf', 'aSta',
	],
};

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const logit = (p) => Math.log(Math.max(p, 1e-6) / Math.max(1 - p, 1e-6));
export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * Profil drużyny z ostatnich `WINDOW` meczów: gole i strzały za i przeciw.
 *
 * @param {Array<{gf:number, ga:number, sf:number|null, sa:number|null, stf:number|null, sta:number|null}>} history
 *   mecze drużyny w porządku chronologicznym, NAJNOWSZY NA KOŃCU; strzały mogą być `null`
 */
export function teamProfile(history) {
	const ost = (history || []).slice(-WINDOW);
	const pole = (k) => srednia(ost.map((h) => h[k]).filter((v) => v !== null && v !== undefined));
	return {
		n: (history || []).length,
		shotMatches: ost.filter((h) => h.sf !== null && h.sf !== undefined).length,
		gf: pole('gf'),
		ga: pole('ga'),
		sf: pole('sf'),
		sa: pole('sa'),
		stf: pole('stf'),
		sta: pole('sta'),
	};
}

/**
 * Odniesienia ligowe z okna ostatnich meczów: częstość „powyżej 2,5", średnie gole
 * i strzały NA DRUŻYNĘ w meczu.
 *
 * @param {Array<{hg:number, ag:number, hs?:number|null, as?:number|null, hst?:number|null, ast?:number|null}>} matches
 */
export function leagueReference(matches) {
	const dane = (matches || []).slice(-LEAGUE_WINDOW);
	if (dane.length < MIN_LEAGUE_SAMPLE) return null;
	const sr = (k) => srednia(dane.map((x) => x[k]).filter((v) => v !== null && v !== undefined));
	const para = (a, b) => (a !== null && b !== null ? (a + b) / 2 : null);
	const zeStrzalami = dane.filter((x) => x.hs !== null && x.hs !== undefined).length;
	return {
		n: dane.length,
		rate: srednia(dane.map((x) => (x.hg + x.ag > 2.5 ? 1 : 0))),
		gf: para(sr('hg'), sr('ag')),
		sf: zeStrzalami >= MIN_LEAGUE_SAMPLE ? para(sr('hs'), sr('as')) : null,
		stf: zeStrzalami >= MIN_LEAGUE_SAMPLE ? para(sr('hst'), sr('ast')) : null,
	};
}

/**
 * Wektor cech dla wariantu. Cechy drużyn są WZGLĘDEM ligi (różnica od średniej ligowej),
 * żeby jedna regresja działała w ligach o różnym tempie gry.
 *
 * @param {'goals'|'shots'} variant
 * @param {{ league: object, dcOver: number, home: object, away: object }} input
 *   `league` z `leagueReference`, `dcOver` ułamek z Dixona-Colesa, `home`/`away` z `teamProfile`
 */
export function featureVector(variant, { league, dcOver, home, away }) {
	const rel = (v, base) => (v === null || v === undefined || base === null || base === undefined ? 0 : v - base);
	const x = [
		logit(league.rate),
		logit(dcOver),
		rel(home.gf, league.gf),
		rel(home.ga, league.gf),
		rel(away.gf, league.gf),
		rel(away.ga, league.gf),
	];
	if (variant === 'shots') {
		x.push(
			rel(home.sf, league.sf),
			rel(home.sa, league.sf),
			rel(away.sf, league.sf),
			rel(away.sa, league.sf),
			rel(home.stf, league.stf),
			rel(home.sta, league.stf),
			rel(away.stf, league.stf),
			rel(away.sta, league.stf)
		);
	}
	return x;
}

/** Który wariant da się policzyć dla pary profili i odniesienia ligowego; `null` — żaden. */
export function pickVariant({ league, home, away }) {
	if (!league || !home || !away) return null;
	if (home.n < MIN_HIST || away.n < MIN_HIST) return null;
	const strzaly =
		league.sf !== null &&
		league.stf !== null &&
		home.shotMatches >= MIN_SHOT_MATCHES &&
		away.shotMatches >= MIN_SHOT_MATCHES;
	return strzaly ? 'shots' : 'goals';
}

/* ---------------------------------------------------------------- regresja */

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

/**
 * Regresja logistyczna z L2 (Newton/IRLS) na cechach standaryzowanych.
 *
 * @param {number[][]} X wektory cech
 * @param {number[]} y 0/1
 * @returns {null | { mean: number[], sd: number[], w: number[], n: number }} `w[0]` to wyraz wolny
 */
export function fitLogistic(X, y, { l2 = L2, minRows = 200 } = {}) {
	const n = X.length;
	if (n < minRows) return null;
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
			grad[j] -= l2 * n * w[j];
			H[j][j] += l2 * n;
		}
		const krok = rozwiazUklad(H, grad);
		let zmiana = 0;
		for (let j = 0; j <= d; j += 1) {
			w[j] += krok[j];
			zmiana = Math.max(zmiana, Math.abs(krok[j]));
		}
		if (zmiana < 1e-6) break;
	}
	return { mean, sd, w, n };
}

/** Prawdopodobieństwo z zapisanej regresji dla wektora cech. */
export function applyCalibration(params, x) {
	if (!params || !Array.isArray(x) || x.length !== params.mean.length) return null;
	let s = params.w[0];
	for (let j = 0; j < x.length; j += 1) s += params.w[j + 1] * ((x[j] - params.mean[j]) / params.sd[j]);
	return sigmoid(s);
}
