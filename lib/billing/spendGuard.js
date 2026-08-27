import { getRedisClient } from '@/lib/redis';

/**
 * Globalny bezpiecznik wydatków na AI.
 *
 * Limity per użytkownik chronią przed pojedynczym nadużyciem, ale nie przed błędem
 * w pętli, wyciekiem sesji czy skoordynowanym ruchem z wielu kont. To jedyna reguła,
 * która patrzy na SUMĘ wydatków całej aplikacji i po przekroczeniu progu zatrzymuje
 * generowanie — lepiej pokazać komunikat niż zobaczyć rachunek na koniec miesiąca.
 *
 * Próg ustawia `AI_DAILY_SPEND_CAP_USD`; domyślne $5/dzień to około trzykrotność
 * spodziewanego ruchu, czyli reaguje na anomalię, a nie na normalny dzień.
 */

const DEFAULT_CAP_USD = 5;

const capUsd = () => {
	const raw = Number(process.env.AI_DAILY_SPEND_CAP_USD);
	return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CAP_USD;
};

function todayKey() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
		now.getDate()
	).padStart(2, '0')}`;
}

const KEY = () => `spend:ai:${todayKey()}`;

/**
 * Czy wolno jeszcze wywoływać model.
 *
 * Przy niedostępnym Redisie przepuszczamy: bezpiecznik ma łapać anomalie, a nie wyłączać
 * produkt przy awarii cache'u. Limity per użytkownik nadal wtedy obowiązują.
 *
 * @returns {Promise<{ allowed: boolean, spent: number, cap: number }>}
 */
export async function checkSpendCap() {
	const cap = capUsd();
	const client = await getRedisClient();
	if (!client) return { allowed: true, spent: 0, cap, degraded: true };

	try {
		const spent = Number(await client.get(KEY())) || 0;
		return { allowed: spent < cap, spent, cap };
	} catch {
		return { allowed: true, spent: 0, cap, degraded: true };
	}
}

/**
 * Dopisuje koszt zakończonego wywołania do dziennej sumy.
 *
 * Redis nie ma inkrementacji po liczbie zmiennoprzecinkowej z zachowaniem precyzji,
 * ale `incrByFloat` w zupełności wystarcza przy kwotach rzędu centów.
 */
export async function recordSpend(costUsd) {
	if (!Number.isFinite(costUsd) || costUsd <= 0) return;

	const client = await getRedisClient();
	if (!client) return;

	try {
		const key = KEY();
		await client.incrByFloat(key, costUsd);
		// Klucz żyje dwie doby — wystarczy na dzień rozliczeniowy i podgląd wstecz.
		await client.expire(key, 48 * 3600);
	} catch {
		/* brak zapisu kosztu nie może wywrócić żądania, które już się udało */
	}
}
