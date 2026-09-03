import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Model liczbowy w analizie pojedynczego meczu — część czysta, bez sieci i bez bazy.
 *
 * Testy pilnują, że liczby w analizie pochodzą z rachunku, a nie z modelu językowego:
 * że szanse 1X2 sumują się do stu, że selekcje mają normę i przewagę zgodne z polityką
 * typów, że nieznana drużyna nie dostaje prognozy, że mecz w trakcie liczy się względem
 * przeciętnej pary w tej samej sytuacji — i że odpowiedź modelu językowego zostaje
 * po fakcie sprowadzona do tych liczb.
 */

setupEnv();

const { buildAnalysisModel, bindAnalysisToModel, formatModelSection, toPercentTriple } =
	await import('@/lib/analysis/model');
const { meetsPolicy, BASE_RATES } = await import('@/lib/picks/policy');
// Wersja z modułu, nie wpisana na sztywno — inaczej każdy jej podbicie wywraca testy,
// które o wersję wcale nie pytają.
const { MODEL_VERSION } = await import('@/lib/model');

/**
 * Dopasowany model ligi w kształcie, jakiego używa `expectedGoals`: mapa ocen drużyn,
 * wyraz wolny, przewaga boiska i korekta niskobramkowa. Drużyna 1 mocna, 2 słaba.
 */
const liga = {
	teams: new Map([
		[1, { attack: 0.3, defence: 0.3 }],
		[2, { attack: -0.3, defence: -0.3 }],
	]),
	intercept: Math.log(1.3),
	homeAdvantage: 0.25,
	rho: -0.1,
	matchesUsed: 400,
};

function mecz({ homeId = 1, awayId = 2, live = false, elapsed = null, goals = null } = {}) {
	return {
		teams: {
			home: { id: homeId, name: 'Machida Zelvia' },
			away: { id: awayId, name: 'Kawasaki Frontale' },
		},
		status: { isLive: live, elapsed },
		goals: goals ?? { home: null, away: null },
		league: { id: 98, season: 2026 },
	};
}

describe('prognoza przed meczem', () => {
	const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz() });

	test('powstaje dla pary znanej modelowi', () => {
		assert.ok(model);
		assert.equal(model.inPlay, false);
		assert.equal(model.version, MODEL_VERSION);
	});

	test('szanse 1X2 to liczby całkowite sumujące się do stu', () => {
		const { home, draw, away } = model.probabilities;
		assert.equal(home + draw + away, 100);
		for (const v of [home, draw, away]) assert.ok(Number.isInteger(v));
	});

	test('wyraźny faworyt u siebie dostaje wysoką szansę wygranej', () => {
		assert.ok(model.probabilities.home > 60, `wyszło ${model.probabilities.home}`);
	});

	test('każda selekcja ma normę z tabeli i przewagę zgodną z polityką', () => {
		for (const s of model.selections) {
			assert.equal(Number.isFinite(s.probability), true);
			assert.equal(s.lift, Math.round(s.probability - s.base));
			assert.equal(s.eligible, meetsPolicy(s.normalized, s.probability, { base: s.base }).ok);
		}
		const home = model.selections.find((s) => s.key === 'home');
		assert.equal(home.base, BASE_RATES.matchWinner.home);
	});

	test('wygrana faworyta jest kandydatem, a jego gol — nie, bo to norma', () => {
		const home = model.selections.find((s) => s.key === 'home');
		const homeScores = model.selections.find((s) => s.key === 'homeScores');

		assert.equal(home.eligible, true);
		// Mocny gospodarz strzela niemal zawsze, ale tak samo niemal zawsze strzela każdy gospodarz.
		assert.equal(homeScores.eligible, homeScores.lift >= 12 && homeScores.probability >= 60);
	});

	test('nieznana drużyna nie dostaje prognozy', () => {
		assert.equal(buildAnalysisModel({ leagueModel: liga, fixture: mecz({ awayId: 99 }) }), null);
	});

	test('bez modelu ligi nie ma prognozy', () => {
		assert.equal(buildAnalysisModel({ leagueModel: null, fixture: mecz() }), null);
	});
});

