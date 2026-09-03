import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Selekcja meczów do raportu — część deterministyczna, bez AI i bez sieci.
 *
 * Testy pilnują pięciu rzeczy. Że raport NIE patrzy na kursy: żadna funkcja tutaj nie
 * przyjmuje danych rynkowych i nie ma jak ich przyjąć. Że o wejściu typu decyduje PRZEWAGA
 * NAD NORMĄ rynku, a nie sam procent — inaczej raport zapełnia się typami prawdziwymi
 * i pustymi. Że prawdopodobieństwa pochodzą z własnego modelu, gdy jest dostępny, a prognoza
 * dostawcy schodzi do roli potwierdzenia. Że w rynkach bramkowych NIE POWSTAJE ŻADEN TYP,
 * bo backtest wykazał, że jest w nich gorzej niż zgadywanie. I że liczby, które czytelnik
 * widzi przy typie, są liczbami z selekcji, a nie „skorygowanymi" przez model językowy.
 */

// Rejestruje alias `@/` — bazy ani sieci ten plik nie dotyka.
setupEnv();

const { evaluateMarkets, selectionScore, bindPicksToSelection } = await import('@/lib/reports/service');

/** Forma drużyny w kształcie, jaki daje `normalizeTeamForm`. */
function forma({ strzelone, stracone, rozegrane = 10 }) {
	const avg = (v) => ({ total: String(v), home: String(v), away: String(v) });
	return {
		played: { total: rozegrane, home: Math.ceil(rozegrane / 2), away: Math.floor(rozegrane / 2) },
		goals: {
			for: { average: avg(strzelone) },
			against: { average: avg(stracone) },
		},
	};
}

/** Mecz bez własnego modelu — ścieżka zapasowa, na samych procentach dostawcy. */
function mecz({ home = 70, draw = 20, away = 10 } = {}) {
	return {
		prediction: { percent: { home, draw, away } },
		formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
		formAway: forma({ strzelone: 1.4, stracone: 1.3 }),
	};
}

/** Prognoza własnego modelu w kształcie, jaki zwraca `predictFixture`. */
function zModelu({ home = 0.7, draw = 0.2, away = 0.1, homeScores = 0.8, awayScores = 0.7 } = {}) {
	return {
		matchWinner: { home, draw, away },
		doubleChance: { '1X': home + draw, X2: away + draw, 12: home + away },
		teamGoals: { home: { over: homeScores }, away: { over: awayScores } },
		known: true,
	};
}

const znajdz = (rynki, market, selection) =>
	rynki.find((r) => r.market === market && r.selection === selection) ?? null;

describe('przewaga nad normą jako próg wejścia', () => {
	test('typ poniżej dolnej granicy nie wchodzi do raportu', () => {
		// 58% to więcej niż rzut monetą, ale mniej niż wymagane 60.
		const rynki = evaluateMarkets(mecz({ home: 58, draw: 22, away: 20 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home'), null);
	});

	test('typ powyżej progu wchodzi z normą i przewagą przy sobie', () => {
		const rynki = evaluateMarkets(mecz({ home: 66, draw: 20, away: 14 }));
		const wpis = znajdz(rynki, 'Wynik meczu', 'home');

		assert.equal(wpis.pModel, 66);
		assert.equal(wpis.base, 43.8);
		assert.equal(wpis.lift, 22);
	});

	test('prawdopodobieństwo bliskie pewności odrzucamy jako artefakt danych', () => {
		const rynki = evaluateMarkets(mecz({ home: 95, draw: 3, away: 2 }));

		assert.equal(
			znajdz(rynki, 'Wynik meczu', 'home'),
			null,
			'95% z prognozy dostawcy to błąd danych, nie pewniak'
		);
	});

	test('gol drużyny tuż nad normą nie wchodzi, choć procent wygląda na wysoki', () => {
		/*
		 * „Drużyna strzeli gola" zachodzi samo z siebie w 79% meczów gospodarzy i 70% gości.
		 * Typ z 85% u gospodarza to +6 pkt — dokładnie taki typ miał u bukmachera kurs 1,04
		 * i to z niego wzięła się cała ta zmiana.
		 */
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.85, awayScores: 0.78 }),
		});

		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5'), null);
		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gość powyżej 0.5'), null);
	});

	test('gol gościa wyraźnie powyżej normy przechodzi', () => {
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ awayScores: 0.86 }),
		});
		const wpis = znajdz(rynki, 'Gole drużyny', 'Gość powyżej 0.5');

		assert.equal(wpis?.pModel, 86);
		assert.equal(wpis?.lift, 16);
	});

	test('podwójna szansa 1X potrzebuje znacznie więcej niż X2, bo jej norma jest wyższa', () => {
		// 1X = 45+25 = 70: zaledwie +1 pkt nad normą 69%. X2 = 30+25 = 55: poniżej dolnej granicy.
		const rynki = evaluateMarkets(mecz({ home: 45, draw: 25, away: 30 }));

		assert.equal(znajdz(rynki, 'Podwójna szansa', '1X'), null, '+1 pkt nad normą to nie typ');
		assert.equal(znajdz(rynki, 'Podwójna szansa', 'X2'), null);

		// X2 = 45+25 = 70 przy normie 56%: +14 pkt, wchodzi.
		const odwrotnie = evaluateMarkets(mecz({ home: 30, draw: 25, away: 45 }));
		assert.equal(znajdz(odwrotnie, 'Podwójna szansa', 'X2')?.lift, 14);
	});
});

