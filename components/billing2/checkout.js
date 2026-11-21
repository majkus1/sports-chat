/**
 * Start płatności z przeglądarki — wspólny dla planów i pakietów kredytów.
 *
 * Do 21.11.2026 oba miejsca miały własną kopię i jeden komunikat na wszystko („Nie udało się
 * rozpocząć płatności"), także gdy sesja logowania po prostu wygasła albo gdy przepustka nie miała
 * sensu przy aktywnym planie. Każdy kod z trasy (`app/api/billing/checkout`) ma tu własne zdanie
 * w `billing2` — kupujący wie, co zrobić, zamiast próbować w kółko.
 *
 * Przed przekierowaniem zapisujemy w `sessionStorage`, CO jest kupowane i jaki był stan konta.
 * Po powrocie cennik czeka, aż webhook to zmieni, i mówi „gotowe" konkretnie (plan do daty albo
 * saldo), zamiast ogólnego „pojawi się po potwierdzeniu". To zapamiętanie służy wyłącznie
 * dokończeniu zakupu, o który prosi użytkownik, i znika po pokazaniu wyniku.
 */
export const PENDING_KEY = 'billing2:pending';

/**
 * @param {{ body: object, before?: { validUntil?: string|null, credits?: number } }} p
 *   `body` — `{ planId }` albo `{ packId }` z `locale`, `source` i oświadczeniem
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>} `error` to klucz z `billing2`
 */
export async function startCheckout({ body, before = {} }) {
	try {
		const res = await fetch('/api/billing/checkout', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify(body),
		});
		const data = await res.json().catch(() => ({}));

		if (res.ok && data.url) {
			try {
				window.sessionStorage.setItem(
					PENDING_KEY,
					JSON.stringify({
						kind: body.planId ? 'plan' : 'credits',
						id: body.planId || body.packId,
						validUntil: before.validUntil || null,
						credits: before.credits ?? 0,
						at: Date.now(),
					})
				);
			} catch {
				/* bez pamięci sesji cennik pokaże po powrocie ogólny komunikat */
			}
			// Pełne przekierowanie, nie router Next.js — cel jest poza aplikacją.
			window.location.href = data.url;
			return { ok: true };
		}

		if (res.status === 401) return { ok: false, error: 'err_login' };
		if (res.status === 409) return { ok: false, error: data.error === 'pass_downgrade' ? 'downgrade_hint' : 'err_outdated' };
		if (res.status === 503) return { ok: false, error: 'err_unavailable' };
		return { ok: false, error: 'err_generic' };
	} catch {
		return { ok: false, error: 'err_generic' };
	}
}

export function readPending() {
	try {
		const raw = window.sessionStorage.getItem(PENDING_KEY);
		return raw ? JSON.parse(raw) : null;
	} catch {
		return null;
	}
}

export function clearPending() {
	try {
		window.sessionStorage.removeItem(PENDING_KEY);
	} catch {
		/* nic do sprzątania */
	}
}
