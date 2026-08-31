import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Uruchamianie testów niezależne od wersji Node i od powłoki.
 *
 * Wbudowany runner przyjmuje wyłącznie ścieżki do PLIKÓW — ani katalog, ani wzorzec nie
 * działają wszędzie:
 *
 *   `node --test "test/**\/*.test.mjs"`  — Node 22 rozwinie wzorzec sam, Node 18 nie umie
 *                                          i kończy komunikatem „Could not find”.
 *   `node --test test/`                  — Node próbuje wczytać katalog jako moduł i pada
 *                                          na „Cannot find module”.
 *   rozwinięcie w powłoce                — `sh` nie obsługuje `**`, a `cmd.exe` żadnych
 *                                          wzorców; skrypt npm chodzi raz w jednym, raz
 *                                          w drugim.
 *
 * Serwer produkcyjny stoi na Node 18, komputer deweloperski na 22, więc rozwiązanie musi
 * działać w obu. Ten skrypt po prostu znajduje pliki sam i podaje je runnerowi po nazwie.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Wszystkie pliki `*.test.mjs` w drzewie testów, posortowane dla powtarzalnej kolejności. */
function znajdzTesty(katalog) {
	const out = [];
	for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
		const sciezka = path.join(katalog, wpis.name);
		if (wpis.isDirectory()) out.push(...znajdzTesty(sciezka));
		else if (wpis.name.endsWith('.test.mjs')) out.push(sciezka);
	}
	return out.sort();
}

const pliki = znajdzTesty(HERE);

if (!pliki.length) {
	console.error('Nie znaleziono żadnego pliku *.test.mjs w katalogu test/.');
	process.exit(1);
}

/*
 * `--no-experimental-detect-module` na Node 22+ wyrównuje zachowanie z Node 18, na którym
 * stoi produkcja: bez niego nowszy Node po cichu ratuje pliki `.js` zawierające składnię
 * modułu, a starszy wywala się na pierwszym `export`. Ta różnica raz już przepuściła
 * zielone testy lokalnie i czerwone na serwerze. Format deklaruje jawnie `alias.mjs`.
 */
const flagi = ['--test'];
if (Number(process.versions.node.split('.')[0]) >= 22) flagi.unshift('--no-experimental-detect-module');

const wynik = spawnSync(process.execPath, [...flagi, ...pliki], { stdio: 'inherit' });
process.exit(wynik.status ?? 1);
