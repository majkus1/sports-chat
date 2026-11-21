import { fitRatings, expectedGoals, DEFAULT_XI } from '@/lib/model/ratings';
import { predictMarkets } from '@/lib/model/dixonColes';
import { EXCLUDED_COMPETITIONS, MIN_MATCHES, MIN_MATCHES_PER_TEAM, medianMatchesPerTeam } from '@/lib/model';
import { entryThresholdFor } from '@/lib/picks/policy';
import { SELECTION_SHAPES } from '@/lib/picks/markets';

/**
 * EKSPERYMENT „xG W SIŁACH DRUŻYN" — część czysta (bez sieci i bazy). Skrypt: `xgExperiment.mjs`.
 *
 * PYTANIE. Model sił (`ratings.js`) dopasowuje się do GOLI, a gol to zdarzenie rzadkie i w dużej
 * części losowe: drużyna, która wygrała 1:0 po jedynym strzale, dostaje taką samą „obserwację"
 * jak ta, która zmarnowała pięć sytuacji. Gole oczekiwane (xG) i strzały celne mierzą jakość
 * okazji, więc mogą mówić o sile drużyny więcej niż sam wynik. Sprawdzamy, czy tak jest.
 *
 * JAK. Niczego w modelu nie zmieniamy — podmieniamy wyłącznie to, co model widzi jako „gole"
 * w danych uczących:
 *
 *     gole skorygowane = a · gole + (1 − a) · k · xG
 *
 * `a` to waga goli (1 = dzisiejszy model, 0 = samo xG), `k` wyrównuje skalę: suma xG w lidze
 * nie musi równać się sumie goli (dostawca liczy karne i samobóje po swojemu), a model ma
 * nadal przewidywać GOLE, więc xG skalujemy tak, żeby na danych uczących dawało tyle samo
 * bramek. `fitRatings` przyjmuje wartości ułamkowe: gradient Poissona to „obserwacja − λ"
 * i nic w nim nie wymaga liczb całkowitych (quasi-wiarogodność).
 *
 * BRAK xG. Mecz bez xG wchodzi do nauki z prawdziwymi golami (albo — w wariancie ze strzałami
 * — z przybliżeniem „strzały celne × skuteczność ligi"). Nigdy nie wypada z danych: liga bez
 * xG daje wtedy DOKŁADNIE dzisiejszy model, co jest warunkiem bezpiecznego wdrożenia.
 *
 * OCENA jest zawsze na prawdziwych wynikach, chronologicznie, tak jak `leagueCheck.js`.
 */

/**
 * Warianty. `a` — waga prawdziwych goli; `source` — czym uzupełniamy resztę wagi.
 *   xg      xG, a gdy go brak — same gole
 *   sot     strzały celne przeliczone na gole skutecznością ligi, a gdy ich brak — same gole
 *   xg+sot  xG, gdy brak — strzały celne, gdy i tych brak — same gole
 */
export const VARIANTS = [
	{ key: 'G', label: 'gole (dziś)', a: 1, source: 'none' },
	{ key: 'X70', label: '0,7·gole + 0,3·xG', a: 0.7, source: 'xg' },
	{ key: 'X50', label: '0,5·gole + 0,5·xG', a: 0.5, source: 'xg' },
	{ key: 'X30', label: '0,3·gole + 0,7·xG', a: 0.3, source: 'xg' },
	{ key: 'X0', label: 'samo xG', a: 0, source: 'xg' },
	{ key: 'S70', label: '0,7·gole + 0,3·strzały celne', a: 0.7, source: 'sot' },
	{ key: 'S50', label: '0,5·gole + 0,5·strzały celne', a: 0.5, source: 'sot' },
	{ key: 'S30', label: '0,3·gole + 0,7·strzały celne', a: 0.3, source: 'sot' },
	{ key: 'S0', label: 'same strzały celne', a: 0, source: 'sot' },
	{ key: 'XS50', label: '0,5·gole + 0,5·(xG, gdy brak: celne)', a: 0.5, source: 'xg+sot' },
];

/** Poniżej tylu meczów z danymi skali nie liczymy — z garstki meczów wyszedłby szum. */
export const MIN_SCALE_SAMPLE = 30;
/** Skala poza tym przedziałem znaczy zepsute dane (xG w innych jednostkach, same zera). */
export const SCALE_BOUNDS = { xg: [0.6, 1.6], sot: [0.15, 0.6] };
/** Okno danych do nauki — jak `getLeagueModel` (bieżący i poprzedni sezon). */
export const TRAIN_WINDOW_DAYS = 730;

