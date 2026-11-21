import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Szansa do pokazania (`lib/picks/chance.js`) — część czysta.
 *
 * Pilnujemy reguły z 21.11.2026: model wybiera selekcję, a gdy jest kurs, pokazana szansa pochodzi
 * z kursu po zdjęciu marży i ona sama musi przejść próg polityki; bez kursu zostaje szansa modelu.
 * Przewaga zawsze od normy, nie od rynku. „Goście strzelą" nie przechodzi nigdy.
 */

setupEnv();

const { impliedFromSnapshot, shownChance, confirmWithMarket, confirmMarkets, liveChance, modelChance, ONE_SIDED_MARGIN, CHANCE_SOURCE } =
	await import('@/lib/picks/chance');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');
const { MARKET_CEILING } = await import('@/lib/picks/policy');

const N = (key) => SELECTION_SHAPES[key].normalized;

describe('szanse ze zdjęcia kursów', () => {
	test('1X2 i podwójna szansa z odmarżowanej trójki, kursy jednostronne przez stałą marżę', () => {
		const r = impliedFromSnapshot({ home: 1.8, draw: 3.6, away: 4.5, homeScores: 1.2, awayScores: 1.5, over25: 1.9 });
		assert.ok(Math.abs(r.home + r.draw + r.away - 100) < 0.2, 'trójka sumuje się do stu');
		assert.equal(r['1X'], Number((r.home + r.draw).toFixed(1)));
		assert.equal(r.homeScores, Number((100 / 1.2 / ONE_SIDED_MARGIN).toFixed(1)));
		assert.ok(r.homeScores < 100 / 1.2, 'marża zdjęta — szansa niższa niż 1/kurs');
	});

	test('brak kursów to null, niepełna trójka nie daje 1X2', () => {
		assert.equal(impliedFromSnapshot(null), null);
		assert.equal(impliedFromSnapshot({ bookmakers: 0 }), null);
		const r = impliedFromSnapshot({ home: 1.8, homeScores: 1.2 });
		assert.equal(r.home, null);
		assert.ok(Number.isFinite(r.homeScores));
	});
});

describe('szansa do pokazania', () => {
	test('rynek, gdy jest — z obiema liczbami i źródłem', () => {
		assert.deepEqual(shownChance({ model: 74.4, market: 70.6 }), {
			probability: 71,
			source: CHANCE_SOURCE.market,
			modelProbability: 74,
			marketProbability: 70.6,
		});
	});

	test('bez rynku — model', () => {
		assert.deepEqual(shownChance({ model: 74.4, market: null }), {
			probability: 74,
			source: CHANCE_SOURCE.model,
			modelProbability: 74,
			marketProbability: null,
		});
	});

	test('potwierdzenie: szansa z kursu sama przechodzi próg, przewaga liczona od normy', () => {
		// X2: norma 56,2 → próg 68. Rynek 70% przechodzi, przewaga 70 − 56 = 14.
		const ok = confirmWithMarket({ normalized: N('X2'), model: 75, implied: { X2: 70 } });
		assert.equal(ok.ok, true);
		assert.equal(ok.probability, 70);
		assert.equal(ok.lift, Math.round(70 - 56.2));
		assert.equal(ok.source, CHANCE_SOURCE.market);
		// Rynek 64% — model by przeszedł, ale rynek nie potwierdza.
		const nie = confirmWithMarket({ normalized: N('X2'), model: 75, implied: { X2: 64 } });
		assert.equal(nie.ok, false);
		assert.equal(nie.reason, 'below_min_lift');
	});

	test('sufit rynkowy zostaje', () => {
		const c = confirmWithMarket({ normalized: N('homeScores'), model: 93, implied: { homeScores: MARKET_CEILING } });
		assert.equal(c.ok, false);
		assert.equal(c.reason, 'market_certain');
	});

	test('bez kursu decyduje szansa modelu', () => {
		const c = confirmWithMarket({ normalized: N('home'), model: 66, implied: null });
		assert.equal(c.ok, true);
		assert.equal(c.source, CHANCE_SOURCE.model);
		assert.equal(c.probability, 66);
	});

	test('„goście strzelą" odpada niezależnie od kursu', () => {
		const c = confirmWithMarket({ normalized: N('awayScores'), model: 88, implied: { awayScores: 86 } });
		assert.equal(c.ok, false);
		assert.equal(c.reason, 'market_not_predictable');
	});

	test('norma ligowa (powyżej 2,5) wędruje do progu', () => {
		// Norma 50 → próg 62. Rynek 63 przechodzi; z normą 55 (próg 67) już nie.
		assert.equal(confirmWithMarket({ normalized: N('over25'), model: 66, base: 50, implied: { over25: 63 } }).ok, true);
		assert.equal(confirmWithMarket({ normalized: N('over25'), model: 70, base: 55, implied: { over25: 63 } }).ok, false);
	});
});

describe('selekcje meczu zestawione z kursem', () => {
	const wpis = (key, p, base) => ({ normalized: N(key), probability: p, modelProbability: p, base, lift: p - base, selection: key });

	test('niepotwierdzone wypadają, potwierdzone niosą szansę z kursu, niewycenione zostają z modelem', () => {
		const wynik = confirmMarkets([wpis('home', 66, 43.8), wpis('X2', 75, 56.2), wpis('over25', 66, 50)], { home: 52, X2: 72 });
		assert.deepEqual(
			wynik.map((w) => [w.selection, w.probability, w.chanceSource, w.modelProbability]),
			[
				['X2', 72, 'market', 75],
				['over25', 66, 'model', 66],
			]
		);
	});

	test('bez kursów lista bez zmian', () => {
		const lista = [wpis('home', 66, 43.8)];
		assert.equal(confirmMarkets(lista, null), lista);
	});
});

describe('szansa na żywo i szansa modelu', () => {
	test('na żywo ostrożniejsza z dwóch liczb', () => {
		assert.equal(liveChance(80, 1.4), Math.round(100 / 1.4));
		assert.equal(liveChance(66, 1.4), 66);
		assert.equal(liveChance(66, null), 66);
		assert.equal(liveChance(null, 1.4), null);
	});

	test('szansa modelu zaokrąglona raz; bez czynnej korekty bez zmian', () => {
		assert.equal(modelChance('X2', 74.6), 75);
		assert.equal(modelChance('X2', null), null);
	});
});
