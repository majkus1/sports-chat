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
	 * podejście co `href: '/narzedzia'` w test/tools/tools.test.mjs.
	 */
	/*
	 * Menu piłki uproszczone (pakiet UX P4): na wierzchu najwyżej cztery pozycje plus asystent,
	 * reszta pod „Więcej". Pilnujemy, żeby przy okazji żadna funkcja nie zniknęła z menu.
	 */
	test('pasek piłki: „Typy na dziś" na wierzchu, najwyżej 4 pozycje, reszta pod „Więcej"', () => {
		const zrodlo = readFileSync(path.join(ROOT, 'components', 'FootballMenu.js'), 'utf8');
		const wycinek = (poczatek) => zrodlo.slice(zrodlo.indexOf(poczatek), zrodlo.indexOf('];', zrodlo.indexOf(poczatek)));
		const pas = wycinek('const menuItems = [');
		const wiecej = wycinek('const moreItems = [');
		assert.ok(pas.includes("href: '/typy-na-dzis'"), 'brak /typy-na-dzis w pasie');
		assert.ok(pas.includes("t('today_picks_menu')"), 'etykieta inna niż w menu nagłówka (today_picks_menu)');
		assert.ok((pas.match(/key: '/g) || []).length <= 4, 'w pasie więcej niż 4 pozycje');
		// Każda funkcja z dawnego paska nadal osiągalna: w pasie albo pod „Więcej".
		for (const cel of ['/pilka-nozna/przedmeczowe', '/pilka-nozna/live', '/pilka-nozna/skutecznosc', '/pilka-nozna/ai-agent', '/pilka-nozna/kolejka', '/narzedzia']) {
			assert.ok(pas.includes(`'${cel}'`) || wiecej.includes(`'${cel}'`), `brak ${cel} w menu piłki`);
		}
		for (const klucz of ["t('results')", "t('guide_menu')"]) assert.ok(wiecej.includes(klucz), `brak ${klucz} pod „Więcej"`);
		assert.ok(zrodlo.includes('href="/pilka-nozna/asystent"'), 'brak pigułki asystenta');
	});

	test('menu nagłówka: działy piłki rozwinięte od razu (☰ → dział, dwa kliknięcia)', () => {
		const zrodlo = readFileSync(path.join(ROOT, 'components', 'NavBar.js'), 'utf8');
		assert.match(zrodlo, /\[isSportsOpen, setIsSportsOpen\] = useState\(true\)/);
	});
});
