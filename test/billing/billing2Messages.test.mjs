import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IntlMessageFormat } from 'intl-messageformat';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Teksty okien zakupu i przepustki (`messages/*.json` → `billing2`).
 *
 * Trzy rzeczy: każdy klucz użyty w komponentach istnieje w obu językach; liczby z cennika
 * (dni przepustki, dni planu, cena) idą z `plans.js` przez miejsca `{week}`, `{month}`, `{price}`,
 * a nie są wpisane ręcznie; i każdy tekst daje się wyrenderować tym samym silnikiem ICU co next-intl.
 */

setupEnv();

const { b2Defaults } = await import('@/components/billing2/useB2.js');
const { PRO_WEEK, PLAN_PASS_DAYS } = await import('@/lib/billing/plans');
const { PRICING_OFFERS, compareParams, formatZl } = await import('@/lib/billing/offers');
const { LIMIT_KEYS, LIMIT_PLACEMENTS, limitPassValues } = await import('@/components/billing2/limitPass.js');
const { isPlacement } = await import('@/lib/upsell/placements');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const czytaj = (...c) => readFileSync(path.join(ROOT, ...c), 'utf8');
const MSG = { pl: JSON.parse(czytaj('messages', 'pl.json')).billing2, en: JSON.parse(czytaj('messages', 'en.json')).billing2 };
const UX = { pl: JSON.parse(czytaj('messages', 'pl.json')).ux_p2, en: JSON.parse(czytaj('messages', 'en.json')).ux_p2 };

/** Pliki, w których `b(...)` albo (w `components/billing2`) `t(...)` to tłumacz `billing2`. */
const PLIKI = [
	...readdirSync(path.join(ROOT, 'components', 'billing2')).map((f) => ['components', 'billing2', f]),
	['components', 'pricing', 'PricingClient.jsx'],
	['components', 'billing', 'CreditPacks.jsx'],
	['components', 'billing', 'PlanSummary.jsx'],
	['components', 'billing', 'PurchaseConsentDialog.jsx'],
];

/** Liczby, które są nazwą rzeczy, a nie ceną ani długością biletu. */
const DOZWOLONE = [/3- i 5-dniowe/g, /3-day and 5-day/g, /24 godziny albo 3 dni/g, /24 hours or 3 days/g, /2,0/g, /2\.0/g, /18\+/g];

