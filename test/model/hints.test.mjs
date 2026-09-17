import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Plakietka modelu na liście meczów — część czysta, bez sieci.
 *
 * Pilnuje dwóch rzeczy. Że plakietka wybiera selekcję PO PRZEWADZE nad normą, a nie po
 * procencie — inaczej lista pokazywałaby wszędzie „G1" przy 90%, czyli truizm, i cała
 * plakietka byłaby szumem. I że plakietka nie pokaże niczego, czego raport by nie wystawił:
 * selekcje idą przez ten sam `evaluateMarkets`, więc mecz bez selekcji nad progiem nie
 * dostaje plakietki wcale.
 */

setupEnv();

const { bestHint, COMPACT_LABELS } = await import('@/lib/model/hints');
const { evaluateMarkets } = await import('@/lib/reports/service');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');

/** Prognoza własnego modelu w kształcie, jaki zwraca `predictFixture`. */
function zModelu({ home = 0.45, draw = 0.27, away = 0.28, homeScores = 0.79, awayScores = 0.7 } = {}) {
	return {
		matchWinner: { home, draw, away },
		doubleChance: { '1X': home + draw, X2: away + draw, 12: home + away },
		teamGoals: { home: { over: homeScores }, away: { over: awayScores } },
		known: true,
	};
}

const nazwy = { homeName: 'Lech Poznan', awayName: 'Jagiellonia' };

describe('wybór selekcji na plakietkę', () => {
	test('przewaga wygrywa z procentem', () => {
		/*
		 * Gość strzeli: 92% przy normie 70 → +22 (jeszcze pod sufitem 92, MAX_PROBABILITY).
		 * Wygrana gościa: 66% przy normie 30,7 → +35. Wyższy procent ma gol, większą
		 * przewagę — wygrana. Plakietka ma pokazać wygraną.
		 */
		const rynki = evaluateMarkets({
			modelPrediction: zModelu({ home: 0.2, draw: 0.14, away: 0.66, awayScores: 0.92 }),
			...nazwy,
		});
		const hint = bestHint(rynki);

		assert.equal(hint.key, 'away');
		assert.equal(hint.label, '2');
		assert.equal(hint.probability, 66);
		assert.equal(hint.lift, 35);
		assert.equal(hint.selection, 'Jagiellonia (goście)');
	});

	test('mecz bez selekcji nad progiem nie dostaje plakietki', () => {
		// Wszystko blisko normy: gospodarz 45 (norma 43,8), 1X 72 (norma 69,3) — nic nie przechodzi.
		const rynki = evaluateMarkets({ modelPrediction: zModelu(), ...nazwy });
		assert.equal(bestHint(rynki), null);
	});

	test('pusta lista i brak listy dają null, nie wyjątek', () => {
		assert.equal(bestHint([]), null);
		assert.equal(bestHint(null), null);
	});

	test('każda selekcja z tabeli kształtów ma swój skrót', () => {
		for (const key of Object.keys(SELECTION_SHAPES)) {
			assert.ok(COMPACT_LABELS[key], `brak skrótu dla ${key}`);
		}
	});
});
