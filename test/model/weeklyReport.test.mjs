import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Cotygodniowy raport modelu (`lib/model/weeklyReport.js`, `weeklyJob.js`).
 *
 * Liczby na danych syntetycznych o znanym wyniku (log loss, kubełki, tabela źródeł szansy, CLV,
 * kupony), treść maila (krótka, z liczbami i tym, co zmieniono), a na końcu jeden przebieg zadania
 * na prawdziwym dzienniku: podgląd (`dryRun`) niczego nie zapisuje, a zapis idzie pod losowym
 * `scope` — bez maila — i jest sprzątany.
 */

setupEnv();
const r = await import('@/lib/model/weeklyReport');
const { runWeeklyModelJob, weeklyReportHistory } = await import('@/lib/model/weeklyJob');
const ModelReport = (await import('@/models/ModelReport')).default;
const ChanceCalibration = (await import('@/models/ChanceCalibration')).default;

const T = Date.UTC(2099, 5, 1);
/** Mecz z dziennika: model, poranny i zamykający kurs 1X2, wynik. */
function mecz({ i = 0, model, open, close = null, wynik, strength = 'shots', hint = null, extra = {} }) {
	return {
		kickoff: new Date(T + i * 3600_000),
		markets: { home: model[0], draw: model[1], away: model[2], ...extra },
		odds: { open: open ? { bookmakers: 8, home: open[0], draw: open[1], away: open[2], ...(open[3] || {}) } : null, close },
		result: { home: wynik[0], away: wynik[1] },
		strength,
		hint,
		over25: { base: 0.5 },
	};
}

describe('log loss model wobec rynku', () => {
	test('liczy na meczach z kursem i wynikiem; podział na siłę ze strzałów i same gole', () => {
		const f = [
			mecz({ i: 0, model: [0.5, 0.3, 0.2], open: [2, 3.5, 4], wynik: [1, 0] }),
			mecz({ i: 1, model: [0.5, 0.3, 0.2], open: [2, 3.5, 4], wynik: [0, 0], strength: 'goals' }),
			mecz({ i: 2, model: [0.5, 0.3, 0.2], open: null, wynik: [0, 0] }),
			{ ...mecz({ i: 3, model: [0.5, 0.3, 0.2], open: [2, 3.5, 4], wynik: [0, 0] }), result: { home: null, away: null } },
		];
		const s = r.logLossSummary(f);
		assert.equal(s.n, 2);
		assert.ok(Math.abs(s.model - (-Math.log(0.5) - Math.log(0.3)) / 2) < 1e-4);
		const m = r.marketTriple({ home: 2, draw: 3.5, away: 4 });
		assert.ok(Math.abs(m.home + m.draw + m.away - 1) < 1e-12, 'marża zdjęta');
		assert.equal(s.shots.n, 1);
		assert.equal(s.goals.n, 1);
		assert.ok(Math.abs(s.gap - (s.model - s.market)) < 1e-4);
	});
});

describe('kubełki obietnica/fakt', () => {
	test('typy rozliczone, po pokazanej szansie', () => {
		const picks = [
			{ probability: 65, status: 'won' },
			{ probability: 67, status: 'lost' },
			{ probability: 85, status: 'won' },
			{ probability: 92, status: 'won' },
			{ probability: 92, status: 'void' },
		];
		const b = r.promiseBuckets(picks);
		assert.equal(b.n, 4);
		assert.equal(b.hit, 75);
		assert.deepEqual(b.buckets[0], { range: '60–70%', n: 2, promised: 66, hit: 50 });
		assert.equal(b.buckets[3].n, 1);
		assert.equal(b.buckets[1].n, 0);
	});
});

describe('tabela źródeł szansy — ten sam sprawdzian co 21.11.2026', () => {
	test('potwierdzone plakietki „1": kurs bliżej faktów → zalecenie „kurs"; niepotwierdzone odpadają', () => {
		const f = [];
		for (let i = 0; i < 60; i += 1) {
			// Model 75% na gospodarzy, kurs 1,45 (≈ 66% po marży), wchodzi 2 z 3 — kurs trafia lepiej.
			f.push(mecz({ i: i * 30, model: [0.75, 0.15, 0.1], open: [1.45, 4.5, 7], wynik: i % 3 === 2 ? [0, 1] : [2, 0] }));
		}
		// Kurs 2,6 na gospodarzy — rynek nie potwierdza, plakietki nie ma, do tabeli nie wchodzi.
		f.push(mecz({ i: 5000, model: [0.75, 0.15, 0.1], open: [2.6, 3.2, 2.8], wynik: [1, 0] }));
		const t = r.chanceSourceTable(f, { minN: 30 });
		const home = t.find((w) => w.key === 'home');
		assert.ok(home, JSON.stringify(t));
		assert.equal(home.n, 60);
		assert.ok(home.brierMarket < home.brierModel);
		assert.equal(home.recommended, 'market');
		assert.equal(home.current, 'market', '„1" pokazuje dziś szansę z kursu');
		assert.equal(home.differs, false);
	});

	test('za mało typów — bez zalecenia', () => {
		const f = [mecz({ model: [0.75, 0.15, 0.1], open: [1.45, 4.5, 7], wynik: [1, 0] })];
		const t = r.chanceSourceTable(f, { minN: 30 });
		assert.equal(t[0].recommended, null);
		assert.equal(t[0].differs, false);
	});
});

