import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Strona „Narzędzia": każdy kafelek prowadzi do istniejącej trasy, ma teksty w obu językach
 * i oznaczenie dostępu zgodne z `lib/billing/plans`. Strona, która obiecuje „za darmo" przy
 * funkcji z planu płatnego (albo odsyła pod adres, którego nie ma), szkodzi bardziej niż jej brak.
 */

setupEnv();

const { ACCESS_LEVELS, TOOL_ACTIONS, TOOL_GROUPS, TOOLS, toolsContent } = await import('@/lib/tools/content');
const { PLANS, TRIAL } = await import('@/lib/billing/plans');
const { SITE_LINKS } = await import('@/lib/navigation');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'app', '[locale]');
const czytaj = (...czesci) => readFileSync(path.join(ROOT, ...czesci), 'utf8');

/** Plik strony dla ścieżki bez prefiksu języka: `/typy-na-dzis` → `app/[locale]/typy-na-dzis/page.js`. */
function plikStrony(sciezka) {
	return path.join(APP, ...sciezka.split('/').filter(Boolean), 'page.js');
}

/** Słowa zachęty do gry i obietnic wygranej — nie mają prawa pojawić się w opisach narzędzi. */
const ZACHETY = ['zarob', 'gwarant', 'obstaw', 'stawk', 'wygrasz', 'pewna wygrana', 'guarantee', 'earn', 'stake', 'place a bet', 'win big'];

describe('narzędzia: dane kafelków', () => {
	test('identyfikatory unikalne, każda grupa ma kafelki, każdy kafelek ma grupę', () => {
		const ids = TOOLS.map((t) => t.id);
		assert.equal(new Set(ids).size, ids.length, 'zdublowany identyfikator kafelka');
		const grupy = new Set(TOOL_GROUPS.map((g) => g.id));
		for (const tool of TOOLS) assert.ok(grupy.has(tool.group), `${tool.id}: nieznana grupa ${tool.group}`);
		for (const g of TOOL_GROUPS) assert.ok(TOOLS.some((t) => t.group === g.id), `${g.id}: pusta grupa`);
	});

	test('wyróżnione są dwa albo trzy', () => {
		const n = TOOLS.filter((t) => t.featured).length;
		assert.ok(n >= 2 && n <= 3, `wyróżnionych: ${n}`);
	});

	test('każdy kafelek i każda grupa mają komplet tekstów po polsku i po angielsku', () => {
		for (const tool of TOOLS) {
			for (const lang of ['pl', 'en']) {
				for (const pole of ['name', 'body', 'cta']) {
					assert.ok(tool[lang]?.[pole]?.trim(), `${tool.id}.${lang}.${pole}`);
				}
			}
			// Dopisek o dostępie albo w obu językach, albo w żadnym.
			assert.equal(Boolean(tool.pl.note), Boolean(tool.en.note), `${tool.id}: dopisek tylko w jednym języku`);
			assert.equal(Boolean(tool.pl.ask), Boolean(tool.en.ask), `${tool.id}: pytanie tylko w jednym języku`);
		}
		for (const g of TOOL_GROUPS) {
			for (const lang of ['pl', 'en']) assert.ok(g[lang]?.title && g[lang]?.lead, `${g.id}.${lang}`);
		}
	});

	test('adres prowadzi do istniejącej strony w app/[locale], a kotwica do istniejącego id', () => {
		for (const tool of TOOLS) {
			assert.ok(tool.href.startsWith('/'), `${tool.id}: adres bez ukośnika`);
			assert.ok(!/^\/(pl|en)(\/|$)/.test(tool.href), `${tool.id}: adres z prefiksem języka — dokłada go Link`);
			const [sciezka, kotwica] = tool.href.split('#');
			assert.ok(!sciezka.includes('?'), `${tool.id}: zapytanie w adresie — od tego jest pole \`ask\``);
			const plik = plikStrony(sciezka);
			assert.ok(existsSync(plik), `${tool.id}: brak strony ${path.relative(ROOT, plik)}`);
			if (kotwica) {
				assert.ok(readFileSync(plik, 'utf8').includes(`id="${kotwica}"`), `${tool.id}: brak id="${kotwica}" na ${sciezka}`);
			}
		}
	});

	test('pytanie do asystenta tylko przy kafelku asystenta; czynność ze znanej listy', () => {
		for (const tool of TOOLS) {
			if (tool.pl.ask) assert.equal(tool.href, '/pilka-nozna/asystent', `${tool.id}: \`ask\` poza asystentem`);
			if (tool.action) assert.ok(TOOL_ACTIONS.includes(tool.action), `${tool.id}: nieznana czynność ${tool.action}`);
		}
	});
});