describe('rynki bramkowe nie są już wystawiane', () => {
	/*
	 * To nie jest test kosmetyczny. Backtest na 3541 meczach pokazał ujemny zysk na mierze
	 * Brier we WSZYSTKICH rynkach zależnych od sumy goli — model jest tam gorszy od stałej
	 * prognozy. Gdyby ktoś kiedyś dołożył je z powrotem „bo szkoda oferty", te testy mają
	 * o tym przypomnieć.
	 */
	const zakazane = ['Suma goli', 'Obie strzelą'];

	test('nawet przy skrajnie wysokiej średniej goli nie ma typu na sumę', () => {
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 70, draw: 20, away: 10 } },
			formHome: forma({ strzelone: 3.4, stracone: 2.2 }),
			formAway: forma({ strzelone: 3.1, stracone: 2.6 }),
		});

		for (const market of zakazane) {
			assert.equal(
				rynki.filter((r) => r.market === market).length,
				0,
				`${market} nie może się pojawić`
			);
		}
	});

	test('nawet przy skrajnie niskiej średniej goli nie ma typu na sumę', () => {
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 70, draw: 20, away: 10 } },
			formHome: forma({ strzelone: 0.4, stracone: 0.3 }),
			formAway: forma({ strzelone: 0.3, stracone: 0.4 }),
		});

		for (const market of zakazane) {
			assert.equal(rynki.filter((r) => r.market === market).length, 0);
		}
	});

	test('model podający wysokie prawdopodobieństwo goli też go nie przemyci', () => {
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.95, awayScores: 0.93 }),
		});

		for (const market of zakazane) {
			assert.equal(rynki.filter((r) => r.market === market).length, 0);
		}
	});
});

