import { liftFor, meetsPolicy } from '@/lib/picks/policy';
import { SELECTION_SHAPES } from '@/lib/picks/markets';

/**
 * TRYB CIENIA: „typy modelu przy kursie ≥ 1,50" — część czysta (bez bazy i sieci).
 *
 * PYTANIE. Czy model daje dobre typy tam, gdzie bukmacher płaci co najmniej 1,50? Kurs 1,50
 * przy typie modelu znaczy, że rynek ocenia szansę wyraźnie niżej niż model — i dopiero
 * pomiar mówi, kto w takim sporze ma rację. Pierwsze 23 rozliczone typy (wrzesień 2026)
 * mówiły, że częściej rynek: model obiecywał ~71%, trafił 48%.
 *
 * DLATEGO NAJPIERW CIEŃ. Kursy dopisujemy do dziennika prognoz (`ModelForecast`) —
 * rano („otwarcie", to, co zobaczyłby czytelnik zakładki) i tuż przed meczem („zamknięcie").
 * Użytkownik nie widzi niczego, typy nie wchodzą do publicznej skuteczności, nic nie trafia
 * do interfejsu ani promptów. Decyzję o zakładce podejmujemy dopiero na liczbach.
 *
 * TE SAME FUNKCJE LICZĄ HISTORIĘ I ŻYWE DANE. Eksperyment na archiwach football-data
 * (`oddsExperiment.mjs`) i raport z dziennika (`oddsShadowCheck.mjs`) budują ten sam kształt
 * rekordu i przepuszczają go przez te same reguły i ten sam bilans — dwie miary, jedna definicja.
 *
 * TRZY MIARY, BO KAŻDA MÓWI CO INNEGO:
 *   - trafność wobec obietnicy — czy „70%" trafia w 70% (kalibracja; zbiega się najszybciej);
 *   - zwrot przy stałej stawce — po kursie rynkowym i po polskim podatku 12% od stawki;
 *   - CLV (kurs otwarcia wobec zamknięcia) — czy rynek przesuwa się W STRONĘ modelu. Najszybszy
 *     uczciwy sygnał przewagi: zwrot potrzebuje tysięcy zakładów, CLV kilkuset.
 */

/** Próg kursu, o który pytał właściciel serwisu. */
export const MIN_ODDS = 1.5;

/**
 * Podatek od gier w Polsce: 12% od stawki u legalnych bukmacherów. Kurs 1,50 daje realnie
 * 1,50 × 0,88 = 1,32 — żeby wyjść na zero, typ musi mieć przewagę ponad 12%, nie ponad marżę.
 */
export const PL_TAX = 0.12;

/** Selekcje, które dziennik prognoz zna i które da się wycenić kursem. */
export const SELECTIONS = ['home', 'draw', 'away', 'dc1X', 'dcX2', 'homeScores', 'awayScores', 'over25'];

/** Klucz plakietki (`SELECTION_SHAPES`) → klucz selekcji w dzienniku. */
export const HINT_TO_SELECTION = {
	home: 'home',
	away: 'away',
	'1X': 'dc1X',
	X2: 'dcX2',
	homeScores: 'homeScores',
	awayScores: 'awayScores',
	over25: 'over25',
};

const kurs = (v) => (Number.isFinite(v) && v > 1 ? Number(v.toFixed(3)) : null);

/**
 * Zdjęcie kursów z wyniku `normalizeOddsFixture` — mediana bukmacherów per selekcja.
 *
 * Mediana, nie najlepszy kurs: pojedynczy bukmacher z egzotycznym kursem to nie jest kurs,
 * który czytelnik dostanie. Nazw bukmacherów nie zapisujemy — nie są potrzebne do pomiaru.
 *
 * @returns {null | { at: Date, bookmakers: number, home, draw, away, dc1X, dcX2, homeScores, awayScores, over25 }}
 */
