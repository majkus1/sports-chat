import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutEvent, setupEnv, signedRequest } from '../helpers/setup.mjs';

/**
 * Płatne plany sprzedawane jako dostęp na czas określony.
 *
 * Plan nie jest subskrypcją: kupuje się 30 dni, po których konto samo wraca do darmowego.
 * Testy pilnują trzech rzeczy, na których można stracić pieniądze albo zaufanie — że dostęp
 * przyznaje się dokładnie raz na zdarzenie, że przedłużenie DOKŁADA dni zamiast je kasować
 * i że po terminie plan naprawdę wygasa.
 */

setupEnv();

const { default: mongoose } = await import('mongoose');
const { default: Stripe } = await import('stripe');
const { POST } = await import('@/app/api/billing/webhook/route.js');
const { default: User } = await import('@/models/User');
const { default: CreditLedger } = await import('@/models/CreditLedger');
const { PLAN_PASSES, PLAN_PASS_DAYS } = await import('@/lib/billing/plans');
const { accessEndsAt } = await import('@/lib/billing/planAccess');
const { resolvePlan } = await import('@/lib/billing/entitlements');

const stripe = new Stripe('sk_test_dummy_key_for_local_tests');
const PRO = PLAN_PASSES.find((p) => p.id === 'pro');
const VIP = PLAN_PASSES.find((p) => p.id === 'vip');
const DZIEN_MS = 24 * 3600 * 1000;

let user;
const bieg = Date.now();
const evt = (nazwa) => `evt_plan_${bieg}_${nazwa}`;

/** Zdarzenie zakupu dostępu do planu — metadane zamiast pakietu kredytów niosą `planId`. */
function planEvent({ id, pass, ...reszta }) {
	return checkoutEvent({
		id,
		userId: user._id,
		amountTotal: pass.priceGrosze,
		metadata: { userId: String(user._id), planId: pass.id, days: String(pass.days) },
		...reszta,
	});
}

async function wyslij(event) {
	const res = await POST(signedRequest(stripe, event));
	return { status: res.status, body: await res.json() };
}

async function konto() {
	return User.findById(user._id).select('plan planStatus planValidUntil').lean();
}

/** Ustawia datę końca dostępu bez przechodzenia przez webhook — do testów wygaśnięcia. */
async function ustawTermin(data) {
	await User.updateOne({ _id: user._id }, { $set: { planValidUntil: data } });
}

before(async () => {
	await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

	user = await User.create({
		username: `test-plan-${bieg}`,
		email: `test-plan-${bieg}@example.test`,
		password: 'x'.repeat(60),
		plan: 'free',
		credits: 0,
	});
});

after(async () => {
	await CreditLedger.deleteMany({ userId: user._id });
	await User.deleteOne({ _id: user._id });
	await mongoose.disconnect();
});

describe('wyliczanie końca dostępu', () => {
	test('pierwszy zakup liczy dni od teraz', () => {
		const teraz = new Date('2026-08-25T12:00:00Z');
		const koniec = accessEndsAt(null, 30, teraz);

		assert.equal(koniec.getTime(), teraz.getTime() + 30 * DZIEN_MS);
	});

	test('przedłużenie przed wygaśnięciem dokłada dni do pozostałego okresu', () => {
		const teraz = new Date('2026-08-25T12:00:00Z');
		const dotychczas = new Date('2026-09-04T12:00:00Z'); // zostało 10 dni
		const koniec = accessEndsAt(dotychczas, 30, teraz);

		assert.equal(
			koniec.getTime(),
			dotychczas.getTime() + 30 * DZIEN_MS,
			'kto przedłuża wcześniej, nie może tracić opłaconych dni'
		);
	});

	test('zakup po wygaśnięciu liczy od teraz, nie od starej daty', () => {
		const teraz = new Date('2026-08-25T12:00:00Z');
		const dawno = new Date('2026-07-01T12:00:00Z');
		const koniec = accessEndsAt(dawno, 30, teraz);

		assert.equal(koniec.getTime(), teraz.getTime() + 30 * DZIEN_MS);
	});
});

