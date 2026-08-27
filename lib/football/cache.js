import { getFromCache, setInCache } from '@/lib/redis';

/**
 * Cache nad zapytaniami do API piłkarskiego.
 *
 * Dotąd cache'owane były wyłącznie mecze z danego dnia — predykcje, statystyki drużyn
 * i mecze na żywo szły do płatnego API przy każdym wejściu na stronę. Przy większym
 * ruchu to najszybszy sposób na spalenie limitu.
 *
 * `stale-while-revalidate`: gdy dane są przeterminowane, ale API nie odpowiada,
 * oddajemy ostatnią znaną wersję zamiast pokazywać pustkę.
 */

/** Czas życia w sekundach, dobrany do tego, jak szybko zmieniają się dane. */
export const TTL = {
	live: 30,
	fixtureEvents: 45,
	fixtureStatistics: 60,
	lineups: 300,
	fixturesByDate: 3600,
	predictions: 6 * 3600,
	injuries: 3600,
	standings: 3600,
	h2h: 12 * 3600,
	// Dostawca aktualizuje kursy przedmeczowe co ~3 godziny — częstsze pytanie nic nie daje.
	odds: 3 * 3600,
	// Ostatnie mecze drużyny zmieniają się dopiero po kolejnym spotkaniu, transfery
	// najwyżej raz na dobę — obie sekcje są zapasowe, nie ma sensu odświeżać ich częściej.
	teamRecentFixtures: 6 * 3600,
	transfers: 24 * 3600,
	teamStatistics: 24 * 3600,
	players: 24 * 3600,
	static: 7 * 24 * 3600,
};

/** Ile dłużej trzymamy kopię awaryjną po wygaśnięciu właściwego TTL. */
const STALE_EXTRA_SECONDS = 24 * 3600;

/** Krótka pamięć o pustych wynikach — bez tego brak danych oznacza odpytywanie w kółko. */
const NEGATIVE_TTL = 300;

function cacheKey(namespace, params) {
	const parts = Object.entries(params || {})
		.filter(([, value]) => value !== undefined && value !== null && value !== '')
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, value]) => `${name}=${value}`)
		.join('&');
	return `football:${namespace}${parts ? `:${parts}` : ''}`;
}

/**
 * Pobiera dane z cache'u albo wywołuje `fetcher`.
 *
 * @param {{ namespace: string, params?: object, ttlSeconds: number, fetcher: () => Promise<any> }} options
 */
export async function cachedFetch({ namespace, params, ttlSeconds, fetcher }) {
	const key = cacheKey(namespace, params);
	const cached = await getFromCache(key);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	try {
		const data = await fetcher();
		const isEmpty = Array.isArray(data) ? data.length === 0 : data == null;
		const effectiveTtl = isEmpty ? NEGATIVE_TTL : ttlSeconds;

		await setInCache(
			key,
			{ data, expiresAt: Date.now() + effectiveTtl * 1000 },
			effectiveTtl + STALE_EXTRA_SECONDS
		);
		return data;
	} catch (error) {
		if (cached) {
			console.warn(`[football] ${namespace}: API niedostępne, oddaję dane z cache'u.`, error.message);
			return cached.data;
		}
		throw error;
	}
}
