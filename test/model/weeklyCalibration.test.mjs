import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Cotygodniowa kalibracja z bezpiecznikami (`lib/model/weeklyCalibration.js`) i jej zapis w bazie
 * (`lib/model/chanceCalibrationStore.js`).
 *
 * Każdy bezpiecznik osobno, na plakietkach syntetycznych o znanej prawdzie: minimalna próba,
 * poprawa na ostatnich tygodniach, tylko w stronę faktów, limit zmiany na tydzień, wyłączanie
 * szkodzącej korekty krokami, wersja i data, poprzednia wersja do wycofania.
 *
 * Zapis do bazy idzie pod LOSOWYM `scope` (produkcja czyta wyłącznie `prod`) i jest sprzątany;
 * daty 2099.
 */

setupEnv();
const { decideCalibration, buildCandidate, limitShift, hintSamples, shiftOf, activeShiftHurts, MAX_WEEKLY_STEP, MIN_TOTAL_HINTS } = await import(
	'@/lib/model/weeklyCalibration'
);
const { applyShift, activeCalibration } = await import('@/lib/model/chanceCalibration');
const store = await import('@/lib/model/chanceCalibrationStore');
const ChanceCalibration = (await import('@/models/ChanceCalibration')).default;
const DANE = (await import('@/lib/model/chanceCalibrationData')).default;

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

const START = Date.UTC(2099, 0, 5);
/**
 * Wiersze dziennika z plakietką `key` (X2: wygrywa przy remisie albo wygranej gości). Model obiecuje
 * `p` ∈ [0,75; 0,90], a wchodzi z prawdopodobieństwem `prawda(p, i)`; trzy plakietki na dobę.
 */
function dziennik(n, prawda, { key = 'X2', ziarno = 1, od = START } = {}) {
	const los = losowe(ziarno);
	return Array.from({ length: n }, (_, i) => {
		const p = 0.75 + 0.15 * los();
		const won = los() < prawda(p, i);
		return {
			kickoff: new Date(od + i * 8 * 3600_000),
			hint: { key, raw: Math.round(100 * p), probability: Math.round(100 * p) },
			result: won ? { home: 0, away: 1 } : { home: 2, away: 0 },
		};
	});
}

const bezKorekty = { version: 'chance-cal/2099-01-01', selections: {} };

describe('próbki i kandydat', () => {
	test('wygrana liczona po wyniku, surowa szansa z `hint.raw`, wyłączone selekcje pominięte', () => {
		const wiersze = [
			{ kickoff: new Date(START), hint: { key: 'X2', raw: 80, probability: 77 }, result: { home: 1, away: 1 } },
			{ kickoff: new Date(START), hint: { key: 'awayScores', raw: 85 }, result: { home: 0, away: 1 } },
			{ kickoff: new Date(START), hint: { key: 'home', probability: 70 }, result: { home: null, away: null } },
		];
		const s = hintSamples(wiersze);
		assert.deepEqual([...s.keys()], ['X2']);
		assert.equal(s.get('X2')[0].p, 0.8);
		assert.equal(s.get('X2')[0].won, true);
	});

	test('kandydat ma wersję, datę i datę ostatniego meczu', () => {
		const c = buildCandidate(dziennik(10, (p) => p), { now: new Date(Date.UTC(2099, 1, 1)) });
		assert.equal(c.version, 'chance-cal/2099-02-01');
		assert.equal(c.generatedAt, '2099-02-01');
		assert.match(c.through, /^2099-01-0\d$/);
		assert.equal(c.hints, 10);
	});
});

