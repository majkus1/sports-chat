/**
 * Stan widoku w adresie strony — czyste funkcje, bez Reacta i bez `window`.
 *
 * Wybrana zakładka, okres czy dzień listy żyły dotąd wyłącznie w `useState`, więc ginęły
 * przy każdym powrocie: wejście w mecz i „Wstecz" otwierało stronę od wartości domyślnych,
 * a odświeżenie albo wysłany komuś odnośnik pokazywały coś innego niż to, na co się patrzyło.
 * Adres przeżywa wszystkie trzy sytuacje, więc to on jest źródłem prawdy (hook
 * `lib/hooks/useUrlState.js`). Tutaj tylko odczyt, walidacja i składanie adresu — da się je
 * sprawdzić testem bez przeglądarki.
 *
 * Dwie zasady:
 *   - wartość domyślna nie trafia do adresu — linki zostają czyste, a adres kanoniczny
 *     strony (metadane) i tak jest bez parametrów;
 *   - adres to dane z zewnątrz (ktoś mógł go przepisać ręcznie albo przysłać stary),
 *     więc nieznana wartość cicho wraca do domyślnej, zamiast psuć widok.
 */

/** Czy surowa wartość z adresu jest dopuszczalna. `allowed`: lista wartości albo funkcja. */
export function isAllowedParam(raw, allowed) {
	if (typeof raw !== 'string' || raw === '') return false;
	if (typeof allowed === 'function') return Boolean(allowed(raw));
	if (Array.isArray(allowed)) return allowed.includes(raw);
	// Bez reguły nie przepuszczamy niczego — parametr bez walidacji to furtka, nie wygoda.
	return false;
}

/** Wartość parametru z adresu albo domyślna, gdy brak go lub jest nieznany. */
export function readParam(raw, allowed, fallback) {
	return isAllowedParam(raw, allowed) ? raw : fallback;
}

/**
 * Nowy query string (z `?` albo pusty) po zmianie części parametrów.
 *
 * Pozostałe parametry zostają nietknięte — strona ma ich kilka naraz (dzień, fraza, strona
 * listy), a ustawienie jednego nie może kasować reszty. `null`, `undefined` i pusty napis
 * usuwają parametr.
 */
export function mergeSearch(search, updates) {
	const params = new URLSearchParams(search || '');
	for (const [key, value] of Object.entries(updates || {})) {
		if (value == null || value === '') params.delete(key);
		else params.set(key, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : '';
}

/** Wartość do zapisania w adresie: domyślna oznacza brak parametru. */
export function paramValue(value, fallback) {
	return value === fallback ? null : value;
}

/* ---------- walidatory wspólnych parametrów ---------- */

/** Numer strony listy: 1–9999, bez zer wiodących i ułamków. */
export const isPageParam = (raw) => /^[1-9]\d{0,3}$/.test(raw);

/** Najdłuższa fraza wyszukiwania przyjmowana z adresu — dłuższa to nie nazwa drużyny ani ligi. */
export const MAX_SEARCH_PARAM = 80;

/** Fraza wyszukiwania: niepusta po przycięciu i rozsądnej długości. */
export const isSearchParam = (raw) => raw.trim().length > 0 && raw.length <= MAX_SEARCH_PARAM;

/** Identyfikator dokumentu (raport) — 24 znaki szesnastkowe, jak ObjectId w bazie. */
export const isObjectIdParam = (raw) => /^[a-f0-9]{24}$/i.test(raw);

/* ---------- skuteczność: odnośniki prosto do zakładki ---------- */

export const ACCURACY_PATH = '/pilka-nozna/skutecznosc';
/** Domyślne wartości strony skuteczności — brak parametru w adresie (`components/stats/AccuracyPanel`). */
export const ACCURACY_DEFAULT_KIND = 'all';
export const ACCURACY_DEFAULT_RANGE = '90';

/**
 * Adres skuteczności otwarty od razu na danej zakładce i okresie, np. z dorobku kuponów:
 * `accuracyHref({ kind: 'coupon_3d', days: 'all' })` → `/pilka-nozna/skutecznosc?kind=coupon_3d&days=all`.
 * Wartości domyślne nie trafiają do adresu, tak jak przy przełączaniu na samej stronie.
 */
export function accuracyHref({ kind = ACCURACY_DEFAULT_KIND, days = ACCURACY_DEFAULT_RANGE } = {}) {
	return `${ACCURACY_PATH}${mergeSearch('', {
		kind: paramValue(kind, ACCURACY_DEFAULT_KIND),
		days: paramValue(days, ACCURACY_DEFAULT_RANGE),
	})}`;
}

/* ---------- powrót na listę meczów ---------- */

/** Klucz sessionStorage z ostatnim widokiem listy przedmeczowej (`?date=…&q=…&page=…`). */
export const PREMATCH_LIST_KEY = 'lista:przedmeczowe';
export const PREMATCH_PATH = '/pilka-nozna/przedmeczowe';

/**
 * Adres „Wróć do listy" ze strony meczu: lista z ostatnio oglądanym dniem i frazą.
 *
 * Zapisany query string pochodzi z naszej własnej strony, ale leży w pamięci przeglądarki,
 * więc przepuszczamy tylko to, co wygląda jak nasz query string — inaczej czysta lista.
 */
export function prematchBackHref(saved) {
	// Dokładnie to, co produkuje `URLSearchParams#toString` (reszta znaków jest kodowana jako %XX).
	if (typeof saved !== 'string' || !/^\?[\w.*%+=&-]{1,300}$/.test(saved)) return PREMATCH_PATH;
	return `${PREMATCH_PATH}${saved}`;
}

/* ---------- pamięć przewinięcia ---------- */

/** Okno, w którym zamontowanie strony po „Wstecz" uznajemy za powrót (strona bywa doczytywana z serwera). */
export const RETURN_WINDOW_MS = 10_000;

/**
 * Czy to wejście jest powrotem, po którym warto przywrócić przewinięcie.
 *
 * Tylko powrót — wejście z menu albo z odnośnika ma się otwierać od góry, nawet jeśli ta sama
 * lista była już kiedyś przewinięta. Dwie drogi:
 *   - „Wstecz"/„Dalej" w obrębie aplikacji: niedawny `popstate` dokładnie na ten adres;
 *   - pełne przeładowanie albo powrót z innej witryny: pierwsze zamontowanie w dokumencie,
 *     którego nawigacja była typu `reload`/`back_forward` i dotyczyła właśnie tego adresu
 *     (bez tego warunku wejście z menu po odświeżeniu INNEJ strony też przewijałoby listę).
 *
 * @param {{ href: string, now: number, lastPop?: { href: string, at: number } | null,
 *           firstMount?: boolean, navigation?: { type?: string, name?: string } | null }} p
 */
export function isReturnVisit({ href, now, lastPop = null, firstMount = false, navigation = null }) {
	if (lastPop && lastPop.href === href && now - lastPop.at >= 0 && now - lastPop.at < RETURN_WINDOW_MS) {
		return true;
	}
	if (!firstMount || !navigation) return false;
	return (navigation.type === 'reload' || navigation.type === 'back_forward') && navigation.name === href;
}

/** Zapisana pozycja przewinięcia albo `null` (brak, śmieci, zero — nie ma czego przywracać). */
export function parseScrollY(raw) {
	if (typeof raw !== 'string' || !/^\d{1,7}$/.test(raw)) return null;
	const y = Number(raw);
	return y > 0 ? y : null;
}
