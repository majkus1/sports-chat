import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Dane strukturalne mówią to samo co cennik i strona główna.
 *
 * Oferta planu płatnego podawała `billingDuration: 1, unitCode: 'MON'` — w schema.org „cena
 * naliczana co miesiąc", czyli subskrypcję. Plan to jednorazowy dostęp na `PLAN_PASS_DAYS` dni,
 * który sam się nie odnawia. FAQ w danych strukturalnych ma być tym samym FAQ co na stronie.
 */

setupEnv();

const { webApplicationLd, faqLd } = await import('@/lib/seo/jsonLd');
const { PLANS, PLAN_PASS_DAYS, CREDIT_PACKS } = await import('@/lib/billing/plans');
const { faqItems } = await import('@/lib/landing/faq');

const czytaj = (wstawka) => JSON.parse(wstawka.__html);

describe('dane strukturalne: oferty', () => {
	for (const locale of ['pl', 'en']) {
		const ld = czytaj(webApplicationLd(locale));

		test(`${locale}: żadna oferta nie udaje subskrypcji`, () => {
			const tekst = JSON.stringify(ld);
			for (const slowo of ['priceSpecification', 'UnitPriceSpecification', 'billingDuration', 'billingIncrement', '"MON"']) {
				assert.ok(!tekst.includes(slowo), `${slowo} sugeruje płatność cykliczną`);
			}
		});

		test(`${locale}: ceny z planów i pakietów, plan płatny opisany jako dostęp na ${PLAN_PASS_DAYS} dni`, () => {
			const ceny = ld.offers.map((o) => o.price);
			for (const plan of Object.values(PLANS)) assert.ok(ceny.includes(String(plan.priceMonthlyPln)), plan.id);
			for (const pack of CREDIT_PACKS) assert.ok(ceny.includes(String(pack.priceGrosze / 100)), pack.id);

			const platne = ld.offers.filter((o) => Number(o.price) > 0 && ['Pro', 'VIP'].includes(o.name));
			assert.equal(platne.length, Object.values(PLANS).filter((p) => p.priceMonthlyPln > 0).length);
			for (const oferta of platne) {
				assert.ok(oferta.description?.includes(`${PLAN_PASS_DAYS}`), `${oferta.name}: brak ${PLAN_PASS_DAYS} dni w opisie`);
				assert.match(oferta.description, locale === 'en' ? /one-off/i : /jednorazow/i);
			}
		});

		test(`${locale}: FAQPage to dokładnie FAQ ze strony głównej`, () => {
			const faq = faqItems(locale);
			const dane = czytaj(faqLd(faq));
			assert.equal(dane.mainEntity.length, faq.length);
			faq.forEach((item, i) => {
				assert.equal(dane.mainEntity[i].name, item.question);
				assert.equal(dane.mainEntity[i].acceptedAnswer.text, item.answer);
			});
		});
	}
});