describe('CLV i kupony', () => {
	test('CLV = kurs poranny / zamknięcia − 1 dla selekcji plakietki', () => {
		const f = [
			mecz({ model: [0.7, 0.2, 0.1], open: [1.5, 4, 6], close: { home: 1.4 }, wynik: [1, 0], hint: { key: 'home' } }),
			mecz({ model: [0.7, 0.2, 0.1], open: [1.5, 4, 6], close: { home: 1.6 }, wynik: [1, 0], hint: { key: 'home' } }),
			mecz({ model: [0.7, 0.2, 0.1], open: [1.5, 4, 6], close: null, wynik: [1, 0], hint: { key: 'home' } }),
		];
		const c = r.clvSummary(f);
		assert.equal(c.n, 2);
		assert.equal(c.positive, 50);
		assert.equal(c.mean, Number((100 * ((1.5 / 1.4 - 1 + 1.5 / 1.6 - 1) / 2)).toFixed(1)));
		assert.deepEqual(r.clvSummary([]), { n: 0, mean: null, positive: null });
	});

	test('kupony: weszło / rozliczone per rodzaj, bez niepostawionych', () => {
		const k = r.couponSummary([
			{ type: 'daily', status: 'won', totalOdds: 2.1 },
			{ type: 'daily', status: 'lost', totalOdds: 2.3 },
			{ type: 'days3', status: 'none' },
		]);
		assert.deepEqual(k, { daily: { won: 1, lost: 1, avgOdds: 2.2 } });
	});
});

describe('treść maila', () => {
	const decision = {
		changed: true,
		selections: [
			{ key: 'X2', from: 0, to: -0.12, status: 'wlaczona', reasons: ['limit_zmiany_2_pkt'], n: 600, promised: 0.79, hit: 0.74, pointsAtTypical: -2 },
			{ key: 'home', from: 0, to: 0, status: 'bez_zmian', reasons: ['sprawdzian_nie_potwierdza'], n: 400, promised: 0.7, hit: 0.7, pointsAtTypical: 0 },
		],
		reasons: [],
	};
	const summary = r.buildWeeklySummary({
		forecasts: [mecz({ i: 0, model: [0.5, 0.3, 0.2], open: [2, 3.5, 4], wynik: [1, 0] })],
		picks: [{ probability: 80, status: 'won', settledAt: new Date(T) }],
		coupons: [{ type: 'daily', status: 'won', totalOdds: 2.1, settledAt: new Date(T) }],
		decision,
		active: { version: 'chance-cal/2099-05-25' },
		activated: 'chance-cal/2099-06-01',
		model: { version: 'dixon-coles/6', shots: { enabled: true, a: 0.7 } },
		now: new Date(T + 24 * 3600_000),
	});

	test('krótko: liczby i co zmieniono', () => {
		const { subject, text } = r.formatWeeklyReport(summary);
		assert.match(subject, /korekta zmieniona/);
		assert.match(text, /dixon-coles\/6, strzały celne z wagą goli 0,7/);
		assert.match(text, /zmieniona — chance-cal\/2099-05-25 → chance-cal\/2099-06-01/);
		assert.match(text, /X2: WŁĄCZONA \(przesunięcie 0,000 → -0,120/);
		assert.match(text, /home: bez zmian.*sprawdzian_nie_potwierdza/);
		assert.match(text, /LOG LOSS 1X2/);
		assert.match(text, /KUPONY .*dnia 1\/1/);
		assert.ok(text.split('\n').length < 40, 'raport ma być krótki');
	});

	test('bez zmiany kalibracji temat to mówi', () => {
		const s = r.buildWeeklySummary({ forecasts: [], picks: [], coupons: [], decision: { changed: false, selections: [], reasons: [] }, active: { version: 'v' }, now: new Date(T) });
		const { subject, text } = r.formatWeeklyReport(s);
		assert.match(subject, /bez zmian/);
		assert.match(text, /KOREKTA SZANSY: bez zmian \(v\)/);
		assert.match(text, /CLV: brak/);
	});
});

describe('przebieg zadania na prawdziwym dzienniku', () => {
	const scope = `test-${crypto.randomUUID()}`;
	const polaczenie = mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });
	after(async () => {
		await ModelReport.deleteMany({ scope });
		await ChanceCalibration.deleteMany({ scope });
		await mongoose.disconnect();
	});

	test('podgląd liczy raport i niczego nie zapisuje', async () => {
		await polaczenie;
		const przed = await ModelReport.countDocuments({});
		const w = await runWeeklyModelJob({ dryRun: true, scope, send: false });
		assert.equal(w.reportId, null);
		assert.equal(w.activated, null);
		assert.ok(w.text.includes('LOG LOSS 1X2'));
		assert.equal(await ModelReport.countDocuments({}), przed);
		assert.equal(await ChanceCalibration.countDocuments({ scope }), 0);
	});

	test('przebieg zapisuje raport (pod swoim scope), bez maila; historia go pokazuje', async () => {
		await polaczenie;
		const w = await runWeeklyModelJob({ scope, send: false });
		assert.ok(w.reportId);
		assert.equal(w.emailedTo, 0);
		const historia = await weeklyReportHistory({ scope });
		assert.equal(historia.length, 1);
		assert.equal(historia[0].subject, w.subject);
		// Gdy kalibracja się zmieniła, nowa wersja jest aktywna pod tym samym scope i wskazuje raport.
		if (w.activated) {
			const doc = await ChanceCalibration.findOne({ scope, version: w.activated }).lean();
			assert.equal(doc.active, true);
			assert.equal(String(doc.reportId), w.reportId);
		}
	});
});
