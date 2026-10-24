import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Jedno narzędzie — jedna nazwa: w menu, na kafelku strony „Narzędzia", w nagłówku strony
 * i w cenniku. Kto szuka „Raportu AI" z kafelka, ma go znaleźć pod tą samą nazwą w menu.
 * Różnice są dozwolone tylko tam, gdzie miejsca jest mało (zakładka „Wyższy kurs").
 *
 * Etykiety menu piszemy normalnie — wielkie litery w pasku piłki robi CSS (`.pre-match-p`).
 * Wpisane w tłumaczeniu („PRZEDMECZOWE") krzyczały w stopce i w menu nagłówka obok „Typy na dziś".
 */

setupEnv();

const { TOOLS } = await import('@/lib/tools/content');
const { SPORT_CATEGORIES, SITE_LINKS } = await import('@/lib/navigation');
const { liveContent } = await import('@/lib/live/content');
const { valueContent } = await import('@/lib/value/content');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MESSAGES = Object.fromEntries(
	['pl', 'en'].map((lang) => [lang, JSON.parse(readFileSync(path.join(ROOT, 'messages', `${lang}.json`), 'utf8')).common])
);

/** Kafelek → klucz etykiety, pod którą to samo narzędzie stoi w menu, cenniku albo nagłówku. */
const TA_SAMA_NAZWA = {
	raport: 'ai_agent_title',
	'wyzszy-kurs': 'report_variant_value',
	asystent: 'assistant_menu_cta',
	skutecznosc: 'accuracy_menu',
	kolejka: 'round_menu',
	'na-zywo': 'onlive',
	'typy-na-dzis': 'today_picks_menu',
	'typ-dnia': 'accuracy_kind_daily',
	'poranny-mail': 'pricing_morning_email',
	'jak-to-dziala': 'method_title',
};

describe('nazwy narzędzi', () => {
	for (const lang of ['pl', 'en']) {
		const m = MESSAGES[lang];

		test(`${lang}: kafelek nazywa narzędzie tak jak menu, cennik i nagłówek`, () => {
			for (const [id, klucz] of Object.entries(TA_SAMA_NAZWA)) {
				const kafelek = TOOLS.find((t) => t.id === id);
				assert.ok(kafelek, `brak kafelka ${id}`);
				assert.ok(
					kafelek[lang].name.toLowerCase().includes(m[klucz].toLowerCase()),
					`${id}: „${kafelek[lang].name}" nie zawiera „${m[klucz]}" (${klucz})`
				);
			}
			// Kupon live: kafelek i panel na stronie „Na żywo" mają tę samą nazwę.
			assert.equal(TOOLS.find((t) => t.id === 'kupon-live')[lang].name, liveContent(lang).title);
			// Zakładka w Skuteczności może być krótsza, ale kafelek ma ją nazwać dokładnie.
			assert.ok(TOOLS.find((t) => t.id === 'wyzszy-kurs')[lang].body.includes(valueContent(lang).tab));
			assert.equal(m.report_hub_title.toLowerCase(), m.ai_agent_title.toLowerCase(), 'nagłówek raportu ≠ pozycja w menu');
		});

		test(`${lang}: etykiety menu i stopki bez wielkich liter wpisanych w tłumaczeniu`, () => {
			const klucze = [...SPORT_CATEGORIES.flatMap((s) => s.sections), ...SITE_LINKS].map((l) => l.labelKey);
			for (const klucz of klucze) {
				const etykieta = m[klucz];
				assert.ok(etykieta?.trim(), `${lang}: brak ${klucz}`);
				assert.notEqual(etykieta, etykieta.toUpperCase(), `${lang}: ${klucz} = „${etykieta}"`);
			}
		});
	}

	test('do asystenta prowadzi menu nagłówka i stopka (sekcje piłki)', () => {
		const sekcje = SPORT_CATEGORIES.flatMap((s) => s.sections).map((s) => s.href);
		for (const href of ['/typy-na-dzis', '/pilka-nozna/asystent', '/pilka-nozna/ai-agent?variant=value']) {
			assert.ok(sekcje.includes(href), `brak ${href} w SPORT_CATEGORIES`);
		}
	});

	/*
	 * Komponentów nie renderujemy (testy chodzą bez bundlera), więc sprawdzamy źródło: to samo
	 * podejście co `href="/narzedzia"` w test/tools/tools.test.mjs.
	 */
	test('„Typy na dziś" w pasku piłki — pod „⋯" na telefonie i obok „Wszystkich narzędzi" na komputerze', () => {
		const zrodlo = readFileSync(path.join(ROOT, 'components', 'FootballMenu.js'), 'utf8');
		assert.ok(zrodlo.includes("href: '/typy-na-dzis'"), 'brak /typy-na-dzis w pasku piłki');
		assert.ok(zrodlo.includes("t('today_picks_menu')"), 'etykieta inna niż w menu nagłówka (today_picks_menu)');
		assert.ok(zrodlo.includes('[todayItem, ...secondaryItems]'), 'brak w rozwijanym „⋯"');
		assert.ok(zrodlo.includes('href={todayItem.href}'), 'brak obok „Wszystkich narzędzi"');
		// Pas zakładek bez zmian — kolejna pozycja w nim zrzuciłaby pigułkę asystenta do drugiego rzędu.
		const pas = zrodlo.slice(zrodlo.indexOf('const menuItems = ['), zrodlo.indexOf('];', zrodlo.indexOf('const menuItems = [')));
		assert.ok(!pas.includes('/typy-na-dzis'), '„Typy na dziś" w pasie zakładek');
	});

	test('menu nagłówka: działy piłki rozwinięte od razu (☰ → dział, dwa kliknięcia)', () => {
		const zrodlo = readFileSync(path.join(ROOT, 'components', 'NavBar.js'), 'utf8');
		assert.match(zrodlo, /\[isSportsOpen, setIsSportsOpen\] = useState\(true\)/);
	});
});
