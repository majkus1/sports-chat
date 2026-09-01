/**
 * Które typy w ogóle liczą się do skuteczności — jedna reguła dla wszystkich ścieżek.
 *
 * DLACZEGO TO NIE MOŻE ŻYĆ W PROMPCIE. Raport ma filtr po stronie kodu, więc typ spoza
 * dozwolonych rynków nigdy nie powstanie. Analiza meczu takiego filtra nie miała: reguły
 * były wyłącznie instrukcją dla modelu językowego, a on może ich nie posłuchać — i wtedy
 * typ na sumę goli wpadał do statystyki mimo zakazu. Instrukcja to prośba, nie gwarancja.
 *
 * ZNACZAMY, NIE KASUJEMY. Typ łamiący regułę zostaje widoczny przy meczu, ale nie wchodzi
 * do publicznej skuteczności. Usuwanie go byłoby gorsze: analiza jest strumieniowana do
 * przeglądarki w trakcie pisania, więc użytkownik zdążyłby zobaczyć typ, który potem
 * zniknąłby z historii — a rozjazd między tym, co widać, a tym, co liczymy, jest dokładnie
 * tym, czego cała warstwa pomiaru ma unikać.
 */

/**
 * Minimalne prawdopodobieństwo dla rynku, po znormalizowanym typie z `lib/picks/markets`.
 *
 * Progi stoją wyraźnie POWYŻEJ częstości bazowej każdego rynku, policzonej na 3590 meczach
 * uczących w backteście:
 *
 *     zwycięstwo gospodarzy   43,8%   |  gość        30,7%
 *     podwójna szansa 1X      69,3%   |  X2          56,2%
 *     gospodarz strzeli gola  78,6%   |  gość        70,0%
 *
 * Bez tego typ „drużyna strzeli" z wynikiem 75% wygląda na mocny, a jest słabszy niż
 * zgadywanie średniej ligowej.
 */
export const MARKET_MIN_PROBABILITY = {
	matchWinner: 62,
	doubleChance: 74,
	teamGoals: 85,
};

/**
 * Rynki, w których nie prognozujemy.
 *
 * Backtest na 3541 meczach: każdy z nich wypada gorzej niż stała prognoza równa własnej
 * częstości. Ujemny zysk znaczy, że typ jest gorszy niż jego brak.
 */
export const BANNED_MARKET_TYPES = new Set(['totalGoals', 'btts']);

/** Próg dla progów drużynowych innych niż 0.5 — tych backtest nie sprawdzał. */
const TEAM_GOALS_TESTED_LINE = 0.5;

/**
 * Czy typ wchodzi do publicznej statystyki skuteczności.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {number|null} probability deklarowane prawdopodobieństwo w procentach
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function meetsPolicy(normalized, probability) {
	if (!normalized) return { ok: false, reason: 'market_not_supported' };

	if (BANNED_MARKET_TYPES.has(normalized.type)) {
		return { ok: false, reason: 'market_not_predictable' };
	}

	// Progi drużynowe powyżej 0.5 gola nie były mierzone — nie udajemy, że je znamy.
	if (normalized.type === 'teamGoals' && normalized.line !== TEAM_GOALS_TESTED_LINE) {
		return { ok: false, reason: 'market_not_measured' };
	}

	const prog = MARKET_MIN_PROBABILITY[normalized.type];
	if (prog === undefined) return { ok: false, reason: 'market_not_measured' };

	/*
	 * Brak deklarowanego prawdopodobieństwa nie wyklucza typu.
	 *
	 * Typy sprzed wprowadzenia tego pola oraz te z modeli, które go nie zwracają, muszą
	 * dalej się liczyć — inaczej wykluczylibyśmy całą historię za brak metadanej, a nie
	 * za jakość prognozy.
	 */
	if (!Number.isFinite(probability)) return { ok: true, reason: null };

	if (probability < prog) return { ok: false, reason: 'below_market_threshold' };

	return { ok: true, reason: null };
}