describe('prognoza w trakcie meczu', () => {
	test('prowadzenie 2:0 w 85. minucie to pewna wygrana, ale NIE typ — norma jest równie pewna', () => {
		const model = buildAnalysisModel({
			leagueModel: liga,
			fixture: mecz({ live: true, elapsed: 85, goals: { home: 2, away: 0 } }),
		});
		const home = model.selections.find((s) => s.key === 'home');

		assert.equal(model.inPlay, true);
		assert.deepEqual(model.score, { home: 2, away: 0 });
		assert.ok(home.probability >= 95, `wyszło ${home.probability}`);
		assert.ok(home.base >= 90, 'przeciętna para przy 2:0 w 85. minucie też prawie na pewno wygrywa');
		assert.equal(home.eligible, false);
	});

	test('gol, który już padł, ma sto procent i zerową przewagę', () => {
		const model = buildAnalysisModel({
			leagueModel: liga,
			fixture: mecz({ live: true, elapsed: 30, goals: { home: 1, away: 0 } }),
		});
		const homeScores = model.selections.find((s) => s.key === 'homeScores');

		assert.equal(homeScores.probability, 100);
		assert.equal(homeScores.lift, 0);
		assert.equal(homeScores.eligible, false);
	});

	test('brak minuty w trwającym meczu to jego początek, nie błąd', () => {
		const model = buildAnalysisModel({
			leagueModel: liga,
			fixture: mecz({ live: true, elapsed: null, goals: { home: 0, away: 0 } }),
		});

		assert.equal(model.minute, 0);
	});
});

describe('sekcja promptu', () => {
	test('oznacza kandydatów i podaje normę z przewagą przy każdej selekcji', () => {
		const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz() });
		const tekst = formatModelSection(model).join('\n');

		assert.match(tekst, /PROGNOZA MODELU LICZBOWEGO/);
		assert.match(tekst, /Wynik meczu \/ Machida Zelvia \(gospodarze\): \d+% \(norma 43\.8%, \+\d+ pkt\) — KANDYDAT NA TYP/);
		assert.match(tekst, /przepisz DOKŁADNIE do "probabilities"/);
	});

	test('bez kandydatów każe zostawić pustą tablicę', () => {
		const model = buildAnalysisModel({
			leagueModel: liga,
			fixture: mecz({ live: true, elapsed: 85, goals: { home: 2, away: 0 } }),
		});
		const tekst = formatModelSection(model).join('\n');

		assert.equal(model.selections.some((s) => s.eligible), false);
		assert.match(tekst, /zostaw "picks" pustą tablicą/);
		assert.match(tekst, /Stan: 2:0 w 85\. minucie/);
	});

	test('bez modelu nie ma sekcji', () => {
		assert.deepEqual(formatModelSection(null), []);
	});
});

describe('wiązanie odpowiedzi z modelem', () => {
	const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz() });
	const names = { homeName: 'Machida Zelvia', awayName: 'Kawasaki Frontale' };
	const home = model.selections.find((s) => s.key === 'home');

	test('szanse 1X2 i procent typu wracają do wartości modelu', () => {
		const odpowiedz = {
			summary: '…',
			probabilities: { home: 50, draw: 30, away: 20 },
			picks: [
				{ market: 'Wynik meczu', selection: 'Machida Zelvia (gospodarze)', probability: 64, confidence: 70, rationale: '…' },
			],
		};
		const zwiazane = bindAnalysisToModel(odpowiedz, model, names);

		assert.deepEqual(zwiazane.probabilities, model.probabilities);
		assert.equal(zwiazane.picks[0].probability, home.probability);
		assert.equal(zwiazane.picks[0].baseRate, home.base);
		assert.equal(zwiazane.picks[0].lift, home.lift);
		assert.equal(zwiazane.model.version, MODEL_VERSION);
	});

	test('selekcja napisana po swojemu i tak trafia do właściwego wpisu', () => {
		const zwiazane = bindAnalysisToModel(
			{ picks: [{ market: 'Podwójna szansa', selection: 'Machida Zelvia lub remis', probability: 70 }] },
			model,
			names
		);
		const wpis = model.selections.find((s) => s.key === '1X');

		assert.equal(zwiazane.picks[0].probability, wpis.probability);
	});

	test('typ spoza rachunku zostaje z własnym procentem', () => {
		const zwiazane = bindAnalysisToModel(
			{ picks: [{ market: 'Suma goli', selection: 'Powyżej 2.5', probability: 70 }] },
			model,
			names
		);

		assert.equal(zwiazane.picks[0].probability, 70);
		assert.equal(zwiazane.picks[0].baseRate, undefined);
	});

	test('bez modelu odpowiedź wraca nietknięta', () => {
		const odpowiedz = { probabilities: { home: 50, draw: 30, away: 20 }, picks: [] };
		assert.equal(bindAnalysisToModel(odpowiedz, null, names), odpowiedz);
	});
});