const skonczona = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Czy mecz ma użyteczne xG. Para 0:0 w xG to brak danych zapisany jako zero (mecz bez żadnej
 * okazji się nie zdarza); jednostronne zero bywa prawdziwe.
 */
export function hasXg(m) {
	return skonczona(m?.hxg) && skonczona(m?.axg) && m.hxg + m.axg > 0;
}

/** Czy mecz ma strzały celne (0:0 w strzałach celnych zdarza się naprawdę — zostaje). */
export function hasSot(m) {
	return skonczona(m?.hst) && skonczona(m?.ast);
}

/**
 * Skale przeliczenia na gole z danych uczących: `xg` = gole / xG, `sot` = gole / strzały celne.
 * `null`, gdy danych jest za mało albo wynik jest niewiarygodny — wtedy wariant spada na gole.
 */
export function scaleFactors(matches) {
	let gx = 0;
	let x = 0;
	let nx = 0;
	let gs = 0;
	let s = 0;
	let ns = 0;
	for (const m of matches || []) {
		if (!Number.isFinite(m.homeGoals) || !Number.isFinite(m.awayGoals)) continue;
		if (hasXg(m)) {
			gx += m.homeGoals + m.awayGoals;
			x += m.hxg + m.axg;
			nx += 1;
		}
		if (hasSot(m)) {
			gs += m.homeGoals + m.awayGoals;
			s += m.hst + m.ast;
			ns += 1;
		}
	}
	const wGranicach = (v, [lo, hi]) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);
	return {
		xg: nx >= MIN_SCALE_SAMPLE && x > 0 ? wGranicach(gx / x, SCALE_BOUNDS.xg) : null,
		sot: ns >= MIN_SCALE_SAMPLE && s > 0 ? wGranicach(gs / s, SCALE_BOUNDS.sot) : null,
		nXg: nx,
		nSot: ns,
	};
}

/**
 * „Gole skorygowane" jednego meczu dla wariantu. Zwraca też `used` — z czego powstały
 * (`xg`, `sot` albo `goals`), żeby dało się policzyć, ile danych faktycznie zadziałało.
 */
export function adjustedGoals(m, variant, scales) {
	const a = variant.a;
	const czyste = { homeGoals: m.homeGoals, awayGoals: m.awayGoals, used: 'goals' };
	if (!(a < 1) || variant.source === 'none') return czyste;

	const chceXg = variant.source === 'xg' || variant.source === 'xg+sot';
	const chceSot = variant.source === 'sot' || variant.source === 'xg+sot';

	if (chceXg && scales?.xg && hasXg(m)) {
		return {
			homeGoals: a * m.homeGoals + (1 - a) * scales.xg * m.hxg,
			awayGoals: a * m.awayGoals + (1 - a) * scales.xg * m.axg,
			used: 'xg',
		};
	}
	if (chceSot && scales?.sot && hasSot(m)) {
		return {
			homeGoals: a * m.homeGoals + (1 - a) * scales.sot * m.hst,
			awayGoals: a * m.awayGoals + (1 - a) * scales.sot * m.ast,
			used: 'sot',
		};
	}
	return czyste;
}

/**
 * Dane uczące z podmienionymi golami — gotowe dla `fitRatings`. Skale liczone z TYCH SAMYCH
 * meczów (czyli wyłącznie z przeszłości względem prognozy — pilnuje tego wywołujący).
 */
export function adjustMatches(matches, variant, scales = scaleFactors(matches)) {
	return (matches || []).map((m) => {
		const g = adjustedGoals(m, variant, scales);
		return { ...m, homeGoals: g.homeGoals, awayGoals: g.awayGoals, used: g.used };
	});
}

/**
 * Jaka część WAGI danych uczących ma xG / strzały celne. Liczona wagami modelu (wygaszanie
 * po dacie), bo to one decydują, ile wariant w ogóle może się różnić od dzisiejszego modelu:
 * xG tylko w meczach sprzed roku znaczy prawie nic, xG w ostatnich dziesięciu — prawie wszystko.
 */
export function coverage(matches, referenceDate, xi = DEFAULT_XI) {
	const koniec = new Date(referenceDate).getTime();
	let w = 0;
	let wx = 0;
	let ws = 0;
	for (const m of matches || []) {
		const wiek = Math.max(0, koniec - new Date(m.date).getTime()) / 86_400_000;
		const waga = Math.exp(-xi * wiek);
		w += waga;
		if (hasXg(m)) wx += waga;
		if (hasSot(m)) ws += waga;
	}
	return { xg: w ? wx / w : 0, sot: w ? ws / w : 0 };
}

