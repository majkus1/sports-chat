import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Okno limitów planu płatnego — 30 dni od zakupu, nie miesiąc kalendarzowy.
 *
 * Błąd, którego ten test pilnuje: limity „miesięczne" odnawiały się 1-go, a plan kupuje się
 * na 30 dni. Zakup 28 września dawał 100 analiz do 30-go i drugie 100 od 1 października —
 * dwa komplety za jedną płatność.
 */

setupEnv();
const { paidWindow } = await import('@/lib/billing/entitlements');

const DZIEN = 86_400_000;
const d = (s) => new Date(`${s}T12:00:00Z`);
const pro = (validUntil) => ({ plan: 'pro', planStatus: 'active', planValidUntil: validUntil });

describe('okno limitów planu płatnego', () => {
	const zakup = d('2026-09-28');
	const user = pro(new Date(zakup.getTime() + 30 * DZIEN));

	test('okno zaczyna się w dniu zakupu, a nie pierwszego dnia miesiąca', () => {
		const okno = paidWindow(user, d('2026-09-30'));
		assert.equal(okno.startsAt.getTime(), zakup.getTime());
	});

	test('1 października to NADAL to samo okno — bez drugiego kompletu limitów', () => {
		assert.equal(paidWindow(user, d('2026-09-30')).key, paidWindow(user, d('2026-10-01')).key);
		assert.equal(paidWindow(user, d('2026-09-30')).key, paidWindow(user, d('2026-10-27')).key);
	});

	test('przedłużenie przed terminem nie zeruje bieżącego okna, a kolejne 30 dni mają własne', () => {
		const przedluzony = pro(new Date(zakup.getTime() + 60 * DZIEN));
		assert.equal(paidWindow(przedluzony, d('2026-10-10')).key, paidWindow(user, d('2026-10-10')).key);
		assert.notEqual(paidWindow(przedluzony, d('2026-10-29')).key, paidWindow(przedluzony, d('2026-10-10')).key);
	});

	test('licznik wygasa z końcem okna', () => {
		const okno = paidWindow(user, d('2026-10-27'));
		assert.equal(okno.endsAt.getTime(), zakup.getTime() + 30 * DZIEN);
		assert.ok(okno.ttlSeconds > 0 && okno.ttlSeconds <= 24 * 3600);
	});

	test('plan darmowy, wygasły i administrator liczą się po miesiącu kalendarzowym', () => {
		assert.equal(paidWindow({ plan: 'free' }, d('2026-10-01')), null);
		assert.equal(paidWindow(pro(d('2026-09-01')), d('2026-10-01')), null);
		assert.equal(paidWindow({ role: 'admin', plan: 'pro', planValidUntil: d('2026-12-01') }, d('2026-10-01')), null);
	});
});

/*
 * Przepustka 7 dni i okna liczone od kotwicy (`planPeriod.from`, od 22.11.2026).
 *
 * Wcześniejsza wersja tego pliku padała od listopada 2026 także na main: `resolvePlan` sprawdzał
 * wygaśnięcie zegarem systemu, a nie chwilą, o którą pytał test, więc plan „z września" był już
 * wygasły. Teraz `paidWindow(user, now)` przekazuje `now` dalej.
 */
const { resolvePlan, currentPass } = await import('@/lib/billing/entitlements');
const { planAfterPurchase, canBuyPass } = await import('@/lib/billing/planAccess');
const { PLANS, PRO_WEEK, getPlanPass } = await import('@/lib/billing/plans');

const TYDZIEN = getPlanPass('pro_week');
const PRO30 = getPlanPass('pro');
const VIP30 = getPlanPass('vip');
/** Konto po zakupie: stan z `planAfterPurchase`, tak jak zapisuje go webhook. */
const kup = (user, pass, now) => ({ ...user, planStatus: 'active', ...planAfterPurchase(user, pass, now) });

describe('przepustka 7 dni: limity i okno', () => {
	const t0 = d('2099-03-01');
	const konto = kup({ plan: 'free' }, TYDZIEN, t0);

	test('to plan Pro z tygodniowymi limitami, rozpoznany po bilecie', () => {
		assert.equal(konto.plan, 'pro');
		assert.equal(konto.planPeriod.pass, 'pro_week');
		assert.equal(konto.planValidUntil.getTime(), t0.getTime() + 7 * DZIEN);
		const plan = resolvePlan(konto, d('2099-03-03'));
		assert.equal(plan.id, 'pro', 'odblokowania w serwisie zależą od id planu — musi zostać „pro"');
		assert.deepEqual(plan.limits, PRO_WEEK.limits);
		assert.deepEqual(plan.features, PLANS.pro.features);
		assert.equal(currentPass(konto, d('2099-03-03')), 'pro_week');
	});

	test('okno ma 7 dni, nie 30', () => {
		const okno = paidWindow(konto, d('2099-03-05'));
		assert.equal(okno.startsAt.getTime(), t0.getTime());
		assert.equal(okno.endsAt.getTime(), t0.getTime() + 7 * DZIEN);
	});

	test('po 7 dniach konto wraca do darmowego', () => {
		assert.equal(resolvePlan(konto, d('2099-03-09')).id, 'free');
		assert.equal(paidWindow(konto, d('2099-03-09')), null);
	});

	test('druga przepustka w trakcie: bieżące okno bez zmian, kolejny tydzień z własną pulą', () => {
		const dwa = kup(konto, TYDZIEN, d('2099-03-04'));
		assert.equal(dwa.planValidUntil.getTime(), t0.getTime() + 14 * DZIEN);
		assert.equal(dwa.planPeriod.from.getTime(), t0.getTime(), 'kotwica zostaje');
		assert.equal(paidWindow(dwa, d('2099-03-04')).key, paidWindow(konto, d('2099-03-04')).key, 'licznik się nie zeruje');
		const drugi = paidWindow(dwa, d('2099-03-10'));
		assert.equal(drugi.startsAt.getTime(), t0.getTime() + 7 * DZIEN);
		assert.notEqual(drugi.key, paidWindow(dwa, d('2099-03-04')).key);
	});
});

