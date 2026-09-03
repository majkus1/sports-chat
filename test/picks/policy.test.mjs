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
 *
 * Druga rzecz, której pilnują: typ liczy się dopiero wtedy, gdy PRZEWYŻSZA NORMĘ swojego
 * rynku. Sam wysoki procent to za mało — „gość strzeli gola" przy 80% jest prawdziwe,
 * pewne i puste, bo gość strzela w 70% meczów bez żadnego modelu.
 */

setupEnv();

const { meetsPolicy, liftFor, entryThresholdFor, BASE_RATES, MIN_PROBABILITY, MIN_LIFT } =
	await import('@/lib/picks/policy');
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

describe('przewaga nad normą, nie wysokość procentu', () => {
	test('gol gospodarza tuż nad normą nie liczy się do statystyki', () => {
		// 85% brzmi wysoko, ale gospodarze strzelają sami z siebie w 78,6% meczów — to +6 pkt.
		const wynik = meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola'), 85);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'below_min_lift');
	});

	test('gol gościa przy tym samym procencie przechodzi, bo jego norma jest niższa', () => {
		// 85% wobec normy 70% to +15 pkt — o tyle ten mecz różni się od przeciętnego.
		assert.equal(meetsPolicy(typ('Gole drużyny', 'Legia Warszawa powyżej 0.5 gola'), 85).ok, true);
	});

	test('ten sam procent przechodzi w rynku o niższej normie', () => {
		// 78% przy zwycięzcy meczu (norma 44%) to mocny typ; przy golu gospodarza — poniżej normy.
		assert.equal(meetsPolicy(typ('Wynik meczu', 'Lech Poznań'), 78).ok, true);
		assert.equal(meetsPolicy(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola'), 78).ok, false);
	});

	test('podwójna szansa ma dwa różne progi, bo 1X i X2 mają różne normy', () => {
		// 1X zachodzi w 69% meczów, X2 w 56% — 74% to dla 1X banał, dla X2 wyraźna przewaga.
		assert.equal(meetsPolicy(typ('Podwójna szansa', '1X'), 74).ok, false);
		assert.equal(meetsPolicy(typ('Podwójna szansa', 'X2'), 74).ok, true);
		assert.equal(meetsPolicy(typ('Podwójna szansa', '1X'), 82).ok, true);
	});

	test('dolna granica zatrzymuje rzut monetą nawet przy dużej przewadze', () => {
		// Wygrana gości przy 50% to +19 pkt nad normą, ale wciąż niewiele więcej niż orzeł-reszka.
		const wynik = meetsPolicy(typ('Wynik meczu', 'Legia Warszawa'), 50);

		assert.equal(wynik.ok, false);
		assert.equal(wynik.reason, 'below_min_probability');
	});

	test('próg wejścia to wyższy z dwóch warunków', () => {
		// Zwycięzca: norma tak niska, że wiąże dolna granica. Gol gospodarza: wiąże przewaga.
		assert.equal(entryThresholdFor(typ('Wynik meczu', 'Lech Poznań')), MIN_PROBABILITY);
		assert.equal(entryThresholdFor(typ('Gole drużyny', 'Lech Poznań powyżej 0.5 gola')), 91);
		assert.equal(entryThresholdFor(typ('Podwójna szansa', '1X')), 81);
	});

	test('próg z tabeli jest dokładnie pierwszym procentem, który przechodzi', () => {
		for (const [market, selection] of [
			['Wynik meczu', 'Lech Poznań'],
			['Wynik meczu', 'Legia Warszawa'],
			['Podwójna szansa', '1X'],
			['Podwójna szansa', 'X2'],
			['Gole drużyny', 'Lech Poznań powyżej 0.5 gola'],
			['Gole drużyny', 'Legia Warszawa powyżej 0.5 gola'],
		]) {
			const n = typ(market, selection);
			const prog = entryThresholdFor(n);
			assert.equal(meetsPolicy(n, prog).ok, true, `${market}/${selection} przy ${prog}%`);
			assert.equal(meetsPolicy(n, prog - 1).ok, false, `${market}/${selection} przy ${prog - 1}%`);
		}
	});
});

describe('norma i przewaga', () => {
	test('przewaga to różnica między procentem a normą, zaokrąglona do całości', () => {
		const { base, lift } = liftFor(typ('Gole drużyny', 'Legia Warszawa powyżej 0.5 gola'), 84);

		assert.equal(base, BASE_RATES.teamGoals.away);
		assert.equal(lift, 14);
	});

	test('bez prawdopodobieństwa jest norma, ale nie ma przewagi', () => {
		const { base, lift } = liftFor(typ('Wynik meczu', 'Lech Poznań'), null);

		assert.equal(base, BASE_RATES.matchWinner.home);
		assert.equal(lift, null);
	});

	test('rynek bez zmierzonej normy nie ma ani normy, ani przewagi', () => {
		assert.deepEqual(liftFor(typ('Suma goli', 'Powyżej 2.5 gola'), 70), { base: null, lift: null });
	});

	test('minimalna przewaga jest dodatnia — inaczej cała reguła nie miałaby sensu', () => {
		assert.ok(MIN_LIFT > 0);
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

describe('norma warunkowa — mecz w trakcie', () => {
	/*
	 * W trwającym meczu norma nie pochodzi z tabeli, tylko z rachunku dla przeciętnej pary
	 * drużyn w tej samej sytuacji. „Gospodarz wygra" przy 2:0 w 80. minucie ma 97% u każdego,
	 * więc wobec normy 95% to +2 pkt — nie typ, choć wobec tabelarycznych 44% wyglądałby
	 * na odkrycie.
	 */
	test('przekazana norma zastępuje tabelaryczną', () => {
		const n = typ('Wynik meczu', 'Lech Poznań');

		assert.equal(liftFor(n, 97, { base: 95 }).lift, 2);
		assert.equal(meetsPolicy(n, 97, { base: 95 }).ok, false);
		assert.equal(meetsPolicy(n, 97, { base: 95 }).reason, 'below_min_lift');
	});

	test('ta sama liczba bez normy warunkowej liczy się wobec tabeli', () => {
		assert.equal(meetsPolicy(typ('Wynik meczu', 'Lech Poznań'), 97).ok, true);
	});

	test('norma warunkowa nie ratuje rynku zakazanego', () => {
		assert.equal(meetsPolicy(typ('Suma goli', 'Powyżej 2.5 gola'), 90, { base: 50 }).ok, false);
	});
});
