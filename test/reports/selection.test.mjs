import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Selekcja meczów do raportu — część deterministyczna, bez AI i bez sieci.
 *
 * Testy pilnują czterech rzeczy. Że raport NIE patrzy na kursy: żadna funkcja tutaj nie
 * przyjmuje danych rynkowych i nie ma jak ich przyjąć. Że progi pewności działają, bo po
 * usunięciu przewagi nad rynkiem to jedyne sito. Że prawdopodobieństwa pochodzą z własnego
 * modelu, gdy jest dostępny, a prognoza dostawcy schodzi do roli potwierdzenia. I — najmniej
 * oczywiste — że w rynkach bramkowych NIE POWSTAJE ŻADEN TYP, bo backtest wykazał, że jest
 * w nich gorzej niż zgadywanie.
 */

// Rejestruje alias `@/` — bazy ani sieci ten plik nie dotyka.
setupEnv();

const { evaluateMarkets, selectionScore } = await import('@/lib/reports/service');

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

describe('progi pewności', () => {
	test('typ poniżej progu nie wchodzi do raportu', () => {
		// 58% to więcej niż rzut monetą, ale mniej niż wymagane 62.
		const rynki = evaluateMarkets(mecz({ home: 58, draw: 22, away: 20 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home'), null);
	});

	test('typ powyżej progu wchodzi', () => {
		const rynki = evaluateMarkets(mecz({ home: 66, draw: 20, away: 14 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home')?.pModel, 66);
	});

	test('prawdopodobieństwo bliskie pewności odrzucamy jako artefakt danych', () => {
		const rynki = evaluateMarkets(mecz({ home: 95, draw: 3, away: 2 }));

		assert.equal(
			znajdz(rynki, 'Wynik meczu', 'home'),
			null,
			'95% z prognozy dostawcy to błąd danych, nie pewniak'
		);
	});

	test('gole drużyny mają najwyższy próg, bo zdarzają się najczęściej', () => {
		/*
		 * „Drużyna strzeli gola" zachodzi samo z siebie w 70–79% meczów. Typ z 78% jest więc
		 * w tym rynku słabszy niż zwykła średnia ligowa i nie może przejść — mimo że przy
		 * progu ogólnym (62%) wyglądałby na mocny.
		 */
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.78, awayScores: 0.74 }),
		});

		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5'), null);
		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gość powyżej 0.5'), null);
	});

	test('gol drużyny wyraźnie powyżej normy przechodzi', () => {
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.89 }),
		});

		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5')?.pModel, 89);
	});

	test('podwójna szansa ma wyższy próg niż rynki pojedyncze', () => {
		// 1X = 45+25 = 70: powyżej progu ogólnego (62), poniżej progu dla podwójnej (74).
		const rynki = evaluateMarkets(mecz({ home: 45, draw: 25, away: 30 }));

		assert.equal(
			znajdz(rynki, 'Podwójna szansa', '1X'),
			null,
			'suma dwóch zgrubnych procentów zawyża pewność — stąd osobny, wyższy próg'
		);
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
		// Wartość musi przekraczać własny próg rynku (85%), a nie tylko ogólny.
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.88 }),
		});

		assert.equal(znajdz(rynki, 'Gole drużyny', 'Gospodarz powyżej 0.5')?.pModel, 88);
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
	const slabsze = { pModel: 70, support: 1 };
	const mocniejsze = { pModel: 70, support: 2 };

	test('przy równym procencie wygrywa typ potwierdzony dwoma rachunkami', () => {
		const a = selectionScore(mocniejsze, { tier: 2, played: 10 });
		const b = selectionScore(slabsze, { tier: 2, played: 10 });

		assert.ok(a > b, 'samo prawdopodobieństwo nie może być jedynym kryterium');
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

describe('brak danych rynkowych', () => {
	test('selekcja działa bez jakiejkolwiek informacji o kursach', () => {
		const rynki = evaluateMarkets({ ...mecz(), modelPrediction: zModelu() });

		assert.ok(rynki.length > 0);
		for (const wpis of rynki) {
			assert.deepEqual(
				Object.keys(wpis).sort(),
				['market', 'pModel', 'selection', 'support'],
				'wpis selekcji nie może nieść pola pochodzącego z rynku zakładów'
			);
		}
	});
});