describe('bezpieczniki', () => {
	const zawyza = (p) => p - 0.12;

	test('1. za mało plakietek w całym dzienniku — nic się nie zmienia', () => {
		const c = buildCandidate(dziennik(MIN_TOTAL_HINTS - 1, zawyza, { ziarno: 2 }));
		const d = decideCalibration({ candidate: c, active: bezKorekty });
		assert.equal(d.changed, false);
		assert.ok(d.reasons[0].startsWith('za_malo_plakietek'));
	});

	test('2–4. stałe zawyżenie: korekta włącza się, w stronę faktów, najwyżej o limit punktów na tydzień', () => {
		const c = buildCandidate(dziennik(900, zawyza, { ziarno: 3 }));
		assert.ok(c.selections.X2.enabled, JSON.stringify(c.selections.X2));
		const d = decideCalibration({ candidate: c, active: bezKorekty });
		const x = d.selections.find((s) => s.key === 'X2');
		assert.equal(d.changed, true);
		assert.equal(x.status, 'wlaczona');
		assert.ok(x.to < 0 && x.to >= c.selections.X2.shift, 'nie głębiej niż dopasowanie');
		const typowa = 100 * c.selections.X2.check.promised;
		assert.ok(applyShift(typowa, x.to) < typowa, 'tylko w dół');
		assert.ok(typowa - applyShift(typowa, x.to) <= MAX_WEEKLY_STEP + 1e-6, 'limit zmiany na tydzień');
		assert.ok(x.reasons.some((r) => r.startsWith('limit_zmiany')), 'pełna korekta była większa niż limit');
		assert.equal(d.data.selections.X2.enabled, true);
		assert.equal(d.data.selections.X2.shift, x.to);
		assert.equal(d.data.version, c.version);

		// Tydzień później ta sama sytuacja: korekta schodzi o kolejny krok, w stronę dopasowania.
		const d2 = decideCalibration({ candidate: c, active: d.data });
		const x2 = d2.selections.find((s) => s.key === 'X2');
		assert.equal(x2.status, 'zmieniona');
		assert.ok(x2.to < x.to && x2.to >= c.selections.X2.shift);
	});

	test('2. zawyżenie tylko w starszych tygodniach — ostatnie tygodnie nie potwierdzają, korekty nie ma', () => {
		const wiersze = dziennik(900, (p, i) => (i < 650 ? p - 0.2 : Math.min(0.99, p + 0.04)), { ziarno: 4 });
		const d = decideCalibration({ candidate: buildCandidate(wiersze), active: bezKorekty });
		const x = d.selections.find((s) => s.key === 'X2');
		assert.equal(x.to, 0, JSON.stringify(x));
		assert.equal(d.changed, false);
	});

	test('3. model ostrożny — korekta nie podnosi szansy (tylko w stronę faktów, nigdy w górę)', () => {
		const d = decideCalibration({ candidate: buildCandidate(dziennik(900, (p) => Math.min(0.99, p + 0.06), { ziarno: 5 })), active: bezKorekty });
		const x = d.selections.find((s) => s.key === 'X2');
		assert.equal(x.to, 0);
		assert.equal(d.changed, false);
		assert.ok(x.reasons.length > 0);
	});

	test('5. działająca korekta, która w sprawdzianie szkodzi — schodzi do zera krokami', () => {
		const active = { version: 'chance-cal/2099-01-02', selections: { X2: { enabled: true, shift: -0.6 } } };
		const wiersze = dziennik(900, (p) => Math.min(0.99, p + 0.05), { ziarno: 6 });
		const d = decideCalibration({ candidate: buildCandidate(wiersze), active, samples: hintSamples(wiersze) });
		const x = d.selections.find((s) => s.key === 'X2');
		assert.equal(x.status, 'wylaczana', JSON.stringify(x));
		assert.ok(x.to > -0.6 && x.to <= 0);
		const typowa = 100 * x.promised;
		assert.ok(applyShift(typowa, x.to) - applyShift(typowa, -0.6) <= MAX_WEEKLY_STEP + 1e-6);
	});

	test('5. brak danych nie zdejmuje działającej korekty', () => {
		const active = { version: 'chance-cal/2099-01-02', selections: { home: { enabled: true, shift: -0.2 } } };
		const wiersze = dziennik(900, (p) => p, { ziarno: 7 });
		const d = decideCalibration({ candidate: buildCandidate(wiersze), active, samples: hintSamples(wiersze) });
		const x = d.selections.find((s) => s.key === 'home');
		assert.equal(x.to, -0.2);
		assert.equal(d.data.selections.home.enabled, true);
		assert.equal(shiftOf(d.data, 'home'), -0.2);
	});

	test('działająca korekta, która na ostatnich tygodniach pomaga, zostaje', () => {
		const wiersze = dziennik(900, (p) => p - 0.1, { ziarno: 8 });
		assert.equal(activeShiftHurts(hintSamples(wiersze).get('X2'), -0.3), false);
		assert.equal(activeShiftHurts(hintSamples(wiersze.slice(0, 20)).get('X2'), -0.3), null, 'za mało danych');
	});

	test('limitShift: bez limitu, gdy zmiana mieści się w kroku; monotonicznie przy większej', () => {
		assert.equal(limitShift(80, 0, -0.05), -0.05);
		const s = limitShift(80, 0, -1.5);
		assert.ok(s > -1.5 && s < 0);
		assert.ok(80 - applyShift(80, s) <= MAX_WEEKLY_STEP && 80 - applyShift(80, s) > MAX_WEEKLY_STEP - 0.05);
	});
});

