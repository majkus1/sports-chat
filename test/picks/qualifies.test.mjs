import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Próg rozegranych meczów — ten sam dla powstania typu i dla wliczenia go do statystyki.
 *
 * Przez miesiąc były dwa (raport 4, statystyka 6) i 44% pokazywanych typów cicho wypadało
 * z publicznej skuteczności. Test pilnuje, że statystyka wlicza dokładnie od progu polityki
 * — czyli że to, co raport publikuje, panel liczy.
 */

setupEnv();

const { qualifiesForStats } = await import('@/lib/picks/service');
const { MIN_PLAYED } = await import('@/lib/picks/policy');

describe('próg rozegranych meczów w statystyce', () => {
	const komplet = { dataQuality: 'good', sectionsPresent: ['form', 'prediction'] };

	test('typ z progu polityki wchodzi do statystyki', () => {
		assert.equal(qualifiesForStats({ ...komplet, playedHome: MIN_PLAYED, playedAway: MIN_PLAYED }), true);
	});

	test('typ o jeden mecz poniżej progu nie wchodzi', () => {
		assert.equal(qualifiesForStats({ ...komplet, playedHome: MIN_PLAYED - 1, playedAway: MIN_PLAYED }), false);
		assert.equal(qualifiesForStats({ ...komplet, playedHome: MIN_PLAYED, playedAway: MIN_PLAYED - 1 }), false);
	});

	test('brak informacji o próbie nie wyklucza — decydują pozostałe warunki', () => {
		assert.equal(qualifiesForStats({ ...komplet, playedHome: null, playedAway: null }), true);
	});

	test('próg polityki to cztery mecze', () => {
		// Zmiana tej liczby zmienia jednocześnie selekcję raportu i pomiar — świadomie.
		assert.equal(MIN_PLAYED, 4);
	});
});
