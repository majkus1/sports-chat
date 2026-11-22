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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const czytaj = (...c) => readFileSync(path.join(ROOT, ...c), 'utf8');
const MSG = { pl: JSON.parse(czytaj('messages', 'pl.json')).billing2, en: JSON.parse(czytaj('messages', 'en.json')).billing2 };

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
		const proba = { date: '1.01.2099', days: 7, plan: 'Pro', count: 15, used: 12, limit: 15, kind: 'analysis', analyses: 20, questions: 30, reports: 3, saving: 40, home: 'A', away: 'B', selection: '1', email: 'x@example.test' };
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
