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
 * `base` w opcjach nadpisuje normę z tabeli — tak samo jak w `liftFor` i `meetsPolicy`.
 * W meczu w trakcie norma jest liczona dla aktualnego stanu, więc i próg jest inny.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {{ base?: number }} [options]
 * @returns {number|null}
 */
export function entryThresholdFor(normalized, { base: override } = {}) {
	const base = Number.isFinite(override) ? override : baseRateFor(normalized);
	if (base === null) return null;
	// Najmniejsze całkowite p, dla którego zaokrąglona przewaga sięga MIN_LIFT.
	return Math.max(MIN_PROBABILITY, Math.ceil(base + MIN_LIFT - 0.5));
}

/**
 * SUFIT RYNKOWY: „to już wszyscy wiedzą".
 *
 * Przewaga nad normą ligową nie wyklucza zdarzeń, które rynek uważa za pewne. Typ „gość
 * strzeli" przy 85% wobec normy 70% jest prawdziwym zdaniem o tej parze drużyn — i kursem
 * 1,04 u bukmachera, bo rynek widział dziurawą obronę gospodarzy lepiej niż my. Taki typ
 * nie mówi czytelnikowi niczego, czego nie wiedziałby każdy.
 *
 * Gdy rynek daje selekcji co najmniej tyle procent (po zdjęciu marży), typu nie wystawiamy.
 *
 * GRANICA, KTÓREJ PILNUJEMY: rynek jest WYŁĄCZNIE sufitem, nigdy bazą do liczenia przewagi.
 * „Przewaga nad rynkiem" to value betting — mechanika usunięta z serwisu świadomie i to
 * się nie zmienia. Żadna liczba rynkowa nie trafia do treści analizy, raportu, interfejsu
 * ani do odpowiedzi API; zostaje w bazie przy typie do pomiaru po rozliczeniu.
 */
export const MARKET_CEILING = 90;

/**
 * Prawdopodobieństwo rynkowe dla znormalizowanej selekcji z wyniku `impliedFromOdds`.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {object|null} implied wynik `impliedFromOdds` z `lib/football/normalize`
 * @returns {number|null} procent po zdjęciu marży albo `null`, gdy rynek nie wycenia selekcji
 */
export function marketProbabilityFor(normalized, implied) {
	if (!normalized || !implied) return null;
	let klucz = null;
	switch (normalized.type) {
		case 'matchWinner':
			klucz = normalized.value;
			break;
		case 'doubleChance':
			klucz = normalized.value === '12' ? null : normalized.value;
			break;
		case 'teamGoals':
			if (normalized.dir === 'over' && normalized.line === TEAM_GOALS_TESTED_LINE) {
				klucz = normalized.side === 'home' ? 'homeScores' : 'awayScores';
			}
			break;
		default:
			klucz = null;
	}
	const v = klucz ? implied[klucz] : null;
	return Number.isFinite(v) ? v : null;
}

/**
 * POWODY PROGOWE — typ jest słabszy, niż chcielibyśmy, ale nadal jest prognozą.
 *
 * Decyzja produktowa: analiza bez typu wygląda dla czytelnika na pustą, więc gdy nic nie
 * sięga progu, wystawiamy typ zapasowy od modelu językowego I LICZYMY GO do skuteczności.
 * Te dwa powody odrzucenia znaczą tylko tyle, że przewaga nad normą jest za mała.
 *
 * Pozostałe powody to co innego i pozostają twarde: `market_not_predictable` (rynek, w którym
 * pomiar wykazał, że szkodzimy), `market_not_measured` (selekcja bez zmierzonej normy)
 * oraz `market_certain` (zdarzenie, które rynek uważa za pewne — dokładnie ten typ za kurs
 * 1,04, od którego zaczęła się cała ta praca). Ich wliczanie cofnęłoby zmianę, o którą
 * chodziło.
 */
export const THRESHOLD_REASONS = new Set(['below_min_probability', 'below_min_lift']);

/**
 * Czy typ odrzucony przez politykę nadal wchodzi do statystyki jako zapasowy.
 *
 * @param {string|null} reason `policyReason` z `meetsPolicy`
 */
export function countsAsFallback(reason) {
	return THRESHOLD_REASONS.has(reason);
}

/**
 * Czy typ wchodzi do publicznej statystyki skuteczności.
 *
 * @param {object|null} normalized wynik `normalizePick`
 * @param {number|null} probability deklarowane prawdopodobieństwo w procentach
 * @param {{ base?: number, market?: number }} [options] `base` — norma warunkowa zamiast
 *   tabelarycznej (patrz `liftFor`); `market` — prawdopodobieństwo rynkowe selekcji po zdjęciu
 *   marży, do sufitu `MARKET_CEILING`
 * @returns {{ ok: boolean, reason: string|null }}
 */
export function meetsPolicy(normalized, probability, { base: override, market } = {}) {
	if (!normalized) return { ok: false, reason: 'market_not_supported' };

	if (BANNED_MARKET_TYPES.has(normalized.type)) {
		return { ok: false, reason: 'market_not_predictable' };
	}

	// Selekcja bez zmierzonej normy (np. drużyna powyżej 1.5 gola) — nie udajemy, że ją znamy.
	const base = Number.isFinite(override) ? override : baseRateFor(normalized);
	if (base === null) return { ok: false, reason: 'market_not_measured' };

	// Zdarzenie, które rynek uważa za pewne, nie jest typem niezależnie od naszego procentu.
	if (Number.isFinite(market) && market >= MARKET_CEILING) {
		return { ok: false, reason: 'market_certain' };
	}

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
