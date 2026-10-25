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
	// Najbliższe mecze drużyny (terminarz) — zmieniają się równie rzadko.
	teamNextFixtures: 6 * 3600,
	transfers: 24 * 3600,
	teamStatistics: 24 * 3600,
	// Terminarz całego sezonu — zakończone kolejki są niezmienne, trwająca może poczekać dobę.
	leagueFixtures: 24 * 3600,
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
 * Dane NA ŻYWO: zapas najwyżej 2 minuty, pusty wynik pamiętany 30 s.
 *
 * Dobowy zapas jest dobry dla tabeli czy H2H, ale nie dla meczu w trakcie. 24.10.2026 generator
 * kuponu live pokazywał „226 meczów na żywo, 0 z kursami live", choć dostawca oddawał kursy dla
 * 201 meczów: odpowiedź `odds/live` ma ~3,3 MB, na małym serwerze nie mieściła się w limicie czasu,
 * a cache oddawał wtedy kursy sprzed wielu godzin — z innymi meczami. Lepiej powiedzieć „brak
 * kursów teraz" niż liczyć na wczorajszych.
 */
export const LIVE_CACHE = { maxStaleSeconds: 120, negativeTtlSeconds: 30 };

/** Czy przeterminowana kopia nadaje się jeszcze na zapas (awaria API) — najwyżej `maxStaleSeconds` po terminie. */
export function staleUsable(cached, now = Date.now(), maxStaleSeconds = STALE_EXTRA_SECONDS) {
	return Boolean(cached) && now - cached.expiresAt <= maxStaleSeconds * 1000;
}

/**
 * Pobiera dane z cache'u albo wywołuje `fetcher`.
 *
 * @param {{ namespace: string, params?: object, ttlSeconds: number, fetcher: () => Promise<any>,
 *   maxStaleSeconds?: number, negativeTtlSeconds?: number }} options
 *   `maxStaleSeconds` — jak długo po terminie wolno oddać starą kopię przy awarii API (dla danych
 *   na żywo krótko — `LIVE_CACHE`); `negativeTtlSeconds` — jak długo pamiętać pusty wynik
 */
export async function cachedFetch({
	namespace,
	params,
	ttlSeconds,
	fetcher,
	maxStaleSeconds = STALE_EXTRA_SECONDS,
	negativeTtlSeconds = NEGATIVE_TTL,
}) {
	const key = cacheKey(namespace, params);
	const cached = await getFromCache(key);

	if (cached && cached.expiresAt > Date.now()) {
		return cached.data;
	}

	try {
		const data = await fetcher();
		const isEmpty = Array.isArray(data) ? data.length === 0 : data == null;
		const effectiveTtl = isEmpty ? negativeTtlSeconds : ttlSeconds;

		await setInCache(
			key,
			{ data, expiresAt: Date.now() + effectiveTtl * 1000 },
			effectiveTtl + maxStaleSeconds
		);
		return data;
	} catch (error) {
		if (staleUsable(cached, Date.now(), maxStaleSeconds)) {
			console.warn(`[football] ${namespace}: API niedostępne, oddaję dane z cache'u.`, error.message);
			return cached.data;
		}
		throw error;
	}
}