describe('billing2: klucze i liczby', () => {
	test('te same klucze po polsku i po angielsku', () => {
		assert.deepEqual(Object.keys(MSG.pl).sort(), Object.keys(MSG.en).sort());
	});

	test('każdy klucz z komponentów istnieje', () => {
		for (const czesci of PLIKI) {
			const kod = czytaj(...czesci);
			const wzor = czesci[1] === 'billing2' ? /\b(?:b|t)\('([a-z0-9_]+)'/g : /\bb\('([a-z0-9_]+)'/g;
			const klucze = [...kod.matchAll(wzor)].map((m) => m[1]);
			for (const m of kod.matchAll(/error: '([a-z_]+)'/g)) klucze.push(m[1]);
			for (const k of klucze) {
				for (const lang of ['pl', 'en']) assert.ok(MSG[lang][k]?.trim(), `${lang}: brak billing2.${k} (${czesci.join('/')})`);
			}
		}
	});

	test('bez ręcznie wpisanych dni i cen — tylko miejsca na wartości', () => {
		for (const lang of ['pl', 'en']) {
			for (const [k, v] of Object.entries(MSG[lang])) {
				let s = v;
				while (/\{[^{}]*\}/.test(s)) s = s.replace(/\{[^{}]*\}/g, '');
				for (const d of DOZWOLONE) s = s.replace(d, '');
				assert.ok(!/\d/.test(s), `${lang}.${k}: liczba wpisana ręcznie — „${v}"`);
			}
		}
	});

	test('każdy tekst renderuje się z liczbami z planów', () => {
		const proba = { date: '1.01.2099', days: 7, plan: 'Pro', count: 15, used: 12, limit: 15, kind: 'analysis', analyses: 20, questions: 30, reports: 3, saving: 40, monthPerDay: '1,63', weekPerDay: '2,71', home: 'A', away: 'B', selection: '1', email: 'x@example.test' };
		for (const lang of ['pl', 'en']) {
			const domyslne = b2Defaults(lang);
			assert.equal(domyslne.week, PRO_WEEK.days);
			assert.equal(domyslne.month, PLAN_PASS_DAYS);
			for (const [k, v] of Object.entries(MSG[lang])) {
				const wynik = new IntlMessageFormat(v, lang).format({ ...proba, ...domyslne });
				assert.ok(typeof wynik === 'string' && wynik.length > 0, `${lang}.${k}`);
				assert.ok(!/\{|\}/.test(wynik), `${lang}.${k}: zostało niepodstawione miejsce — ${wynik}`);
			}
		}
		const pl = new IntlMessageFormat(MSG.pl.buy_week, 'pl').format(b2Defaults('pl'));
		assert.equal(pl, `Kup ${PRO_WEEK.days} dni za ${PRO_WEEK.priceGrosze / 100} zł`);
	});
});

/*
 * Błąd z 22.11.2026: cennik podawał cenę za dzień pod nazwą `month`, a `useB2` podstawia pod tą
 * nazwą liczbę dni planu — wartość z wywołania wygrywała i na stronie stało „Pro na 1,63 dni".
 * Test renderuje zdanie dokładnie tak, jak robi to cennik: domyślne wartości + `compareParams`.
 */
describe('billing2: porównanie cen pod kartami', () => {
	const tydzien = PRICING_OFFERS.find((o) => o.id === PRO_WEEK.id);
	const miesiac = PRICING_OFFERS.find((o) => o.id === 'pro');

	test('wartości do porównania nie nadpisują liczby dni ani ceny przepustki', () => {
		for (const nazwa of Object.keys(b2Defaults('pl'))) {
			assert.ok(!(nazwa in compareParams('pl')), `compareParams nadpisuje „${nazwa}" z b2Defaults`);
		}
	});

	test('cennik woła porównanie z compareParams, nie z ręcznie złożonymi wartościami', () => {
		const kod = czytaj('components', 'pricing', 'PricingClient.jsx');
		assert.match(kod, /b\('compare', compareParams\(locale\)\)/);
	});

	for (const lang of ['pl', 'en']) {
		test(`${lang}: zdanie mówi o dniach i o cenach za dzień we właściwych miejscach`, () => {
			const wynik = new IntlMessageFormat(MSG[lang].compare, lang).format({ ...b2Defaults(lang), ...compareParams(lang) });
			const dni = lang === 'en' ? 'days' : 'dni';
			const zaDzien = (o) => `${formatZl(o.perDayGrosze, lang)} zł`;
			assert.ok(wynik.includes(`${PLAN_PASS_DAYS} ${dni}`), wynik);
			assert.ok(wynik.includes(`${PRO_WEEK.days} ${dni}`), wynik);
			assert.ok(wynik.includes(zaDzien(miesiac)), wynik);
			assert.ok(wynik.includes(zaDzien(tydzien)), wynik);
			assert.ok(!wynik.includes(`${formatZl(miesiac.perDayGrosze, lang)} ${dni}`), `cena za dzień jako liczba dni: ${wynik}`);
		});
	}
});

/*
 * Nowe teksty pakietu UX P2 (`ux_p2`): ta sama zasada co w `billing2` — dni, cena i limity
 * przepustki z `plans.js`, nie wpisane ręcznie — i te same klucze w obu językach.
 */
describe('ux_p2: teksty cennika i wyczerpanego limitu', () => {
	test('te same klucze po polsku i po angielsku', () => {
		assert.deepEqual(Object.keys(UX.pl).sort(), Object.keys(UX.en).sort());
	});

	test('bez ręcznie wpisanych dni i cen', () => {
		for (const lang of ['pl', 'en']) {
			for (const [k, v] of Object.entries(UX[lang])) {
				let s = v;
				while (/\{[^{}]*\}/.test(s)) s = s.replace(/\{[^{}]*\}/g, '');
				assert.ok(!/\d/.test(s.replace(/18\+/g, '')), `${lang}.${k}: liczba wpisana ręcznie — „${v}"`);
			}
		}
	});

	test('komunikat limitu: każdy rodzaj ma tekst, miejsce pomiaru i liczby przepustki', () => {
		for (const [kind, klucz] of Object.entries(LIMIT_KEYS)) {
			assert.ok(isPlacement(LIMIT_PLACEMENTS[kind]), `${kind}: miejsce spoza listy`);
			for (const lang of ['pl', 'en']) {
				const wynik = new IntlMessageFormat(UX[lang][klucz], lang).format(limitPassValues(lang));
				assert.ok(!/\{|\}/.test(wynik), `${lang}.${klucz}: ${wynik}`);
				assert.ok(wynik.includes(`${PRO_WEEK.priceGrosze / 100} zł`), `${lang}.${klucz}: brak ceny — ${wynik}`);
				assert.ok(wynik.includes(String(PRO_WEEK.days)), `${lang}.${klucz}: brak dni — ${wynik}`);
			}
		}
		const pl = (k) => new IntlMessageFormat(UX.pl[k], 'pl').format(limitPassValues('pl'));
		assert.ok(pl('limit_ai_chat').includes(`${PRO_WEEK.limits.aiChat} pytań`));
		assert.ok(pl('limit_analysis').includes(`${PRO_WEEK.limits.analysis} analiz`));
		assert.ok(pl('limit_report').includes(`${PRO_WEEK.limits.report} raporty`));
	});

	test('nagłówek cennika: cena przepustki z planów', () => {
		const wynik = new IntlMessageFormat(UX.pl.pricing_lead, 'pl').format(b2Defaults('pl'));
		assert.equal(wynik, `Zacznij za darmo. Pro na ${PRO_WEEK.days} dni za ${PRO_WEEK.priceGrosze / 100} zł — bez subskrypcji.`);
	});
});
