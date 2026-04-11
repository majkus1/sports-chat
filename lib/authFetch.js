/** Po udanym odświeżeniu access tokena Socket.IO musi zrobić nowy handshake (pole `un` w JWT). */
export const ACCESS_REFRESH_EVENT = 'czat-access-refreshed';

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
 * fetch z credentials; przy 401 → refreshAccessToken() → powtórzenie żądania.
 */
export async function fetchWithAuthRefresh(url, opts = {}) {
  let res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status !== 401) return res;

  const r = await refreshAccessToken();
  if (!r.ok) return res;

  return fetch(url, { credentials: 'include', ...opts });
}