describe('zakup dostępu przez webhook', () => {
	test('opłacony plan Pro nadaje dostęp na 30 dni', async () => {
		const { status, body } = await wyslij(planEvent({ id: evt('pro'), pass: PRO }));
		const stan = await konto();

		assert.equal(status, 200);
		assert.equal(body.plan, 'pro');
		assert.equal(stan.plan, 'pro');
		assert.equal(stan.planStatus, 'active');

		const dni = Math.round((new Date(stan.planValidUntil) - Date.now()) / DZIEN_MS);
		assert.equal(dni, PLAN_PASS_DAYS);
	});

	test('to samo zdarzenie drugi raz nie przedłuża dostępu', async () => {
		const eventId = evt('pro_powtorka');

		await wyslij(planEvent({ id: eventId, pass: PRO }));
		const poPierwszym = await konto();

		const drugie = await wyslij(planEvent({ id: eventId, pass: PRO }));
		const poDrugim = await konto();

		assert.equal(drugie.body.duplicate, true);
		assert.equal(
			new Date(poDrugim.planValidUntil).getTime(),
			new Date(poPierwszym.planValidUntil).getTime(),
			'powtórka zdarzenia nie może dokładać kolejnych dni'
		);
	});

	test('zakup VIP przy aktywnym Pro zmienia plan i zachowuje pozostałe dni', async () => {
		const przed = await konto();
		const { body } = await wyslij(planEvent({ id: evt('vip'), pass: VIP }));
		const po = await konto();

		assert.equal(body.plan, 'vip');
		assert.equal(po.plan, 'vip');
		assert.equal(
			new Date(po.planValidUntil).getTime(),
			new Date(przed.planValidUntil).getTime() + PLAN_PASS_DAYS * DZIEN_MS,
			'zmiana planu nie może kasować już opłaconych dni'
		);
	});

	test('kwota niezgodna z ceną planu nie nadaje dostępu', async () => {
		const przed = await konto();
		const { status, body } = await wyslij(
			planEvent({ id: evt('zla_kwota'), pass: PRO, amountTotal: 100 })
		);
		const po = await konto();

		assert.equal(status, 200);
		assert.equal(body.skipped, 'amount_mismatch');
		assert.equal(new Date(po.planValidUntil).getTime(), new Date(przed.planValidUntil).getTime());
	});

	test('nieznany plan w metadanych nie nadaje dostępu', async () => {
		const przed = await konto();
		const { body } = await wyslij(
			checkoutEvent({
				id: evt('nieznany_plan'),
				userId: user._id,
				amountTotal: PRO.priceGrosze,
				metadata: { userId: String(user._id), planId: 'platinum' },
			})
		);
		const po = await konto();

		assert.equal(body.skipped, 'unknown_pack');
		assert.equal(new Date(po.planValidUntil).getTime(), new Date(przed.planValidUntil).getTime());
	});
});

describe('wygasanie dostępu', () => {
	test('po terminie konto wraca do planu darmowego', async () => {
		await ustawTermin(new Date(Date.now() - DZIEN_MS));
		const stan = await konto();

		assert.equal(stan.plan, 'vip', 'w bazie plan zostaje — wygaśnięcie liczy się przy odczycie');
		assert.equal(
			resolvePlan(stan).id,
			'free',
			'żadne zadanie cykliczne nie jest potrzebne: rozstrzyga `resolvePlan`'
		);
	});

	test('przed terminem plan obowiązuje', async () => {
		await ustawTermin(new Date(Date.now() + 5 * DZIEN_MS));
		const stan = await konto();

		assert.equal(resolvePlan(stan).id, 'vip');
	});
});

describe('zwrot płatności za plan', () => {
	test('zwrot odejmuje dokładnie tyle dni, ile dodał zakup', async () => {
		const paymentIntentId = `pi_plan_zwrot_${bieg}`;

		await wyslij(planEvent({ id: evt('zakup_do_zwrotu'), pass: PRO, paymentIntentId }));
		const poZakupie = await konto();

		const { status, body } = await wyslij({
			id: evt('zwrot_planu'),
			type: 'charge.refunded',
			data: { object: { id: 'ch_plan_1', payment_intent: paymentIntentId } },
		});
		const poZwrocie = await konto();

		assert.equal(status, 200);
		assert.equal(body.revoked, true);
		assert.equal(
			new Date(poZwrocie.planValidUntil).getTime(),
			new Date(poZakupie.planValidUntil).getTime() - PLAN_PASS_DAYS * DZIEN_MS,
			'zwrot cofa własny okres, a nie cały dostęp — wcześniejsze zakupy zostają'
		);
	});
});
