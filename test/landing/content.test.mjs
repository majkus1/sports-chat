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
const { PLANS, TRIAL } = await import('@/lib/billing/plans');
const { COUPON_TYPES } = await import('@/lib/coupons/build');

const IKONY = ['BarChart3', 'Bot', 'FileText', 'Mail', 'Radio', 'Sparkles', 'MessagesSquare', 'Target', 'Trophy', 'Users'];
const ZARGON = ['kalibrac', 'dixon', 'brier', 'log loss', 'calibrat', 'regres'];
const ZAKLADY = ['kurs', 'bukmacher', 'stawk', 'obstaw', 'odds', 'bookmaker', 'stake'];

/*
 * Jedyny wyjątek od zakazu kursów: pytania o kupony (i ewentualnie o wyższe kursy). Kupon bez
 * kursu łącznego nie ma sensu. Poluzowane jest WYŁĄCZNIE „kurs"/„odds" — stawki, zachęty do gry,
 * „pewniaki" i nazwy bukmacherów są tam zakazane tak samo, a zastrzeżenia obowiązkowe.
 */
const O_KURSACH = /kupon|coupon|wyższe kursy|higher odds/i;
const W_PYTANIU_O_KURSACH = ['kurs', 'odds'];
const ZACHETY = ['stawk', 'obstaw', 'stake', 'pewniak', 'pewna wygrana', 'sure thing', 'zarob', 'gwarant', 'guarantee', 'place a bet'];
const NAZWY_BUKMACHEROW =
	/\b(sts|fortuna|betclic|superbet|totalbet|etoto|betfan|lv ?bet|forbet|fuksiarz|noblebet|betters|comeon|pinnacle|bet365|betway|unibet)\b/i;

describe('strona główna', () => {
	for (const locale of ['pl', 'en']) {
		const c = landingContent(locale);
		const faq = faqItems(locale);
		const oKursach = faq.filter((f) => O_KURSACH.test(f.question));
		// Odpowiedź „czy to bukmacher" z konieczności nazywa rzeczy po imieniu — poza nią ani słowa.
		// Pytania o kupony mają własne, węższe reguły (niżej).
		const bezZastrzezenia = faq.filter((f) => !/bukmacher|bookmaker/i.test(f.question) && !O_KURSACH.test(f.question));
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

		test(`${locale}: pytanie o kupony — jedyne z kursem, z zastrzeżeniami i liczbami z kodu`, () => {
			assert.equal(oKursach.length, 1, 'wyjątek od zakazu kursów ma dotyczyć jednego pytania o kupony');
			const odp = oKursach[0].answer;
			const male = odp.toLowerCase();
			const kurs = (v) => (locale === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ','));

			// Jeden przedział w odpowiedzi — więc wszystkie aktywne kupony muszą go mieć.
			for (const typ of [COUPON_TYPES.days3, COUPON_TYPES.days5]) {
				assert.equal(typ.target, COUPON_TYPES.daily.target);
				assert.equal(typ.max, COUPON_TYPES.daily.max);
			}
			assert.ok(odp.includes(`${kurs(COUPON_TYPES.daily.target)}–${kurs(COUPON_TYPES.daily.max)}`), 'brak kursu łącznego z kodu');
			assert.ok(odp.includes(`${TRIAL.days}`), 'brak długości okresu próbnego');

			// Zastrzeżenia obowiązkowe: mediana bez odnośników, szacunki, bez zakładów, 18+.
			assert.ok(odp.includes('18+'), 'brak 18+');
			assert.match(male, locale === 'en' ? /median/ : /mediana/);
			assert.match(male, locale === 'en' ? /no links/ : /bez odnośników/);
			assert.match(male, locale === 'en' ? /estimates/ : /szacunki/);
			assert.match(male, locale === 'en' ? /does not take bets/ : /nie przyjmuje zakładów/);
			assert.match(male, locale === 'en' ? /free for everyone/ : /za darmo/);

			// Poluzowane tylko „kurs"/„odds" — reszta zakazów obowiązuje także tutaj.
			const zakazane = [...ZAKLADY, ...ZACHETY].filter(
				(s) => !W_PYTANIU_O_KURSACH.includes(s) && s !== 'bukmacher' && s !== 'bookmaker'
			);
			for (const slowo of zakazane) assert.ok(!male.includes(slowo), slowo);
			assert.ok(!NAZWY_BUKMACHEROW.test(odp), 'nazwa bukmachera');
			for (const slowo of ZARGON) assert.ok(!male.includes(slowo), slowo);
		});
	}
});
