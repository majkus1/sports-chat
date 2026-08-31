import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Miary jakości prognoz.
 *
 * Testy pilnują tego, co odróżnia uczciwą statystykę od marketingowej: że przedział ufności
 * przy małej próbie jest szeroki i nie wychodzi poza zakres, oraz że Brier score karze
 * pewność siebie bez pokrycia — czego sam odsetek trafień nie robi w ogóle.
 */

setupEnv();

const { wilsonInterval, brierScore, BRIER_BASELINE } = await import('@/lib/picks/metrics');

describe('przedział ufności Wilsona', () => {
	test('nasze realne 47/68 daje uczciwie szeroki przedział', () => {
		const p = wilsonInterval(47, 68);

		assert.ok(p.low < 62 && p.high > 76, `oczekiwano szerokiego przedziału, dostano ${p.low}-${p.high}`);
		assert.ok(p.high - p.low > 15, 'przy 68 typach przedział nie może być wąski');
	});

	test('większa próba zawęża przedział przy tym samym odsetku', () => {
		const maly = wilsonInterval(69, 100);
		const duzy = wilsonInterval(690, 1000);

		assert.ok(duzy.high - duzy.low < maly.high - maly.low);
	});

	test('komplet trafień nie daje przedziału 100–100', () => {
		const p = wilsonInterval(3, 3);

		assert.ok(p.low < 100, '3/3 nie jest dowodem stuprocentowej skuteczności');
		assert.ok(p.low >= 0 && p.high <= 100, 'granice muszą mieścić się w zakresie');
	});

	test('brak rozstrzygniętych typów zwraca null zamiast dzielenia przez zero', () => {
		assert.equal(wilsonInterval(0, 0), null);
		assert.equal(wilsonInterval(5, null), null);
	});
});

describe('Brier score', () => {
	test('prognoza pewna i trafiona daje wynik bliski zeru', () => {
		const wynik = brierScore([
			{ probability: 95, status: 'won' },
			{ probability: 95, status: 'won' },
		]);

		assert.ok(wynik < 0.01);
	});

	test('pewność bez pokrycia kosztuje więcej niż ostrożność', () => {
		const pewny = brierScore([{ probability: 90, status: 'lost' }]);
		const ostrozny = brierScore([{ probability: 55, status: 'lost' }]);

		assert.ok(
			pewny > ostrozny,
			'ten sam błąd przy wyższej deklarowanej pewności musi kosztować więcej'
		);
	});

	test('prognoza „50% na wszystko" trafia dokładnie w wynik odniesienia', () => {
		const wynik = brierScore([
			{ probability: 50, status: 'won' },
			{ probability: 50, status: 'lost' },
		]);

		assert.equal(wynik, BRIER_BASELINE);
	});

	test('typy bez deklarowanego prawdopodobieństwa są pomijane, nie zerowane', () => {
		assert.equal(brierScore([{ probability: null, status: 'won' }]), null);

		// Jeden typ z prognozą wśród trzech — liczy się tylko on.
		const wynik = brierScore([
			{ probability: null, status: 'lost' },
			{ probability: 100, status: 'won' },
			{ probability: null, status: 'lost' },
		]);
		assert.equal(wynik, 0);
	});
});