describe('zaokrąglanie do stu', () => {
	test('największe reszty dostają brakujące punkty', () => {
		// 33,4 / 33,3 / 33,3 → podłogi 33/33/33 = 99, brakujący punkt idzie do największej reszty.
		assert.deepEqual(toPercentTriple({ home: 0.334, draw: 0.333, away: 0.333 }), { home: 34, draw: 33, away: 33 });
	});

	test('suma zawsze wynosi sto', () => {
		for (const [h, d] of [[0.5, 0.25], [0.618, 0.2], [0.05, 0.05], [0.999, 0.0005]]) {
			const t = toPercentTriple({ home: h, draw: d, away: 1 - h - d });
			assert.equal(t.home + t.draw + t.away, 100, `${h}/${d}`);
		}
	});
});

describe('sufit rynkowy w analizie', () => {
	// Ułamki celowo: liczby modelu są całkowite, więc „95.3" w tekście oznaczałoby wyciek.
	const pewne = { home: 95.3, draw: 2.7, away: 2, '1X': 98, X2: 4.7, homeScores: 97.1, awayScores: 55 };

	test('selekcja pewna dla rynku traci status kandydata, ale zostaje na liście z powodem', () => {
		const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz(), implied: pewne });
		const home = model.selections.find((s) => s.key === 'home');

		assert.equal(home.eligible, false);
		assert.equal(home.reason, 'market_certain');
		assert.equal(home.marketProbability, 95.3);
	});

	test('model językowy nie widzi rynku — tylko słowo „oczywiste"', () => {
		const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz(), implied: pewne });
		const tekst = formatModelSection(model).join('\n');

		assert.match(tekst, /zbyt oczywiste/);
		assert.doesNotMatch(tekst, /rynek|kurs|bukmach|95\.3|97\.1/i);
	});

	test('w trakcie meczu kursy przedmeczowe są ignorowane', () => {
		const model = buildAnalysisModel({
			leagueModel: liga,
			fixture: mecz({ live: true, elapsed: 20, goals: { home: 0, away: 0 } }),
			implied: pewne,
		});

		for (const s of model.selections) assert.equal(s.marketProbability, null);
	});

	test('liczba rynkowa nie trafia do sekcji zapisywanych przy analizie', () => {
		const implied = { home: 60, draw: 22, away: 18, '1X': 82, X2: 40, homeScores: 80, awayScores: 70 };
		const model = buildAnalysisModel({ leagueModel: liga, fixture: mecz(), implied });
		const zwiazane = bindAnalysisToModel(
			{ picks: [{ market: 'Wynik meczu', selection: 'Machida Zelvia (gospodarze)', probability: 64 }] },
			model,
			{ homeName: 'Machida Zelvia', awayName: 'Kawasaki Frontale' }
		);

		assert.equal('marketProbability' in zwiazane.picks[0], false);
		assert.equal('marketProbability' in zwiazane.model, false);
	});
});
