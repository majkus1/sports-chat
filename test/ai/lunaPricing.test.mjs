import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Koszt wywołań gpt-5.6-luna musi trafiać do dziennika użycia i progu wydatków.
 * Bez wpisu w cenniku koszt zapisywał się jako null — tak było przy pierwszym teście Luny.
 */

setupEnv();
const { estimateCostUsd } = await import('@/lib/ai/config');

describe('cennik gpt-5.6-luna', () => {
	test('alias i identyfikator z datą liczą się tą samą stawką', () => {
		// 7197 tokenów wejścia i 1221 wyjścia — prawdziwa analiza przed meczem z testu 2026-10-12.
		const koszt = estimateCostUsd('gpt-5.6-luna', 7197, 1221);
		// Funkcja zaokrągla do 6 miejsc po przecinku.
		assert.ok(Math.abs(koszt - (7197 * 0.2 + 1221 * 1.2) / 1e6) < 1e-6, String(koszt));
		assert.equal(estimateCostUsd('gpt-5.6-luna-2026-07-09', 7197, 1221), koszt);
	});
});