describe('dokupienie Pro 30 albo VIP w trakcie przepustki', () => {
	const t0 = d('2099-04-01');
	const tydzien = kup({ plan: 'free' }, TYDZIEN, t0);
	const teraz = d('2099-04-04'); // zostały 4 dni przepustki
	const pro = kup(tydzien, PRO30, teraz);

	test('bez utraty dni: koniec = koniec przepustki + 30 dni', () => {
		assert.equal(pro.plan, 'pro');
		assert.equal(pro.planPeriod.pass, 'pro');
		assert.equal(pro.planValidUntil.getTime(), t0.getTime() + 37 * DZIEN);
	});

	test('nowy plan działa od razu — z limitami Pro, nie tygodniowymi', () => {
		assert.deepEqual(resolvePlan(pro, teraz).limits, PLANS.pro.limits);
	});

	test('bez podwójnych limitów: jedno okno 34 dni z jedną pulą, a nie 4 dni + 30 dni', () => {
		const okno = paidWindow(pro, teraz);
		assert.equal(okno.startsAt.getTime(), teraz.getTime(), 'kotwica przeskakuje na chwilę zakupu');
		assert.equal(okno.endsAt.getTime(), pro.planValidUntil.getTime(), 'reszta przepustki dokleja się do okna');
		assert.equal(paidWindow(pro, d('2099-05-06')).key, okno.key, 'dzień 33. to wciąż to samo okno');
	});

	test('klucz nowego okna różni się od tygodniowego — tygodniowa pula nie przechodzi na Pro', () => {
		assert.notEqual(paidWindow(pro, teraz).key, paidWindow(tydzien, teraz).key);
	});

	test('VIP w trakcie przepustki: tak samo, z limitami VIP', () => {
		const vip = kup(tydzien, VIP30, teraz);
		assert.equal(vip.plan, 'vip');
		assert.equal(vip.planValidUntil.getTime(), t0.getTime() + 37 * DZIEN);
		assert.deepEqual(resolvePlan(vip, teraz).limits, PLANS.vip.limits);
	});

	test('kolejne Pro 30 po przejściu: następne okno zaczyna się po pierwszym, bez nowej puli w środku', () => {
		const dalej = kup(pro, PRO30, d('2099-04-20'));
		assert.equal(paidWindow(dalej, d('2099-04-20')).key, paidWindow(pro, d('2099-04-20')).key);
		const drugie = paidWindow(dalej, d('2099-05-20'));
		assert.equal(drugie.startsAt.getTime(), teraz.getTime() + 30 * DZIEN);
		assert.equal(drugie.endsAt.getTime(), dalej.planValidUntil.getTime());
	});
});

describe('przepustka przy aktywnym planie 30-dniowym', () => {
	const t0 = d('2099-06-01');
	const pro = kup({ plan: 'free' }, PRO30, t0);

	test('trasa checkout jej nie sprzedaje', () => {
		assert.deepEqual(canBuyPass(pro, 'pro_week', d('2099-06-10')), { ok: false, reason: 'pass_downgrade' });
		assert.equal(canBuyPass(pro, 'vip', d('2099-06-10')).ok, true);
		assert.equal(canBuyPass({ plan: 'free' }, 'pro_week', d('2099-06-10')).ok, true);
		assert.equal(canBuyPass(kup({ plan: 'free' }, TYDZIEN, t0), 'pro_week', d('2099-06-03')).ok, true);
	});

	test('gdyby jednak przyszła opłacona (wyścig dwóch kart): +7 dni, plan i limity bez zmian, bez nowej puli', () => {
		const po = kup(pro, TYDZIEN, d('2099-06-10'));
		assert.equal(po.plan, 'pro');
		assert.equal(po.planPeriod.pass, 'pro');
		assert.equal(po.planValidUntil.getTime(), t0.getTime() + 37 * DZIEN);
		assert.deepEqual(resolvePlan(po, d('2099-06-10')).limits, PLANS.pro.limits);
		assert.equal(paidWindow(po, d('2099-06-10')).key, paidWindow(pro, d('2099-06-10')).key);
		assert.equal(paidWindow(po, d('2099-07-05')).key, paidWindow(pro, d('2099-06-10')).key, 'ostatnie okno wydłużone, nie nowe');
	});

	test('konto sprzed kotwicy dostaje ją z bieżącego okna — okna się nie przesuwają', () => {
		const stary = pro2099Bez(t0);
		const przed = paidWindow(stary, d('2099-06-10'));
		const po = kup(stary, PRO30, d('2099-06-10'));
		assert.equal(po.planPeriod.from.getTime(), przed.startsAt.getTime());
		assert.equal(paidWindow(po, d('2099-06-10')).key, przed.key);
	});
});

/** Pro kupione „po staremu": bez `planPeriod`, okna liczone wstecz od końca. */
function pro2099Bez(start) {
	return { plan: 'pro', planStatus: 'active', planValidUntil: new Date(start.getTime() + 30 * DZIEN) };
}
