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
 * podwójna szansa 1X od 81%, X2 od 68%, gospodarz strzeli od 91% („gość strzeli" — wyłączone
 * od 21.11.2026, niżej). Od 21.11.2026 ten sam próg musi przejść także szansa z kursu, gdy kurs
 * jest (`lib/picks/chance.js`) — przewaga dalej liczy się od normy, nie od rynku.
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
 * Ile meczów w sezonie musi mieć za sobą każda drużyna, żeby typ w ogóle powstał — i żeby
 * się liczył. JEDNA LICZBA DLA OBU RZECZY, CELOWO.
 *
 * Do września 2026 były dwie: raport publikował od 4 rozegranych meczów, a statystyka
 * wliczała od 6. Skutek był niewidoczny i duży: 61 ze 138 rozliczonych typów miesiąca
 * (44%) — cała Europa po starcie sezonu — było pokazywanych użytkownikom, rozliczanych,
 * i nie wchodziło do publicznej skuteczności. Trafiały przy tym LEPIEJ niż te wliczane
 * (71% przy normie 55%). Panel zaniżał własny wynik, a nikt nie miał jak tego zauważyć,
 * bo `played` nie było zapisywane przy typie.
 *
 * Zasada, która stoi w kodzie od dawna: skoro typ pokazujemy, musimy go też liczyć.
 * Ta stała jest jej gwarancją: raport i pomiar importują ten sam symbol, więc nie mogą
 * się rozjechać. Cztery, nie sześć, bo model sił drużyn uczy się na dwóch sezonach
 * i po czterech kolejkach ma pokrycie; niżej prognoza dostawcy jest zgadywaniem.
 */
export const MIN_PLAYED = 4;

/**
 * Rynki, w których nie prognozujemy.
 *
 * Backtest na 3541 meczach: każdy z nich wypada gorzej niż stała prognoza równa własnej
 * częstości. Ujemny zysk znaczy, że typ jest gorszy niż jego brak.
 *
 * Suma goli ZOSTAJE zakazana z jednym wyjątkiem: „powyżej 2,5" po kalibracji cechami drużyn
 * (`lib/model/goals.js`). Wyjątek nie jest w tej liście, tylko w `isBannedMarket`, bo zależy
 * od progu i kierunku, nie od samego typu rynku.
 */
export const BANNED_MARKET_TYPES = new Set(['btts']);

/** Jedyna dopuszczona selekcja sumy goli — zmierzona eksperymentem, patrz README modelu. */
const TOTAL_GOALS_ALLOWED = { dir: 'over', line: 2.5 };

