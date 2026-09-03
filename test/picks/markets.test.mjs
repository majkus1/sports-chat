import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Rozpoznawanie rynków — nazwy pisze model językowy, więc parser musi znosić warianty.
 *
 * POWÓD ISTNIENIA TEGO PLIKU. Model wystawił typ z rynkiem „Drużyna strzeli gola" zamiast
 * kanonicznego „Gole drużyny". Parser go nie rozpoznał, typ wylądował w bazie jako `void`
 * i nie policzył się do niczego — a czytelnik widział przy meczu pełnoprawny typ, tyle że
 * bez wiersza z prawdopodobieństwem. Cicha strata, wykryta wyłącznie okiem.
 *
 * Naprawa jest dwustronna: prompt podaje nazwy dosłownie, a parser rozpoznaje po treści.
 * Te testy pilnują drugiej strony, bo pierwsza jest tylko prośbą.
 */

setupEnv();

const { normalizePick, CANONICAL_MARKETS } = await import('@/lib/picks/markets');

const DRUZYNY = { homeName: 'Deportivo Recoleta', awayName: 'Cerro Porteno' };
const rozpoznaj = (market, selection) => normalizePick({ market, selection, ...DRUZYNY });

describe('gole drużyny bez względu na nazwę rynku', () => {
	const oczekiwany = { type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 };

	for (const nazwa of [
		'Gole drużyny',
		'Drużyna strzeli gola',
		'Drużyna strzeli gol',
		'Team goals',
		'Team to score',
	]) {
		test(`„${nazwa}"`, () => {
			assert.deepEqual(rozpoznaj(nazwa, 'Deportivo Recoleta powyżej 0.5 gola'), oczekiwany);
		});
	}

	test('rozpoznaje też gościa i zapis angielski', () => {
		assert.deepEqual(rozpoznaj('Team to score', 'Cerro Porteno over 0.5 goals'), {
			type: 'teamGoals',
			side: 'away',
			dir: 'over',
			line: 0.5,
		});
	});

	test('bez wskazanej drużyny nie zgadujemy strony', () => {
		assert.equal(rozpoznaj('Drużyna strzeli gola', 'powyżej 0.5 gola'), null);
	});
});

describe('zwycięzca meczu bez względu na nazwę rynku', () => {
	for (const nazwa of ['Wynik meczu', 'Zwycięzca meczu', 'Kto wygra', 'Match Winner', '1X2']) {
		test(`„${nazwa}"`, () => {
			assert.deepEqual(rozpoznaj(nazwa, 'Deportivo Recoleta'), {
				type: 'matchWinner',
				value: 'home',
			});
		});
	}
});

describe('rynki, które muszą trafić gdzie indziej', () => {
	test('obie drużyny strzelą to BTTS, nie gole drużyny', () => {
		// „Obie drużyny strzelą gola" zawiera „strzeli gol" — kolejność sprawdzania ma znaczenie.
		assert.deepEqual(rozpoznaj('Obie drużyny strzelą gola', 'Tak'), { type: 'btts', value: 'yes' });
		assert.deepEqual(rozpoznaj('Both Teams Score', 'Yes'), { type: 'btts', value: 'yes' });
	});

	test('suma goli nie jest golami drużyny', () => {
		assert.deepEqual(rozpoznaj('Suma goli', 'Powyżej 2.5'), {
			type: 'totalGoals',
			dir: 'over',
			line: 2.5,
		});
		assert.deepEqual(rozpoznaj('Liczba bramek', 'Poniżej 3.5'), {
			type: 'totalGoals',
			dir: 'under',
			line: 3.5,
		});
	});

	test('podwójna szansa zostaje podwójną szansą', () => {
		assert.deepEqual(rozpoznaj('Podwójna szansa', '1X'), { type: 'doubleChance', value: '1X' });
		assert.deepEqual(rozpoznaj('Podwójna szansa', 'Cerro Porteno lub remis'), {
			type: 'doubleChance',
			value: 'X2',
		});
	});

	test('rynku nierozstrzygalnego końcowym wynikiem nadal nie przyjmujemy', () => {
		assert.equal(rozpoznaj('Następna bramka', 'Deportivo Recoleta'), null);
		assert.equal(rozpoznaj('Liczba rzutów rożnych', 'Powyżej 9.5'), null);
	});
});

describe('nazwy kanoniczne', () => {
	test('każda z nich jest rozpoznawana przez parser', () => {
		assert.deepEqual(rozpoznaj(CANONICAL_MARKETS.matchWinner, 'Deportivo Recoleta'), {
			type: 'matchWinner',
			value: 'home',
		});
		assert.deepEqual(rozpoznaj(CANONICAL_MARKETS.doubleChance, '1X'), {
			type: 'doubleChance',
			value: '1X',
		});
		assert.deepEqual(rozpoznaj(CANONICAL_MARKETS.teamGoals, 'Cerro Porteno powyżej 0.5 gola'), {
			type: 'teamGoals',
			side: 'away',
			dir: 'over',
			line: 0.5,
		});
	});

	test('są trzy i tylko te trzy — prompt wypisuje je z tego samego źródła', () => {
		assert.deepEqual(Object.keys(CANONICAL_MARKETS).sort(), [
			'doubleChance',
			'matchWinner',
			'teamGoals',
		]);
	});
});
