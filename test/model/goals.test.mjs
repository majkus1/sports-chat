import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Rynek „powyżej 2,5" na produkcji — zbieracz strzałów (część czysta) i cały łańcuch
 * `predictFixture → over25` na syntetycznej lidze, bez klucza API i bez bazy.
 *
 * Łańcuch idzie w procesie potomnym z atrapą endpointów (jak test dymny backtestu), bo
 * `lib/model` czyta terminarz przez `@/lib/football/endpoints`, a podmienić moduł można
 * tylko loaderem. Bez bazy zapytanie o strzały pada od razu i ma zostać przełknięte —
 * wtedy działa wariant `goals`. To jest dokładnie stan produkcji w pierwszą noc po
 * wdrożeniu, zanim zbieracz cokolwiek pobierze.
 */

setupEnv();

const { parseShots, neededFixtures } = await import('@/lib/model/fixtureStats');
const { WINDOW } = await import('@/lib/model/goalsCalibration');

describe('strzały z odpowiedzi dostawcy', () => {
	const raw = [
		{ team: { id: 10 }, statistics: [{ type: 'Total Shots', value: 14 }, { type: 'Shots on Goal', value: 6 }, { type: 'Ball Possession', value: '61%' }] },
		{ team: { id: 20 }, statistics: [{ type: 'Total Shots', value: '9' }, { type: 'Shots on Goal', value: null }] },
	];

	test('przypisuje po identyfikatorze drużyny, nie po kolejności', () => {
		assert.deepEqual(parseShots(raw, { homeId: 20, awayId: 10 }), { hs: 9, hst: null, as: 14, ast: 6 });
	});

	test('brak statystyk to same null — rekord i tak powstaje', () => {
		assert.deepEqual(parseShots([], { homeId: 1, awayId: 2 }), { hs: null, as: null, hst: null, ast: null });
		assert.deepEqual(parseShots(null, { homeId: 1, awayId: 2 }), { hs: null, as: null, hst: null, ast: null });
	});
});

describe('które mecze pobierać', () => {
	test('ostatnie WINDOW + 2 mecze każdej drużyny, nic starszego', () => {
		// Dwie drużyny grają ze sobą 30 razy, od najnowszego.
		const rows = Array.from({ length: 30 }, (_, i) => ({ fixtureId: String(i), homeId: 1, awayId: 2, date: new Date(2026, 0, 30 - i) }));
		const wybrane = neededFixtures(rows);
		assert.equal(wybrane.length, WINDOW + 2);
		assert.equal(wybrane[0].fixtureId, '0', 'najnowszy pierwszy');
	});

	test('mecz wchodzi, gdy potrzebuje go choć jedna z drużyn', () => {
		const rows = [
			...Array.from({ length: WINDOW + 2 }, (_, i) => ({ fixtureId: `a${i}`, homeId: 1, awayId: 2, date: new Date(2026, 1, 28 - i) })),
			// Starszy mecz drużyny 1 z drużyną 3 — drużyna 1 ma już komplet, ale 3 nie.
			{ fixtureId: 'stary', homeId: 1, awayId: 3, date: new Date(2025, 0, 1) },
		];
		assert.ok(neededFixtures(rows).some((m) => m.fixtureId === 'stary'));
	});
});

describe('łańcuch predictFixture → powyżej 2,5 na syntetycznej lidze', () => {
	const wynik = spawnSync(
		process.execPath,
		[
			'--no-experimental-detect-module',
			'--experimental-loader',
			'./test/helpers/alias.mjs',
			'--experimental-loader',
			'./test/helpers/stubLoader.mjs',
			'test/model/goalsSmoke.script.mjs',
		],
		{ cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 }
	);
	const linia = `${wynik.stdout || ''}`.split('\n').find((l) => l.startsWith('{'));

	test('skrypt dochodzi do końca i oddaje prognozę', () => {
		assert.equal(wynik.status, 0, `${wynik.stderr}`.slice(-800));
		assert.ok(linia, 'brak wiersza JSON w wyjściu');
	});

	test('rynek powstaje w wariancie goals z normą ligową, gdy strzałów jeszcze nie ma', () => {
		const dane = JSON.parse(linia);
		assert.equal(dane.modelVersion, 'dixon-coles/4');
		assert.ok(dane.over25, 'brak over25');
		assert.equal(dane.over25.variant, 'goals');
		assert.ok(dane.over25.probability > 0 && dane.over25.probability < 1);
		assert.ok(dane.over25.base > 0.3 && dane.over25.base < 0.8, `norma ligowa ${dane.over25.base}`);
	});

	test('skalibrowana prognoza trzyma się blisko normy w losowej lidze', () => {
		// Syntetyczne wyniki nie niosą sygnału pod gole, więc regresja ma zostać przy stałej.
		const dane = JSON.parse(linia);
		assert.ok(Math.abs(dane.over25.probability - dane.over25.base) < 0.12);
	});
});
