import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Generator kuponu live — część czysta i pamięć wyniku (bez sieci i bez zapisu do bazy).
 *
 * Pilnujemy: odczytu kursów live (zawieszone pomijane), szans modelu przy stanie meczu,
 * okna minut, weta za czerwoną kartkę, zgody modelu z rynkiem, składania kuponu ~2,0
 * i pojedynczego typu, a na końcu — że wynik jest wspólny przez 3 minuty.
 */

setupEnv();
const {
	liveOddsFromRow,
	liveModelMarkets,
	liveMinuteOk,
	legVeto,
	liveSelections,
	buildLiveCoupon,
	bestLiveSingle,
	lambdasFromOdds,
	liveLeagueOk,
	LIVE_COUPON,
} = await import('@/lib/live/select');
const { predictMarkets } = await import('@/lib/model/dixonColes');
const { getLiveCoupon, lockedLiveDto } = await import('@/lib/live/service');

describe('kursy na żywo', () => {
	test('1X2, podwójna szansa i linia 2,5 gola; zawieszone kursy pomijane', () => {
		const row = {
			odds: [
				{ name: 'Fulltime Result', values: [{ value: 'Home', odd: '1.045' }, { value: 'Draw', odd: '11' }, { value: 'Away', odd: '26', suspended: true }] },
				{ name: 'Double Chance', values: [{ value: 'Home or Draw', odd: '1.01' }, { value: 'Away or Draw', odd: '8.5' }] },
				{ name: 'Match Goals', values: [{ value: 'Over', odd: '1.30', handicap: '2.5' }, { value: 'Over', odd: '2.1', handicap: '5.5' }] },
			],
		};
		assert.deepEqual(liveOddsFromRow(row), { home: 1.04, away: null, '1X': 1.01, X2: 8.5, over25: 1.3, homeScores: null, awayScores: null });
	});
});

describe('model w trakcie meczu', () => {
	test('prowadzenie 2:0 w 75. minucie — wygrana gospodarzy bardzo prawdopodobna, gol gospodarzy pewny', () => {
		const m = liveModelMarkets({ lambdaHome: 1.5, lambdaAway: 1.1, homeGoals: 2, awayGoals: 0, minute: 75 });
		assert.ok(m.home > 0.9 && m.home < 1);
		assert.ok(m.homeScores > 0.999);
		assert.ok(m['1X'] >= m.home);
	});

	test('okno minut 10–80 i tylko trwająca gra', () => {
		assert.equal(liveMinuteOk('1H', 9), false);
		assert.equal(liveMinuteOk('2H', 64), true);
		assert.equal(liveMinuteOk('HT', 45), true);
		assert.equal(liveMinuteOk('2H', 81), false);
		assert.equal(liveMinuteOk('FT', 90), false);
	});
});

describe('wybór typów', () => {
	test('czerwona kartka odcina typy na drużynę w osłabieniu, nie na gole', () => {
		assert.equal(legVeto('home', { home: 1, away: 0 }), true);
		assert.equal(legVeto('X2', { home: 1, away: 0 }), false);
		assert.equal(legVeto('over25', { home: 1, away: 1 }), false);
	});

	test('rynek co najmniej tak pewny jak my: wyliczenie najwyżej 3 pkt powyżej i 15 pkt poniżej rynku', () => {
		const s = liveSelections({
			odds: { home: 1.1, away: 3.0, over25: 1.25, '1X': 1.05, X2: 2.0 },
			model: { home: 0.9, away: 0.2, over25: 0.7, '1X': 0.7, X2: 0.6 },
		});
		// home: rynek 91%, my 90% ✓; away: 33% / 20% ✓ (rynek pewniejszy o 13); over25: 80% / 70% ✓;
		// 1X: 95% / 70% ✗ (rynek pewniejszy o 25 — widzi coś, czego my nie); X2: 50% / 60% ✗ (my pewniejsi o 10)
		assert.deepEqual(s.map((x) => x.key), ['home', 'away', 'over25']);
	});

	const k = (id, model, odds, key = 'home') => ({ fixtureId: String(id), key, model, odds, market: Math.round(100 / odds) });

	test('kupon ~2,0 z typów 1,05–1,40, od najpewniejszego, jeden typ na mecz', () => {
		const kupon = buildLiveCoupon([k(1, 95, 1.06), k(1, 94, 1.08, 'X2'), k(2, 90, 1.2), k(3, 88, 1.3), k(4, 86, 1.35), k(5, 60, 1.9)]);
		assert.ok(kupon.totalOdds >= LIVE_COUPON.target && kupon.totalOdds <= LIVE_COUPON.max);
		assert.equal(new Set(kupon.legs.map((l) => l.fixtureId)).size, kupon.legs.length);
		assert.ok(kupon.legs.every((l) => l.odds < 1.4));
	});

	test('bez kuponu — najlepszy pojedynczy typ (kurs 1,30–2,10, najwyższa szansa); bez niego nic', () => {
		assert.equal(buildLiveCoupon([k(1, 95, 1.06)]), null);
		const pojedynczy = bestLiveSingle([k(1, 95, 1.06), k(2, 58, 1.6), k(3, 55, 1.7), k(4, 40, 2.6)]);
		assert.equal(pojedynczy.fixtureId, '2');
		assert.equal(bestLiveSingle([k(1, 50, 2.6), k(2, 95, 1.06)]), null);
	});
});

