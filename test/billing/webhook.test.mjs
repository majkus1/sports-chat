import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutEvent, setupEnv, signedRequest, TEST_WEBHOOK_SECRET } from '../helpers/setup.mjs';

/**
 * Webhook Stripe'a — jedyne miejsce, w którym kredyty trafiają na konto.
 *
 * Zakres testów wynika z listy sposobów, na jakie ta trasa może kosztować pieniądze:
 * naliczyć kredyty za płatność, która nie doszła do skutku; naliczyć je dwa razy za to samo
 * zdarzenie; przyjąć kwotę niezgodną z cennikiem; albo odesłać błąd, przez który Stripe
 * zacznie ponawiać i w końcu wyłączy endpoint.
 *
 * Testy idą przez PRAWDZIWĄ weryfikację podpisu i PRAWDZIWĄ bazę. Atrapa podpisu sprawdzałaby
 * atrapę, a idempotencja opiera się na unikalnym indeksie w Mongo — czyli na czymś, czego
 * w naszym kodzie w ogóle nie ma.
 *
 * Uruchomienie: `npm test` (wymaga DATABASE_URL w .env.local; klucze Stripe'a nie są potrzebne).
 */

setupEnv();

const { default: mongoose } = await import('mongoose');
const { default: Stripe } = await import('stripe');
const { POST } = await import('@/app/api/billing/webhook/route.js');
const { default: User } = await import('@/models/User');
const { default: CreditLedger } = await import('@/models/CreditLedger');
const { CREDIT_PACKS } = await import('@/lib/billing/plans');

const stripe = new Stripe('sk_test_dummy_key_for_local_tests');
const PACK = CREDIT_PACKS[0];

let user;
/** Każdy przebieg ma własne identyfikatory zdarzeń — inaczej idempotencja blokowałaby drugi bieg. */
const bieg = Date.now();
const evt = (nazwa) => `evt_test_${bieg}_${nazwa}`;

/** Saldo prosto z bazy — nie ufamy temu, co zwróciła trasa. */
async function saldo() {
	const swiezy = await User.findById(user._id).select('credits').lean();
	return swiezy.credits;
}

async function wyslij(event, opcje) {
	const res = await POST(signedRequest(stripe, event, opcje));
	return { status: res.status, body: await res.json() };
}

before(async () => {
	await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

	user = await User.create({
		username: `test-webhook-${bieg}`,
		email: `test-webhook-${bieg}@example.test`,
		password: 'x'.repeat(60),
		plan: 'free',
		credits: 0,
	});
});

after(async () => {
	// Konto testowe i jego księga nie mogą zostać w bazie po przebiegu.
	await CreditLedger.deleteMany({ userId: user._id });
	await User.deleteOne({ _id: user._id });
	await mongoose.disconnect();
});

describe('weryfikacja podpisu', () => {
	test('zły podpis kończy się kodem 400 — jedyny przypadek błędu', async () => {
		const { status } = await wyslij(checkoutEvent({ id: evt('zly_podpis'), userId: user._id }), {
			secret: 'whsec_zupelnie_inny_sekret',
		});

		assert.equal(status, 400, 'przy złym podpisie Stripe ma ponowić — to jedyny sensowny błąd');
		assert.equal(await saldo(), 0, 'żadne kredyty nie mogą się nalicząć bez poprawnego podpisu');
	});

	test('brak nagłówka z podpisem kończy się kodem 400', async () => {
		const request = new Request('http://localhost/api/billing/webhook', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(checkoutEvent({ id: evt('bez_naglowka'), userId: user._id })),
		});

		const res = await POST(request);
		assert.equal(res.status, 400);
		assert.equal(await saldo(), 0);
	});
});

describe('odrzucanie zdarzeń, które nie powinny nic naliczyć', () => {
	/*
	 * Wszystkie te przypadki MUSZĄ zwrócić 200.
	 *
	 * Stripe traktuje każdą odpowiedź spoza 2xx jako awarię i ponawia zdarzenie przez wiele dni,
	 * a po serii niepowodzeń wyłącza endpoint. Ponowienie nigdy nie naprawi błędu w danych —
	 * metadane same się nie zmienią — a wyłączony endpoint zatrzyma WSZYSTKIE kolejne płatności.
	 */
	test('płatność nieopłacona nie nalicza kredytów', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('nieoplacona'), userId: user._id, paymentStatus: 'unpaid' })
		);

		assert.equal(status, 200);
		assert.equal(body.skipped, 'not_paid_yet');
		assert.equal(await saldo(), 0);
	});

	test('kwota niezgodna z cennikiem nie nalicza kredytów', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('zla_kwota'), userId: user._id, amountTotal: 100 })
		);

		assert.equal(status, 200);
		assert.equal(body.skipped, 'amount_mismatch', 'cena musi pochodzić z cennika, nie z sesji');
		assert.equal(await saldo(), 0);
	});

	test('brak metadanych nie nalicza kredytów', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('bez_metadanych'), userId: user._id, metadata: {} })
		);

		assert.equal(status, 200);
		assert.equal(body.skipped, 'missing_metadata');
		assert.equal(await saldo(), 0);
	});

	test('nieznany pakiet nie nalicza kredytów', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('nieznany_pakiet'), userId: user._id, packId: 'pack_9999' })
		);

		assert.equal(status, 200);
		assert.equal(body.skipped, 'unknown_pack');
		assert.equal(await saldo(), 0);
	});

	test('płatność cykliczna jest pomijana — obsługujemy tylko jednorazowe', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('subskrypcja'), userId: user._id, mode: 'subscription' })
		);

		assert.equal(status, 200);
		assert.equal(body.skipped, 'not_one_time');
		assert.equal(await saldo(), 0);
	});

	test('nieobsługiwany rodzaj zdarzenia kończy się cichym 200', async () => {
		const { status, body } = await wyslij(
			checkoutEvent({ id: evt('inne'), userId: user._id, type: 'customer.created' })
		);

		assert.equal(status, 200);
		assert.equal(body.ignored, 'customer.created');
		assert.equal(await saldo(), 0);
	});
});

