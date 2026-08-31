import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * Wspólny start dla testów: zmienne środowiskowe, alias `@/` i połączenie z bazą.
 *
 * Testy sięgają po PRAWDZIWĄ bazę i prawdziwą weryfikację podpisu Stripe'a. To celowe:
 * przy kodzie obsługującym pieniądze atrapy sprawdzałyby wyłącznie to, czy atrapy działają.
 * Najważniejsze zabezpieczenia — unikalny indeks na kluczu idempotencji i kryptograficzna
 * weryfikacja podpisu — istnieją poza naszym kodem i tylko integracja je obejmuje.
 */

// Zgodność z Node 18 — `import.meta.dirname` pojawiło się dopiero w 20.11, a produkcja
// stoi na 18. Szczegóły przy tej samej linii w `alias.mjs`.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Sekret używany wyłącznie w testach — nie musi pochodzić ze Stripe'a. */
export const TEST_WEBHOOK_SECRET = 'whsec_test_secret_for_local_tests';

let gotowe = false;

/**
 * Przygotowuje środowisko. Wołane raz na plik testowy, PRZED dynamicznymi importami
 * modułów aplikacji — kolejność ma znaczenie, bo moduły czytają `process.env` przy ładowaniu.
 */
export function setupEnv() {
	if (gotowe) return;

	dotenv.config({ path: path.join(ROOT, '.env.local') });
	dotenv.config({ path: path.join(ROOT, '.env') });

	/*
	 * Klucze Stripe'a nadpisujemy wartościami testowymi.
	 *
	 * Dzięki temu testy przechodzą także wtedy, gdy `.env.local` nie ma jeszcze prawdziwych
	 * kluczy, i — co ważniejsze — nigdy nie dotkną prawdziwego konta Stripe.
	 */
	process.env.STRIPE_SECRET_KEY = 'sk_test_dummy_key_for_local_tests';
	process.env.STRIPE_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
	process.env.STRIPE_APP_PUBLIC_URL = 'http://localhost:3001';

	register('./alias.mjs', import.meta.url);
	gotowe = true;
}

/** Żądanie webhooka z prawdziwym, poprawnie policzonym podpisem. */
export function signedRequest(stripe, event, { secret = TEST_WEBHOOK_SECRET } = {}) {
	const payload = JSON.stringify(event);
	const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

	return new Request('http://localhost/api/billing/webhook', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'stripe-signature': signature },
		body: payload,
	});
}

/** Szkielet zdarzenia `checkout.session.completed` z możliwością nadpisania pól. */
export function checkoutEvent({
	id,
	userId,
	packId = 'pack_5',
	amountTotal = 1900,
	paymentStatus = 'paid',
	mode = 'payment',
	type = 'checkout.session.completed',
	paymentIntentId = 'pi_test_1',
	metadata,
} = {}) {
	return {
		id,
		type,
		data: {
			object: {
				id: 'cs_test_1',
				mode,
				payment_status: paymentStatus,
				amount_total: amountTotal,
				currency: 'pln',
				payment_intent: paymentIntentId,
				customer_details: { email: 'test@example.test' },
				metadata: metadata ?? { userId: String(userId), packId, credits: '5' },
			},
		},
	};
}