describe('prawdopodobieństwa z własnego modelu', () => {
	test('gdy model jest dostępny, to on wyznacza wartość typu', () => {
		// Model widzi 74% na gospodarzy, dostawca tylko 63%. Liczy się model.
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 63, draw: 22, away: 15 } },
			formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
			formAway: forma({ strzelone: 1.2, stracone: 1.4 }),
			modelPrediction: zModelu({ home: 0.74, draw: 0.16, away: 0.1 }),
		});

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').pModel, 74);
	});

	test('zgodność z prognozą dostawcy podnosi wsparcie do dwóch', () => {
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 71, draw: 19, away: 10 } },
			formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
			formAway: forma({ strzelone: 1.2, stracone: 1.4 }),
			modelPrediction: zModelu({ home: 0.7, draw: 0.2, away: 0.1 }),
		});

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').support, 2);
	});

	test('rozbieżność z dostawcą zostawia wsparcie na jednym rachunku', () => {
		// Model 70%, dostawca 45% — różnica 25 punktów, więc bez potwierdzenia.
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 45, draw: 25, away: 30 } },
			formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
			formAway: forma({ strzelone: 1.2, stracone: 1.4 }),
			modelPrediction: zModelu({ home: 0.7, draw: 0.2, away: 0.1 }),
		});

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').support, 1);
	});

	test('model wystawia typ na to, czy drużyna strzeli — jedyny potwierdzony rynek bramkowy', () => {
		// Gość: norma 70%, więc 88% to +18 pkt. Ten sam procent u gospodarza (norma 79%) nie wchodzi.
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.88, awayScores: 0.88 }),
		});

		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gość powyżej 0.5')?.pModel, 88);
		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5'), null);
	});

	test('bez modelu działa ścieżka zapasowa na procentach dostawcy', () => {
		const rynki = evaluateMarkets(mecz({ home: 68, draw: 20, away: 12 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').pModel, 68);
		assert.equal(
			znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5'),
			null,
			'bez modelu nie mamy skąd wziąć tej liczby'
		);
	});
});

describe('ranking selekcji', () => {
	const slabsze = { pModel: 70, lift: 26, support: 1 };
	const mocniejsze = { pModel: 70, lift: 26, support: 2 };

	test('przy równej przewadze wygrywa typ potwierdzony dwoma rachunkami', () => {
		const a = selectionScore(mocniejsze, { tier: 2, played: 10 });
		const b = selectionScore(slabsze, { tier: 2, played: 10 });

		assert.ok(a > b, 'sama przewaga nie może być jedynym kryterium');
	});

	test('sortuje po przewadze nad normą, nie po procencie', () => {
		/*
		 * Gol gospodarza przy 91% to +12 pkt; wygrana gości przy 62% to +31 pkt. Sortowanie
		 * po procencie stawiałoby pewniak na czele — a to on jest typem bez treści.
		 */
		const pewniak = { pModel: 91, lift: 12, support: 2 };
		const odkrycie = { pModel: 62, lift: 31, support: 2 };

		assert.ok(
			selectionScore(odkrycie, { tier: 2, played: 10 }) > selectionScore(pewniak, { tier: 2, played: 10 })
		);
	});

	test('mecz z czołowych rozgrywek wyprzedza taki sam typ z niższego poziomu', () => {
		const a = selectionScore(mocniejsze, { tier: 1, played: 10 });
		const b = selectionScore(mocniejsze, { tier: 2, played: 10 });

		assert.ok(a > b);
	});

	test('dłuższa próba meczowa podnosi wynik, ale z sufitem', () => {
		const krotka = selectionScore(mocniejsze, { tier: 1, played: 4 });
		const dluga = selectionScore(mocniejsze, { tier: 1, played: 12 });
		const bardzoDluga = selectionScore(mocniejsze, { tier: 1, played: 30 });

		assert.ok(dluga > krotka);
		assert.equal(bardzoDluga, dluga, 'powyżej dwunastu meczów próba nic już nie dokłada');
	});
});

describe('wiązanie typów modelu językowego z selekcją', () => {
	const rynki = evaluateMarkets({
		...mecz(),
		modelPrediction: zModelu({ home: 0.55, draw: 0.3, away: 0.15, awayScores: 0.86 }),
	});
	const kandydat = {
		fixtureId: 777,
		home: 'Machida Zelvia',
		away: 'Kawasaki Frontale',
		best: rynki[0],
		otherMarkets: rynki.slice(1),
	};

	test('prawdopodobieństwo wraca do wartości z selekcji, gdy model je „skorygował"', () => {
		// Selekcja: 1X przy 85%. Model językowy zjechał na 76 i napisał selekcję po swojemu.
		const [typ] = bindPicksToSelection(
			[{ fixtureId: 777, market: 'Podwójna szansa', selection: '1X — Machida Zelvia lub remis', probability: 76 }],
			[kandydat]
		);

		assert.equal(typ.probability, 85);
		assert.equal(typ.baseRate, 69.3);
		assert.equal(typ.lift, 16);
	});

	test('gol drużyny rozpoznawany po nazwie zespołu w selekcji', () => {
		const [typ] = bindPicksToSelection(
			[{ fixtureId: 777, market: 'Gole drużyny', selection: 'Kawasaki Frontale powyżej 0.5 gola', probability: 80 }],
			[kandydat]
		);

		assert.equal(typ.probability, 86);
		assert.equal(typ.lift, 16);
	});

	test('typ spoza selekcji zostaje z własnym procentem, ale dostaje normę z tej samej tabeli', () => {
		// Model wystawił wygraną gospodarzy, której selekcja nie proponowała (55% < próg 60).
		const [typ] = bindPicksToSelection(
			[{ fixtureId: 777, market: 'Wynik meczu', selection: 'Machida Zelvia', probability: 64 }],
			[kandydat]
		);

		assert.equal(typ.probability, 64, 'brak wpisu selekcji — nie ma czym nadpisać');
		assert.equal(typ.baseRate, 43.8);
		assert.equal(typ.lift, 20);
	});

	test('mecz spoza listy kandydatów nie wywraca wiązania', () => {
		const [typ] = bindPicksToSelection(
			[{ fixtureId: 1, market: 'Suma goli', selection: 'Powyżej 2.5', probability: 70 }],
			[kandydat]
		);

		assert.equal(typ.probability, 70);
		assert.equal(typ.baseRate, null);
	});
});

describe('brak danych rynkowych', () => {
	test('selekcja działa bez jakiejkolwiek informacji o kursach', () => {
		const rynki = evaluateMarkets({ ...mecz(), modelPrediction: zModelu() });

		assert.ok(rynki.length > 0);
		for (const wpis of rynki) {
			assert.deepEqual(
				Object.keys(wpis).sort(),
				['base', 'lift', 'market', 'normalized', 'pModel', 'selection', 'support'],
				'wpis selekcji nie może nieść pola pochodzącego z rynku zakładów'
			);
		}
	});
});