describe('zapis w bazie: wersja, data, poprzednia do wycofania', () => {
	const scope = `test-${crypto.randomUUID()}`;
	const polaczenie = mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

	after(async () => {
		await ChanceCalibration.deleteMany({ scope });
		await mongoose.disconnect();
	});

	const zapis = (v, shift) => ({
		version: `chance-cal/${v}`,
		generatedAt: v,
		through: v,
		hints: 999,
		selections: { X2: { n: 500, shift, enabled: true, reason: null, check: null } },
	});

	test('włączenie, zastąpienie, wycofanie — i nic z tego nie dotyka produkcji', async () => {
		await polaczenie;
		const przed = activeCalibration();
		assert.equal((await store.currentCalibration({ scope })).source, 'file', 'pusty scope → plik danych');

		const a = await store.activateCalibration(zapis('2099-03-01', -0.1), { scope, now: new Date(Date.UTC(2099, 2, 1)) });
		assert.equal(a.active, true);
		assert.equal(a.status, 'active');
		assert.equal(a.version, 'chance-cal/2099-03-01');
		assert.ok(a.activatedAt instanceof Date);

		const b = await store.activateCalibration(zapis('2099-03-08', -0.2), { scope, now: new Date(Date.UTC(2099, 2, 8)) });
		assert.equal(b.previousVersion, 'chance-cal/2099-03-01');
		const stara = await ChanceCalibration.findOne({ scope, version: a.version }).lean();
		assert.equal(stara.active, false);
		assert.equal(stara.status, 'superseded', 'poprzednia zostaje w bazie');
		assert.equal((await store.currentCalibration({ scope })).version, 'chance-cal/2099-03-08');

		// Drugi przebieg tego samego dnia — wersja musi zostać unikalna.
		const c = await store.activateCalibration(zapis('2099-03-08', -0.25), { scope, now: new Date(Date.UTC(2099, 2, 8, 12)) });
		assert.notEqual(c.version, b.version);
		assert.ok(c.version.startsWith('chance-cal/2099-03-08-'));

		const w1 = await store.rollbackCalibration({ scope, now: new Date(Date.UTC(2099, 2, 9)) });
		assert.deepEqual(w1, { rolledBack: c.version, active: b.version });
		assert.equal((await store.currentCalibration({ scope })).version, b.version);
		assert.equal((await ChanceCalibration.findOne({ scope, version: c.version }).lean()).status, 'rolled_back');

		await store.rollbackCalibration({ scope });
		await store.rollbackCalibration({ scope });
		const pusto = await store.rollbackCalibration({ scope });
		assert.deepEqual(pusto, { rolledBack: null, active: DANE.version }, 'po wycofaniu wszystkiego obowiązuje plik');
		assert.equal((await store.currentCalibration({ scope })).source, 'file');

		assert.equal(activeCalibration(), przed, 'korekta obowiązująca w procesie nie zmieniła się');
		const historia = await store.calibrationHistory({ scope });
		assert.equal(historia.length, 3);
	});
});
