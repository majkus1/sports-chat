import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Skuteczność wszystkich plakietek modelu — rachunek bez bazy.
 *
 * Pilnujemy, że plakietka liczy się raz, po wyniku z 90 minut; że mecze po dogrywce, odwołane
 * i bez typu nie wchodzą; że obietnica, norma i przewaga liczą się z tych samych plakietek;
 * i że „ostatnie dni" i kubełki kalibracji dzielą zbiór, a nie zmyślają liczb.
 */

setupEnv();
const { summarizeHints } = await import('@/lib/stats/hintAccuracy');

const TERAZ = new Date('2026-10-14T12:00:00Z');
const dni = (n) => new Date(TERAZ.getTime() - n * 86_400_000).toISOString();
let id = 0;
const mecz = ({ key = 'home', p = 70, base = 44, wynik = [2, 0], status = 'FT', kiedy = 1 } = {}) => ({
	fixtureId: String(++id),
	homeName: `H${id}`,
	awayName: `A${id}`,
	kickoff: dni(kiedy),
	hint: { key, selection: `typ ${id}`, probability: p, base },
	result: { home: wynik[0], away: wynik[1], status },
});

describe('bilans plakietek', () => {
	const docs = [
		mecz({ key: 'home', p: 70, base: 44, wynik: [2, 0], kiedy: 2 }), // trafiony
		mecz({ key: 'home', p: 64, base: 44, wynik: [1, 1], kiedy: 3 }), // chybiony
		mecz({ key: 'X2', p: 80, base: 56, wynik: [0, 0], kiedy: 40 }), // trafiony, poza 30 dniami
		mecz({ key: 'awayScores', p: 92, base: 70, wynik: [3, 0], kiedy: 5 }), // chybiony
		mecz({ key: 'home', p: 75, base: 44, wynik: [2, 1], status: 'AET' }), // po dogrywce — poza bilansem
		mecz({ key: 'home', p: 75, base: 44, wynik: [null, null], status: 'PST' }), // przełożony — poza bilansem
		{ ...mecz({ key: 'home' }), hint: { key: null } }, // bez typu — poza bilansem
	];
	const s = summarizeHints(docs, { now: TERAZ });

	test('liczą się tylko rozliczone po 90 minutach, każda raz', () => {
		assert.equal(s.all.settled, 4);
		assert.equal(s.all.won, 2);
		assert.equal(s.all.hitRate, 50);
	});

	test('obietnica, norma i przewaga z tych samych plakietek', () => {
		assert.equal(s.all.promised, Math.round((70 + 64 + 80 + 92) / 4));
		assert.equal(s.all.base, Math.round((44 + 44 + 56 + 70) / 4));
		assert.equal(s.all.edge, s.all.hitRate - s.all.base);
		assert.ok(s.all.interval.low < 50 && s.all.interval.high > 50);
	});

	test('ostatnie 14 dni bez meczu sprzed 40 dni; od kiedy liczymy — najstarszy mecz', () => {
		assert.equal(s.recent.days, 14);
		assert.equal(s.recent.settled, 3);
		assert.equal(s.since, dni(40));
	});

	test('rynki od najliczniejszego, kalibracja w kubełkach procentu', () => {
		assert.deepEqual(s.byMarket.map((r) => [r.key, r.settled]), [['home', 2], ['X2', 1], ['awayScores', 1]]);
		assert.deepEqual(s.calibration.map((k) => [k.bucket, k.settled, k.won]), [['60-69', 1, 0], ['70-79', 1, 1], ['80-89', 1, 1], ['90+', 1, 0]]);
	});

	test('ostatnio rozliczone: od najnowszego, z wynikiem i werdyktem', () => {
		assert.deepEqual(s.last.map((m) => [m.score, m.won]), [['2:0', true], ['1:1', false], ['3:0', false], ['0:0', true]]);
	});

	test('pusty dziennik to pusty bilans, nie błąd', () => {
		const pusty = summarizeHints([], { now: TERAZ });
		assert.equal(pusty.all.settled, 0);
		assert.equal(pusty.since, null);
		assert.deepEqual(pusty.byMarket, []);
	});
});
