import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kupony na prawdziwej bazie — na datach z 2099 roku (klucz kuponu to data, a baza jest
 * wspólna z produkcją), z plakietkami i kursami podstawionymi zamiast dostawcy, ze sprzątaniem.
 *
 * Sprawdzamy: kupon powstaje dopiero po 9:30 i raz; weekendowy w piątek, bez meczów z kuponu
 * dnia; gdy nie da się go złożyć — do południa nic, potem „dziś bez kuponu"; rozliczenie
 * zamyka kupon od pierwszego chybionego i pokazuje wynik w statystyce.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Coupon = (await import('@/models/Coupon')).default;
const { ensureCoupons, settleCoupons, couponsOverview, couponStats, weekendWindow } = await import('@/lib/coupons/service');
const { localDate, localMidnight } = await import('@/lib/time');

const PREFIX = `9${crypto.randomInt(10_000_000, 99_999_999)}`;
let nr = 0;

/** Pierwszy piątek i pierwszy wtorek 2099 roku (data w czasie polskim). */
function dzien(weekday) {
	for (let d = 1; d <= 7; d++) {
		const date = `2099-01-0${d}`;
		if (new Date(`${date}T12:00:00Z`).getUTCDay() === weekday) return date;
	}
	throw new Error('brak dnia');
}
const PIATEK = dzien(5);
const WTOREK = dzien(2);
const o = (date, h, m = 0) => new Date(localMidnight(date).getTime() + (h * 60 + m) * 60_000);

/** Plakietka z listy dnia (`hintsForDate().list`) i jej kurs (dla podstawionego dostawcy). */
const kursy = new Map();
function wpis(date, h, probability, odds) {
	const fixtureId = `${PREFIX}${String(++nr).padStart(3, '0')}`;
	kursy.set(fixtureId, odds);
	return {
		fixtureId,
		home: `Gospodarz ${nr}`,
		away: `Gość ${nr}`,
		league: 'Ekstraklasa, Poland',
		leagueId: 106,
		kickoff: o(date, h).toISOString(),
		hint: { key: 'home', selection: `Gospodarz ${nr} wygra`, probability, base: 45, lift: probability - 45 },
	};
}

const sobota = localDate(o(PIATEK, 12), 1);
const niedziela = localDate(o(PIATEK, 12), 2);
const LISTY = {
	[PIATEK]: [wpis(PIATEK, 18, 86, 1.2), wpis(PIATEK, 19, 84, 1.25), wpis(PIATEK, 20, 82, 1.35), wpis(PIATEK, 21, 70, 1.6)],
	[sobota]: [wpis(sobota, 15, 85, 1.22), wpis(sobota, 17, 83, 1.3), wpis(sobota, 18, 81, 1.28)],
	[niedziela]: [wpis(niedziela, 15, 80, 1.33), wpis(niedziela, 17, 79, 1.25), wpis(niedziela, 20, 77, 1.3)],
	// Wtorek: za mało typów do kursu 2,0.
	[WTOREK]: [wpis(WTOREK, 20, 85, 1.2), wpis(WTOREK, 21, 80, 1.2)],
};
let pytaniaOKursy = 0;
const opcje = {
	hintsFor: async (date) => ({ list: LISTY[date] || [] }),
	fetchOdds: async (fixtureId) => {
		pytaniaOKursy += 1;
		return { at: new Date(), bookmakers: 8, home: kursy.get(fixtureId) ?? null };
	},
};
const KLUCZE = [`daily:${PIATEK}`, `weekend:${PIATEK}`, `daily:${WTOREK}`];

after(async () => {
	await Coupon.deleteMany({ key: { $in: KLUCZE } });
	await mongoose.disconnect();
});

