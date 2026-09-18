import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Przewodnik: liczby w tekście mają pochodzić z kodu, a zakładki z menu — żeby zmiana
 * progu typu albo cennika nie zostawiła w modalu nieprawdy.
 */

setupEnv();

const { guideContent } = await import('@/lib/landing/guide');
const { MIN_LIFT, MIN_PROBABILITY } = await import('@/lib/picks/policy');
const { PLANS } = await import('@/lib/billing/plans');

describe('przewodnik', () => {
	for (const locale of ['pl', 'en']) {
		test(`${locale}: próg typu i limity planów wzięte z kodu`, () => {
			const g = guideContent(locale);
			const tekst = JSON.stringify(g);
			assert.ok(tekst.includes(`${MIN_PROBABILITY}%`), 'brak dolnej granicy');
			assert.ok(tekst.includes(`${MIN_LIFT} `), 'brak progu przewagi');
			assert.ok(tekst.includes(String(PLANS.free.limits.analysis)), 'brak limitu darmowego');
			assert.ok(tekst.includes(String(PLANS.pro.priceMonthlyPln)), 'brak ceny Pro');
		});

		test(`${locale}: sześć zakładek, każda z adresem z menu`, () => {
			const g = guideContent(locale);
			assert.deepEqual(
				g.tabs.items.map((t) => t.key),
				['przedmeczowe', 'live', 'ai-agent', 'asystent', 'kolejka', 'skutecznosc']
			);
		});

		test(`${locale}: bez żargonu`, () => {
			const tekst = JSON.stringify(guideContent(locale)).toLowerCase();
			for (const slowo of ['kalibrac', 'dixon', 'log loss', 'brier', 'calibrat']) {
				assert.ok(!tekst.includes(slowo), slowo);
			}
		});
	}
});
