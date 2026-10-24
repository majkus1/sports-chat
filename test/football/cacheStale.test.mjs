import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Zapas przy awarii API — dane na żywo nie mogą wracać sprzed godzin.
 *
 * 24.10.2026 generator kuponu live liczył na kursach live sprzed wielu godzin (inne mecze),
 * bo przy przekroczonym limicie czasu cache oddawał kopię z dobowym zapasem.
 */

setupEnv();
const { staleUsable, LIVE_CACHE } = await import('@/lib/football/cache');

describe('zapas cache przy awarii API', () => {
	const teraz = Date.parse('2099-01-01T12:00:00Z');
	test('dane na żywo: kopia do 2 minut po terminie tak, starsza nie', () => {
		assert.equal(staleUsable({ expiresAt: teraz - 60_000 }, teraz, LIVE_CACHE.maxStaleSeconds), true);
		assert.equal(staleUsable({ expiresAt: teraz - 3 * 60_000 }, teraz, LIVE_CACHE.maxStaleSeconds), false);
		assert.equal(staleUsable({ expiresAt: teraz - 5 * 3600_000 }, teraz, LIVE_CACHE.maxStaleSeconds), false);
	});
	test('dane zwykłe: dobowy zapas zostaje; brak kopii — nic', () => {
		assert.equal(staleUsable({ expiresAt: teraz - 5 * 3600_000 }, teraz), true);
		assert.equal(staleUsable(null, teraz), false);
	});
});
