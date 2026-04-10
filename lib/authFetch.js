/** Po udanym odświeżeniu access tokena Socket.IO musi zrobić nowy handshake (pole `un` w JWT). */
export const ACCESS_REFRESH_EVENT = 'czat-access-refreshed';

/**
 * fetch z credentials; przy 401 → POST /api/auth/refresh → powtórzenie żądania.
 * Po udanym refreshu emituje zdarzenie, które SocketContext wykorzystuje do reconnect.
 */
export async function fetchWithAuthRefresh(url, opts = {}) {
  let res = await fetch(url, { credentials: 'include', ...opts });
  if (res.status !== 401) return res;

  const r = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  });
  if (!r.ok) return res;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ACCESS_REFRESH_EVENT));
  }

  return fetch(url, { credentials: 'include', ...opts });
}
