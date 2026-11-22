import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Komponent przeglądarkowy ('use client') nie może dostać od serwera całego obiektu treści.
 *
 * 22.11.2026 „Typy na dziś" padały na produkcji („Coś poszło nie tak"), bo strona serwerowa
 * przekazała `<TodayCta c={c} />` — a `c` z `todayPicksContent` ma funkcje (tytuły z datą,
 * odmiany). Next nie przenosi funkcji do przeglądarki i wywraca render, a `next build` tego
 * nie widzi — błąd wychodzi dopiero przy pierwszym wejściu na stronę.
 *
 * Test łapie najczęstszy wzór: plik serwerowy, który komponentowi klienckiemu podaje cały
 * obiekt treści (`c={c}`, `content={content}`, `c={valueContent(...)}` itp.). Napisy i liczby
 * podawaj pojedynczo albo jako obiekt z samymi napisami.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KATALOGI = ['app', 'components'];

function pliki(dir) {
	const out = [];
	for (const wpis of readdirSync(dir)) {
		const p = path.join(dir, wpis);
		if (statSync(p).isDirectory()) out.push(...pliki(p));
		else if (/\.(js|jsx)$/.test(wpis)) out.push(p);
	}
	return out;
}

const wszystkie = KATALOGI.flatMap((d) => pliki(path.join(ROOT, d))).map((p) => ({ p, s: readFileSync(p, 'utf8') }));
const kliencki = (s) => /^\s*['"]use client['"]/.test(s);

/** Nazwy komponentów eksportowanych z plików 'use client'. */
const klienckie = new Set();
for (const { s } of wszystkie) {
	if (!kliencki(s)) continue;
	for (const m of s.matchAll(/export default function (\w+)/g)) klienckie.add(m[1]);
	for (const m of s.matchAll(/export function ([A-Z]\w+)/g)) klienckie.add(m[1]);
}

test('serwer nie podaje komponentom klienckim całych obiektów treści (z funkcjami)', () => {
	const bledy = [];
	for (const { p, s } of wszystkie) {
		if (kliencki(s)) continue;
		for (const nazwa of klienckie) {
			const re = new RegExp(`<${nazwa}\\b[^>]*?\\b(c|content|labels|t)=\\{(c|content|\\w+Content\\([^)]*\\))\\}`, 'g');
			for (const m of s.matchAll(re)) bledy.push(`${path.relative(ROOT, p)}: <${nazwa} ${m[1]}={${m[2]}}>`);
		}
	}
	assert.deepEqual(bledy, [], `komponent kliencki dostaje cały obiekt treści:\n${bledy.join('\n')}`);
});
