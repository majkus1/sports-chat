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
 * Częstości bazowe selekcji — jak często zdarzenie zachodzi SAMO Z SIEBIE, bez patrzenia
 * na drużyny. Policzone na 3590 meczach uczących w backteście. Remis i „12" są dopełnieniem
 * zmierzonych wartości, nie osobnym pomiarem.
 *
 * To jest punkt odniesienia dla każdego typu. Bez niego procent nic nie mówi: „gospodarz
 * strzeli gola" przy 80% brzmi jak mocny typ, a jest o włos od tego, co dzieje się w każdym
 * meczu bez wyjątku.
 */
export const BASE_RATES = {
	matchWinner: { home: 43.8, draw: 25.5, away: 30.7 },
	doubleChance: { '1X': 69.3, X2: 56.2, 12: 74.5 },
	/** Drużyna strzeli co najmniej gola (powyżej 0.5). */
	teamGoals: { home: 78.6, away: 70.0 },
};

/**
 * TYP LICZY SIĘ DOPIERO WTEDY, GDY MÓWI COŚ PONAD NORMĘ.
 *
 * Poprzednia wersja miała próg na sam procent, osobny dla każdego rynku i ustawiony tuż nad
 * jego częstością bazową. Skutek był mechaniczny: przechodziły typy, które ledwie wystają
 * ponad to, co zdarza się samo — „gość strzeli gola" przy 85% na rynku, w którym gość strzela
 * w 70% meczów. Prawdziwe, pewne i bez treści; kurs takich zdarzeń u bukmachera to 1,04.
 *
 * Wartość typu nie leży w wysokości procentu, tylko w ODLEGŁOŚCI od normy. Stąd dwa warunki:
 *
 *   MIN_PROBABILITY — dolna granica, żeby nie wystawiać rzutu monetą jako typu;
 *   MIN_LIFT        — o ile punktów procentowych typ musi przewyższać częstość bazową.
 *
 * Wynikające progi (wyższy z obu warunków): zwycięstwo gospodarzy od 60%, gości od 60%,
 * podwójna szansa 1X od 81%, X2 od 68%, gospodarz strzeli od 91%, gość strzeli od 82%.
 * Zamiast jednego progu na rynek — próg na selekcję, bo 1X i X2 to inne światy.
 *
 * Konsekwencja, którą trzeba przyjąć świadomie: trafność publicznej statystyki SPADNIE,
 * bo znikną z niej typy trafiające niemal zawsze. To nie regres modelu, tylko koniec
 * pompowania procentu banałami. Uczciwą miarą jest trafność zestawiona z normą tych samych
 * typów — i tak ją pokazujemy.
 *
 * Obie liczby są parametrami do strojenia backtestem, nie dogmatem.
 */
export const MIN_PROBABILITY = 60;
export const MIN_LIFT = 12;

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
 * Częstość bazowa dla znormalizowanego typu, w procentach. `null`, gdy selekcja nie ma
 * zmierzonej normy — wtedy nie da się powiedzieć, czy typ cokolwiek wnosi.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @returns {number|null}
 */
export function baseRateFor(normalized) {
	if (!normalized) return null;
	switch (normalized.type) {
		case 'matchWinner':
			return BASE_RATES.matchWinner[normalized.value] ?? null;
		case 'doubleChance':
			return BASE_RATES.doubleChance[normalized.value] ?? null;
		case 'teamGoals':
			if (normalized.dir !== 'over' || normalized.line !== TEAM_GOALS_TESTED_LINE) return null;
			return BASE_RATES.teamGoals[normalized.side] ?? null;
		default:
			return null;
	}
}

/**
 * Przewaga deklarowanego prawdopodobieństwa nad normą rynku, w punktach procentowych.
 *
 * Zaokrąglona do całości, bo dokładnie tę liczbę pokazujemy czytelnikowi — a próg liczony
 * na niezaokrąglonej dawałby typy z podpisem „+12 pkt", które progu 12 nie przeszły.
 *
 * `base` w opcjach nadpisuje normę z tabeli. Potrzebne w meczu W TRAKCIE: norma
 * „gospodarz wygra" przy 2:0 w 80. minucie nie wynosi 44%, tylko tyle, ile dałaby
 * przeciętna para drużyn w tej samej sytuacji — i to liczy `lib/analysis/model`.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {number|null} probability deklarowane prawdopodobieństwo w procentach
 * @param {{ base?: number }} [options]
 * @returns {{ base: number|null, lift: number|null }}
 */
export function liftFor(normalized, probability, { base: override } = {}) {
	const base = Number.isFinite(override) ? override : baseRateFor(normalized);
	if (base === null || !Number.isFinite(probability)) return { base, lift: null };
	return { base, lift: Math.round(probability - base) };
}

/**
 * Najniższe całkowite prawdopodobieństwo, przy którym selekcja przechodzi politykę.
 * Do instrukcji dla modelu językowego — żeby prompt i kod mówiły tę samą liczbę.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @returns {number|null}
 */
export function entryThresholdFor(normalized) {
	const base = baseRateFor(normalized);
	if (base === null) return null;
	// Najmniejsze całkowite p, dla którego zaokrąglona przewaga sięga MIN_LIFT.
	return Math.max(MIN_PROBABILITY, Math.ceil(base + MIN_LIFT - 0.5));
}

/**
 * Czy typ wchodzi do publicznej statystyki skuteczności.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {number|null} probability deklarowane prawdopodobieństwo w procentach
 * @param {{ base?: number }} [options] norma warunkowa zamiast tabelarycznej — patrz `liftFor`
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function meetsPolicy(normalized, probability, { base: override } = {}) {
	if (!normalized) return { ok: false, reason: 'market_not_supported' };

	if (BANNED_MARKET_TYPES.has(normalized.type)) {
		return { ok: false, reason: 'market_not_predictable' };
	}

	// Selekcja bez zmierzonej normy (np. drużyna powyżej 1.5 gola) — nie udajemy, że ją znamy.
	const base = Number.isFinite(override) ? override : baseRateFor(normalized);
	if (base === null) return { ok: false, reason: 'market_not_measured' };

	/*
	 * Brak deklarowanego prawdopodobieństwa nie wyklucza typu.
	 *
	 * Typy sprzed wprowadzenia tego pola oraz te z modeli, które go nie zwracają, muszą
	 * dalej się liczyć — inaczej wykluczylibyśmy całą historię za brak metadanej, a nie
	 * za jakość prognozy.
	 */
	if (!Number.isFinite(probability)) return { ok: true, reason: null };

	if (probability < MIN_PROBABILITY) return { ok: false, reason: 'below_min_probability' };

	const { lift } = liftFor(normalized, probability, { base });
	if (lift < MIN_LIFT) return { ok: false, reason: 'below_min_lift' };

	return { ok: true, reason: null };
}
