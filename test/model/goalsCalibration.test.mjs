import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kalibracja „powyżej 2,5": cechy, wybór wariantu i zastosowanie zapisanej regresji.
 *
 * Regresja w `goalsCalibrationData.js` ma sens wyłącznie z DOKŁADNIE tym wektorem cech,
 * którym była uczona. Te testy pilnują kształtu wektora (nazwy i kolejność), granic wariantu
 * (kiedy `shots`, kiedy `goals`, kiedy nic) i tego, że zapisana regresja robi to, co obiecuje
 * eksperyment: podnosi prognozę w meczu bramkowych drużyn i obniża w meczu zachowawczych.
 */

setupEnv();

const {
	FEATURE_NAMES,
	MIN_HIST,
	MIN_SHOT_MATCHES,
	WINDOW,
	teamProfile,
	leagueReference,
	featureVector,
	pickVariant,
	fitLogistic,
	applyCalibration,
} = await import('@/lib/model/goalsCalibration');
const calibration = (await import('@/lib/model/goalsCalibrationData')).default;

const mecz = (gf, ga, sf = null, sa = null, stf = null, sta = null) => ({ gf, ga, sf, sa, stf, sta });
const liga = () =>
	leagueReference(
		Array.from({ length: 200 }, (_, i) => ({ hg: 1 + (i % 3), ag: i % 2, hs: 13, as: 11, hst: 5, ast: 4 }))
	);

describe('profil drużyny', () => {
	test('liczy z ostatnich WINDOW meczów, strzały tylko tam, gdzie są', () => {
		const historia = [
			...Array.from({ length: 5 }, () => mecz(0, 3)),
			...Array.from({ length: WINDOW }, () => mecz(2, 1, 14, 9)),
		];
		const p = teamProfile(historia);
		assert.equal(p.n, WINDOW + 5);
		assert.equal(p.gf, 2, 'pięć starych meczów poza oknem');
		assert.equal(p.sf, 14);
		assert.equal(p.shotMatches, WINDOW);
	});
});

describe('wybór wariantu', () => {
	const lg = liga();
	const zeStrzalami = teamProfile(Array.from({ length: 8 }, () => mecz(1, 1, 12, 12, 4, 4)));
	const bezStrzalow = teamProfile(Array.from({ length: 8 }, () => mecz(1, 1)));

	test('obie drużyny ze strzałami → shots', () => {
		assert.equal(pickVariant({ league: lg, home: zeStrzalami, away: zeStrzalami }), 'shots');
	});
	test('jedna bez strzałów → goals', () => {
		assert.equal(pickVariant({ league: lg, home: zeStrzalami, away: bezStrzalow }), 'goals');
	});
	test('za krótka historia → nic', () => {
		const krotka = teamProfile(Array.from({ length: MIN_HIST - 1 }, () => mecz(1, 1)));
		assert.equal(pickVariant({ league: lg, home: krotka, away: zeStrzalami }), null);
	});
	test('za mało meczów ze strzałami w oknie → goals', () => {
		const malo = teamProfile([
			...Array.from({ length: WINDOW - MIN_SHOT_MATCHES + 1 }, () => mecz(1, 1)),
			...Array.from({ length: MIN_SHOT_MATCHES - 1 }, () => mecz(1, 1, 10, 10, 3, 3)),
		]);
		assert.equal(pickVariant({ league: lg, home: malo, away: zeStrzalami }), 'goals');
	});
	test('liga bez odniesienia dla strzałów → goals', () => {
		const bez = { ...lg, sf: null, stf: null };
		assert.equal(pickVariant({ league: bez, home: zeStrzalami, away: zeStrzalami }), 'goals');
	});
});

