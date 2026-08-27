/**
 * Adres IP klienta zza reverse proxy.
 *
 * Ta sama logika była skopiowana w getOrCreateAnalysis, checkAnalysis i run-agent —
 * tutaj jest jedna kopia, żeby limity liczyły się wszędzie tak samo.
 */

function isLocalhostIp(value) {
	if (!value) return false;
	return (
		value === '127.0.0.1' ||
		value === '::1' ||
		value.startsWith('::ffff:127.0.0.1') ||
		value === 'localhost' ||
		value === 'unknown'
	);
}

/**
 * @param {Request} request
 * @returns {string} adres IP albo 'localhost', gdy żaden nagłówek nie niesie sensownej wartości
 */
export function getClientIp(request) {
	const forwarded = request.headers.get('x-forwarded-for');
	const candidates = [
		forwarded?.split(',')[0]?.trim(),
		request.headers.get('x-real-ip'),
		request.headers.get('x-client-ip'),
	];

	for (const candidate of candidates) {
		if (candidate && !isLocalhostIp(candidate)) return candidate;
	}
	return 'localhost';
}
