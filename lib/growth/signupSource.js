import { SITE_URL } from '@/lib/seo/config';
import { normalizeSignupSource } from '@/lib/growth/source';

/**
 * Źródło rejestracji z ciała żądania — wspólne dla rejestracji mailem i przez Google.
 *
 * Własne domeny to adres serwisu i host żądania (lokalnie `localhost`, na serwerze `czatsportowy.pl`):
 * referrer z nich to przejście wewnątrz serwisu, a nie źródło. Walidacja całości w `normalizeSignupSource`.
 *
 * @param {unknown} raw `signupSource` przysłany przez przeglądarkę
 * @param {Request} [request]
 */
export function signupSourceFromRequest(raw, request, now = new Date()) {
	const hosty = [];
	try {
		hosty.push(new URL(SITE_URL).hostname);
	} catch {
		/* zły APP_URL nie może wywrócić rejestracji */
	}
	const host = request?.headers?.get?.('x-forwarded-host') || request?.headers?.get?.('host');
	if (host) hosty.push(String(host).split(':')[0]);
	return normalizeSignupSource(raw, { now, ownHosts: hosty });
}