describe('wektor cech', () => {
	const lg = liga();
	const h = teamProfile(Array.from({ length: 10 }, () => mecz(2, 1, 15, 8, 6, 3)));
	const a = teamProfile(Array.from({ length: 10 }, () => mecz(1, 2, 9, 14, 3, 5)));

	test('ma tyle składowych, ile nazw — w obu wariantach', () => {
		for (const w of ['goals', 'shots']) {
			assert.equal(
				featureVector(w, { league: lg, dcOver: 0.55, home: h, away: a }).length,
				FEATURE_NAMES[w].length
			);
		}
	});
	test('zapisana regresja pasuje do wektora', () => {
		for (const w of ['goals', 'shots']) {
			const params = calibration.variants[w];
			assert.deepEqual(params.features, FEATURE_NAMES[w]);
			assert.equal(params.mean.length, FEATURE_NAMES[w].length);
			assert.equal(params.w.length, FEATURE_NAMES[w].length + 1);
		}
	});
	test('cechy drużyn są względem ligi: przeciętna drużyna daje zera', () => {
		const przecietna = teamProfile(
			Array.from({ length: 10 }, () => mecz(lg.gf, lg.gf, lg.sf, lg.sf, lg.stf, lg.stf))
		);
		const x = featureVector('shots', { league: lg, dcOver: lg.rate, home: przecietna, away: przecietna });
		assert.equal(x[0], x[1], 'DC równy stałej');
		for (const v of x.slice(2)) assert.ok(Math.abs(v) < 1e-9);
	});
});

describe('zapisana regresja', () => {
	const lg = liga();
	const bramkowa = teamProfile(Array.from({ length: 10 }, () => mecz(2.4, 1.8, 16, 14, 6, 5)));
	const zachowawcza = teamProfile(Array.from({ length: 10 }, () => mecz(0.8, 0.7, 8, 8, 2, 2)));

	test('podnosi prognozę dla bramkowych i obniża dla zachowawczych — w obu wariantach', () => {
		for (const w of ['goals', 'shots']) {
			const params = calibration.variants[w];
			const wysoko = applyCalibration(
				params,
				featureVector(w, { league: lg, dcOver: 0.62, home: bramkowa, away: bramkowa })
			);
			const nisko = applyCalibration(
				params,
				featureVector(w, { league: lg, dcOver: 0.4, home: zachowawcza, away: zachowawcza })
			);
			// Asymetria jest celowa i zmierzona: w dół regresja schodzi ostrożnie (mało goli
			// to brak przyczyny), w górę śmielej — patrz README modelu.
			assert.ok(wysoko > lg.rate + 0.05, `${w}: ${wysoko}`);
			assert.ok(nisko < lg.rate, `${w}: ${nisko}`);
			assert.ok(wysoko - nisko > 0.08, `${w}: rozstęp ${wysoko - nisko}`);
			assert.ok(wysoko > 0 && wysoko < 1 && nisko > 0 && nisko < 1);
		}
	});

	test('kalibracja ściąga nadmierną pewność macierzy do środka', () => {
		// Sama macierz mówi 80 %; regresja z tymi samymi przeciętnymi drużynami ma powiedzieć mniej.
		const przecietna = teamProfile(
			Array.from({ length: 10 }, () => mecz(lg.gf, lg.gf, lg.sf, lg.sf, lg.stf, lg.stf))
		);
		const p = applyCalibration(
			calibration.variants.goals,
			featureVector('goals', { league: lg, dcOver: 0.8, home: przecietna, away: przecietna })
		);
		assert.ok(p < 0.8 && p > lg.rate, String(p));
	});

	test('odrzuca wektor o złej długości', () => {
		assert.equal(applyCalibration(calibration.variants.goals, [0, 0]), null);
	});
});

describe('dopasowanie regresji', () => {
	test('odtwarza znaną zależność na danych syntetycznych', () => {
		const X = [];
		const y = [];
		let seed = 7;
		const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
		for (let i = 0; i < 3000; i += 1) {
			const a = rnd() * 2 - 1;
			const b = rnd() * 2 - 1;
			const p = 1 / (1 + Math.exp(-(0.3 + 1.5 * a - 1 * b)));
			X.push([a, b]);
			y.push(rnd() < p ? 1 : 0);
		}
		const params = fitLogistic(X, y);
		const p = (a, b) => applyCalibration(params, [a, b]);
		// Regularyzacja L2 celowo ściąga wagi do środka, więc progi są luźniejsze niż prawda (0,92 / 0,10).
		assert.ok(p(1, -1) > 0.8, String(p(1, -1)));
		assert.ok(p(-1, 1) < 0.2, String(p(-1, 1)));
	});
	test('za mała próba → null', () => {
		assert.equal(fitLogistic([[1], [0]], [1, 0]), null);
	});
});
