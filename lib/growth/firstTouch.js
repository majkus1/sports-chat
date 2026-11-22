import { hasConsent } from '@/lib/consent';
import { captureTouch, cleanDate } from '@/lib/growth/source';

/**
 * Pierwsze wejście w przeglądarce — gdzie je trzymamy i dlaczego tak.
 *
 * PRAWO. Art. 399 Prawa komunikacji elektronicznej (dawniej art. 173 Prawa telekomunikacyjnego,
 * odpowiednik art. 5 ust. 3 dyrektywy ePrivacy): zapisanie informacji w urządzeniu użytkownika albo
 * dostęp do już zapisanej wymaga zgody, chyba że jest NIEZBĘDNE do usługi, o którą prosi. Źródło
 * rejestracji służy nam, nie jemu — więc niezbędne nie jest, a `sessionStorage` to taki sam zapis
 * w urządzeniu jak ciasteczko. Stąd dwa tryby:
 *
 *   1. BEZ ZGODY ANALITYCZNEJ — tylko zmienna w pamięci tej karty (moduł JS). Nic nie trafia do
 *      urządzenia; znika przy pełnym przeładowaniu. Aplikacja przechodzi między stronami bez
 *      przeładowania (nawigacja Next.js), więc wejście z posta i rejestracja trzy kliknięcia dalej
 *      i tak się połączą. Adres strony i referrer przeglądarka wysyła sama przy każdym wejściu —
 *      czytamy to, co już dostaliśmy, a nie nic, co leżałoby w urządzeniu.
 *   2. ZE ZGODĄ ANALITYCZNĄ — dodatkowo `sessionStorage` (klucz `czat-first-touch`): przeżywa
 *      przeładowanie, ginie z zamknięciem karty. Nie `localStorage` — „pierwsze wejście sprzed
 *      tygodnia" nie jest źródłem dzisiejszej rejestracji, a krótszy zapis to mniej danych.
 *
 * Zgodę bierzemy z kategorii `analytics` (`lib/consent.js`), nie dokładamy nowej: to pomiar ruchu,
 * dokładnie to, na co użytkownik zgadza się w banerze. Cofnięcie zgody kasuje zapis (`syncFirstTouchStorage`).
 */

export const FIRST_TOUCH_KEY = 'czat-first-touch';

/** Pamięć tej karty — żyje tak długo jak aplikacja bez pełnego przeładowania. */
let pamiec = null;

function zSesji() {
	if (!hasConsent('analytics')) return null;
	try {
		const raw = window.sessionStorage.getItem(FIRST_TOUCH_KEY);
		if (!raw) return null;
		const t = JSON.parse(raw);
		// Zapis sprzed 30 dni albo popsuty — traktujemy jak brak.
		return t && typeof t === 'object' && cleanDate(t.at) ? t : null;
	} catch {
		return null;
	}
}

/** Zapis do `sessionStorage` tylko ze zgodą; bez niej kasuje to, co zostało po wcześniejszej zgodzie. */
export function syncFirstTouchStorage() {
	if (typeof window === 'undefined') return;
	try {
		if (hasConsent('analytics') && pamiec) window.sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(pamiec));
		else if (!hasConsent('analytics')) window.sessionStorage.removeItem(FIRST_TOUCH_KEY);
	} catch {
		/* tryb prywatny bez zapisu — zostaje pamięć karty */
	}
}

/**
 * Zapamiętuje pierwsze wejście, jeśli jeszcze go nie ma. Wołane raz, przy pierwszym renderze
 * aplikacji (`components/growth/FirstTouchTracker.jsx`) — później adres strony to już nawigacja
 * wewnątrz serwisu, nie źródło.
 */
export function recordFirstTouch() {
	if (typeof window === 'undefined') return null;
	if (pamiec) return pamiec;
	pamiec =
		zSesji() ||
		captureTouch({ href: window.location.href, referrer: document.referrer, ownHosts: [window.location.hostname] });
	syncFirstTouchStorage();
	return pamiec;
}

/** Do wysłania przy rejestracji; `null`, gdy nic nie przechwycono (serwer zapisze `unknown`). */
export function getFirstTouch() {
	if (typeof window === 'undefined') return null;
	return pamiec || zSesji();
}
