import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kupony na prawdziwej bazie — na datach z 2099 roku (klucz kuponu to data, a baza jest
 * wspólna z produkcją), z plakietkami i kursami podstawionymi zamiast dostawcy, ze sprzątaniem.
 *
 * Sprawdzamy: kupony powstają dopiero po 9:30 i raz — dnia, 3-dniowy i 5-dniowy, każdy z innymi
 * meczami; płatne bez planu przychodzą bez meczów; gdy nie da się ich złożyć — do południa nic,
 * potem „bez kuponu"; nieudane pobranie kursów wstrzymuje kupon; rozliczenie zamyka kupon od
 * pierwszego chybionego i pokazuje wynik w statystyce.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Coupon = (await import('@/models/Coupon')).default;
const { ensureCoupons, settleCoupons, couponsOverview, couponStats, couponDates } = await import('@/lib/coupons/service');
const { localDate, localMidnight } = await import('@/lib/time');

const PREFIX = `9${crypto.randomInt(10_000_000, 99_999_999)}`;
let nr = 0;

const o = (date, h, m = 0) => new Date(localMidnight(date).getTime() + (h * 60 + m) * 60_000);
const D0 = '2099-01-02';
const D = [0, 1, 2, 3, 4].map((i) => localDate(o(D0, 12), i));
// Osobne miesiące: pule 3 i 5 dni tych dni nie sięgają do meczów z innych testów.
const WTOREK = '2099-03-03';
const SRODA = '2099-05-06';

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

const LISTY = {
	// Dzień publikacji: kupon dnia bierze cztery pierwsze (1,60 nie wchodzi — tam model przesadza).
	[D[0]]: [wpis(D[0], 15, 90, 1.15), wpis(D[0], 16, 88, 1.2), wpis(D[0], 17, 86, 1.25), wpis(D[0], 18, 84, 1.3), wpis(D[0], 21, 70, 1.6)],
	[D[1]]: [wpis(D[1], 15, 89, 1.2), wpis(D[1], 17, 87, 1.22), wpis(D[1], 19, 85, 1.3)],
	[D[2]]: [wpis(D[2], 15, 86, 1.18), wpis(D[2], 18, 83, 1.25)],
	[D[3]]: [wpis(D[3], 14, 88, 1.15), wpis(D[3], 16, 86, 1.2), wpis(D[3], 18, 84, 1.25)],
	[D[4]]: [wpis(D[4], 14, 87, 1.2), wpis(D[4], 16, 85, 1.22), wpis(D[4], 18, 83, 1.3), wpis(D[4], 20, 82, 1.28)],
	// Za mało typów do kursu 2,0.
	[WTOREK]: [wpis(WTOREK, 20, 85, 1.2), wpis(WTOREK, 21, 80, 1.2)],
	// Dość typów, ale kursu najpewniejszego meczu nie da się pobrać.
	[SRODA]: [wpis(SRODA, 22, 92, 1.1), wpis(SRODA, 22, 85, 1.3), wpis(SRODA, 22, 84, 1.3), wpis(SRODA, 22, 83, 1.3)],
};
const UPARTY = LISTY[SRODA][0].fixtureId;
const opcje = {
	hintsFor: async (date) => ({ list: LISTY[date] || [] }),
	fetchOdds: async (fixtureId) => {
		if (fixtureId === UPARTY) throw new Error('API zwróciło 429');
		return { at: new Date(), bookmakers: 8, home: kursy.get(fixtureId) ?? null };
	},
};
const klucze = (date) => ['daily', 'days3', 'days5'].map((t) => `${t}:${date}`);
const NASZE = { date: { $in: [D[0], WTOREK, SRODA] } };

after(async () => {
	await Coupon.deleteMany(NASZE);
	await mongoose.disconnect();
});