/* ------------------------------------------------------------------ ocena */

/** Te same selekcje i progi co `leagueCheck.js` — typy po polityce produkcji. */
const SELEKCJE = [
	{ key: 'home', p: (r) => r.matchWinner.home, won: (h, a) => h > a },
	{ key: 'away', p: (r) => r.matchWinner.away, won: (h, a) => a > h },
	{ key: '1X', p: (r) => r.doubleChance['1X'], won: (h, a) => h >= a },
	{ key: 'X2', p: (r) => r.doubleChance.X2, won: (h, a) => a >= h },
	{ key: 'homeScores', p: (r) => r.teamGoals.home[0.5].over, won: (h) => h > 0 },
	{ key: 'awayScores', p: (r) => r.teamGoals.away[0.5].over, won: (h, a) => a > 0 },
];
let progi = null;
const prog = (key) => {
	progi ??= new Map(SELEKCJE.map((s) => [s.key, entryThresholdFor(SELECTION_SHAPES[s.key].normalized)]));
	return progi.get(key);
};

const WYNIKI = ['home', 'draw', 'away'];
export const outcomeOf = (m) => (m.homeGoals > m.awayGoals ? 'home' : m.homeGoals < m.awayGoals ? 'away' : 'draw');
export const logLoss = (p, w) => -Math.log(Math.max(1e-12, Math.min(1, p[w])));
/** Brier wieloklasowy: suma kwadratów błędu po trzech wynikach (0 = ideał, 2/3 = „po 1/3"). */
export const brier = (p, w) => WYNIKI.reduce((s, k) => s + (p[k] - (k === w ? 1 : 0)) ** 2, 0);

/**
 * Walk-forward jednej ligi dla wszystkich wariantów naraz.
 *
 * Każdy wariant uczy się na TYM SAMYM zbiorze meczów (różni się tylko „golami"), więc zbiór
 * ocenianych meczów jest identyczny i różnice są sparowane mecz po meczu.
 *
 * @param {Array} matches zakończone mecze ligi: `{ date, homeId, awayId, homeGoals, awayGoals,
 *   hxg?, axg?, hst?, ast?, market? }`; `market` = `{ home, draw, away }` po zdjęciu marży
 * @param {{ leagueId: number, split: Date, until?: Date, refitDays?: number, variants?: Array }} options
 * @returns {{ rows: Array, baseline: object }} `rows` — po jednym na oceniony mecz:
 *   `{ leagueId, date, outcome, known, cov, scales, used, market, extra, base,
 *      p: { [wariant]: { home, draw, away } }, picks: { [wariant]: [{ key, p, won }] } }`
 */
export function evaluateVariants(matches, { leagueId, split, until = null, refitDays = 14, variants = VARIANTS } = {}) {
	const mecze = [...(matches || [])]
		.filter((m) => Number.isFinite(m.homeGoals) && Number.isFinite(m.awayGoals) && m.homeId != null && m.awayId != null)
		.map((m) => ({ ...m, t: Date.parse(m.date) }))
		.filter((m) => Number.isFinite(m.t))
		.sort((a, b) => a.t - b.t);
	const granica = split.getTime();
	const koniec = until ? until.getTime() : Infinity;
	const okno = TRAIN_WINDOW_DAYS * 86_400_000;

	// Linia bazowa jak w `leagueCheck.js`: częstości tej ligi z dwóch lat przed podziałem.
	const czest = { home: 1, draw: 1, away: 1 };
	for (const m of mecze) if (m.t < granica && m.t >= granica - okno) czest[outcomeOf(m)] += 1;
	const suma = czest.home + czest.draw + czest.away;
	const baseline = { home: czest.home / suma, draw: czest.draw / suma, away: czest.away / suma };

	let modele = null;
	let stan = null;
	let waznyDo = -Infinity;
	const rows = [];

	for (const m of mecze) {
		if (m.t < granica || m.t >= koniec) continue;
		if (m.t >= waznyDo) {
			const nauka = mecze.filter((x) => x.t < m.t && x.t >= m.t - okno);
			const dopuszczona =
				!EXCLUDED_COMPETITIONS.has(leagueId) && nauka.length >= MIN_MATCHES && medianMatchesPerTeam(nauka) >= MIN_MATCHES_PER_TEAM;
			if (dopuszczona) {
				const scales = scaleFactors(nauka);
				const referenceDate = new Date(m.t);
				modele = new Map();
				const used = {};
				for (const v of variants) {
					const dane = adjustMatches(nauka, v, scales);
					used[v.key] = dane.filter((d) => d.used !== 'goals').length / dane.length;
					modele.set(v.key, fitRatings(dane, { referenceDate }));
				}
				stan = { cov: coverage(nauka, referenceDate), scales, used };
			} else {
				modele = null;
			}
			waznyDo = m.t + Math.max(1, refitDays) * 86_400_000;
		}
		if (!modele) continue;

		const row = {
			leagueId,
			date: m.date,
			outcome: outcomeOf(m),
			known: true,
			cov: stan.cov,
			scales: stan.scales,
			used: stan.used,
			market: m.market || null,
			extra: m.extra ?? null,
			base: baseline,
			p: {},
			picks: {},
		};
		for (const v of variants) {
			const model = modele.get(v.key);
			const eg = expectedGoals(model, m.homeId, m.awayId);
			const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);
			row.p[v.key] = { home: rynki.matchWinner.home, draw: rynki.matchWinner.draw, away: rynki.matchWinner.away };
			row.known = eg.known;
			// Typy tylko przy znanych drużynach — produkcja nie wystawia plakietki dla nieznanej.
			row.picks[v.key] = [];
			if (!eg.known) continue;
			for (const s of SELEKCJE) {
				const p = 100 * s.p(rynki);
				if (p >= prog(s.key)) row.picks[v.key].push({ key: s.key, p, won: s.won(m.homeGoals, m.awayGoals) });
			}
		}
		rows.push(row);
	}
	return { rows, baseline };
}