describe('narzędzia: dostęp zgodny z planami', () => {
	const ma = (plan, req) =>
		req.feature ? plan.features.includes(req.feature) : (plan.limits[req.quota] ?? 0) !== 0;

	for (const tool of TOOLS) {
		test(`${tool.id}: ${tool.access}`, () => {
			assert.ok(ACCESS_LEVELS.includes(tool.access), `nieznane oznaczenie ${tool.access}`);

			if (tool.access === 'free') {
				assert.equal(tool.requires, undefined, 'darmowe narzędzie nie może mieć płatnej części');
				return;
			}

			// Częściowo darmowe i płatne: płatna część jest w Pro i VIP…
			const req = tool.requires;
			assert.ok(req && (req.feature || req.quota), 'brak `requires` przy płatnej części');
			if (req.quota) assert.ok(req.quota in PLANS.free.limits, `nieznany limit ${req.quota}`);
			assert.ok(ma(PLANS.pro, req), 'Pro nie ma płatnej części');
			assert.ok(ma(PLANS.vip, req), 'VIP nie ma płatnej części');

			// …a darmowy plan jej nie ma (cecha) albo ma mniej (limit).
			if (req.feature) assert.ok(!PLANS.free.features.includes(req.feature), 'cecha jest w planie darmowym');
			if (req.quota) assert.ok(PLANS.free.limits[req.quota] < PLANS.pro.limits[req.quota], 'darmowy limit nie jest mniejszy');
			// „Pro i VIP" znaczy: w darmowym planie wcale.
			if (tool.access === 'paid') assert.ok(!ma(PLANS.free, req), 'oznaczone „Pro i VIP", a jest w planie darmowym');

			for (const lang of ['pl', 'en']) {
				assert.ok(/Pro/.test(tool[lang].note) && /VIP/.test(tool[lang].note), `${lang}: dopisek bez Pro i VIP`);
			}
		});

		if (typeof tool.trial === 'boolean') {
			test(`${tool.id}: okres próbny ${tool.trial ? 'obejmuje' : 'nie obejmuje'}`, () => {
				const req = tool.requires;
				const wProbie = req.feature ? TRIAL.features.includes(req.feature) : (TRIAL.limits[req.quota] ?? 0) > 0;
				assert.equal(wProbie, tool.trial, 'niezgodne z TRIAL w lib/billing/plans');
				if (tool.trial) {
					assert.ok(tool.pl.note.includes(`${TRIAL.days} dni`), 'pl: dopisek bez długości okresu próbnego');
					assert.ok(tool.en.note.includes(`${TRIAL.days} days`), 'en: dopisek bez długości okresu próbnego');
				}
			});
		}
	}

	test('liczby w dopiskach pochodzą z planów', () => {
		const tekst = JSON.stringify(TOOLS);
		for (const n of [PLANS.free.limits.analysis, PLANS.pro.limits.analysis, PLANS.free.limits.aiChat, PLANS.pro.limits.report]) {
			assert.ok(tekst.includes(String(n)), `brak liczby ${n}`);
		}
	});
});

