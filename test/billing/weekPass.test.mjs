import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkoutEvent, setupEnv, signedRequest } from '../helpers/setup.mjs';

/**
 * Przepustka Pro na 7 dni przez PRAWDZIWY webhook i prawdziwą bazę (jak `planAccess.test`).
 *
 * Pilnujemy trzech rzeczy, na których przepustka mogłaby kosztować pieniądze albo zaufanie:
 * że daje 7 dni (nie 30) z tygodniowymi limitami, że dokupienie Pro w trakcie nie zabiera dni,
 * i że zwrot odejmuje 7 dni, a nie 30. Konto testowe ma losową nazwę i znika po przebiegu;
 * żadne zdarzenie nie niesie `metadata.source`, więc licznik okien zakupu (dzisiejsza data)
 * nie dostaje wpisów z testów.
 */

setupEnv();

const { default: mongoose } = await import('mongoose');
const { default: Stripe } = await import('stripe');
const { POST } = await import('@/app/api/billing/webhook/route.js');
const { default: User } = await import('@/models/User');
const { default: CreditLedger } = await import('@/models/CreditLedger');
const { PLANS, PRO_WEEK, getPlanPass } = await import('@/lib/billing/plans');
const { resolvePlan, paidWindow, getEntitlements } = await import('@/lib/billing/entitlements');

const stripe = new Stripe('sk_test_dummy_key_for_local_tests');
const TYDZIEN = getPlanPass('pro_week');
const PRO30 = getPlanPass('pro');
const DZIEN_MS = 24 * 3600 * 1000;

let user;
const bieg = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const evt = (nazwa) => `evt_week_${bieg}_${nazwa}`;

function passEvent({ id, pass, ...reszta }) {
	return checkoutEvent({
		id,
		userId: user._id,
		amountTotal: pass.priceGrosze,
		metadata: { userId: String(user._id), planId: pass.id, days: String(pass.days) },
		// Własny identyfikator płatności — zwrot w innym pliku testów nie może trafić w nasz zakup.
		paymentIntentId: `pi_${id}`,
		...reszta,
	});
}

async function wyslij(event) {
	const res = await POST(signedRequest(stripe, event));
	return { status: res.status, body: await res.json() };
}

const konto = () => User.findById(user._id).select('plan planStatus planValidUntil planPeriod role createdAt').lean();
const dni = (od, doo) => Math.round((new Date(doo) - new Date(od)) / DZIEN_MS);

before(async () => {
	await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });
	user = await User.create({
		username: `test-week-${bieg}`.slice(0, 32),
		email: `test-week-${bieg}@example.test`,
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

describe('przepustka 7 dni przez webhook', () => {
	test('opłacona przepustka: plan Pro na 7 dni, tygodniowe limity, cechy Pro', async () => {
		const { status, body } = await wyslij(passEvent({ id: evt('1'), pass: TYDZIEN }));
		const stan = await konto();

		assert.equal(status, 200);
		assert.equal(body.plan, 'pro');
		assert.equal(body.pass, 'pro_week');
		assert.equal(stan.plan, 'pro');
		assert.equal(stan.planPeriod.pass, 'pro_week');
		assert.equal(dni(Date.now(), stan.planValidUntil), PRO_WEEK.days);
		assert.deepEqual(resolvePlan(stan).limits, PRO_WEEK.limits);

		const ent = getEntitlements(stan);
		assert.equal(ent.pass, 'pro_week');
		assert.equal(ent.passDays, 7);
		assert.ok(ent.features.includes('live_analysis'));

		const okno = paidWindow(stan);
		assert.equal(dni(okno.startsAt, okno.endsAt), 7, 'okno limitów przepustki ma 7 dni');
	});

	test('kwota Pro 30 z biletem przepustki nie przechodzi (cena z cennika po naszej stronie)', async () => {
		const przed = await konto();
		const { body } = await wyslij(passEvent({ id: evt('zla_kwota'), pass: TYDZIEN, amountTotal: PRO30.priceGrosze }));
		const po = await konto();
		assert.equal(body.skipped, 'amount_mismatch');
		assert.equal(new Date(po.planValidUntil).getTime(), new Date(przed.planValidUntil).getTime());
	});

	test('druga przepustka dokłada 7 dni i nie rusza bieżącego okna', async () => {
		const przed = await konto();
		await wyslij(passEvent({ id: evt('2'), pass: TYDZIEN }));
		const po = await konto();
		assert.equal(dni(przed.planValidUntil, po.planValidUntil), 7);
		assert.equal(new Date(po.planPeriod.from).getTime(), new Date(przed.planPeriod.from).getTime());
		assert.equal(paidWindow(po).key, paidWindow(przed).key);
	});

	test('Pro 30 w trakcie przepustki: od razu limity Pro, dni przepustki zostają, jedno okno', async () => {
		const przed = await konto();
		const { body } = await wyslij(passEvent({ id: evt('pro'), pass: PRO30, paymentIntentId: `pi_week_pro_${bieg}` }));
		const po = await konto();

		assert.equal(body.plan, 'pro');
		assert.equal(body.pass, 'pro');
		assert.equal(po.planPeriod.pass, 'pro');
		assert.equal(dni(przed.planValidUntil, po.planValidUntil), 30, 'bez utraty dni przepustki');
		assert.deepEqual(resolvePlan(po).limits, PLANS.pro.limits);
		const okno = paidWindow(po);
		assert.equal(new Date(okno.endsAt).getTime(), new Date(po.planValidUntil).getTime(), 'reszta doklejona do okna');
		assert.notEqual(okno.key, paidWindow(przed).key);
	});

	test('zwrot Pro 30 odejmuje 30 dni; zwrot przepustki — 7', async () => {
		const przed = await konto();
		const pro = await wyslij({
			id: evt('zwrot_pro'),
			type: 'charge.refunded',
			data: { object: { id: `ch_week_${bieg}`, payment_intent: `pi_week_pro_${bieg}` } },
		});
		const poPro = await konto();
		assert.equal(pro.body.revoked, true);
		assert.equal(dni(poPro.planValidUntil, przed.planValidUntil), 30);

		await wyslij(passEvent({ id: evt('3'), pass: TYDZIEN, paymentIntentId: `pi_week_3_${bieg}` }));
		const poZakupie = await konto();
		await wyslij({
			id: evt('zwrot_tydzien'),
			type: 'charge.refunded',
			data: { object: { id: `ch_week3_${bieg}`, payment_intent: `pi_week_3_${bieg}` } },
		});
		const poZwrocie = await konto();
		assert.equal(dni(poZwrocie.planValidUntil, poZakupie.planValidUntil), 7);
	});
});
