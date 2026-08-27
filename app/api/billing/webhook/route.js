import connectToDb from '@/lib/db';
import CreditLedger from '@/models/CreditLedger';
import { getCreditPack, getPlanPass } from '@/lib/billing/plans';
import { grantCredits, revokeCredits } from '@/lib/billing/credits';
import { grantPlanAccess, revokePlanAccess } from '@/lib/billing/planAccess';
import { getStripe, getStripeConfig } from '@/lib/stripe/config';

/**
 * Webhook Stripe'a — jedyne miejsce, w którym kredyty i dostęp do planu trafiają na konto.
 *
 * Adres powrotu (`success_url`) NIE jest potwierdzeniem płatności. Użytkownik może zamknąć
 * kartę przed przekierowaniem, a BLIK potwierdza się asynchronicznie, już po powrocie na
 * stronę. Doładowanie następuje wyłącznie na podstawie zdarzenia od Stripe'a.
 *
 * KODY ODPOWIEDZI. 400 zwracamy TYLKO przy złym podpisie. Każdy inny problem — brakujące
 * metadane, nieznany pakiet, nieodnaleziony użytkownik — dostaje 200 i wpis w logu. Powód
 * jest praktyczny: Stripe traktuje odpowiedź inną niż 2xx jako awarię i ponawia zdarzenie
 * przez wiele dni, a po serii niepowodzeń potrafi wyłączyć endpoint. Ponowienie nigdy nie
 * naprawi błędu w danych, bo metadane same się nie zmienią — a zablokowany endpoint
 * zatrzyma wszystkie kolejne płatności.
 */

/** Trasa musi być dynamiczna: podpis liczy się z konkretnego żądania, nie z cache'u. */
export const dynamic = 'force-dynamic';

/** Zdarzenia, które faktycznie obsługujemy. Reszta kończy się cichym 200. */
const HANDLED = new Set([
	'checkout.session.completed',
	'checkout.session.async_payment_succeeded',
	'checkout.session.async_payment_failed',
	'charge.refunded',
]);

const ok = (payload = {}) => Response.json({ received: true, ...payload }, { status: 200 });

/**
 * Realizacja opłaconej sesji.
 *
 * Warunki sprawdzamy w kolejności od najtańszego do najdroższego, a kwotę porównujemy
 * z cennikiem po naszej stronie — sesja mogła zostać utworzona przy innym cenniku albo,
 * w skrajnym przypadku, zmanipulowana.
 */
async function handleCheckoutPaid(event) {
	const data = event.data?.object || {};

	if (data.mode !== 'payment') return ok({ skipped: 'not_one_time' });

	// `completed` nie znaczy „opłacone" — przy metodach odroczonych status bywa `unpaid`.
	if (data.payment_status !== 'paid') return ok({ skipped: 'not_paid_yet' });

	const userId = data.metadata?.userId;
	const packId = data.metadata?.packId;
	const planId = data.metadata?.planId;

	if (!userId || (!packId && !planId)) {
		console.error('[stripe] sesja bez metadanych — nie wiadomo, komu i co przyznać', {
			eventId: event.id,
			sessionId: data.id,
		});
		return ok({ skipped: 'missing_metadata' });
	}

	// Cennik po naszej stronie jest jedynym źródłem prawdy o cenie.
	const pack = packId ? getCreditPack(packId) : null;
	const pass = planId ? getPlanPass(planId) : null;

	if (!pack && !pass) {
		console.error('[stripe] nieznany przedmiot zakupu w metadanych', {
			eventId: event.id,
			packId,
			planId,
		});
		return ok({ skipped: 'unknown_pack' });
	}

	const oczekiwanaKwota = pack ? pack.priceGrosze : pass.priceGrosze;
	if (data.amount_total !== oczekiwanaKwota) {
		console.error('[stripe] kwota sesji nie zgadza się z cennikiem', {
			eventId: event.id,
			item: pack?.id || pass?.id,
			zaplacono: data.amount_total,
			oczekiwano: oczekiwanaKwota,
		});
		return ok({ skipped: 'amount_mismatch' });
	}

	await connectToDb();

	const szczegoly = {
		sessionId: data.id,
		paymentIntentId: typeof data.payment_intent === 'string' ? data.payment_intent : null,
		amountTotal: data.amount_total,
		currency: data.currency,
		email: data.customer_details?.email || null,
		eventType: event.type,
	};

	if (pass) {
		const { granted, plan, validUntil } = await grantPlanAccess({
			userId,
			planId: pass.id,
			idempotencyKey: `stripe:event:${event.id}`,
			details: szczegoly,
		});

		if (!granted) return ok({ duplicate: true });

		console.log('[stripe] przyznano dostęp do planu', { userId, plan, do: validUntil });
		return ok({ plan, validUntil });
	}

	/*
	 * Klucz idempotencji budujemy z identyfikatora ZDARZENIA, nie sesji.
	 *
	 * Jedna sesja może wygenerować kilka zdarzeń (np. `completed`, a potem
	 * `async_payment_succeeded` dla BLIK-a) i każde jest osobnym faktem. Za to to samo
	 * zdarzenie potrafi przyjść wielokrotnie — Stripe gwarantuje dostarczenie co najmniej
	 * raz — i właśnie przed tym broni unikalny indeks w księdze.
	 */
	const { granted, credits } = await grantCredits({
		userId,
		credits: pack.credits,
		reason: `purchase:${pack.id}`,
		idempotencyKey: `stripe:event:${event.id}`,
		details: szczegoly,
	});

	if (!granted) return ok({ duplicate: true });

	console.log('[stripe] doładowano konto', { userId, packId, kredytow: pack.credits, saldo: credits });
	return ok({ credited: pack.credits });
}

