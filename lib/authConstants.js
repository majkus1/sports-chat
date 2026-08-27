/**
 * Czasy życia tokenów — w osobnym module, bo potrzebuje ich też przeglądarka,
 * a `lib/auth.js` ciągnie `next/headers` i `bcrypt` (tylko serwer).
 */

/** Access token. 15 minut było za mało: po tym czasie socket przy reconnekcie tracił sesję. */
export const ACCESS_TTL_MIN = 30;

export const REFRESH_TTL_DAYS = 30;

/** Zapas przed wygaśnięciem — odświeżamy wcześniej, żeby nie trafić w okno bez tokenu. */
export const ACCESS_REFRESH_MARGIN_MIN = 5;

/** Co ile klient sam odnawia access token (i przy okazji zmusza socket do nowego handshake). */
export const ACCESS_REFRESH_INTERVAL_MS =
	(ACCESS_TTL_MIN - ACCESS_REFRESH_MARGIN_MIN) * 60 * 1000;