export function oddsSnapshot(normalized, at = new Date()) {
	const m = normalized?.markets;
	if (!m) return null;
	const tg = m.teamGoals || {};
	const out = {
		home: kurs(m.matchWinner?.home),
		draw: kurs(m.matchWinner?.draw),
		away: kurs(m.matchWinner?.away),
		dc1X: kurs(m.doubleChance?.homeDraw),
		dcX2: kurs(m.doubleChance?.drawAway),
		homeScores: kurs(tg.home?.over05 ?? tg.home?.scoreYes),
		awayScores: kurs(tg.away?.over05 ?? tg.away?.scoreYes),
		over25: kurs(m.goals25?.over),
	};
	if (!Object.values(out).some((v) => v !== null)) return null;
	return { at, bookmakers: normalized.bookmakerCount ?? null, ...out };
}

/**
 * Kursy podwójnej szansy z kursów 1X2 — dla archiwów, które DC nie mają.
 * Ta sama marża co w 1X2, więc to przybliżenie oferty, nie kurs z tablicy.
 */
export function doubleChanceFrom1x2({ home, draw, away } = {}) {
	const ok = (v) => Number.isFinite(v) && v > 1;
	return {
		dc1X: ok(home) && ok(draw) ? kurs(1 / (1 / home + 1 / draw)) : null,
		dcX2: ok(away) && ok(draw) ? kurs(1 / (1 / away + 1 / draw)) : null,
	};
}

/** Czy selekcja weszła przy wyniku `home:away` (90 minut). `null` bez wyniku. */
export function settleSelection(key, home, away) {
	if (!Number.isFinite(home) || !Number.isFinite(away)) return null;
	switch (key) {
		case 'home':
			return home > away;
		case 'draw':
			return home === away;
		case 'away':
			return away > home;
		case 'dc1X':
			return home >= away;
		case 'dcX2':
			return away >= home;
		case 'homeScores':
			return home > 0;
		case 'awayScores':
			return away > 0;
		case 'over25':
			return home + away > 2;
		default:
			return null;
	}
}

/**
 * Plakietka modelu z prawdopodobieństw — dokładnie gałąź modelu z `evaluateMarkets`
 * i `bestHint`: próg polityki, odrzucenie powyżej 92%, najwyższa przewaga nad normą.
 * Dla historii, gdzie produkcyjnej plakietki nie ma. `over25` pomijamy: w produkcji
 * wymaga kalibracji cechami drużyn, której archiwum nie odtworzy bez przecieku.
 *
 * @param {{ home, away, dc1X, dcX2, homeScores, awayScores }} markets ułamki 0–1
 * @returns {{ key: string, probability: number, lift: number } | null}
 */
export function hintFromMarkets(markets) {
	const kandydaci = [
		['home', markets?.home],
		['away', markets?.away],
		['1X', markets?.dc1X],
		['X2', markets?.dcX2],
		['homeScores', markets?.homeScores],
		['awayScores', markets?.awayScores],
	];
	let najlepszy = null;
	for (const [key, frac] of kandydaci) {
		if (!Number.isFinite(frac)) continue;
		const pModel = 100 * frac;
		if (pModel > 92) continue;
		const p = Math.round(pModel);
		const normalized = SELECTION_SHAPES[key].normalized;
		if (!meetsPolicy(normalized, p).ok) continue;
		const { lift } = liftFor(normalized, p);
		if (!najlepszy || lift > najlepszy.lift) najlepszy = { key, probability: p, lift };
	}
	return najlepszy;
}

/**
 * REGUŁY — co zakładka mogłaby pokazać. Każda daje najwyżej jeden zakład na mecz.
 *
 *   hint    plakietka modelu (ten sam typ, który widać na liście meczów), gdy kurs ≥ 1,50
 *   edge5   dowolna selekcja z kursem ≥ 1,50, przy której model widzi wartość ≥ 5%
 *           (prawdopodobieństwo × kurs ≥ 1,05) — ta z największą
 *   edge10  jak wyżej, ≥ 10%
 *   edge20  jak wyżej, ≥ 20%
 */