/**
 * Zwrot płatności — cofamy dokładnie to, co dodał zwracany zakup.
 *
 * Obciążenie nie niesie naszych metadanych, więc konto i rodzaj zakupu odnajdujemy po wpisie
 * w księdze, powiązanym identyfikatorem płatności. Szukamy po prefiksie `purchase:`, a nie
 * po dodatniej kwocie: zakup planu zapisuje się z kwotą zerową, bo nie zmienia salda kredytów.
 */
async function handleRefund(event) {
	const charge = event.data?.object || {};
	const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
	if (!paymentIntentId) return ok({ skipped: 'no_payment_intent' });

	await connectToDb();

	const purchase = await CreditLedger.findOne({
		'details.paymentIntentId': paymentIntentId,
		reason: /^purchase:/,
	}).lean();

	if (!purchase) {
		console.warn('[stripe] zwrot bez pasującego zakupu w księdze', { eventId: event.id, paymentIntentId });
		return ok({ skipped: 'purchase_not_found' });
	}

	const wspolne = {
		userId: purchase.userId,
		idempotencyKey: `stripe:event:${event.id}`,
		details: { paymentIntentId, originalEntry: String(purchase._id) },
	};

	if (purchase.details?.planId) {
		const { revoked, validUntil } = await revokePlanAccess({ ...wspolne, planId: purchase.details.planId });
		return ok({ revoked, validUntil });
	}

	const { revoked } = await revokeCredits({ ...wspolne, credits: purchase.amount, reason: 'refund' });
	return ok({ revoked });
}

export async function POST(request) {
	const config = getStripeConfig();
	const stripe = getStripe();

	if (!stripe || !config.hasWebhookSecret) {
		console.warn('[stripe] webhook wywołany bez konfiguracji');
		return Response.json({ error: 'webhook_not_configured' }, { status: 503 });
	}

	const signature = request.headers.get('stripe-signature');
	if (!signature) return Response.json({ error: 'missing_signature' }, { status: 400 });

	/*
	 * Surowe bajty, nie sparsowany JSON.
	 *
	 * Podpis to HMAC z dokładnej treści żądania — jakakolwiek normalizacja (kolejność pól,
	 * białe znaki) sprawia, że weryfikacja nigdy się nie uda. W App Routerze nie ma parsera
	 * ciała po drodze, więc wystarczy nie wołać `request.json()` przed weryfikacją.
	 */
	const payload = Buffer.from(await request.arrayBuffer());

	let event;
	try {
		event = stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
	} catch (error) {
		// Jedyny przypadek, w którym odpowiadamy błędem — tu ponowienie ma sens.
		console.error('[stripe] weryfikacja podpisu nieudana', { message: error.message });
		return Response.json({ error: 'invalid_signature' }, { status: 400 });
	}

	if (!HANDLED.has(event.type)) return ok({ ignored: event.type });

	try {
		if (event.type === 'charge.refunded') return await handleRefund(event);
		if (event.type === 'checkout.session.async_payment_failed') {
			console.warn('[stripe] płatność odroczona nie doszła do skutku', {
				eventId: event.id,
				sessionId: event.data?.object?.id,
			});
			return ok({ failed: true });
		}
		return await handleCheckoutPaid(event);
	} catch (error) {
		/*
		 * Logujemy `message`, nie sam `code`.
		 *
		 * Zapis w stylu `error.code || error.message` wygląda niewinnie, ale gdy `code` jest
		 * ustawiony, komunikat nigdy nie trafia do logu — a to on nazywa przyczynę.
		 */
		console.error('[stripe] obsługa zdarzenia nieudana', {
			eventId: event.id,
			eventType: event.type,
			code: error.code,
			message: error.message,
		});
		// 200 mimo błędu: ponowienie nie naprawi awarii po naszej stronie, a seria
		// niepowodzeń potrafi doprowadzić do wyłączenia endpointu przez Stripe'a.
		return ok({ error: 'handler_failed' });
	}
}