describe('wybór kuponów', () => {
	test('pula: dzień publikacji i kolejne dni', () => {
		assert.deepEqual(couponDates('daily', o(D0, 10)), [D[0]]);
		assert.deepEqual(couponDates('days3', o(D0, 10)), D.slice(0, 3));
		assert.deepEqual(couponDates('days5', o(D0, 10)), D);
	});

	test('przed 9:30 nic nie powstaje', async () => {
		const r = await ensureCoupons({ now: o(D0, 9, 20), ...opcje });
		assert.deepEqual(r, { created: [], none: [], postponed: [], details: {} });
		assert.equal(await Coupon.countDocuments(NASZE), 0);
	});

	test('po 9:30: dnia, 3- i 5-dniowy, każdy z innymi meczami; drugi przebieg niczego nie zmienia', async () => {
		const r = await ensureCoupons({ now: o(D0, 9, 40), ...opcje });
		assert.deepEqual(r.created, klucze(D[0]));

		const [dzienny, trzy, piec] = await Promise.all(klucze(D[0]).map((key) => Coupon.findOne({ key }).lean()));
		assert.ok(dzienny.totalOdds >= 2 && dzienny.totalOdds <= 2.6);
		assert.ok(dzienny.legs.every((l) => l.odds < 1.4 && localDate(l.kickoff) === D[0]));
		assert.ok(trzy.totalOdds >= 2 && trzy.totalOdds <= 2.6);
		assert.ok(trzy.legs.every((l) => D.slice(0, 3).includes(localDate(l.kickoff))));
		assert.ok(piec.totalOdds >= 3 && piec.totalOdds <= 3.9);
		const id = (k) => k.legs.map((l) => l.fixtureId);
		const wszystkie = [...id(dzienny), ...id(trzy), ...id(piec)];
		assert.equal(new Set(wszystkie).size, wszystkie.length, 'mecze nie powtarzają się między kuponami');

		const ponownie = await ensureCoupons({ now: o(D0, 10), ...opcje });
		assert.deepEqual(ponownie.created, []);
		assert.equal(await Coupon.countDocuments({ date: D[0] }), 3);
	});

	test('bez planu płatne kupony przychodzą bez meczów; kupon dnia zawsze z meczami', async () => {
		const gosc = await couponsOverview({ now: o(D0, 11) });
		assert.ok(gosc.today.legs.length > 0);
		for (const k of [gosc.days3, gosc.days5]) {
			assert.equal(k.locked, true);
			assert.deepEqual(k.legs, []);
			assert.ok(k.legsCount > 0 && k.totalOdds > 1 && k.chance > 0 && k.firstKickoff && k.lastKickoff);
		}
		const plan = await couponsOverview({ now: o(D0, 11), unlocked: true });
		assert.equal(plan.days3.locked, undefined);
		assert.equal(plan.days3.legs.length, gosc.days3.legsCount);
		assert.equal(plan.days5.legs.length, gosc.days5.legsCount);
	});

	test('za mało typów: do południa nic, po południu „bez kuponu" dla wszystkich trzech', async () => {
		assert.deepEqual((await ensureCoupons({ now: o(WTOREK, 10), ...opcje })).created, []);
		assert.equal(await Coupon.countDocuments({ date: WTOREK }), 0);
		const r = await ensureCoupons({ now: o(WTOREK, 12, 10), ...opcje });
		assert.deepEqual(r.none, klucze(WTOREK));
		const ov = await couponsOverview({ now: o(WTOREK, 13) });
		assert.equal(ov.today.status, 'none');
		assert.equal(ov.todayLater, false);
	});
});

describe('nieudane pobranie kursów', () => {
	test('kursu nie ma — kupony czekają na kolejny przebieg; od 22:00 już nie czekają', async () => {
		const r = await ensureCoupons({ now: o(SRODA, 13), ...opcje });
		assert.deepEqual(r.postponed, klucze(SRODA));
		assert.deepEqual(r.details[`daily:${SRODA}`], { entries: 4, fetched: 3, failed: 1, withOdds: 3 });
		assert.equal(await Coupon.countDocuments({ date: SRODA }), 0);

		assert.deepEqual((await ensureCoupons({ now: o(SRODA, 21), ...opcje })).postponed, klucze(SRODA));
		const ostatnia = await ensureCoupons({ now: o(SRODA, 22), ...opcje });
		assert.equal(ostatnia.postponed.length, 0);
		// O 22:00 mecze o 22:00 nie mają już godziny wyprzedzenia — kuponów nie da się złożyć.
		assert.deepEqual(ostatnia.none, klucze(SRODA));
	});
});

describe('rozliczenie i statystyka', () => {
	test('typy rozliczane dwie godziny po meczu; chybiony zamyka kupon jako przegrany', async () => {
		const dzienny = await Coupon.findOne({ key: `daily:${D[0]}` }).lean();
		const [pierwszy, drugi] = dzienny.legs;
		const wiersze = (ids) =>
			ids.map((id) => ({
				fixture: { id, status: { short: 'FT' } },
				// Pierwszy typ trafiony 2:0, drugi chybiony 0:1.
				goals: id === pierwszy.fixtureId ? { home: 2, away: 0 } : { home: 0, away: 1 },
			}));
		const zakres = { query: { key: `daily:${D[0]}` }, fetchRows: async (ids) => wiersze(ids) };

		// Godzinę po drugim meczu — rozliczony tylko pierwszy.
		await settleCoupons({ now: new Date(new Date(drugi.kickoff).getTime() + 3600_000), ...zakres });
		let teraz = await Coupon.findOne({ key: `daily:${D[0]}` }).lean();
		assert.equal(teraz.legs.find((l) => l.fixtureId === pierwszy.fixtureId).status, 'won');
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).status, 'pending');
		assert.equal(teraz.status, 'pending');

		const r = await settleCoupons({ now: new Date(new Date(drugi.kickoff).getTime() + 2.5 * 3600_000), ...zakres });
		teraz = await Coupon.findOne({ key: `daily:${D[0]}` }).lean();
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).status, 'lost');
		assert.equal(teraz.legs.find((l) => l.fixtureId === drugi.fixtureId).score, '0:1');
		assert.equal(teraz.status, 'lost');
		assert.ok(teraz.settledAt);
		assert.equal(r.settled, 1);
	});

	test('statystyka: rozliczony kupon z typami, „bez kuponu" osobno, płatny w grze zakryty bez planu', async () => {
		const s = await couponStats({ type: 'daily', days: null, now: o(WTOREK, 13), recent: 500 });
		const nasz = s.recent.find((k) => k.key === `daily:${D[0]}`);
		assert.equal(nasz.status, 'lost');
		assert.ok(nasz.legs.every((l) => typeof l.odds === 'number' && l.label));
		assert.ok(s.summary.lost >= 1 && s.summary.none >= 1);
		assert.ok(!s.recent.some((k) => k.key === `daily:${WTOREK}`));

		const zakryty = (await couponStats({ type: 'days3', now: o(D0, 11), recent: 500, unlocked: false })).recent.find(
			(k) => k.key === `days3:${D[0]}`
		);
		assert.equal(zakryty.locked, true);
		assert.deepEqual(zakryty.legs, []);
	});
});
