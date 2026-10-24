import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Plakietki na liście meczów a typ dnia i kupony (`lib/coupons/marks.js`) — bez bazy i sieci.
 *
 * Pilnujemy dwóch rzeczy. SPÓJNOŚĆ: przy meczu z typem dnia albo z kuponu stoi selekcja z zapisu
 * (ta sama co na karcie i kuponie), nawet gdy bieżąca plakietka po przeliczeniu modelu mówi co
 * innego, a znacznik kuponu tylko przy tej samej selekcji. SZCZELNOŚĆ: bez planu kupon dnia jest
 * odkryty (jest za darmo), a nogi płatnych kuponów nie zostawiają śladu — ani selekcji, ani znacznika.
 */

setupEnv();
const { hintPresenter } = await import('@/lib/coupons/marks');

/** Bieżąca plakietka z `hintsForDate` (kształt `bestHint`). */
const plakietka = (key, probability, extra = {}) => ({
	key,
	label: { home: '1', '1X': '1X', X2: 'X2', awayScores: 'G2' }[key],
	selection: `selekcja ${key}`,
	probability,
	base: 45,
	lift: probability - 45,
	...extra,
});
/** Noga kuponu z `couponLegsForDate`. */
const noga = (type, fixtureId, key = '1X', probability = 87) => ({
	type,
	fixtureId,
	key,
	selection: `zapis ${key}`,
	probability,
	base: 69,
});

describe('hintPresenter', () => {
	const daily = { fixtureId: '1', key: 'home', selection: 'Gospodarze wygrają', probability: 74, base: 44, lift: 30 };
	const nogi = [noga('daily', '2'), noga('days3', '3', 'X2', 80), noga('days5', '4'), noga('days3', '2', '1X'), noga('days5', '5', 'home', 70)];

	test('bez planu: typ dnia i kupon dnia z zapisu i ze znacznikiem, płatne nogi i reszta za kłódką', () => {
		const { present, fixtureIds } = hintPresenter({ full: false, daily, couponLegs: nogi });

		// Typ dnia: selekcja z zapisu, choć bieżąca plakietka po przeliczeniu mówi „1X".
		assert.deepEqual(present('1', plakietka('1X', 81)), {
			key: 'home',
			label: '1',
			selection: 'Gospodarze wygrają',
			probability: 74,
			base: 44,
			lift: 30,
			daily: true,
		});

		// Kupon dnia: zapis kuponu („1X · 87%"), nie bieżące „1 · 62%"; znacznik tylko kuponu dnia,
		// choć ten sam mecz jest też w płatnym 3-dniowym.
		const wKuponie = present('2', plakietka('home', 62));
		assert.equal(wKuponie.key, '1X');
		assert.equal(wKuponie.label, '1X');
		assert.equal(wKuponie.probability, 87);
		assert.equal(wKuponie.lift, 18, 'przewaga liczona z zapisu: 87 − 69');
		assert.deepEqual(wKuponie.coupons, ['daily']);
		assert.equal(wKuponie.daily, undefined);

		// Płatne nogi: zwykła kłódka, bez śladu kuponu.
		for (const id of ['3', '4', '5']) assert.deepEqual(present(id, plakietka('X2', 80)), { locked: true });
		assert.deepEqual(present('6', plakietka('home', 70)), { locked: true });
		assert.equal(present('7', null), null, 'mecz bez plakietki i bez zapisu — nic');

		assert.deepEqual(fixtureIds.sort(), ['1', '2']);
	});

	test('z planem: płatne kupony też ze znacznikiem i z zapisu, reszta — bieżąca plakietka', () => {
		const { present, fixtureIds } = hintPresenter({ full: true, daily, couponLegs: nogi });
		assert.deepEqual(present('2', plakietka('home', 62)).coupons, ['daily', 'days3'], 'darmowy znacznik pierwszy');
		assert.deepEqual(present('3', plakietka('X2', 79)).coupons, ['days3']);
		assert.equal(present('3', plakietka('X2', 79)).probability, 80, 'procent z kuponu, nie po przeliczeniu');
		assert.deepEqual(present('4', null).coupons, ['days5'], 'mecz z kuponu, którego plakietki lista już nie ma');
		const zwykla = plakietka('awayScores', 84);
		assert.deepEqual(present('6', zwykla), zwykla);
		assert.deepEqual(fixtureIds.sort(), ['1', '2', '3', '4', '5']);
	});

	test('typ dnia na meczu z kuponu o innej selekcji: zostaje typ dnia, bez znacznika kuponu', () => {
		const { present } = hintPresenter({ full: true, daily: { ...daily, fixtureId: '5' }, couponLegs: nogi });
		const w = present('5', plakietka('home', 70));
		assert.equal(w.daily, true);
		assert.equal(w.key, 'home');
		assert.deepEqual(w.coupons, ['days5'], 'ta sama selekcja „1" — znacznik jest');

		const inna = hintPresenter({ full: true, daily: { ...daily, fixtureId: '3' }, couponLegs: nogi }).present('3', null);
		assert.equal(inna.daily, true);
		assert.equal(inna.key, 'home');
		assert.equal(inna.coupons, undefined, 'kupon ma „X2", typ dnia „1" — nie stawiamy ich obok siebie');
	});

	test('bez typu dnia i bez kuponów — dokładnie jak dotąd: plan widzi plakietkę, reszta kłódkę', () => {
		const h = plakietka('X2', 75);
		assert.deepEqual(hintPresenter({ full: true }).present('9', h), h);
		assert.deepEqual(hintPresenter({ full: false }).present('9', h), { locked: true });
		assert.deepEqual(hintPresenter({ full: false, couponLegs: [{ type: 'live', fixtureId: '9', key: 'home' }] }).fixtureIds, []);
	});
});
