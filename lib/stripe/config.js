import Stripe from 'stripe';

/**
 * Konfiguracja Stripe'a w jednym miejscu, razem z odpowiedzią na pytanie „czy jest kompletna".
 *
 * Trasy pytają o `ready` zamiast sprawdzać każdą zmienną osobno. Niekompletna konfiguracja
 * ma dawać czytelne 503, a nie wyjątek z wnętrza biblioteki przy pierwszym wywołaniu.
 *
 * PUŁAPKA TRYBÓW: klucze `sk_test_` i `sk_live_` to dwa rozłączne światy. Sesja, klient czy
 * płatność utworzone w jednym nie istnieją w drugim, a odczyt kończy się `resource_missing`.
 * Nigdy nie mieszaj identyfikatorów między środowiskami.
 */

let cached = null;

export function getStripeConfig() {
	const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
	const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
	// Bez ukośnika na końcu — adresy powrotu sklejamy przez konkatenację.
	const appUrl = (process.env.STRIPE_APP_PUBLIC_URL || process.env.APP_URL || '').replace(/\/$/, '');

	return {
		secretKey,
		webhookSecret,
		appUrl,
		isTestMode: secretKey.startsWith('sk_test_'),
		hasKey: secretKey.length > 0,
		hasWebhookSecret: webhookSecret.length > 0,
		hasAppUrl: /^https?:\/\/.+/i.test(appUrl),
		get ready() {
			return this.hasKey && this.hasAppUrl;
		},
	};
}

/**
 * Klient Stripe'a. `null`, gdy brak klucza — wywołujący ma wtedy oddać 503.
 *
 * Instancja jest współdzielona: w trybie deweloperskim moduły przeładowują się przy każdej
 * zmianie pliku, a tworzenie nowego klienta za każdym razem otwierałoby kolejne pule połączeń.
 */
export function getStripe() {
	const { secretKey } = getStripeConfig();
	if (!secretKey) return null;

	if (!cached || cached.key !== secretKey) {
		cached = { key: secretKey, client: new Stripe(secretKey) };
	}
	return cached.client;
}