/** Średnia i statystyka t sparowanych różnic (dodatnia średnia = wariant lepszy od odniesienia). */
export function pairedT(diffs) {
	const n = diffs.length;
	if (!n) return { n: 0, mean: null, t: 0 };
	const mean = diffs.reduce((a, b) => a + b, 0) / n;
	if (n < 2) return { n, mean, t: 0 };
	const sd = Math.sqrt(diffs.reduce((a, d) => a + (d - mean) ** 2, 0) / (n - 1));
	// Rozrzut na poziomie błędu zaokrągleń to brak rozrzutu, nie „nieskończona istotność".
	return { n, mean, t: sd > 1e-12 ? mean / (sd / Math.sqrt(n)) : 0 };
}

/**
 * Zestawienie wariantów na zbiorze wierszy z `evaluateVariants` (dowolnie przefiltrowanym:
 * liga, okres, pokrycie xG). Różnice i `t` są wobec wariantu `reference` (domyślnie gole).
 */
export function summarize(rows, { variants = VARIANTS, reference = 'G' } = {}) {
	const n = rows.length;
	const sr = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const out = { n, variants: {}, base: null, market: null };
	if (!n) return out;

	out.base = { logLoss: sr(rows.map((r) => logLoss(r.base, r.outcome))), brier: sr(rows.map((r) => brier(r.base, r.outcome))) };
	const zRynkiem = rows.filter((r) => r.market);
	if (zRynkiem.length) {
		out.market = {
			n: zRynkiem.length,
			logLoss: sr(zRynkiem.map((r) => logLoss(r.market, r.outcome))),
			brier: sr(zRynkiem.map((r) => brier(r.market, r.outcome))),
			// Warianty na TYCH SAMYCH meczach — inaczej porównanie z rynkiem jest krzywe.
			variants: Object.fromEntries(variants.map((v) => [v.key, sr(zRynkiem.map((r) => logLoss(r.p[v.key], r.outcome)))])),
		};
	}

	for (const v of variants) {
		const dLL = pairedT(rows.map((r) => logLoss(r.p[reference], r.outcome) - logLoss(r.p[v.key], r.outcome)));
		const dBr = pairedT(rows.map((r) => brier(r.p[reference], r.outcome) - brier(r.p[v.key], r.outcome)));
		const typy = rows.flatMap((r) => r.picks[v.key] || []);
		out.variants[v.key] = {
			logLoss: sr(rows.map((r) => logLoss(r.p[v.key], r.outcome))),
			brier: sr(rows.map((r) => brier(r.p[v.key], r.outcome))),
			gain: dLL.mean,
			t: dLL.t,
			brierGain: dBr.mean,
			brierT: dBr.t,
			picks: typy.length,
			promised: typy.length ? sr(typy.map((x) => x.p)) : null,
			hit: typy.length ? (100 * typy.filter((x) => x.won).length) / typy.length : null,
			used: sr(rows.map((r) => r.used?.[v.key] ?? 0)),
		};
	}
	return out;
}