describe('naliczanie kredytów', () => {
	test('opłacona sesja nalicza kredyty i zostawia wpis w księdze', async () => {
		const eventId = evt('oplacona');
		const { status, body } = await wyslij(checkoutEvent({ id: eventId, userId: user._id }));

		assert.equal(status, 200);
		assert.equal(body.credited, PACK.credits);
		assert.equal(await saldo(), PACK.credits);

		const wpis = await CreditLedger.findOne({ idempotencyKey: `stripe:event:${eventId}` }).lean();
		assert.ok(wpis, 'każde naliczenie musi zostawić ślad w księdze');
		assert.equal(wpis.amount, PACK.credits);
		assert.equal(wpis.reason, `purchase:${PACK.id}`);
		assert.equal(
			wpis.details.paymentIntentId,
			'pi_test_1',
			'bez identyfikatora płatności nie da się później powiązać zwrotu z zakupem'
		);
	});

	test('to samo zdarzenie drugi raz nie nalicza kredytów ponownie', async () => {
		const eventId = evt('powtorka');
		const przed = await saldo();

		const pierwsze = await wyslij(checkoutEvent({ id: eventId, userId: user._id }));
		const po_pierwszym = await saldo();
		const drugie = await wyslij(checkoutEvent({ id: eventId, userId: user._id }));

		assert.equal(pierwsze.body.credited, PACK.credits);
		assert.equal(drugie.status, 200);
		assert.equal(drugie.body.duplicate, true, 'Stripe gwarantuje dostarczenie CO NAJMNIEJ raz');
		assert.equal(await saldo(), po_pierwszym, 'saldo nie może urosnąć przy powtórce');
		assert.equal(await saldo(), przed + PACK.credits);
	});

	test('płatność odroczona (BLIK) nalicza kredyty po potwierdzeniu', async () => {
		const przed = await saldo();
		const { status, body } = await wyslij(
			checkoutEvent({
				id: evt('blik_ok'),
				userId: user._id,
				type: 'checkout.session.async_payment_succeeded',
			})
		);

		assert.equal(status, 200);
		assert.equal(body.credited, PACK.credits);
		assert.equal(await saldo(), przed + PACK.credits);
	});

	test('nieudana płatność odroczona nie nalicza kredytów', async () => {
		const przed = await saldo();
		const { status, body } = await wyslij(
			checkoutEvent({
				id: evt('blik_blad'),
				userId: user._id,
				type: 'checkout.session.async_payment_failed',
			})
		);

		assert.equal(status, 200);
		assert.equal(body.failed, true);
		assert.equal(await saldo(), przed);
	});
});

describe('zwroty', () => {
	test('zwrot odejmuje kredyty z zakupu wskazanego przez identyfikator płatności', async () => {
		const paymentIntentId = `pi_test_zwrot_${bieg}`;

		await wyslij(checkoutEvent({ id: evt('zakup_do_zwrotu'), userId: user._id, paymentIntentId }));
		const poZakupie = await saldo();

		const { status, body } = await wyslij({
			id: evt('zwrot'),
			type: 'charge.refunded',
			data: { object: { id: 'ch_test_1', payment_intent: paymentIntentId } },
		});

		assert.equal(status, 200);
		assert.equal(body.revoked, true);
		assert.equal(await saldo(), poZakupie - PACK.credits);
	});

	test('zwrot bez pasującego zakupu niczego nie zmienia', async () => {
		const przed = await saldo();
		const { status, body } = await wyslij({
			id: evt('zwrot_sierota'),
			type: 'charge.refunded',
			data: { object: { id: 'ch_test_2', payment_intent: 'pi_nie_istnieje' } },
		});

		assert.equal(status, 200, 'ponowienie tego nie naprawi — nie wolno zwracać błędu');
		assert.equal(body.skipped, 'purchase_not_found');
		assert.equal(await saldo(), przed);
	});
});
