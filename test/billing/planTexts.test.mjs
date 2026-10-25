import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Teksty o planach mówią to samo co `lib/billing/plans`.
 *
 * Karty cennika od początku brały limity z `PLANS`, ale zdania obok miały liczby wpisane ręcznie
 * i się rozjechały: podpowiedź przy raportach obiecywała „2 raporty tygodniowo" w planie
 * darmowym (raportów nie ma w nim wcale), licznik raportów mówił „w tym tygodniu" przy limicie
 * miesięcznym, a komunikat po wyczerpaniu analiz kazał „wrócić jutro". Te testy pilnują, żeby
 * liczby w tłumaczeniach były miejscami na liczby, a słowa o okresie — prawdą.
 */

setupEnv();

const { FEATURE_ROWS, QUOTA_ROWS, planMessageParams, pricingMetaDescription } = await import('@/lib/billing/planTexts');
const { PLANS, PLAN_PASS_DAYS, QUOTA_KINDS, QUOTA_PERIODS, TRIAL } = await import('@/lib/billing/plans');
const { COUPON_TYPES } = await import('@/lib/coupons/build');
const { CUSTOM_ODDS } = await import('@/lib/coupons/custom');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const czytaj = (...czesci) => readFileSync(path.join(ROOT, ...czesci), 'utf8');
const MESSAGES = {
	pl: JSON.parse(czytaj('messages', 'pl.json')).common,
	en: JSON.parse(czytaj('messages', 'en.json')).common,
};

/** Tekst tak, jak zobaczy go użytkownik — ten sam silnik ICU, którego używa next-intl. */
const wyrenderuj = (locale, klucz) =>
	new IntlMessageFormat(MESSAGES[locale][klucz], locale).format(planMessageParams(locale)[klucz]);

/** Treść bez miejsc na wartości (`{days}`, `{n, plural, …}`) i bez nazwy Przelewy24 — to, co wpisano ręcznie. */
function bezMiejsc(tekst) {
	let s = tekst.replace(/Przelew\w*24/g, '');
	while (/\{[^{}]*\}/.test(s)) s = s.replace(/\{[^{}]*\}/g, '');
	return s;
}

describe('cennik: pozycje z planów', () => {
	test('każdy limit to rodzaj z QUOTA_KINDS, każda funkcja jest w Pro i VIP', () => {
		for (const [kind] of QUOTA_ROWS) assert.ok(QUOTA_KINDS.includes(kind), kind);
		for (const [feature] of FEATURE_ROWS) {
			assert.ok(PLANS.pro.features.includes(feature), `Pro bez ${feature}`);
			assert.ok(PLANS.vip.features.includes(feature), `VIP bez ${feature}`);
		}
	});

	test('etykiety i objaśnienia istnieją w obu językach', () => {
		for (const lang of ['pl', 'en']) {
			for (const [, label, what] of [...QUOTA_ROWS, ...FEATURE_ROWS]) {
				assert.ok(MESSAGES[lang][label]?.trim(), `${lang}: brak ${label}`);
				assert.ok(MESSAGES[lang][what]?.trim(), `${lang}: brak ${what}`);
			}
		}
	});

	test('kupony 3- i 5-dniowe oraz kupon live mają w cenniku tę cechę, która je odkrywa', () => {
		// `couponsUnlocked` (kupony i kupon live) sprawdza `model_hints` — cennik musi pokazać tę samą cechę.
		assert.ok(czytaj('lib', 'coupons', 'access.js').includes("hasFeature(user, 'model_hints')"));
		const wiersz = FEATURE_ROWS.find(([, label]) => label === 'pricing_coupons');
		assert.equal(wiersz?.[0], 'model_hints');
	});
});