describe('wybór kuponów', () => {
	test('weekend liczy się od piątku i soboty; w inne dni nie ma okna', () => {
		assert.deepEqual(weekendWindow(o(PIATEK, 10)), { friday: PIATEK, dates: [PIATEK, sobota, niedziela] });
		assert.deepEqual(weekendWindow(o(sobota, 10)), { friday: PIATEK, dates: [sobota, niedziela] });
		assert.equal(weekendWindow(o(WTOREK, 10)), null);
	});

	test('przed 9:30 nic nie powstaje', async () => {
		const r = await ensureCoupons({ now: o(PIATEK, 9, 20), ...opcje });
		assert.deepEqual(r, { created: [], none: [] });
		assert.equal(await Coupon.countDocuments({ key: { $in: KLUCZE } }), 0);
	});

	test('piątek po 9:30: kupon dnia i weekendowy, bez wspólnych meczów; drugi przebieg niczego nie zmienia', async () => {
		const r = await ensureCoupons({ now: o(PIATEK, 9, 40), ...opcje });
		assert.deepEqual(r.created.sort(), [`daily:${PIATEK}`, `weekend:${PIATEK}`].sort());

		const dzienny = await Coupon.findOne({ key: `daily:${PIATEK}` }).lean();
		const weekend = await Coupon.findOne({ key: `weekend:${PIATEK}` }).lean();
		assert.equal(dzienny.status, 'pending');
		assert.ok(dzienny.totalOdds >= 2 && dzienny.totalOdds <= 2.6);
		// Kurs 1,60 nie wchodzi na kupon — tam model przesadza.
		assert.ok(dzienny.legs.every((l) => l.odds < 1.4));
		assert.ok(weekend.totalOdds >= 3 && weekend.totalOdds <= 3.9);
		const wspolne = weekend.legs.filter((l) => dzienny.legs.some((d) => d.fixtureId === l.fixtureId));
		assert.equal(wspolne.length, 0);

		const ponownie = await ensureCoupons({ now: o(PIATEK, 10), ...opcje });
		assert.deepEqual(ponownie.created, []);
		assert.equal(await Coupon.countDocuments({ key: { $in: KLUCZE } }), 2);
	});

	test('za mało typów: do południa nic, po południu „dziś bez kuponu"', async () => {
		assert.deepEqual((await ensureCoupons({ now: o(WTOREK, 10), ...opcje })).created, []);
		assert.equal(await Coupon.exists({ key: `daily:${WTOREK}` }), null);
		const r = await ensureCoupons({ now: o(WTOREK, 12, 10), ...opcje });
		assert.deepEqual(r.none, [`daily:${WTOREK}`]);
		assert.equal((await Coupon.findOne({ key: `daily:${WTOREK}` }).lean()).status, 'none');
		const ov = await couponsOverview({ now: o(WTOREK, 13) });
		assert.equal(ov.today.status, 'none');
		assert.equal(ov.todayLater, false);
	});
});

describe('rozliczenie i statystyka', () => {
	test('typy rozliczane dwie godziny po meczu; chybiony zamyka kupon jako przegrany', async () => {
		const dzienny = await Coupon.findOne({ key: `daily:${PIATEK}` }).lean();
		const [pierwszy, drugi] = dzienny.legs;
		const wiersze = (ids) =>
			ids.map((id) => ({
				fixture: { id, status: { short: 'FT' } },
				// Pierwszy typ trafiony 2:0, drugi chybiony 0:1.
				goals: id === pierwszy.fixtureId ? { home: 2, away: 0 } : { home: 0, away: 1 },
			}));
		const zakres = { query: { key: { $in: KLUCZE } }, fetchRows: async (ids) => wiersze(ids) };

		// Godzinę po drugim meczu — rozliczony tylko pierwszy.
		await settleCoupons({ now: new Date(new Date(drugi.kickoff).getTime() + 3600_000), ...zakres });
		let teraz = await Coupon.findOne({ key: `daily:${PIATEK}` }).lean();
		assert.equal(teraz.legs.find((l) => l.fixtureId === pierwszy.fixtureId).status, 'won');
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).status, 'pending');
		assert.equal(teraz.status, 'pending');

		const r = await settleCoupons({ now: new Date(new Date(drugi.kickoff).getTime() + 2.5 * 3600_000), ...zakres });
		teraz = await Coupon.findOne({ key: `daily:${PIATEK}` }).lean();
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).status, 'lost');
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).score, '0:1');
		assert.equal(teraz.status, 'lost');
		assert.ok(teraz.settledAt);
		assert.equal(r.settled, 1);
	});

	test('statystyka liczy kupon i pokazuje go z typami; wtorek „bez kuponu" osobno', async () => {
		const s = await couponStats({ type: 'daily', days: null, now: o(WTOREK, 13), recent: 200 });
		const nasz = s.recent.find((k) => k.key === `daily:${PIATEK}`);
		assert.ok(nasz);
		assert.equal(nasz.status, 'lost');
		assert.ok(nasz.legs.every((l) => typeof l.odds === 'number' && l.label));
		assert.ok(s.summary.lost >= 1 && s.summary.none >= 1);
		assert.ok(!s.recent.some((k) => k.key === `daily:${WTOREK}`));
	});
});
