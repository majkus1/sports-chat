import { getRedisClient } from '@/lib/redis';
import { getClientIp } from '@/lib/requestIp';

/**
 * Licznik w stałym oknie czasowym oparty na Redisie.
 *
 * `failOpen` decyduje, co się dzieje gdy Redis nie odpowiada:
 *  - false (domyślnie) dla logowania, rejestracji i innych wrażliwych ścieżek — brak
 *    Redisa nie może oznaczać nieograniczonego bruteforce'u,
 *  - true tam, gdzie zablokowanie użytkownika boli bardziej niż nadmiarowe żądanie.
 */
export async function checkRateLimit({ key, limit, windowSeconds, failOpen = false }) {
	let client;
	try {
		client = await getRedisClient();
	} catch {
		client = null;
	}

	if (!client) {
		return degradedResult(key, failOpen, windowSeconds);
	}

	try {
		const redisKey = `ratelimit:${key}`;
		const count = await client.incr(redisKey);
		if (count === 1) {
			await client.expire(redisKey, windowSeconds);
		}

		if (count > limit) {
			const ttl = await client.ttl(redisKey);
			return {
				allowed: false,
				remaining: 0,
				retryAfter: ttl > 0 ? ttl : windowSeconds,
				degraded: false,
			};
		}

		return { allowed: true, remaining: limit - count, retryAfter: 0, degraded: false };
	} catch {
		return degradedResult(key, failOpen, windowSeconds);
	}
}

/**
 * Zachowanie przy niedostępnym Redisie.
 *
 * Na produkcji Redis jest częścią infrastruktury, więc jego brak nie może otwierać
 * bruteforce'u na logowaniu — blokujemy. Lokalnie Redis zwykle po prostu nie działa
 * i zablokowane logowanie uniemożliwiłoby pracę, więc przepuszczamy i logujemy ostrzeżenie.
 */
function degradedResult(key, failOpen, windowSeconds) {
	if (!failOpen && process.env.NODE_ENV !== 'production') {
		console.warn(`[rateLimit] Redis niedostępny — limit "${key}" pominięty (tylko dev).`);
		return { allowed: true, remaining: 0, retryAfter: 0, degraded: true };
	}
	return { allowed: failOpen, remaining: 0, retryAfter: windowSeconds, degraded: true };
}

/** Gotowa odpowiedź 429 z nagłówkiem Retry-After. */
export function tooManyRequests(retryAfter, message = 'Zbyt wiele żądań. Spróbuj ponownie za chwilę.') {
	return Response.json(
		{ success: false, error: 'rate_limited', message },
		{ status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } }
	);
}

/**
 * Limit per IP — dla tras, które muszą działać także dla niezalogowanych
 * (logowanie, rejestracja, reset hasła).
 */
export async function limitByIp(request, { scope, limit, windowSeconds, failOpen = false }) {
	return checkRateLimit({
		key: `${scope}:ip:${getClientIp(request)}`,
		limit,
		windowSeconds,
		failOpen,
	});
}
