import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Sprawdzian nowej ligi (`lib/model/leagueCheck.js`) — na ligach syntetycznych, bez sieci.
 *
 * Pilnujemy dwóch rzeczy, od których zależy, czy do produkcji wejdzie dobra liga, a zła nie:
 * liga z prawdziwymi różnicami sił PRZECHODZI, a liga, w której wynik to rzut monetą (wszystkie
 * drużyny równe), ODPADA — model nie może „wygrać" z częstościami na szumie. Do tego progi
 * werdyktu: za mało meczów, przewaga w szumie, typy przesadzające z procentem.
 */

setupEnv();
const { evaluateLeague, verdict, GATE } = await import('@/lib/model/leagueCheck');

/** Powtarzalny generator (mulberry32) — test nie może raz przechodzić, a raz nie. */
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poisson(lambda, los) {
	const L = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= los();
	} while (p > L);
	return k - 1;
}

/** Trzy sezony ligi 16 drużyn, każdy z każdym dwa razy; `rozrzut` = różnice sił (0 — wszyscy równi). */
function liga({ rozrzut, seed }) {
	const los = rng(seed);
	const sila = Array.from({ length: 16 }, (_, i) => rozrzut * ((i - 7.5) / 7.5));
	const mecze = [];
	let dzien = Date.parse('2023-08-01');
	for (let sezon = 0; sezon < 3; sezon += 1) {
		for (let kolejka = 0; kolejka < 2; kolejka += 1) {
			for (let i = 0; i < 16; i += 1) {
				for (let j = 0; j < 16; j += 1) {
					if (i === j) continue;
					dzien += 0.7 * 86_400_000;
					mecze.push({
						date: new Date(dzien).toISOString(),
						homeId: i,
						awayId: j,
						homeGoals: poisson(Math.exp(0.25 + sila[i] - sila[j] + 0.1), los),
						awayGoals: poisson(Math.exp(0.15 + sila[j] - sila[i]), los),
					});
				}
			}
		}
	}
	return mecze;
}

describe('sprawdzian nowej ligi', () => {
	const split = new Date('2025-06-01');

	test('liga z różnicami sił przechodzi; model bije częstości tej ligi istotnie', () => {
		const r = evaluateLeague(liga({ rozrzut: 0.6, seed: 7 }), { leagueId: 999001, split });
		assert.ok(r.n >= GATE.minMatches, `n = ${r.n}`);
		assert.ok(r.gain > 0 && r.t >= GATE.minT, `zysk ${r.gain}, t ${r.t}`);
		assert.equal(r.pass, true, r.reason);
		assert.ok(r.picks > 0);
	});

	test('liga „rzut monetą" (wszyscy równi) odpada — brak przewagi odróżnialnej od szumu', () => {
		const r = evaluateLeague(liga({ rozrzut: 0, seed: 11 }), { leagueId: 999002, split });
		assert.equal(r.pass, false);
	});

	test('progi werdyktu: mało meczów, szum, przesadzone typy; mało typów nie blokuje', () => {
		const dobra = { n: 300, coverage: 0.9, gain: 0.04, t: 3, picks: 120, promised: 76, hit: 74 };
		assert.equal(verdict(dobra).pass, true);
		assert.equal(verdict({ ...dobra, n: 100 }).pass, false);
		assert.equal(verdict({ ...dobra, coverage: 0.4 }).pass, false);
		assert.equal(verdict({ ...dobra, gain: -0.01 }).pass, false);
		assert.equal(verdict({ ...dobra, t: 1.2 }).pass, false);
		assert.equal(verdict({ ...dobra, hit: 68 }).pass, false);
		const malo = verdict({ ...dobra, picks: 12, hit: 50 });
		assert.equal(malo.pass, true);
		assert.match(malo.reason, /mało typów/);
	});
});