/**
 * „GOŚCIE STRZELĄ GOLA" — WYŁĄCZONE OD 21.11.2026, pomiarem.
 *
 * Najgorsza selekcja serwisu: 123 rozliczone typy, obiecane 85%, trafione 67%. Dziennik prognoz
 * (2358 meczów, 18.09–16.11.2026) pokazuje, że to nie pech typów, tylko model:
 *
 *   szansa modelu „goście strzelą"   meczów   model   fakt     kurs (1/kurs)
 *   75–80%                             315    77,5%   78,1%    81,4%
 *   80–85%                             244    82,4%   75,4%    84,9%
 *   85–90%                             151    87,2%   84,1%    89,4%
 *   90%+                               100    92,9%   89,0%    92,7%
 *
 * Regresja „szansa modelu → wynik" daje nachylenie 0,63 (dla gospodarzy 0,85, dla 1X2 ok. 0,95):
 * model różnicuje tę szansę o połowę za mocno. Próg selekcji to 82% (norma 70% + 12 pkt), czyli
 * dokładnie obszar, w którym przesadza: mecze z szansą ≥ 82% do 19.10 — 87% obiecane, 86% trafione
 * (162 mecze), od 20.10 — 87% i 80% (256). PLAKIETKI z tą selekcją (wybierane, gdy jej przewaga
 * jest największa): 106 — obiecane 85%, trafione 72%, czyli tyle, ile wynosi norma (goście strzelają
 * w 71% wszystkich meczów). Typ nie mówił nic ponad „zwykle" i obiecywał 13 pkt za dużo; nawet rynek
 * w tych meczach dawał 80%, a weszło 69% (93 z kursem).
 *
 * Korekta szansy zamiast wyłączenia była policzona i odrzucona: dopasowana na meczach do 19.10
 * nadal obiecywała za dużo na późniejszych (236 meczów nad progiem: 85% obiecane, 80% trafione),
 * a plakietki z najwyższą szansą (≥ 86%, 36 typów) trafiły 75%. Potwierdzenie kursem też jej nie
 * ratuje: plakietki „goście strzelą", przy których i kurs daje ≥ 82% (32), obiecywały 84%, weszło 78%,
 * od 20.10 — 74% (23). Na WSZYSTKICH meczach z obiema szansami ≥ 82% selekcja trafia 88% (250), ale
 * plakietką zostaje wtedy, gdy przegrywa z nią każda inna selekcja meczu — i dokładnie tam zawodzi.
 * „GOSPODARZE STRZELĄ" ZOSTAJĄ:
 * model jest tu skalibrowany (85–90%: 87% → 89%; 90%+: 93% → 95%, 262 mecze), a typy trafiły 92%
 * (26) przy obiecanych 92%.
 *
 * Reguła jest w `isBannedMarket`, więc działa wszędzie naraz: plakietki, raport, analiza (także
 * w trakcie meczu), typ dnia, nogi kuponów i asystent biorą selekcje przez `meetsPolicy`.
 * Typy sprzed wyłączenia zostają w skuteczności tak, jak były.
 */
export const BANNED_TEAM_GOALS_SIDES = new Set(['away']);

/** Czy selekcja należy do rynku, w którym nie prognozujemy. */
export function isBannedMarket(normalized) {
	if (!normalized) return true;
	if (BANNED_MARKET_TYPES.has(normalized.type)) return true;
	if (normalized.type === 'totalGoals') {
		return !(normalized.dir === TOTAL_GOALS_ALLOWED.dir && normalized.line === TOTAL_GOALS_ALLOWED.line);
	}
	if (normalized.type === 'teamGoals') return BANNED_TEAM_GOALS_SIDES.has(normalized.side);
	return false;
}

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
		/*
		 * Suma goli CELOWO bez normy tabelarycznej. Norma „powyżej 2,5" jest ligowa
		 * (Bundesliga ~57 %, Ligue 1 ~48 %) i przychodzi z typem od modelu (`baseRate`).
		 * Typ bez niej — np. napisany przez model językowy z własnej głowy — dostaje
		 * `market_not_measured` i nie wchodzi do statystyki. To jest bezpiecznik: liczą
		 * się wyłącznie typy z kalibracji, bo tylko one były zmierzone.
		 */
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
 * GRANICA, KTÓREJ PILNUJEMY: rynek nigdy nie jest bazą do liczenia PRZEWAGI. „Przewaga nad
 * rynkiem" to value betting — mechanika usunięta z serwisu świadomie i to się nie zmienia.
 *
 * ZMIANA ŚWIADOMA OD 21.11.2026 (decyzja właściciela, pomiar w `lib/picks/chance.js`): rynek
 * przestał być „tylko sufitem". Gdy kurs jest, z niego pochodzi pokazywana i zapisywana SZANSA
 * typu (po zdjęciu marży), a typ, którego szansa z kursu nie przechodzi progu polityki, nie powstaje.
 * Przewaga nadal liczy się od normy. Szansę podpisujemy uczciwie („z kursów"), ale treści analiz,
 * raportów i asystenta dalej nie piszą o kursach, bukmacherach ani „przewadze nad rynkiem".
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
		case 'totalGoals':
			if (normalized.dir === TOTAL_GOALS_ALLOWED.dir && normalized.line === TOTAL_GOALS_ALLOWED.line) {
				klucz = 'over25';
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

	if (isBannedMarket(normalized)) {
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
