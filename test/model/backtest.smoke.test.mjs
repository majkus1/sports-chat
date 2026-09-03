import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

/**
 * Test dymny backtestu — uruchamia CAŁY skrypt na syntetycznych terminarzach.
 *
 * DLACZEGO PROCES POTOMNY, A NIE IMPORT. Backtest to skrypt: ma `await` na najwyższym
 * poziomie, wypisuje raport i kończy się `process.exit`. Zaimportowanie fragmentu nie
 * sprawdziłoby tego, co się psuje naprawdę — a psuło się dwa razy z rzędu i za każdym
 * razem dopiero na serwerze, po kilkudziesięciu zapytaniach do API:
 *
 *   1. `Cannot access 'REFIT_DAYS' before initialization` — stała `const` zadeklarowana
 *      niżej niż funkcja, która jej używa. `node --check` widzi składnię, nie martwą
 *      strefę czasową.
 *   2. Wcześniej: odwołania do zmiennych usuniętych przy przebudowie pętli.
 *
 * Atrapa endpointów daje ligi round-robin i jeden puchar, więc przy okazji sprawdzamy,
 * że próg mediany meczów na drużynę faktycznie odcina drabinkę pucharową, a lista
 * wykluczeń — Ligę Konferencji. Liczby z tych danych nic nie znaczą i nic o nich nie
 * twierdzimy; liczy się to, że skrypt dochodzi do końca.
 */

const WYNIK = spawnSync(
	process.execPath,
	[
		'--experimental-loader',
		'./test/helpers/alias.mjs',
		'--experimental-loader',
		'./test/helpers/stubLoader.mjs',
		'lib/model/backtest.mjs',
		'--market=off',
		'--leagues=39,140,45,848',
	],
	{ cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 }
);

const out = `${WYNIK.stdout || ''}`;
const err = `${WYNIK.stderr || ''}`;

describe('backtest wykonuje się od początku do końca', () => {
	test('kończy własnym werdyktem, nie wyjątkiem', () => {
		// 0 = model lepszy, 2 = model nie lepszy. Oba są POPRAWNYM zakończeniem; przy danych
		// syntetycznych nie wiadomo, który wypadnie, i nie o to tu chodzi.
		assert.ok(
			[0, 2].includes(WYNIK.status),
			`kod wyjścia ${WYNIK.status}\n--- stdout ---\n${out.slice(-2000)}\n--- stderr ---\n${err.slice(-2000)}`
		);
		assert.match(out, /WERDYKT:/);
	});

	test('bez błędu wykonania w strumieniu błędów', () => {
		for (const wzorzec of [/ReferenceError/, /TypeError/, /is not a function/, /Cannot access/, /undefined/]) {
			assert.doesNotMatch(err, wzorzec, `stderr:\n${err.slice(-2000)}`);
		}
	});
});

describe('wszystkie sekcje raportu powstają', () => {
	const sekcje = [
		['nagłówek dopasowania per rozgrywki', /Model dopasowywany osobno dla każdych rozgrywek/],
		['pokrycie modelem', /objętych modelem: \d+ \(\d+\.\d%\)/],
		['tabela miar', /log loss 1X2 \(mniej=lepiej\)/],
		['rynki dwustanowe', /RYNKI DWUSTANOWE/],
		['istotność', /ISTOTNOŚĆ PRZEWAGI NAD CZĘSTOŚCIAMI/],
		['rozbicie po rozgrywkach', /ROZGRYWKI — gdzie model pomaga/],
		['próg przewagi', /PRÓG PRZEWAGI NAD NORMĄ/],
		['rozbicie na selekcje', /ROZBICIE PRZY OBECNYM PROGU/],
		['normy wobec danych', /NORMY Z POLITYKI WOBEC DANYCH TESTOWYCH/],
	];

	for (const [nazwa, wzorzec] of sekcje) {
		test(nazwa, () => {
			assert.match(out, wzorzec);
		});
	}

	test('nie zostaje pusta wartość w żadnym wierszu', () => {
		assert.doesNotMatch(out, /NaN|undefined|null%/);
	});
});

describe('progi wejścia odcinają to, co mają odcinać', () => {
	test('drabinka pucharowa nie dostaje modelu', () => {
		assert.match(out, /bez modelu:.*FA Cup/);
	});

	test('rozgrywki z listy wykluczeń też nie', () => {
		assert.match(out, /bez modelu:.*Conference/);
	});

	test('mecze bez modelu wypadają z pomiaru, a nie wchodzą do niego z zerem', () => {
		const objete = out.match(/objętych modelem: (\d+)/);
		const poza = out.match(/poza modelem: (\d+)/);

		assert.ok(objete && poza, 'brak liczb pokrycia w raporcie');
		assert.ok(Number(poza[1]) > 0, 'atrapa zawiera puchar, więc coś musi wypaść');
		assert.ok(Number(objete[1]) > 100, 'zostało za mało meczów, żeby raport cokolwiek znaczył');
	});
});
