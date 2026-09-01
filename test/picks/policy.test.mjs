import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Polityka typów — bariera po stronie kodu, nie prośba w prompcie.
 *
 * Raport miał filtr w kodzie od początku; analiza meczu nie miała żadnego. Reguły istniały
 * wyłącznie jako instrukcja dla modelu językowego, a on może ich nie posłuchać — i wtedy typ
 * na sumę goli wpadał do publicznej skuteczności mimo zakazu. Te testy pilnują, żeby drugie
 * zabezpieczenie faktycznie działało niezależnie od tego, co zwróci model.
 */

setupEnv();

const { meetsPolicy, MARKET_MIN_PROBABILITY } = await import('@/lib/picks/policy');
const { normalizePick } = await import('@/lib/picks/markets');

/** Typ w postaci, jaką daje parser — tak jak w `recordPicks`. */
const typ = (market, selection) =>
	normalizePick({ market, selection, homeName: 'Lech Poznań', awayName: 'Legia Warszawa' });

describe('rynki, w których nie prognozujemy', () => {
	test('suma goli nie wchodzi do statystyki, nawet przy wysokiej pewności', () => {
		const wynik = meetsPolicy(typ('Suma goli', 'Powyżej 2.5 gola'), 91);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'market_not_predictable');
	});

	test('„obie strzelą" też nie', () => {
		assert.equal(meetsPolicy(typ('Obie strzelą', 'Tak'), 88).ok, false);
	});

	test('nierozpoznany rynek odpada z własnym powodem', () => {
		const wynik = meetsPolicy(null, 80);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'market_not_supported');
	});
});

describe('progi zależne od rynku', () => {
	test('gol drużyny poniżej częstości bazowej nie liczy się do statystyki', () => {
		// 78% brzmi wysoko, ale gospodarze strzelają sami z siebie w 78,6% meczów.
		const wynik = meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola'), 78);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'below_market_threshold');
	});

	test('gol drużyny wyraźnie powyżej normy przechodzi', () => {
		assert.equal(meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola'), 88).ok, true);
	});

	test('ten sam procent przechodzi w rynku o niższej częstości bazowej', () => {
		// 78% przy zwycięzcy meczu to mocny typ, przy golu drużyny — słabszy niż średnia.
		assert.equal(meetsPolicy(typ('Wynik meczu', 'Lech Poznań'), 78).ok, true);
		assert.equal(meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola'), 78).ok, false);
	});

	test('podwójna szansa ma próg pośredni', () => {
		assert.equal(meetsPolicy(typ('Podwójna szansa', '1X'), 70).ok, false);
		assert.equal(meetsPolicy(typ('Podwójna szansa', '1X'), 76).ok, true);
	});

	test('progi rosną wraz z częstością bazową rynku', () => {
		assert.ok(MARKET_MIN_PROBABILITY.matchWinner < MARKET_MIN_PROBABILITY.doubleChance);
		assert.ok(MARKET_MIN_PROBABILITY.doubleChance < MARKET_MIN_PROBABILITY.teamGoals);
	});
});

describe('progi drużynowe inne niż 0.5', () => {
	test('powyżej 1.5 gola drużyny nie było mierzone, więc nie liczy się do statystyki', () => {
		const wynik = meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 1.5 gola'), 90);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'market_not_measured');
	});
});

describe('brak deklarowanego prawdopodobieństwa', () => {
	test('nie wyklucza typu w dozwolonym rynku', () => {
		/*
		 * Typy sprzed wprowadzenia pola `probability` mają je puste. Wykluczenie ich znaczyłoby
		 * karanie za brak metadanej, a nie za jakość prognozy.
		 */
		assert.equal(meetsPolicy(typ('Wynik meczu', 'Lech Poznań'), null).ok, true);
	});

	test('ale nie ratuje rynku zakazanego', () => {
		assert.equal(meetsPolicy(typ('Suma goli', 'Powyżej 2.5 gola'), null).ok, false);
	});
});