describe('ligi poza modelem', () => {
	test('oczekiwane gole z kursów sprzed meczu odtwarzają szanse rynku', () => {
		// Faworyt gospodarzy: 1,55 / 4,20 / 5,80, powyżej 2,5 po 1,80.
		const l = lambdasFromOdds({ home: 1.55, draw: 4.2, away: 5.8, over25: 1.8 });
		assert.ok(l.lambdaHome > l.lambdaAway);
		const m = predictMarkets(l.lambdaHome, l.lambdaAway);
		const suma = 1 / 1.55 + 1 / 4.2 + 1 / 5.8;
		assert.ok(Math.abs(m.matchWinner.home - 1 / 1.55 / suma) < 0.02);
		assert.ok(Math.abs(m.matchWinner.away - 1 / 5.8 / suma) < 0.02);
		assert.equal(lambdasFromOdds({ home: 1.5, over25: 1.8 }), null);
		assert.equal(lambdasFromOdds(null), null);
	});

	test('bez młodzieży, kobiet, rezerw i sparingów', () => {
		assert.equal(liveLeagueOk('First Amateur Division'), true);
		assert.equal(liveLeagueOk('Serie B'), true);
		assert.equal(liveLeagueOk('UEFA Youth League'), false);
		assert.equal(liveLeagueOk('Premier League U21'), false);
		assert.equal(liveLeagueOk('Liga F Women'), false);
		assert.equal(liveLeagueOk('Club Friendlies'), false);
		assert.equal(liveLeagueOk(null), false);
	});

	test('źródło „market" — ta sama zgoda co model, z oznaczeniem źródła', () => {
		const odds = { home: 1.2, away: 3.0 }; // rynek 83% i 33%
		const model = { home: 0.86, away: 0.45 }; // +3 pkt ✓, +12 pkt ✗
		assert.deepEqual(liveSelections({ odds, model, source: 'market' }).map((x) => x.key), ['home']);
		assert.deepEqual(liveSelections({ odds, model }).map((x) => x.key), ['home']);
		assert.equal(liveSelections({ odds, model, source: 'market' })[0].source, 'market');
	});
});

describe('wspólny wynik', () => {
	test('kolejne pytanie w ciągu 3 minut nie liczy od nowa; zapowiedź bez meczów', async () => {
		let liczen = 0;
		const compute = async ({ now }) => {
			liczen += 1;
			return { generatedAt: now.toISOString(), analyzed: 3, withOdds: 2, aiChecked: true, mode: 'none', coupon: null, single: null, rejected: [] };
		};
		const t0 = new Date('2099-01-01T12:00:00Z');
		await getLiveCoupon({ now: t0, compute });
		await getLiveCoupon({ now: new Date(t0.getTime() + 60_000), compute });
		assert.equal(liczen, 1);
		await getLiveCoupon({ now: new Date(t0.getTime() + 4 * 60_000), compute });
		assert.equal(liczen, 2);

		const zapowiedz = lockedLiveDto({
			generatedAt: 'x',
			analyzed: 5,
			mode: 'coupon',
			coupon: { totalOdds: 2.1, chance: 48, legs: [{ fixtureId: '1' }, { fixtureId: '2' }] },
		});
		assert.deepEqual(zapowiedz, { locked: true, generatedAt: 'x', analyzed: 5, mode: 'coupon', totalOdds: 2.1, chance: 48, legsCount: 2 });
	});
});
