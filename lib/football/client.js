/**
 * Jedyne miejsce, w którym aplikacja rozmawia z API piłkarskim.
 *
 * Te same dane da się kupić na dwa sposoby — przez RapidAPI albo bezpośrednio w API-Sports.
 * Różnią się hostem i nazwą nagłówka z kluczem, a nie kształtem odpowiedzi. Dlatego wybór
 * dostawcy to zmienne środowiskowe, nie zmiana kodu:
 *
 *   FOOTBALL_PROVIDER = rapidapi | apisports
 *   FOOTBALL_API_KEY  = klucz (gdy pusty, bierzemy RAPIDAPI_KEY / API_SPORTS_KEY)
 *   FOOTBALL_API_BASE = nadpisanie adresu bazowego (rzadko potrzebne)
 *   FOOTBALL_API_HOST = nadpisanie nagłówka hosta dla RapidAPI
 */

const PROVIDERS = {
	rapidapi: {
		baseUrl: 'https://api-football-v1.p.rapidapi.com/v3',
		host: 'api-football-v1.p.rapidapi.com',
		headers: (key, host) => ({ 'x-rapidapi-key': key, 'x-rapidapi-host': host }),
	},
	apisports: {
		baseUrl: 'https://v3.football.api-sports.io',
		host: 'v3.football.api-sports.io',
		headers: (key) => ({ 'x-apisports-key': key }),
	},
};

const DEFAULT_TIMEOUT_MS = 12000;
const MAX_ATTEMPTS = 3;

export class FootballApiError extends Error {
	constructor(message, { status, endpoint, retryable = false } = {}) {
		super(message);
		this.name = 'FootballApiError';
		this.status = status;
		this.endpoint = endpoint;
		this.retryable = retryable;
	}
}

export function getProviderConfig() {
	const name = (process.env.FOOTBALL_PROVIDER || 'rapidapi').toLowerCase();
	const provider = PROVIDERS[name];
	if (!provider) {
		throw new FootballApiError(
			`Nieznany FOOTBALL_PROVIDER="${name}". Dozwolone: ${Object.keys(PROVIDERS).join(', ')}.`
		);
	}

	// Zgodność wstecz: dopóki nie ustawisz FOOTBALL_API_KEY, działają dotychczasowe zmienne.
	const key =
		process.env.FOOTBALL_API_KEY ||
		(name === 'rapidapi' ? process.env.RAPIDAPI_KEY : process.env.API_SPORTS_KEY) ||
		'';

	return {
		name,
		key,
		baseUrl: process.env.FOOTBALL_API_BASE || provider.baseUrl,
		host: process.env.FOOTBALL_API_HOST || provider.host,
		buildHeaders: provider.headers,
	};
}

/** Nagłówki limitów mówią, ile zapytań zostało w planie — warto to widzieć w logach. */
function logQuota(endpoint, headers) {
	const remainingDay =
		headers.get('x-ratelimit-requests-remaining') ?? headers.get('X-RateLimit-requests-Remaining');
	const remainingMinute = headers.get('x-ratelimit-remaining');
	if (remainingDay == null && remainingMinute == null) return;

	// Ostrzegamy dopiero przy realnie niskim stanie, żeby nie zaśmiecać logów.
	const day = Number(remainingDay);
	if (Number.isFinite(day) && day < 100) {
		console.warn(`[football] Zostało ${day} zapytań w planie dziennym (${endpoint}).`);
	} else if (process.env.NODE_ENV === 'development') {
		console.log(`[football] ${endpoint} — limit: dzień ${remainingDay}, minuta ${remainingMinute}`);
	}
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Surowe wywołanie API. Zwraca tablicę z pola `response` — obaj dostawcy pakują wyniki tak samo.
 *
 * @param {string} endpoint np. 'fixtures', 'teams/statistics'
 * @param {Record<string, string|number>} params
 */
export async function footballRequest(endpoint, params = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
	const config = getProviderConfig();
	if (!config.key) {
		throw new FootballApiError('Brak klucza API. Ustaw FOOTBALL_API_KEY.', { endpoint });
	}

	const url = new URL(`${config.baseUrl}/${endpoint}`);
	for (const [name, value] of Object.entries(params)) {
		if (value !== undefined && value !== null && value !== '') {
			url.searchParams.set(name, String(value));
		}
	}

	let lastError;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);

		try {
			const response = await fetch(url, {
				headers: config.buildHeaders(config.key, config.host),
				signal: controller.signal,
			});
			clearTimeout(timer);
			logQuota(endpoint, response.headers);

			// 429 i 5xx bywają przejściowe — próbujemy ponownie z rosnącym odstępem.
			if (response.status === 429 || response.status >= 500) {
				lastError = new FootballApiError(`API zwróciło ${response.status}`, {
					status: response.status,
					endpoint,
					retryable: true,
				});
				if (attempt < MAX_ATTEMPTS) {
					await sleep(attempt * 700);
					continue;
				}
				throw lastError;
			}

			if (!response.ok) {
				throw new FootballApiError(`API zwróciło ${response.status}`, {
					status: response.status,
					endpoint,
				});
			}

			const payload = await response.json();

			// API-Football zwraca 200 nawet przy błędzie merytorycznym — błąd siedzi w `errors`.
			const errors = payload?.errors;
			const hasErrors = Array.isArray(errors) ? errors.length > 0 : errors && Object.keys(errors).length > 0;
			if (hasErrors) {
				throw new FootballApiError(`API zgłosiło błąd: ${JSON.stringify(errors)}`, { endpoint });
			}

			return Array.isArray(payload?.response) ? payload.response : [];
		} catch (error) {
			clearTimeout(timer);

			if (error.name === 'AbortError') {
				lastError = new FootballApiError('Przekroczono czas oczekiwania na API.', {
					endpoint,
					retryable: true,
				});
				if (attempt < MAX_ATTEMPTS) {
					await sleep(attempt * 700);
					continue;
				}
				throw lastError;
			}

			if (error instanceof FootballApiError && !error.retryable) throw error;
			lastError = error;
			if (attempt < MAX_ATTEMPTS) {
				await sleep(attempt * 700);
				continue;
			}
			throw lastError;
		}
	}

	throw lastError;
}
