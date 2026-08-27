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

/** Jedno równoległe POST /refresh — rotacja refresh tokena unieważnia stary hash; dwa równoczesne żądania mogły wylogować użytkownika. */
let refreshInflight = null;

/**
 * Wywołuje POST /api/auth/refresh (deduplikacja). Przy sukcesie emituje ACCESS_REFRESH_EVENT.
 * @returns {Promise<Response>}
 */
export function refreshAccessToken() {
  if (!refreshInflight) {
    const run = (async () => {
      const r = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });
      if (r.ok && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ACCESS_REFRESH_EVENT));
      }
      return r;
    })();
    refreshInflight = run.finally(() => {
      refreshInflight = null;
    });
  }
  return refreshInflight;
}

/**
 * fetch z credentials; przy 401 odświeża access token i **ponawia to samo żądanie**.
 *
 * Wcześniej po odświeżeniu leciał `window.location.reload()`, a do wywołującego wracała
 * pierwotna odpowiedź 401 — wpisana wiadomość znikała razem z przeładowaniem strony.
 */
export async function fetchWithAuthRefresh(url, opts = {}) {
  const res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status !== 401) return res;

  const refreshed = await refreshAccessToken();
  if (!refreshed.ok) return res;

  return fetch(url, { credentials: 'include', ...opts });
}
