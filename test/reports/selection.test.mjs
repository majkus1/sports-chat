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

const { sameSelection, SELECTION_SHAPES, normalizePick } = await import('@/lib/picks/markets');

const {
	evaluateMarkets,
	selectionScore,
	bindPicksToSelection,
	applyMarketCeiling,
	countPlayed,
	spreadAcrossLeagues,
} = await import('@/lib/reports/service');

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

/**
 * Selekcja szukana po POSTACI ZNORMALIZOWANEJ, nie po brzmieniu opisu.
 *
 * Testy sprawdzaly wczesniej dokladny tekst („Gosc powyzej 0.5"), wiec pilnowaly slow
 * zamiast zachowania — i przechodzily na zielono przy opisie, ktorego parser typow
 * nie rozpoznawal. Brzmienie ma wlasny test ponizej: round-trip przez `normalizePick`.
 */
const znajdz = (rynki, klucz) =>
	rynki.find((r) => sameSelection(r.normalized, SELECTION_SHAPES[klucz].normalized)) ?? null;

describe('przewaga nad normą jako próg wejścia', () => {
	test('typ poniżej dolnej granicy nie wchodzi do raportu', () => {
		// 58% to więcej niż rzut monetą, ale mniej niż wymagane 60.
		const rynki = evaluateMarkets(mecz({ home: 58, draw: 22, away: 20 }));

		assert.equal(znajdz(rynki, 'home'), null);
	});

	test('typ powyżej progu wchodzi z normą i przewagą przy sobie', () => {
		const rynki = evaluateMarkets(mecz({ home: 66, draw: 20, away: 14 }));
		const wpis = znajdz(rynki, 'home');

		assert.equal(wpis.pModel, 66);
		assert.equal(wpis.base, 43.8);
		assert.equal(wpis.lift, 22);
	});

	test('prawdopodobieństwo bliskie pewności odrzucamy jako artefakt danych', () => {
		const rynki = evaluateMarkets(mecz({ home: 95, draw: 3, away: 2 }));

		assert.equal(
			znajdz(rynki, 'home'),
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

		assert.equal(znajdz(rynki, 'homeScores'), null);
		assert.equal(znajdz(rynki, 'awayScores'), null);
	});

	test('gol gościa wyraźnie powyżej normy przechodzi', () => {
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ awayScores: 0.86 }),
		});
		const wpis = znajdz(rynki, 'awayScores');

		assert.equal(wpis?.pModel, 86);
		assert.equal(wpis?.lift, 16);
	});

	test('podwójna szansa 1X potrzebuje znacznie więcej niż X2, bo jej norma jest wyższa', () => {
		// 1X = 45+25 = 70: zaledwie +1 pkt nad normą 69%. X2 = 30+25 = 55: poniżej dolnej granicy.
		const rynki = evaluateMarkets(mecz({ home: 45, draw: 25, away: 30 }));

		assert.equal(znajdz(rynki, '1X'), null, '+1 pkt nad normą to nie typ');
		assert.equal(znajdz(rynki, 'X2'), null);

		// X2 = 45+25 = 70 przy normie 56%: +14 pkt, wchodzi.
		const odwrotnie = evaluateMarkets(mecz({ home: 30, draw: 25, away: 45 }));
		assert.equal(znajdz(odwrotnie, 'X2')?.lift, 14);
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

		assert.equal(znajdz(rynki, 'home').pModel, 74);
	});

	test('zgodność z prognozą dostawcy podnosi wsparcie do dwóch', () => {
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 71, draw: 19, away: 10 } },
			formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
			formAway: forma({ strzelone: 1.2, stracone: 1.4 }),
			modelPrediction: zModelu({ home: 0.7, draw: 0.2, away: 0.1 }),
		});

		assert.equal(znajdz(rynki, 'home').support, 2);
	});

	test('rozbieżność z dostawcą zostawia wsparcie na jednym rachunku', () => {
		// Model 70%, dostawca 45% — różnica 25 punktów, więc bez potwierdzenia.
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 45, draw: 25, away: 30 } },
			formHome: forma({ strzelone: 1.8, stracone: 1.0 }),
			formAway: forma({ strzelone: 1.2, stracone: 1.4 }),
			modelPrediction: zModelu({ home: 0.7, draw: 0.2, away: 0.1 }),
		});

		assert.equal(znajdz(rynki, 'home').support, 1);
	});

	test('model wystawia typ na to, czy drużyna strzeli — jedyny potwierdzony rynek bramkowy', () => {
		// Gość: norma 70%, więc 88% to +18 pkt. Ten sam procent u gospodarza (norma 79%) nie wchodzi.
		const rynki = evaluateMarkets({
			...mecz(),
			modelPrediction: zModelu({ homeScores: 0.88, awayScores: 0.88 }),
		});

		assert.equal(znajdz(rynki, 'awayScores')?.pModel, 88);
		assert.equal(znajdz(rynki, 'homeScores'), null);
	});

	test('bez modelu działa ścieżka zapasowa na procentach dostawcy', () => {
		const rynki = evaluateMarkets(mecz({ home: 68, draw: 20, away: 12 }));

		assert.equal(znajdz(rynki, 'home').pModel, 68);
		assert.equal(
			znajdz(rynki, 'homeScores'),
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

describe('sufit rynkowy w selekcji raportu', () => {
	const rynki = evaluateMarkets({
		...mecz(),
		modelPrediction: zModelu({ home: 0.7, draw: 0.2, away: 0.1, awayScores: 0.86 }),
	});

	test('bez kursów wszystko zostaje, a prawdopodobieństwo rynkowe jest puste', () => {
		const po = applyMarketCeiling(rynki, null);

		assert.equal(po.length, rynki.length);
		for (const wpis of po) assert.equal(wpis.marketProbability, null);
	});

	test('selekcja, którą rynek uznaje za pewną, wypada; reszta dostaje swój procent rynkowy', () => {
		const implied = { home: 60, draw: 22, away: 18, '1X': 82, X2: 40, homeScores: 92, awayScores: 93 };
		const po = applyMarketCeiling(rynki, implied);

		assert.equal(znajdz(po, 'awayScores'), null, 'rynek 93% — odcięte');
		assert.equal(znajdz(po, 'home')?.marketProbability, 60);
		assert.equal(znajdz(po, '1X')?.marketProbability, 82);
	});

	test('wpis selekcji nie niesie liczby rynkowej do promptu ani do typu', () => {
		// `bindPicksToSelection` kopiuje wyłącznie procent, normę i przewagę.
		const implied = { home: 60, draw: 22, away: 18, '1X': 82, X2: 40, homeScores: 80, awayScores: 70 };
		const po = applyMarketCeiling(rynki, implied);
		const kandydat = { fixtureId: 5, home: 'Machida Zelvia', away: 'Kawasaki Frontale', best: po[0], otherMarkets: po.slice(1) };
		const [typ] = bindPicksToSelection(
			[{ fixtureId: 5, market: 'Wynik meczu', selection: 'Machida Zelvia', probability: 66 }],
			[kandydat]
		);

		assert.equal('marketProbability' in typ, false);
	});
});

/**
 * Podział budżetu prognoz — część, przez którą raport 3-dniowy potrafił mieć dwa typy.
 *
 * Kolejność sortowana po samej randze oddawała cały budżet czołowym ligom, a te we wrześniu
 * mają rozegraną kolejkę albo dwie i w komplecie odpadają na progu próby meczowej. Testy
 * pilnują obu połówek naprawy: że wiemy, ile drużyna rozegrała, ZANIM zapłacimy za prognozę,
 * i że jedna liga nie zabiera całej puli.
 */
describe('rozegrane mecze liczone z terminarza ligi', () => {
	/** Wiersz `leagueFixtures` w kształcie, jaki daje API. */
	const spotkanie = (homeId, awayId, status = 'FT') => ({
		fixture: { id: homeId * 1000 + awayId, status: { short: status } },
		teams: { home: { id: homeId }, away: { id: awayId } },
	});

	test('liczy tylko mecze rozegrane do końca', () => {
		const licznik = countPlayed([
			spotkanie(1, 2),
			spotkanie(2, 1),
			spotkanie(1, 3, 'NS'),
			spotkanie(1, 3, 'PST'),
		]);

		assert.equal(licznik.get(1), 2, 'dwa zakończone, dwa nierozegrane');
		assert.equal(licznik.get(2), 2);
		assert.equal(licznik.get(3), undefined, 'przeciwnik tylko z meczów nierozegranych');
	});

	test('dogrywka i karne to też mecz rozegrany', () => {
		const licznik = countPlayed([spotkanie(1, 2, 'AET'), spotkanie(1, 3, 'PEN')]);
		assert.equal(licznik.get(1), 2);
	});

	test('dokłada do wspólnej mapy, bo lig jest w oknie kilkanaście', () => {
		const wspolna = new Map();
		countPlayed([spotkanie(1, 2)], wspolna);
		countPlayed([spotkanie(1, 2)], wspolna);
		assert.equal(wspolna.get(1), 2);
	});
});

describe('budżet prognoz rozłożony po ligach', () => {
	/** Mecz w kształcie, jakiego używa selekcja: liga, godzina, drużyny. */
	const mecz = (leagueId, godzina) => ({
		id: `${leagueId}-${godzina}`,
		league: { id: leagueId, season: 2026 },
		date: `2026-09-05T${String(godzina).padStart(2, '0')}:00:00Z`,
	});

	const tierOf = (f) => (f.league.id === 106 ? 1 : 2);

	test('liga z wieloma meczami nie zabiera całego budżetu', () => {
		const pula = [
			...Array.from({ length: 10 }, (_, i) => mecz(106, 10 + i)),
			mecz(98, 11),
			mecz(71, 12),
		];

		const wybrane = spreadAcrossLeagues(pula, { budget: 4, tierOf });
		const ligi = wybrane.map((f) => f.league.id);

		assert.equal(wybrane.length, 4);
		assert.deepEqual(ligi, [106, 98, 71, 106], 'runda po jednym meczu z ligi, potem druga');
	});

	test('ranga decyduje o kolejności w rundzie, nie o dostępie do budżetu', () => {
		const pula = [mecz(98, 12), mecz(71, 11), mecz(106, 15)];
		const wybrane = spreadAcrossLeagues(pula, { budget: 3, tierOf });

		assert.equal(wybrane[0].league.id, 106, 'poziom 1 pierwszy, choć gra najpóźniej');
		assert.deepEqual(
			wybrane.slice(1).map((f) => f.league.id),
			[71, 98],
			'przy równym poziomie wcześniejszy termin'
		);
	});

	test('w obrębie ligi bierzemy mecze najbliższe w czasie', () => {
		const pula = [mecz(98, 20), mecz(98, 9), mecz(98, 14)];
		const wybrane = spreadAcrossLeagues(pula, { budget: 2, tierOf });

		assert.deepEqual(
			wybrane.map((f) => f.date.slice(11, 16)),
			['09:00', '14:00']
		);
	});

	test('budżet większy niż pula oddaje całą pulę i nie zapętla się', () => {
		const pula = [mecz(98, 12), mecz(71, 11)];
		assert.equal(spreadAcrossLeagues(pula, { budget: 40, tierOf }).length, 2);
	});

	test('pusta pula nie wywraca podziału', () => {
		assert.deepEqual(spreadAcrossLeagues([], { budget: 40, tierOf }), []);
	});
});

/**
 * Opis selekcji musi wracać przez parser do tej samej selekcji.
 *
 * TO JEST TEST NA KONKRETNĄ AWARIĘ. Raport wystawiał „Gole drużyny: Gość powyżej 0.5" —
 * poprawną selekcję, której `normalizePick` nie miał jak rozpoznać, bo gałąź goli drużyny
 * szuka NAZWY ZESPOŁU, a nie słowa „gość". Czytelnik widział pełnoprawny typ, a statystyka
 * go nie liczyła. Drugi objaw tej samej przyczyny był tylko brzydki: „Wynik meczu: away".
 *
 * Model językowy przepisuje `selection` znak w znak, więc to, co tu napiszemy, trafia
 * jednocześnie przed oczy czytelnika i z powrotem do parsera. Ten test pilnuje obu ról.
 */
describe('opisy selekcji są jednocześnie czytelne i rozpoznawalne', () => {
	const NAZWY = { homeName: 'Heerenveen', awayName: 'AZ Alkmaar' };

	for (const [klucz, ksztalt] of Object.entries(SELECTION_SHAPES)) {
		test(`${klucz} wraca przez normalizePick do swojej selekcji`, () => {
			const selection = ksztalt.label(NAZWY);
			const wrocil = normalizePick({ market: ksztalt.market, selection, ...NAZWY });

			assert.notEqual(wrocil, null, `parser nie rozpoznał: „${ksztalt.market}: ${selection}"`);
			assert.equal(sameSelection(wrocil, ksztalt.normalized), true, selection);
		});
	}

	test('działa też bez nazw drużyn — wtedy opis mówi o stronach', () => {
		for (const [klucz, ksztalt] of Object.entries(SELECTION_SHAPES)) {
			const selection = ksztalt.label({});
			const wrocil = normalizePick({ market: ksztalt.market, selection, ...NAZWY });
			assert.equal(sameSelection(wrocil, ksztalt.normalized), true, `${klucz}: ${selection}`);
		}
	});

	test('drużyny dzielące człon nazwy nie gubią typu', () => {
		/*
		 * „Manchester City powyżej 0.5 gola" w meczu z Manchesterem United trafiało dawniej
		 * w obie strony przez samo słowo „manchester", więc parser oddawał null i typ znikał
		 * ze statystyki. Teraz wygrywa dopasowanie mocniejsze — pełna nazwa nad jednym słowem.
		 */
		const derby = { homeName: 'Manchester City', awayName: 'Manchester United' };

		assert.deepEqual(
			normalizePick({ market: 'Gole drużyny', selection: 'Manchester City powyżej 0.5 gola', ...derby }),
			{ type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 }
		);
		assert.deepEqual(
			normalizePick({ market: 'Gole drużyny', selection: 'Manchester United powyżej 0.5 gola', ...derby }),
			{ type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 }
		);
	});

	test('prawdziwa dwuznaczność nadal daje null, zamiast zgadywać', () => {
		const derby = { homeName: 'Manchester City', awayName: 'Manchester United' };
		assert.equal(
			normalizePick({ market: 'Gole drużyny', selection: 'Manchester powyżej 0.5 gola', ...derby }),
			null
		);
	});
});
