import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Sesja po długiej bezczynności — zalogowany nie może zobaczyć „Zaloguj się" tylko dlatego,
 * że token dostępu wygasł, gdy laptop spał (zgłoszenie z 24.10.2026, analiza meczu na żywo).
 *
 * Pilnujemy dwóch czystych reguł z `lib/authFetch.js`: które żądania przechodzą przez
 * odświeżanie (własne `/api/*` bez `/api/auth/*`) i kiedy token odświeżyć przed żądaniem.
 */

setupEnv();
const { shouldGuardRequest, accessNeedsRefresh, ACCESS_REFRESH_MARGIN_MS } = await import('@/lib/authFetch');

describe('odświeżanie tokenu przed żądaniem', () => {
	const origin = 'https://czatsportowy.pl';

	test('pilnujemy własnego API, nie samej obsługi sesji ani cudzych adresów', () => {
		assert.equal(shouldGuardRequest('/api/football/analysis-stream', origin), true);
		assert.equal(shouldGuardRequest('https://czatsportowy.pl/api/coupons?x=1', origin), true);
		assert.equal(shouldGuardRequest('/api/auth/refresh', origin), false);
		assert.equal(shouldGuardRequest('/api/auth/me', origin), false);
		assert.equal(shouldGuardRequest('/pl/mecz/123', origin), false);
		assert.equal(shouldGuardRequest('https://api.openai.com/v1/x', origin), false);
		assert.equal(shouldGuardRequest(undefined, origin), false);
	});

	test('odśwież, gdy zalogowany i termin w zasięgu zapasu; gość i nieznany stan — nie', () => {
		const teraz = Date.parse('2099-01-01T12:00:00Z');
		assert.equal(accessNeedsRefresh(teraz, 'authed', teraz + ACCESS_REFRESH_MARGIN_MS + 60_000), false);
		assert.equal(accessNeedsRefresh(teraz, 'authed', teraz + 60_000), true);
		assert.equal(accessNeedsRefresh(teraz, 'authed', teraz - 3600_000), true); // po uśpieniu laptopa
		assert.equal(accessNeedsRefresh(teraz, 'guest', teraz - 3600_000), false);
		assert.equal(accessNeedsRefresh(teraz, 'unknown', teraz - 3600_000), false);
		assert.equal(accessNeedsRefresh(teraz, 'authed', null), false);
	});
});
