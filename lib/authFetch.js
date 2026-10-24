/** Po udanym odświeżeniu access tokena Socket.IO musi zrobić nowy handshake (pole `un` w JWT). */
export const ACCESS_REFRESH_EVENT = 'czat-access-refreshed';

/** Access token żyje krócej niż sesja — odświeżamy go z zapasem, zanim wygaśnie. */
export const ACCESS_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Pełne przeładowanie — zostaje tylko dla zmiany tożsamości (login/logout). */
export function reloadPageAfterAuth() {
  if (typeof window !== 'undefined') {
    window.location.reload();
  }
}

/*
 * STAN SESJI PO STRONIE PRZEGLĄDARKI — termin tokenu dostępu i to, czy w ogóle jest sesja.
 *
 * Token dostępu żyje 30 minut, odświeżający 30 dni. Odnawianie co 25 minut zegarem
 * (`UserContext`) nie wystarczało: uśpiony laptop albo karta w tle zatrzymują zegar, a po
 * powrocie każde żądanie szło z wygasłym tokenem. Czat i panel konta umiały się odświeżyć
 * (`fetchWithAuthRefresh`), ale ponad 50 innych miejsc — analiza meczu, kupony, typy — nie:
 * zalogowany widział „Zaloguj się, aby wygenerować analizę" aż do przeładowania strony.
 *
 * Teraz liczy się TERMIN z serwera (`/api/auth/me` i `/api/auth/refresh` oddają `accessExpiresAt`),
 * nie zegar w przeglądarce, a każde żądanie do `/api/*` przechodzi przez `installAuthFetch`.
 */
let accessExpiresAt = null;
/** `unknown` do pierwszego sprawdzenia sesji, potem `authed` albo `guest`. */
let sessionState = 'unknown';

/** Zapis stanu sesji — woła `UserContext` po sprawdzeniu sesji i po odświeżeniu tokenu. */
export function noteSession({ authed, accessExpiresAt: termin } = {}) {
  sessionState = authed ? 'authed' : 'guest';
  accessExpiresAt = authed && Number.isFinite(termin) ? termin : null;
}

/** Czy token dostępu trzeba odświeżyć przed żądaniem (zalogowany, termin w zasięgu zapasu). */
export function accessNeedsRefresh(now = Date.now(), state = sessionState, termin = accessExpiresAt) {
  return state === 'authed' && Number.isFinite(termin) && termin - now < ACCESS_REFRESH_MARGIN_MS;
}

/** Jedno równoległe POST /refresh — rotacja refresh tokena unieważnia stary hash; dwa równoczesne żądania mogły wylogować użytkownika. */
let refreshInflight = null;

/**
 * Wywołuje POST /api/auth/refresh (deduplikacja). Przy sukcesie zapisuje nowy termin
 * i emituje ACCESS_REFRESH_EVENT.
 * @returns {Promise<Response>}
 */
export function refreshAccessToken() {
  if (!refreshInflight) {
    const run = (async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      // Odświeżający token wygasł albo został unieważniony — dalej jesteśmy gościem, bez kolejnych prób.
      if (r.status === 401) noteSession({ authed: false });
      if (r.ok) {
        const dane = await r.clone().json().catch(() => null);
        noteSession({ authed: true, accessExpiresAt: dane?.accessExpiresAt });
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ACCESS_REFRESH_EVENT));
      }
      return r;
    })();
    refreshInflight = run.finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

/** Odświeża token, jeśli zaraz wygaśnie — tanie (bez żądania), gdy jest świeży. */
export async function ensureFreshAccess() {
  if (!accessNeedsRefresh()) return;
  await refreshAccessToken().catch(() => {});
}

/**
 * Czy żądanie pilnujemy: własne API (`/api/*`) poza samą obsługą sesji (`/api/auth/*`),
 * tylko ten sam adres co strona. Cudze adresy i zasoby Next.js przechodzą bez zmian.
 */
export function shouldGuardRequest(url, origin) {
  if (!url) return false;
  try {
    const u = new URL(url, origin);
    return u.origin === origin && u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/auth/');
  } catch {
    return false;
  }
}

/** Ciało żądania da się wysłać drugi raz (tekst, formularz) — strumienia nie. */
function bodyReplayable(input, init) {
  if (typeof Request !== 'undefined' && input instanceof Request) return false;
  const body = init?.body;
  return (
    body == null ||
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) ||
    (typeof Blob !== 'undefined' && body instanceof Blob)
  );
}

/**
 * Jedno miejsce zamiast poprawiania kilkudziesięciu wywołań `fetch`: przed żądaniem do `/api/*`
 * odświeża token, gdy zaraz wygaśnie, a przy 401 odświeża i ponawia żądanie raz. Gość (znany
 * stan `guest`) nie próbuje odświeżać. Instalowane raz, przy wczytaniu `UserContext`.
 */
export function installAuthFetch() {
  if (typeof window === 'undefined' || window.__czatAuthFetch) return;
  window.__czatAuthFetch = true;
  const natywny = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!shouldGuardRequest(url, window.location.origin)) return natywny(input, init);

    await ensureFreshAccess();
    const res = await natywny(input, init);
    if (res.status !== 401 || sessionState === 'guest' || !bodyReplayable(input, init)) return res;

    const odswiezony = await refreshAccessToken().catch(() => null);
    if (!odswiezony?.ok) return res;
    return natywny(input, init);
  };
}

/**
 * fetch z credentials; przy 401 odświeża access token i **ponawia to samo żądanie**.
 *
 * Wcześniej po odświeżeniu leciał `window.location.reload()`, a do wywołującego wracała
 * pierwotna odpowiedź 401 — wpisana wiadomość znikała razem z przeładowaniem strony.
 * Od `installAuthFetch` robi to samo każde żądanie do `/api/*`; ta funkcja zostaje dla
 * istniejących wywołań (podwójne ponowienie nie szkodzi — drugie trafia już na świeży token).
 */
export async function fetchWithAuthRefresh(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed.ok) return res;

  return fetch(url, { credentials: 'include', ...opts });
}
