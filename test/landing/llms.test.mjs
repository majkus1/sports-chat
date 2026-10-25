import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * `public/llms.txt` — opis serwisu dla asystentów AI, które cytują go użytkownikom.
 *
 * To plik statyczny, więc liczby są w nim wpisane ręcznie — i przez kilka tygodni mówił
 * o serwisie sprzed kuponów, typów na dziś i okresu próbnego. Test porównuje każdą liczbę
 * z kodem (plany, okres próbny, kredyty, kupony) i sprawdza, że adresy prowadzą do stron.
 */

setupEnv();

const { CREDIT_COSTS, CREDIT_PACKS, PLANS, PLAN_PASS_DAYS, TRIAL } = await import('@/lib/billing/plans');
const { COUPON_TYPES } = await import('@/lib/coupons/build');
const { CUSTOM_LEGS, CUSTOM_ODDS } = await import('@/lib/coupons/custom');
const { odmien, ANALIZY, PYTANIA, RAPORTY, KREDYTY } = await import('@/lib/landing/plural');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tekst = readFileSync(path.join(ROOT, 'public', 'llms.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n\s+/g, ' ');
const pl = (v) => v.toFixed(1).replace('.', ',');
const ma = (fragment) => assert.ok(tekst.includes(fragment), `brak w llms.txt: „${fragment}"`);

describe('llms.txt zgadza się z kodem', () => {
	test('plan darmowy i okres próbny', () => {
		const free = PLANS.free.limits;
		ma(`Plan darmowy: ${free.analysis} ${odmien(free.analysis, ANALIZY)} i ${free.aiChat} ${odmien(free.aiChat, PYTANIA)}`);
		ma(`${TRIAL.days} dni`);
		ma(
			`${TRIAL.limits.analysis} ${odmien(TRIAL.limits.analysis, ANALIZY)}, ${TRIAL.limits.aiChat} ` +
				`${odmien(TRIAL.limits.aiChat, PYTANIA)} i ${TRIAL.limits.report} ${odmien(TRIAL.limits.report, RAPORTY)}`
		);
	});

	test('Pro i VIP: cena, okres i limity', () => {
		for (const plan of [PLANS.pro, PLANS.vip]) {
			const l = plan.limits;
			ma(
				`${plan.id === 'pro' ? 'Pro' : 'VIP'}: ${plan.priceMonthlyPln} zł za ${PLAN_PASS_DAYS} dni — ` +
					`${l.analysis} ${odmien(l.analysis, ANALIZY)}, ${l.aiChat} ${odmien(l.aiChat, PYTANIA)}, ` +
					`${l.report} ${odmien(l.report, RAPORTY)}, ${l.aiNews} wyszukiwań wiadomości`
			);
		}
	});

	test('kredyty i ich koszt', () => {
		const [pierwszy, ...reszta] = CREDIT_PACKS;
		ma(`${pierwszy.credits} ${odmien(pierwszy.credits, KREDYTY)} za ${pierwszy.priceGrosze / 100} zł`);
		for (const p of reszta) ma(`${p.credits} za ${p.priceGrosze / 100} zł`);
		ma(
			`Analiza kosztuje ${CREDIT_COSTS.analysis} ${odmien(CREDIT_COSTS.analysis, KREDYTY)}, ` +
				`raport ${CREDIT_COSTS.report} ${odmien(CREDIT_COSTS.report, KREDYTY)}`
		);
	});

	test('kupony według dzisiejszych zasad, bez weekendowego', () => {
		ma(`kurs łączny ${pl(COUPON_TYPES.daily.target)}–${pl(COUPON_TYPES.daily.max)}`);
		ma(`najwyżej ${COUPON_TYPES.daily.maxLegs} typy na kuponie dnia i ${COUPON_TYPES.days3.maxLegs} na pozostałych`);
		assert.equal(COUPON_TYPES.days3.maxLegs, COUPON_TYPES.days5.maxLegs, '3- i 5-dniowy mają różne limity typów');
		assert.ok(!/weekend/i.test(tekst), 'kupon weekendowy już nie powstaje');
	});

	test('kreator kuponu: cele kursu, liczba meczów i dzienne limity z kodu', () => {
		ma(`kurs łączny ok. ${CUSTOM_ODDS.slice(0, -1).map((o) => pl(o.nominal)).join(', ')} albo ${pl(CUSTOM_ODDS.at(-1).nominal)}`);
		ma(`najwyżej ${CUSTOM_LEGS.min}–${CUSTOM_LEGS.max} meczów`);
		ma(`Pro: ${PLANS.pro.limits.couponGen} kupony dziennie, VIP: ${PLANS.vip.limits.couponGen}, okres próbny: ${TRIAL.limits.couponGen}`);
		ma(`${PLANS.pro.limits.couponGen} kupony z kreatora dziennie`);
		ma(`${PLANS.vip.limits.couponGen} kuponów z kreatora dziennie`);
		ma('nie wchodzą do publicznej skuteczności');
	});

	test('adresy prowadzą do istniejących stron', () => {
		const adresy = [...tekst.matchAll(/https:\/\/czatsportowy\.pl\/pl(\/[^\s?]*)?/g)].map((m) => m[1] || '/');
		assert.ok(adresy.length >= 10, 'za mało adresów');
		for (const sciezka of adresy) {
			const plik = path.join(ROOT, 'app', '[locale]', ...sciezka.split('/').filter(Boolean), 'page.js');
			assert.ok(existsSync(plik), `brak strony dla ${sciezka}`);
		}
	});
});
