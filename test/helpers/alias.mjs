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

	let target = path.join(ROOT, specifier.slice(2));
	// Importy bez rozszerzenia (`@/lib/db`) trafiają na plik `.js`.
	if (!/\.[a-z]+$/.test(target)) target += '.js';

	return next(pathToFileURL(target).href, context);
}