export const RULES = {
	hint: { label: 'plakietka modelu, kurs ≥ 1,50' },
	edge5: { label: 'wartość wg modelu ≥ 5%, kurs ≥ 1,50', edge: 0.05 },
	edge10: { label: 'wartość wg modelu ≥ 10%, kurs ≥ 1,50', edge: 0.1 },
	edge20: { label: 'wartość wg modelu ≥ 20%, kurs ≥ 1,50', edge: 0.2 },
};

/**
 * Zakład wskazany przez regułę dla jednego rekordu — albo `null`.
 *
 * @param {{ markets: object, hint?: { key: string|null }, odds?: { open?: object, close?: object }, result?: { home, away } }} record
 *   `markets` to ułamki jak w `ModelForecast.markets`; `odds.open`/`odds.close` jak z `oddsSnapshot`
 * @param {keyof RULES} rule
 * @returns {null | { selection: string, p: number, odds: number, closeOdds: number|null, won: boolean|null }}
 */
export function betFor(record, rule, { minOdds = MIN_ODDS } = {}) {
	const open = record?.odds?.open;
	if (!open) return null;
	const close = record.odds.close || null;
	const zaklad = (selection) => ({
		selection,
		p: record.markets[selection],
		odds: open[selection],
		closeOdds: close?.[selection] ?? null,
		won: settleSelection(selection, record.result?.home, record.result?.away),
	});

	if (rule === 'hint') {
		const selection = HINT_TO_SELECTION[record.hint?.key];
		if (!selection || !(open[selection] >= minOdds) || !Number.isFinite(record.markets?.[selection])) return null;
		return zaklad(selection);
	}

	const edge = RULES[rule]?.edge;
	if (!Number.isFinite(edge)) return null;
	let najlepsza = null;
	for (const s of SELECTIONS) {
		const p = record.markets?.[s];
		const o = open[s];
		if (!Number.isFinite(p) || !(o >= minOdds)) continue;
		const ev = p * o - 1;
		if (ev >= edge && (!najlepsza || ev > najlepsza.ev)) najlepsza = { s, ev };
	}
	return najlepsza ? zaklad(najlepsza.s) : null;
}

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Bilans zakładów po stałej stawce 1. Zakłady bez wyniku są pomijane.
 *
 * @param {Array<{ p: number, odds: number, closeOdds: number|null, won: boolean|null }>} bets
 * @returns {{ n, won, hitRate, promised, implied, avgOdds, roi, roiTaxed, roiSe, clv, clvShare, clvN }}
 */
export function summarize(bets) {
	const rozliczone = (bets || []).filter((b) => b && typeof b.won === 'boolean' && Number.isFinite(b.odds));
	const n = rozliczone.length;
	if (!n) return { n: 0 };
	const zyski = rozliczone.map((b) => (b.won ? b.odds - 1 : -1));
	const zyskiPoPodatku = rozliczone.map((b) => (b.won ? b.odds * (1 - PL_TAX) - 1 : -1));
	const roi = srednia(zyski);
	const wariancja = n > 1 ? zyski.reduce((s, z) => s + (z - roi) ** 2, 0) / (n - 1) : null;
	const zClv = rozliczone.filter((b) => Number.isFinite(b.closeOdds));
	return {
		n,
		won: rozliczone.filter((b) => b.won).length,
		hitRate: rozliczone.filter((b) => b.won).length / n,
		promised: srednia(rozliczone.map((b) => b.p)),
		implied: srednia(rozliczone.map((b) => 1 / b.odds)),
		avgOdds: srednia(rozliczone.map((b) => b.odds)),
		roi,
		roiTaxed: srednia(zyskiPoPodatku),
		roiSe: wariancja === null ? null : Math.sqrt(wariancja / n),
		clvN: zClv.length,
		clv: zClv.length ? srednia(zClv.map((b) => b.odds / b.closeOdds - 1)) : null,
		clvShare: zClv.length ? zClv.filter((b) => b.closeOdds < b.odds).length / zClv.length : null,
	};
}
