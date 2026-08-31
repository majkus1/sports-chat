import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

/**
 * Rozwiązywanie aliasu `@/` poza Next.js.
 *
 * Kod aplikacji importuje przez `@/lib/...`, co rozumie bundler Next.js, ale nie goły Node.
 * Testy uruchamiamy bez bundlera — celowo, bo chcemy sprawdzać ten sam kod, który pójdzie
 * na produkcję, a nie jego przetworzoną kopię. Ten hak tłumaczy alias na ścieżkę pliku.
 */

/*
 * `fileURLToPath(import.meta.url)`, nie `import.meta.dirname`.
 *
 * To drugie istnieje dopiero od Node 20.11. Na serwerze produkcyjnym stoi Node 18, gdzie
 * jest po prostu `undefined` — a wtedy `path.resolve` wywraca się komunikatem o „paths[0]",
 * który w niczym nie przypomina prawdziwej przyczyny. Wersja poniżej działa wszędzie.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function resolve(specifier, context, next) {
	if (!specifier.startsWith('@/')) return next(specifier, context);

	const base = path.join(ROOT, specifier.slice(2));
	let target = base;

	if (!/\.[a-z]+$/.test(base)) {
		/*
		 * Bundler Next.js sprawdza obie możliwości: plik `x.js` oraz katalog `x/index.js`.
		 * Goły Node nie robi ani jednego, ani drugiego, więc musimy tu odtworzyć obie —
		 * inaczej import `@/lib/model` szuka pliku `lib/model.js`, którego nie ma, i pada
		 * na „Cannot find module" mimo poprawnego kodu.
		 */
		target = existsSync(`${base}.js`) ? `${base}.js` : path.join(base, 'index.js');
	}

	return next(pathToFileURL(target).href, context);
}

/**
 * Pliki `.js` aplikacji są modułami ES — trzeba to Node'owi powiedzieć wprost.
 *
 * `package.json` nie ma `"type": "module"` i mieć nie może: `server.js` i `ecosystem.config.js`
 * są CommonJS-em, a Next.js radzi sobie z tą mieszanką sam. Poza bundlerem rozstrzyga
 * rozszerzenie, więc każdy plik `.js` ląduje domyślnie jako CommonJS.
 *
 * Node 22 tego nie zauważa, bo od 22.7 sam wykrywa składnię modułu i po cichu przełącza
 * plik na ESM. Node 18 takiego mechanizmu nie ma i wywala się na pierwszym `export`
 * komunikatem „Unexpected token 'export'". Produkcja stoi na 18, więc deklarujemy format
 * jawnie i przestajemy zależeć od zachowania konkretnej wersji.
 */
const CJS_ENTRY_POINTS = new Set(['server.js', 'ecosystem.config.js']);

export function load(url, context, next) {
	if (!url.startsWith('file:') || !url.endsWith('.js')) return next(url, context);

	const sciezka = fileURLToPath(url);
	const wzgledna = path.relative(ROOT, sciezka);

	const pozaProjektem = wzgledna.startsWith('..') || path.isAbsolute(wzgledna);
	const zZaleznosci = wzgledna.split(path.sep).includes('node_modules');
	if (pozaProjektem || zZaleznosci || CJS_ENTRY_POINTS.has(wzgledna)) {
		return next(url, context);
	}

	return next(url, { ...context, format: 'module' });
}