describe('narzędzia: słowa', () => {
	for (const locale of ['pl', 'en']) {
		const c = toolsContent(locale);
		const kafelki = c.groups.flatMap((g) => g.tools);

		test(`${locale}: kafelki z kursami mają 18+ i „szacunki, nie pewniaki"`, () => {
			const szacunki = locale === 'en' ? 'not sure things' : 'nie pewniaki';
			for (const tool of kafelki.filter((t) => t.odds)) {
				assert.ok(tool.note?.includes('18+'), `${tool.id}: brak 18+`);
				assert.ok(tool.note.includes(szacunki), `${tool.id}: brak „${szacunki}"`);
			}
			assert.ok(c.disclaimer.includes('18+'), 'zastrzeżenie strony bez 18+');
		});

		test(`${locale}: bez zachęt do gry`, () => {
			const tekst = JSON.stringify(c).toLowerCase();
			for (const slowo of ZACHETY) assert.ok(!tekst.includes(slowo), slowo);
		});

		test(`${locale}: wszystkie kafelki na stronie, oznaczenia mają etykiety`, () => {
			assert.equal(kafelki.length, TOOLS.length);
			for (const level of ACCESS_LEVELS) assert.ok(c.access[level]?.label && c.access[level]?.hint, level);
			for (const tool of kafelki) assert.ok(!tool.pl && !tool.en, `${tool.id}: teksty drugiego języka w kafelku`);
		});

		test(`${locale}: wyższe kursy otwierają raport od razu w wariancie „Wyższe kursy"`, () => {
			const kafelek = kafelki.find((t) => t.id === 'wyzszy-kurs');
			assert.equal(kafelek.href, '/pilka-nozna/ai-agent?variant=value');
			assert.equal(c.groups.find((g) => g.tools.includes(kafelek))?.id, 'asystent-i-raporty');
		});

		test(`${locale}: pytanie do asystenta doklejone do adresu`, () => {
			for (const tool of kafelki.filter((t) => t.ask)) {
				assert.ok(tool.href.startsWith('/pilka-nozna/asystent?q='), tool.href);
				assert.equal(decodeURIComponent(tool.href.split('?q=')[1]), tool.ask);
			}
		});
	}
});

describe('narzędzia: podpięcie', () => {
	test('strona istnieje, jest w mapie witryny, menu i stopce', () => {
		assert.ok(existsSync(plikStrony('/narzedzia')), 'brak app/[locale]/narzedzia/page.js');
		assert.ok(czytaj('app', 'sitemap.js').includes("path: '/narzedzia'"), 'brak w mapie witryny');
		// SITE_LINKS zasila i menu w nagłówku, i kolumnę „Serwis" w stopce.
		assert.ok(SITE_LINKS.some((l) => l.href === '/narzedzia'), 'brak w SITE_LINKS');
		assert.ok(czytaj('components', 'FootballMenu.js').includes('href="/narzedzia"'), 'brak w menu piłki');
		assert.ok(czytaj('components', 'landing', 'LandingSections.jsx').includes('href="/narzedzia"'), 'brak na stronie głównej');
	});

	test('nagłówek nasłuchuje zdarzenia panelu konta', () => {
		assert.ok(czytaj('components', 'NavBar.js').includes('ACCOUNT_PANEL_EVENT'));
	});

	test('etykiety nawigacji w obu plikach tłumaczeń', () => {
		for (const lang of ['pl', 'en']) {
			const m = JSON.parse(czytaj('messages', `${lang}.json`)).common;
			for (const klucz of ['tools_menu', 'tools_menu_all', 'tools_see_all']) assert.ok(m[klucz]?.trim(), `${lang}: ${klucz}`);
		}
	});

	test('każda ikona kafelka jest zaimportowana w komponencie', () => {
		const zrodlo = czytaj('components', 'tools', 'ToolsSections.jsx');
		const importy = zrodlo.match(/import\s*\{([^}]+)\}\s*from\s*'lucide-react'/)?.[1] ?? '';
		const nazwy = new Set(importy.split(',').map((s) => s.trim()).filter(Boolean));
		const mapa = zrodlo.match(/const ICONS = \{([^}]+)\}/)?.[1] ?? '';
		const wMapie = new Set(mapa.split(',').map((s) => s.trim()).filter(Boolean));
		for (const tool of TOOLS) {
			assert.ok(nazwy.has(tool.icon), `${tool.id}: ikona ${tool.icon} nie jest zaimportowana`);
			assert.ok(wMapie.has(tool.icon), `${tool.id}: ikony ${tool.icon} nie ma w ICONS`);
		}
	});
});
