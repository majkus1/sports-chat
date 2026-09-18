import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Strona główna: liczby z kodu, ikony z listy komponentu, FAQ bez żargonu i bez języka
 * zakładów. Landing obiecujący co innego niż polityka typów albo cennik traci zaufanie
 * w pierwszej minucie — te testy pilnują, żeby nie dało się tego zrobić przypadkiem.
 */

setupEnv();

const { landingContent } = await import('@/lib/landing/content');
const { faqItems } = await import('@/lib/landing/faq');
const { MIN_LIFT, MIN_PROBABILITY } = await import('@/lib/picks/policy');
const { PLANS } = await import('@/lib/billing/plans');

const IKONY = ['BarChart3', 'Bot', 'FileText', 'Mail', 'Radio', 'Sparkles', 'MessagesSquare', 'Target', 'Trophy', 'Users'];
const ZARGON = ['kalibrac', 'dixon', 'brier', 'log loss', 'calibrat', 'regres'];
const ZAKLADY = ['kurs', 'bukmacher', 'stawk', 'obstaw', 'odds', 'bookmaker', 'stake'];

describe('strona główna', () => {
	for (const locale of ['pl', 'en']) {
		const c = landingContent(locale);
		const faq = faqItems(locale);
		// Odpowiedź „czy to bukmacher" z konieczności nazywa rzeczy po imieniu — poza nią ani słowa.
		const bezZastrzezenia = faq.filter((f) => !/bukmacher|bookmaker/i.test(f.question));
		const tekst = JSON.stringify([c, bezZastrzezenia]).toLowerCase();

		test(`${locale}: próg typu i limit darmowy z kodu`, () => {
			assert.ok(tekst.includes(`${MIN_PROBABILITY}%`), 'brak dolnej granicy');
			assert.ok(tekst.includes(`${MIN_LIFT} `), 'brak progu przewagi');
			assert.ok(tekst.includes(String(PLANS.free.limits.analysis)), 'brak limitu darmowego');
		});

		test(`${locale}: każdy kafelek ma ikonę znaną komponentowi`, () => {
			for (const item of c.features.items) assert.ok(IKONY.includes(item.icon), item.icon);
		});

		test(`${locale}: cztery rynki wymienione, bez żargonu i bez języka zakładów`, () => {
			assert.ok(/2[,.]5/.test(tekst), 'brak powyżej 2,5');
			for (const slowo of ZARGON) assert.ok(!tekst.includes(slowo), slowo);
			// „bukmacher" wolno wyłącznie w zastrzeżeniu, że treść nie jest poradą bukmacherską.
			const zakazane = ZAKLADY.filter((s) => s !== 'bukmacher' && s !== 'bookmaker');
			for (const slowo of zakazane) assert.ok(!tekst.includes(slowo), slowo);
		});

		test(`${locale}: FAQ ma pytanie o „zwykle" i o rodzaje typów`, () => {
			const pytania = faq.map((f) => f.question.toLowerCase());
			assert.ok(pytania.some((q) => q.includes('44')), 'brak pytania o „66% (zwykle 44%)"');
			assert.ok(pytania.some((q) => /typy|picks/.test(q)), 'brak pytania o rodzaje typów');
		});
	}
});