describe('cennik: liczby w zdaniach z planów', () => {
	for (const locale of ['pl', 'en']) {
		const dni = locale === 'en' ? 'days' : 'dni';

		test(`${locale}: baner okresu próbnego`, () => {
			const tekst = wyrenderuj(locale, 'pricing_trial');
			const oczekiwane =
				locale === 'en'
					? [`${TRIAL.days} days`, `${TRIAL.limits.analysis} analyses`, `${TRIAL.limits.aiChat} questions`, `${TRIAL.limits.report} reports`]
					: [`${TRIAL.days} dni`, `${TRIAL.limits.analysis} analiz`, `${TRIAL.limits.aiChat} pytań`, `${TRIAL.limits.report} raporty`];
			for (const o of oczekiwane) assert.ok(tekst.includes(o), `brak „${o}" w: ${tekst}`);
		});

		test(`${locale}: raporty bez konta, bilet na ${PLAN_PASS_DAYS} dni, przedział kuponów`, () => {
			assert.ok(wyrenderuj(locale, 'report_login_hint').includes(`${TRIAL.days} ${dni}`));
			assert.ok(wyrenderuj(locale, 'report_login_hint').includes(String(TRIAL.limits.report)));
			assert.ok(wyrenderuj(locale, 'pricing_one_off_note').includes(`${PLAN_PASS_DAYS} ${dni}`));
			assert.ok(wyrenderuj(locale, 'quota_reset_note').includes(`${PLAN_PASS_DAYS} ${dni}`));
			const przecinek = (v) => (locale === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ','));
			const zakres = `${przecinek(COUPON_TYPES.days3.target)}–${przecinek(COUPON_TYPES.days3.max)}`;
			assert.ok(wyrenderuj(locale, 'pricing_what_coupons').includes(zakres), zakres);
			assert.deepEqual(
				[COUPON_TYPES.days5.target, COUPON_TYPES.days5.max],
				[COUPON_TYPES.days3.target, COUPON_TYPES.days3.max],
				'kupony 3- i 5-dniowy mają różne przedziały — cennik podaje jeden'
			);
		});

		test(`${locale}: kreator kuponu — limit dzienny, cele kursu z kodu`, () => {
			assert.equal(QUOTA_PERIODS.couponGen, 'day', 'karta cennika pisze „/ dzień" z QUOTA_PERIODS');
			assert.ok(QUOTA_ROWS.some(([kind]) => kind === 'couponGen'), 'brak wiersza w cenniku');
			const tekst = wyrenderuj(locale, 'pricing_what_coupon_gen');
			const przecinek = (v) => (locale === 'en' ? v.toFixed(1) : v.toFixed(1).replace('.', ','));
			for (const o of CUSTOM_ODDS) assert.ok(tekst.includes(przecinek(o.nominal)), `${o.id}: ${tekst}`);
			assert.ok(!/\d/.test(bezMiejsc(MESSAGES[locale].pricing_what_coupon_gen).replace(/18\+/g, '')), 'liczba wpisana ręcznie');
			assert.match(tekst, /18\+/);
		});

		test(`${locale}: zdania z liczbami nie mają liczb wpisanych ręcznie`, () => {
			for (const klucz of ['pricing_trial', 'report_login_hint', 'pricing_one_off_note', 'quota_reset_note']) {
				assert.ok(!/\d/.test(bezMiejsc(MESSAGES[locale][klucz])), `${klucz}: liczba w tłumaczeniu zamiast z planów`);
			}
		});

		test(`${locale}: limity miesięczne nie udają dziennych ani tygodniowych`, () => {
			assert.equal(QUOTA_PERIODS.report, 'month');
			assert.equal(QUOTA_PERIODS.aiChat, 'month');
			const zle = locale === 'en' ? /week|daily|tomorrow/i : /tygodn|dzienn|jutro/i;
			for (const klucz of ['report_usage', 'report_login_hint', 'ai_daily_limit', 'ai_chat_limit', 'quota_report']) {
				assert.ok(!zle.test(MESSAGES[locale][klucz]), `${klucz}: ${MESSAGES[locale][klucz]}`);
			}
		});

		test(`${locale}: opis cennika w wyszukiwarce z planów`, () => {
			const opis = pricingMetaDescription(locale);
			const free = PLANS.free.limits;
			for (const n of [free.analysis, free.aiChat, TRIAL.days, PLAN_PASS_DAYS]) assert.ok(opis.includes(String(n)), `${n}: ${opis}`);
			assert.ok(opis.length <= 200, `opis za długi (${opis.length})`);
		});
	}

	test('komunikaty analiz i raportów: okres miesięczny, liczby z planów', () => {
		const analizy = czytaj('lib', 'analysis', 'service.js');
		for (const zle of ['dzienny limit analiz', 'Wróć jutro', 'daily analysis limit', 'Come back tomorrow', 'dostaje 10 analiz']) {
			assert.ok(!analizy.includes(zle), `lib/analysis/service.js: „${zle}"`);
		}
		const raporty = czytaj('app', 'api', 'reports', 'generate', 'route.js');
		assert.ok(!/dostaje \d raport|get \d to start|limit tygodniowy/.test(raporty), 'raporty: liczba albo okres wpisane ręcznie');
	});
});
