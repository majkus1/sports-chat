import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Korekta zawyżonej szansy modelu (`lib/model/chanceCalibration.js`) — część czysta.
 *
 * Bezpieczniki z zamówienia właściciela, każdy osobno: minimum próby, tylko w stronę faktów (w dół),
 * limit korekty, monotoniczność, sprawdzian tydzień po tygodniu (dopasowanie wyłącznie na wcześniejszych
 * tygodniach) oraz wersja i data w zapisie. Dane syntetyczne o znanej prawdzie.
 */

setupEnv();

const {
	fitShift,
	applyShift,
	fitSelection,
	calibrateChance,
	calibrationVersion,
	CALIBRATION_MAX_POINTS,
	CALIBRATION_MIN_SAMPLE,
} = await import('@/lib/model/chanceCalibration');
const DANE = (await import('@/lib/model/chanceCalibrationData')).default;

/** Powtarzalne liczby losowe (mulberry32). */
function losowe(ziarno) {
	let a = ziarno >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Plakietki: model obiecuje `p`, a wchodzi z prawdopodobieństwem `prawda(p)`; trzy na dzień od 1.09.2099. */
function plakietki(n, prawda, ziarno = 1) {
	const los = losowe(ziarno);
	return Array.from({ length: n }, (_, i) => {
		const p = 0.75 + 0.15 * los();
		return { p, won: los() < prawda(p), at: new Date(Date.UTC(2099, 8, 1) + i * 8 * 3600_000) };
	});
}

describe('przesunięcie i jego bezpieczniki', () => {
	test('model obiecujący za dużo dostaje przesunięcie ujemne, uczciwy — bliskie zera', () => {
		assert.ok(fitShift(plakietki(600, (p) => p - 0.08)) < -0.2);
		assert.ok(Math.abs(fitShift(plakietki(600, (p) => p))) < 0.15);
	});

	test('tylko w dół, najwyżej o limit punktów, monotonicznie', () => {
		assert.equal(applyShift(80, 0.5), 80, 'dodatnie przesunięcie nie podnosi szansy');
		assert.ok(applyShift(80, -0.3) < 80);
		assert.equal(applyShift(85, -5), 85 - CALIBRATION_MAX_POINTS, 'limit korekty');
		let poprzednia = -Infinity;
		for (let p = 55; p <= 95; p += 1) {
			const po = applyShift(p, -0.3);
			assert.ok(po >= poprzednia, `nie monotoniczne przy ${p}`);
			poprzednia = po;
		}
	});
});

describe('dopasowanie selekcji ze sprawdzianem tydzień po tygodniu', () => {
	test('za mała próba — bez korekty', () => {
		const w = fitSelection(plakietki(CALIBRATION_MIN_SAMPLE - 1, (p) => p - 0.1));
		assert.equal(w.enabled, false);
		assert.equal(w.reason, 'za_mala_proba');
	});

	test('stałe zawyżenie — korekta włączona, bo poprawia Brier na tygodniach, których dopasowanie nie widziało', () => {
		const w = fitSelection(plakietki(700, (p) => p - 0.1, 3));
		assert.equal(w.enabled, true, JSON.stringify(w));
		assert.ok(w.shift < 0);
		assert.ok(w.check.n >= 100 && w.check.weeks >= 3);
		assert.ok(w.check.brierCalibrated < w.check.brierRaw);
		assert.ok(w.check.calibrated < w.check.promised);
	});

	test('model uczciwy albo ostrożny — korekty nie ma', () => {
		const uczciwy = fitSelection(plakietki(700, (p) => p, 5));
		assert.equal(uczciwy.enabled, false);
		const ostrozny = fitSelection(plakietki(700, (p) => Math.min(0.99, p + 0.05), 6));
		assert.equal(ostrozny.enabled, false);
		assert.equal(ostrozny.reason, 'model_nie_zawyza');
	});

	test('zawyżenie tylko w starszych tygodniach — sprawdzian na późniejszych go nie potwierdza', () => {
		const stare = plakietki(300, (p) => p - 0.15, 7);
		const nowe = plakietki(500, (p) => Math.min(0.99, p + 0.03), 8).map((x, i) => ({
			...x,
			at: new Date(stare.at(-1).at.getTime() + (i + 1) * 8 * 3600_000),
		}));
		const w = fitSelection([...stare, ...nowe]);
		assert.equal(w.enabled, false, JSON.stringify(w));
	});
});

describe('zastosowanie i zapis', () => {
	const zapis = { version: 'chance-cal/2099-01-01', selections: { X2: { enabled: true, shift: -0.3 }, home: { enabled: false, shift: -0.5 } } };

	test('korekta tylko w selekcji włączonej; nieznana selekcja bez zmian', () => {
		assert.ok(calibrateChance('X2', 80, zapis) < 80);
		assert.equal(calibrateChance('home', 80, zapis), 80);
		assert.equal(calibrateChance('over25', 66, zapis), 66);
		assert.equal(calibrationVersion(zapis), 'chance-cal/2099-01-01');
		assert.equal(calibrationVersion({ version: 'x', selections: { home: { enabled: false } } }), null);
	});

	test('wygenerowany plik ma wersję, datę i wynik sprawdzianu przy każdej selekcji', () => {
		assert.match(DANE.version, /^chance-cal\/\d{4}-\d{2}-\d{2}$/);
		assert.match(DANE.generatedAt, /^\d{4}-\d{2}-\d{2}$/);
		for (const [key, w] of Object.entries(DANE.selections)) {
			assert.equal(typeof w.enabled, 'boolean', key);
			assert.ok(w.enabled === false || (w.shift < 0 && w.check && w.check.brierCalibrated < w.check.brierRaw), key);
		}
		assert.equal(DANE.selections.awayScores, undefined, '„goście strzelą" jest wyłączone — korekty nie ma po co liczyć');
	});
});
