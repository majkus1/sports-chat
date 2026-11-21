import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Sesja Stripe Checkout bez niczego, co ukrywa BLIK albo Przelewy24, i przepustka w cenniku.
 *
 * Checkout nie zgłasza błędu, gdy metoda odpada — po prostu jej nie pokazuje. Parametr dopisany
 * „na wszelki wypadek" (`setup_future_usage`, sztywna lista metod, subskrypcja, inna waluta)
 * po cichu zostawiłby kupującemu samą kartę, a o tym, że BLIK zniknął, dowiedzielibyśmy się
 * z braku sprzedaży. Te testy łapią to wcześniej.
 */

setupEnv();

const { checkoutSessionParams } = await import('@/lib/billing/checkoutSession');
const { PAYMENT_METHODS } = await import('@/lib/billing/paymentMethods');
const { CREDIT_COSTS, PLAN_PASSES, PLANS, PLAN_PASS_DAYS, PRO_WEEK, getPlanPass, passDays } = await import('@/lib/billing/plans');
const { PRICING_OFFERS, formatZl, monthVsWeekSaving } = await import('@/lib/billing/offers');

const item = {
	kind: 'plan',
	id: 'pro_week',
	priceGrosze: PRO_WEEK.priceGrosze,
	name: 'Plan PRO — 7 dni',
	description: 'Dostęp na 7 dni.',
	metadata: { planId: 'pro_week', days: '7' },
};
const params = (extra = {}) =>
	checkoutSessionParams({
		item,
		email: 'kupujacy@example.test',
		userId: 'u1',
		locale: 'pl',
		appUrl: 'https://czatsportowy.pl',
		consentId: 'c1',
		termsVersion: '2099-01-01',
		...extra,
	});

describe('sesja Checkout: nic nie blokuje BLIK-a i Przelewy24', () => {
	const p = params();

	test('płatność jednorazowa w PLN, kwota w groszach liczbą całkowitą', () => {
		assert.equal(p.mode, 'payment');
		assert.equal(p.currency, 'pln');
		assert.equal(p.line_items[0].price_data.currency, 'pln');
		assert.ok(Number.isInteger(p.line_items[0].price_data.unit_amount));
		assert.equal(p.line_items[0].price_data.unit_amount, 1900);
	});

	test('bez zapisu metody na przyszłość, bez sztywnej listy metod, bez subskrypcji', () => {
		const tekst = JSON.stringify(p);
		for (const zakazane of ['setup_future_usage', 'payment_method_types', 'subscription_data', 'automatic_payment_methods', 'payment_method_collection']) {
			assert.ok(!tekst.includes(zakazane), `${zakazane} ukrywa BLIK/P24 albo psuje sesję`);
		}
		assert.equal(p.customer_creation, undefined, 'domyślne `if_required` — bez dodatkowego kroku');
	});

	test('e-mail z konta (P24 go wymaga), język strony płatności = język serwisu', () => {
		assert.equal(p.customer_email, 'kupujacy@example.test');
		assert.equal(p.locale, 'pl');
		assert.equal(params({ locale: 'en' }).locale, 'en');
		assert.ok(params({ locale: 'en' }).success_url.includes('/en/cennik?platnosc=sukces'));
	});

	test('metadane: konto, bilet, oświadczenie; źródło tylko gdy jest', () => {
		assert.equal(p.metadata.userId, 'u1');
		assert.equal(p.metadata.planId, 'pro_week');
		assert.equal(p.metadata.consentId, 'c1');
		assert.equal(p.metadata.source, undefined);
		assert.equal(params({ source: 'coupon_days3' }).metadata.source, 'coupon_days3');
	});

	test('metody w interfejsie: BLIK, Przelewy24, karta — w tej kolejności', () => {
		assert.deepEqual(PAYMENT_METHODS.map((m) => m.id), ['blik', 'p24', 'card']);
	});
});

/*
 * Koszt jednej operacji z nagłówka `lib/billing/plans.js` (zł). Kreator kuponu: typowo ~0,03 $
 * za kupon przy kursie 3,65 zł/$ — werdykty wiadomości są wspólne przez 12 godzin.
 */
const KOSZT = { analysis: 0.084, aiChat: 0.045, report: 0.222, aiNews: 0.1 };
const KUPON_ZL = 0.03 * 3.65;

describe('przepustka Pro 7 dni: cena, limity, reguła kosztu', () => {
	test('bilet w sprzedaży: 19 zł za 7 dni, plan Pro', () => {
		const pass = getPlanPass('pro_week');
		assert.deepEqual(
			{ planId: pass.planId, priceGrosze: pass.priceGrosze, days: pass.days },
			{ planId: 'pro', priceGrosze: 1900, days: 7 }
		);
		assert.equal(passDays('pro_week'), 7);
		assert.equal(passDays('pro'), PLAN_PASS_DAYS);
		assert.equal(passDays('nieznany'), PLAN_PASS_DAYS);
		assert.equal(PLAN_PASSES.filter((p) => p.days === PLAN_PASS_DAYS).length, 2, 'Pro i VIP na 30 dni zostają');
	});

	test('koszt AI przy pełnym zużyciu ≤ 35% ceny (z kreatorem kuponu)', () => {
		const l = PRO_WEEK.limits;
		const ai = Object.entries(KOSZT).reduce((s, [k, c]) => s + (l[k] || 0) * c, 0);
		const kupony = l.couponGen * PRO_WEEK.days * KUPON_ZL;
		const udzial = (ai + kupony) / (PRO_WEEK.priceGrosze / 100);
		assert.ok(udzial <= 0.35, `koszt ${(ai + kupony).toFixed(2)} zł = ${(udzial * 100).toFixed(1)}% ceny`);
	});

	test('limity nie wyższe niż proporcja 7/30 z Pro (zaokrąglona w górę), kreator dziennie jak Pro', () => {
		for (const kind of ['analysis', 'aiChat', 'report', 'aiNews']) {
			const proporcja = Math.ceil((PLANS.pro.limits[kind] * PRO_WEEK.days) / PLAN_PASS_DAYS);
			assert.ok(PRO_WEEK.limits[kind] <= proporcja, `${kind}: ${PRO_WEEK.limits[kind]} > ${proporcja}`);
			assert.ok(PRO_WEEK.limits[kind] > 0, `${kind}: przepustka bez ${kind} to nie Pro`);
		}
		assert.equal(PRO_WEEK.limits.couponGen, PLANS.pro.limits.couponGen);
		assert.equal(PRO_WEEK.limits.analysisView, null);
	});

	test('kredyty nie wychodzą taniej niż przepustka za analizę — przepustka ma sens', () => {
		const zaAnalize = PRO_WEEK.priceGrosze / PRO_WEEK.limits.analysis;
		assert.ok(zaAnalize < 1900 / (5 / CREDIT_COSTS.analysis), 'najmniejszy pakiet kredytów za 19 zł daje mniej');
	});

	test('cennik: cztery karty, Pro 30 tańszy za dzień niż przepustka', () => {
		assert.deepEqual(PRICING_OFFERS.map((o) => o.id), ['free', 'pro_week', 'pro', 'vip']);
		const tydzien = PRICING_OFFERS.find((o) => o.id === 'pro_week');
		const miesiac = PRICING_OFFERS.find((o) => o.id === 'pro');
		assert.ok(miesiac.perDayGrosze < tydzien.perDayGrosze);
		assert.equal(monthVsWeekSaving(), 40);
		assert.equal(formatZl(1900, 'pl'), '19');
		assert.equal(formatZl(271, 'pl'), '2,71');
		assert.equal(formatZl(271, 'en'), '2.71');
	});
});
