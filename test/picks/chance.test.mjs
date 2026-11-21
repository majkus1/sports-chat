import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Szansa do pokazania (`lib/picks/chance.js`) — część czysta.
 *
 * Pilnujemy reguły z 21.11.2026: model wybiera selekcję, a gdy jest kurs, typ powstaje tylko wtedy,
 * gdy próg przechodzi też szansa z kursu po zdjęciu marży. Pokazana liczba — z kursu przy „1", „X2"
 * i „powyżej 2,5", z modelu przy „2", „1X" i „gospodarze strzelą" (tabela sprawdzianu po czasie);
 * przy niezgodzie ostrożniejsza z dwóch. Przewaga zawsze od normy, nie od rynku. „Goście strzelą"
 * nie przechodzi nigdy; „gospodarze strzelą" zna tylko sufit (próg 91% leży nad sufitem 90%).
 */

setupEnv();

const { impliedFromSnapshot, confirmWithMarket, confirmMarkets, liveChance, modelChance, selectionKeyFor, ONE_SIDED_MARGIN, CHANCE_SOURCE, MARKET_CHANCE_KEYS, CONFIRMATION_EXEMPT_KEYS } =
	await import('@/lib/picks/chance');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');
const { MARKET_CEILING, entryThresholdFor } = await import('@/lib/picks/policy');

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
	test('tabela źródeł: kurs przy „1", „X2", +2,5; model przy „2", „1X", golu gospodarzy', () => {
		assert.deepEqual([...MARKET_CHANCE_KEYS].sort(), ['X2', 'home', 'over25']);
		assert.deepEqual([...CONFIRMATION_EXEMPT_KEYS], ['homeScores']);
		// Gol gospodarzy: próg 91% nad sufitem 90% — potwierdzenia kursem nie da się spełnić z definicji.
		assert.ok(entryThresholdFor(N('homeScores')) > MARKET_CEILING);
		for (const key of Object.keys(SELECTION_SHAPES)) assert.equal(selectionKeyFor(N(key)), key);
	});

	test('potwierdzenie: próg przechodzą obie liczby, przy X2 pokazujemy kurs, przewaga od normy', () => {
		// X2: norma 56,2 → próg 68. Model 75, rynek 70 — potwierdzone, pokazana 70, przewaga 70 − 56 = 14.
		const ok = confirmWithMarket({ normalized: N('X2'), model: 75, implied: { X2: 70 } });
		assert.equal(ok.ok, true);
		assert.equal(ok.confirmed, true);
		assert.equal(ok.probability, 70);
		assert.equal(ok.lift, Math.round(70 - 56.2));
		assert.equal(ok.source, CHANCE_SOURCE.market);
		assert.equal(ok.modelProbability, 75);
		assert.equal(ok.marketProbability, 70);
	});

	test('potwierdzony „2" i „1X" pokazują szansę modelu — kurs obok do zapisu', () => {
		const dwojka = confirmWithMarket({ normalized: N('away'), model: 72, implied: { away: 66.4 } });
		assert.deepEqual([dwojka.ok, dwojka.confirmed, dwojka.probability, dwojka.source, dwojka.marketProbability], [true, true, 72, 'model', 66.4]);
		const jedenX = confirmWithMarket({ normalized: N('1X'), model: 86, implied: { '1X': 84 } });
		assert.deepEqual([jedenX.ok, jedenX.probability, jedenX.source], [true, 86, 'model']);
	});

	test('niezgoda: typ odpada, a wiersz dostaje ostrożniejszą liczbę z jej werdyktem', () => {
		// Model 75, rynek 64 — rynek nie przechodzi progu 68 X2.
		const nie = confirmWithMarket({ normalized: N('X2'), model: 75, implied: { X2: 64 } });
		assert.deepEqual([nie.ok, nie.confirmed, nie.probability, nie.source, nie.reason], [false, false, 64, 'market', 'below_min_lift']);
		// „2": model 70, rynek 50 — zapasowy z tego wiersza nie obieca 70% (takie trafiały 40–44%).
		const dwojka = confirmWithMarket({ normalized: N('away'), model: 70, implied: { away: 50 } });
		assert.deepEqual([dwojka.ok, dwojka.probability, dwojka.source], [false, 50, 'market']);
		// Model pod progiem, rynek nad nim — model wybiera, więc typu nie ma; liczba ostrożniejsza (model).
		const slabyModel = confirmWithMarket({ normalized: N('home'), model: 58, implied: { home: 66 } });
		assert.deepEqual([slabyModel.ok, slabyModel.probability, slabyModel.source], [false, 58, 'model']);
	});

	test('sufit rynkowy zostaje — także przy golu gospodarzy, który zna tylko sufit', () => {
		const c = confirmWithMarket({ normalized: N('homeScores'), model: 92, implied: { homeScores: MARKET_CEILING } });
		assert.deepEqual([c.ok, c.reason], [false, 'market_certain']);
		const g1 = confirmWithMarket({ normalized: N('homeScores'), model: 91, implied: { homeScores: 87.5 } });
		assert.deepEqual([g1.ok, g1.confirmed, g1.probability, g1.source], [true, true, 91, 'model']);
		const x2 = confirmWithMarket({ normalized: N('X2'), model: 80, implied: { X2: 91 } });
		assert.deepEqual([x2.ok, x2.reason], [false, 'market_certain']);
	});

	test('bez kursu decyduje szansa modelu, bez potwierdzenia', () => {
		const c = confirmWithMarket({ normalized: N('home'), model: 66, implied: null });
		assert.deepEqual([c.ok, c.confirmed, c.source, c.probability], [true, false, CHANCE_SOURCE.model, 66]);
		const dostawca = confirmWithMarket({ normalized: N('home'), model: 66, implied: null, modelSource: CHANCE_SOURCE.provider });
		assert.equal(dostawca.source, 'provider');
	});

	test('„goście strzelą" odpada niezależnie od kursu', () => {
		const c = confirmWithMarket({ normalized: N('awayScores'), model: 88, implied: { awayScores: 86 } });
		assert.equal(c.ok, false);
		assert.equal(c.reason, 'market_not_predictable');
	});

	test('norma ligowa (powyżej 2,5) wędruje do progu obu liczb', () => {
		// Norma 50 → próg 62. Model 66, rynek 63 — przechodzi, pokazany kurs; z normą 55 (próg 67) już nie.
		const ok = confirmWithMarket({ normalized: N('over25'), model: 66, base: 50, implied: { over25: 63 } });
		assert.deepEqual([ok.ok, ok.probability, ok.source], [true, 63, 'market']);
		assert.equal(confirmWithMarket({ normalized: N('over25'), model: 70, base: 55, implied: { over25: 63 } }).ok, false);
	});
});

describe('selekcje meczu zestawione z kursem', () => {
	const wpis = (key, p, base) => ({ normalized: N(key), probability: p, modelProbability: p, base, lift: p - base, selection: key });

	test('niepotwierdzone wypadają, potwierdzone niosą liczbę z tabeli i potwierdzenie, niewycenione zostają z modelem', () => {
		const wynik = confirmMarkets(
			[wpis('home', 66, 43.8), wpis('X2', 75, 56.2), wpis('away', 72, 30.7), wpis('over25', 66, 50)],
			{ home: 52, X2: 72, away: 66 }
		);
		assert.deepEqual(
			wynik.map((w) => [w.selection, w.probability, w.chanceSource, w.modelProbability, w.chanceConfirmed]),
			[
				['X2', 72, 'market', 75, true],
				['away', 72, 'model', 72, true],
				['over25', 66, 'model', 66, false],
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
