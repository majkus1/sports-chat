import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Doba aplikacji jest polska. Te testy pilnują granic: 22:30 UTC to już jutro w Warszawie
 * latem, a północ warszawska to 22:00 UTC latem i 23:00 UTC zimą. Wszystko przez Intl,
 * więc test sprawdza też, że zmiana czasu liczy się sama.
 */

setupEnv();

const { localDate, localMidnight, localTime, localDatesBetween } = await import('@/lib/time');

describe('doba w czasie polskim', () => {
	test('wieczór UTC to już następny dzień w Warszawie (lato)', () => {
		assert.equal(localDate(new Date('2026-09-17T22:30:00Z')), '2026-09-18');
		assert.equal(localDate(new Date('2026-09-17T21:30:00Z')), '2026-09-17');
	});

	test('zimą granica przesuwa się o godzinę', () => {
		assert.equal(localDate(new Date('2026-12-01T23:30:00Z')), '2026-12-02');
		assert.equal(localDate(new Date('2026-12-01T22:30:00Z')), '2026-12-01');
	});

	test('północ warszawska w UTC — lato i zima', () => {
		assert.equal(localMidnight('2026-09-18').toISOString(), '2026-09-17T22:00:00.000Z');
		assert.equal(localMidnight('2026-12-02').toISOString(), '2026-12-01T23:00:00.000Z');
	});

	test('przesunięcie o doby liczy się w dniach, nie w godzinach UTC', () => {
		// 23:30 UTC 17.09 = 1:30 PL 18.09; „jutro” to 19.09.
		assert.equal(localDate(new Date('2026-09-17T23:30:00Z'), 1), '2026-09-19');
	});

	test('godzina meczu po polsku', () => {
		assert.equal(localTime('2026-09-18T18:30:00Z'), '20:30');
		assert.equal(localTime('2026-09-18T00:30:00+02:00'), '00:30');
	});

	test('zakres dat obejmuje dzień, w którym kończy się okno — także po przekroczeniu doby UTC', () => {
		// Od 20:00 UTC 17.09 (22:00 PL) przez 72 h: PL 17, 18, 19, 20.09.
		const dni = localDatesBetween(Date.parse('2026-09-17T20:00:00Z'), Date.parse('2026-09-20T20:00:00Z'));
		assert.deepEqual(dni, ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20']);
	});

	test('zakres, który zaczyna się po 22:00 UTC, zaczyna się od jutra po polsku', () => {
		const dni = localDatesBetween(Date.parse('2026-09-17T22:30:00Z'), Date.parse('2026-09-18T10:00:00Z'));
		assert.deepEqual(dni, ['2026-09-18']);
	});
});
