/**
 * Zgody użytkownika: pełnoletność i ciasteczka.
 *
 * Obie decyzje trzymamy tak samo jak motyw — w `localStorage`, bo obie dotyczą wyłącznie
 * przeglądarki i nie ma po co obciążać nimi każdego żądania do serwera.
 *
 * Kategorii jest jedna poza niezbędnymi i jest prawdziwa: skrypt logowania Google.
 * Serwis nie ma analityki ani reklam, więc wypisanie ich w banerze byłoby teatrem —
 * baner z wyborem, który niczego nie zmienia, jest gorszy niż jego brak.
 */

export const AGE_KEY = 'czat-age';
export const CONSENT_KEY = 'czat-consent';

/** Podbicie wersji unieważnia wcześniejsze zgody i baner pyta od nowa. */
export const CONSENT_VERSION = 1;

/** Zdarzenie okna — komponenty odświeżają się bez przeładowania strony. */
export const CONSENT_EVENT = 'czat-consent-change';

/** Kategorie opcjonalne. Niezbędnych nie ma na liście, bo nie podlegają wyborowi. */
export const OPTIONAL_CATEGORIES = ['google'];

const DEFAULT_CONSENT = { version: CONSENT_VERSION, google: false, decidedAt: null };

function isBrowser() {
	return typeof window !== 'undefined';
}

/** @returns {{version:number, google:boolean, decidedAt:string|null}|null} `null` = jeszcze nie pytano */
export function readConsent() {
	if (!isBrowser()) return null;
	try {
		const raw = window.localStorage.getItem(CONSENT_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		// Starsza wersja zgód to brak zgody — użytkownik zgadzał się na inny zakres.
		if (parsed?.version !== CONSENT_VERSION) return null;
		return { ...DEFAULT_CONSENT, ...parsed };
	} catch {
		return null;
	}
}

/** Zapisuje wybór i powiadamia komponenty nasłuchujące. */
export function writeConsent(choice) {
	if (!isBrowser()) return;
	const record = {
		...DEFAULT_CONSENT,
		...choice,
		version: CONSENT_VERSION,
		decidedAt: new Date().toISOString(),
	};
	try {
		window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
	} catch {
		/* tryb prywatny bywa bez zapisu — baner pojawi się ponownie, nic się nie psuje */
	}
	window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: record }));
}

/**
 * Kasuje zapisaną decyzję, przez co baner pyta od nowa.
 *
 * Wycofanie zgody musi być tak samo łatwe jak jej udzielenie — inaczej nie jest zgodą.
 * Kasujemy wpis w całości zamiast zapisywać odmowę: użytkownik ma zobaczyć pytanie,
 * a nie ustawienie zmienione za niego.
 */
export function clearConsent() {
	if (!isBrowser()) return;
	try {
		window.localStorage.removeItem(CONSENT_KEY);
	} catch {
		/* brak dostępu do zapisu nie może wywalić strony */
	}
	window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }));
}

/** Czy użytkownik zgodził się na daną kategorię opcjonalną. Brak decyzji = brak zgody. */
export function hasConsent(category) {
	return readConsent()?.[category] === true;
}

/** Czy potwierdzono pełnoletność. */
export function readAgeConfirmed() {
	if (!isBrowser()) return false;
	try {
		return window.localStorage.getItem(AGE_KEY) === 'ok';
	} catch {
		return false;
	}
}

export function writeAgeConfirmed() {
	if (!isBrowser()) return;
	try {
		window.localStorage.setItem(AGE_KEY, 'ok');
	} catch {
		/* jak wyżej — brak zapisu oznacza tylko ponowne pytanie */
	}
}
