import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kreator kuponu na prawdziwej bazie (`lib/coupons/customService.js`) — trasy bez warstwy Next.js
 * (`customGenerateHttp`, `customMineHttp`), z plakietkami, kursami i wiadomościami podstawionymi.
 *
 * BAZA JEST PRODUKCYJNA: mecze i kupony w czerwcu 2099 (żaden inny test nie używa tych dni), losowe
 * identyfikatory meczów i kont, sprzątanie w `after()`. Limit, blokada i dziennik użycia podstawione —
 * nic nie trafia do Redisa ani do `UsageLog`; nigdy prawdziwe API piłkarskie ani AI.
 *
 * Sprawdzamy: 401 bez sesji, 403 (zapowiedź) bez planu, 429 przy wyczerpanym limicie, 409 przy
 * złożeniu w toku, 400 przy złych ustawieniach; udany kupon z okna i lig użytkownika zapisany jako
 * `custom` na koncie, limit zużyty raz; powtórka i „nie da się" limitu nie zużywają; typ z ryzykiem
 * w wiadomościach wypada; „bez meczów z kuponów serwisu"; rozliczanie obejmuje kupony z kreatora,
 * „Moje kupony" mają bilans tylko własnych, a publiczne zestawienia kuponów z kreatora nie widzą.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Coupon = (await import('@/models/Coupon')).default;
const { customGenerateHttp, customMineHttp } = await import('@/lib/coupons/customService');
const { settleCoupons, couponsOverview, couponLegsForDate, couponStats, activeCouponFixtureIds } = await import('@/lib/coupons/service');
const { trialAllowance } = await import('@/lib/billing/entitlements');
const { PLANS, QUOTA_PERIODS, TRIAL } = await import('@/lib/billing/plans');
const { localMidnight } = await import('@/lib/time');

const PREFIX = `8${crypto.randomInt(10_000_000, 99_999_999)}`;
const USER = new mongoose.Types.ObjectId();
const INNY = new mongoose.Types.ObjectId();
const PRO = { plan: 'pro', planStatus: 'active', planValidUntil: new Date('2099-12-31T00:00:00Z'), createdAt: new Date('2020-01-01') };

const o = (date, h, m = 0) => new Date(localMidnight(date).getTime() + (h * 60 + m) * 60_000);
const A = '2099-06-10';
const B = '2099-06-14';
const C = '2099-06-18';
const D = '2099-06-22';
const E = '2099-06-26';

const kursy = new Map();
let nr = 0;
function wpis(date, h, probability, odds, { leagueId = 39, m = 0 } = {}) {
	const fixtureId = `${PREFIX}${String(++nr).padStart(3, '0')}`;
	kursy.set(fixtureId, odds);
	return {
		fixtureId,
		home: `Gospodarz ${PREFIX}-${nr}`,
		away: `Gość ${nr}`,
		league: leagueId === 140 ? 'La Liga, Spain' : 'Premier League, England',
		leagueId,
		kickoff: o(date, h, m).toISOString(),
		hint: { key: 'home', selection: `Gospodarz ${nr} wygra`, probability, base: 45, lift: probability - 45 },
	};
}

/** Wieczorne typy po ~1,35–1,39 — trzy dają 2,4–2,8; szansa nie wyższa niż wynika z kursu. */
const wieczor = (date) => [wpis(date, 18, 74, 1.35), wpis(date, 19, 73, 1.36), wpis(date, 20, 72, 1.37), wpis(date, 21, 71, 1.38)];

const LISTY = {
	[A]: [
		...wieczor(A),
		// Po południu w Hiszpanii — nie wchodzi do okna „wieczorem".
		wpis(A, 14, 80, 1.24, { leagueId: 140 }),
		wpis(A, 15, 79, 1.25, { leagueId: 140 }),
		// O 23:30 — poza godzinami kuponów, choć najpewniejszy.
		wpis(A, 23, 90, 1.1, { m: 30 }),
		// Kurs 1,60 — poza zasadami typu.
		wpis(A, 19, 62, 1.6, { m: 30 }),
		// Liga spoza sprawdzonych — nie trafia na kupony.
		wpis(A, 20, 85, 1.15, { leagueId: 999999, m: 30 }),
	],
	// Jeden typ spełnia zasady: 1,60 za wysoki, przy 90% i 1,30 rynek mniej pewny niż model.
	[B]: [wpis(B, 18, 76, 1.3), wpis(B, 19, 62, 1.6), wpis(B, 20, 90, 1.3)],
	[C]: [...wieczor(C), wpis(C, 22, 70, 1.39)],
	[D]: [...wieczor(D), wpis(D, 22, 70, 1.39), wpis(D, 22, 69, 1.39, { m: 30 })],
	[E]: wieczor(E),
};
const RYZYKOWNY = LISTY[C][0].fixtureId;

/** Zależności serwisu — liczniki wywołań, żeby sprawdzić także to, czego NIE zrobiono. */
function zaleznosci(over = {}) {
	const s = { zuzyte: [], uzycie: [], plakietki: 0, wiadomosci: [] };
	s.deps = {
		loadUser: async () => PRO,
		checkQuota: async () => ({ allowed: true, limit: 3, used: 0, remaining: 3, plan: 'pro' }),
		consumeQuota: async (a) => s.zuzyte.push(a),
		recordUsage: async (e) => s.uzycie.push(e),
		lock: { acquire: async () => true, release: async () => {} },
		hintsFor: async (date) => {
			s.plakietki += 1;
			return { list: LISTY[date] || [] };
		},
		fetchOdds: async (id) => ({ at: new Date(), bookmakers: 8, home: kursy.get(id) ?? null }),
		checkNews: async (leg) => {
			s.wiadomosci.push(leg.fixtureId);
			return leg.fixtureId === RYZYKOWNY
				? { verdict: 'risk', reason: 'kontuzja lidera', sources: [] }
				: { verdict: 'ok', reason: null, sources: [{ title: 'Źródło', url: 'https://example.com' }] };
		},
		newsBudget: async () => true,
		scheduleFor: async () => null,
		...over,
	};
	return s;
}
const zloz = (s, params, now, userId = USER) => customGenerateHttp({ userId, body: { params }, now, deps: s.deps });
const WIECZOR_25 = { odds: 2.5, legs: 4, window: 'evening' };

after(async () => {
	await Coupon.deleteMany({ $or: [{ userId: { $in: [USER, INNY] } }, { key: `daily:${D}` }] });
	await mongoose.disconnect();
});

describe('dostęp i limit — sprawdzane po stronie serwera', () => {
	test('bez sesji: 401 przy złożeniu i przy „Moich kuponach"', async () => {
		const s = zaleznosci();
		const r = await customGenerateHttp({ userId: null, body: { params: WIECZOR_25 }, deps: s.deps });
		assert.equal(r.status, 401);
		assert.equal(r.body.error, 'login_required');
		assert.equal((await customMineHttp({ userId: null, deps: s.deps })).status, 401);
		assert.equal(s.plakietki, 0);
	});

	test('plan bez kreatora: 403 z zapowiedzią, nic się nie liczy', async () => {
		const s = zaleznosci({ checkQuota: async () => ({ allowed: false, limit: 0, used: 0, remaining: 0, plan: 'free' }) });
		const r = await zloz(s, WIECZOR_25, o(A, 10));
		assert.equal(r.status, 403);
		assert.equal(r.body.error, 'plan_required');
		assert.equal(r.body.trialDays, TRIAL.days);
		assert.equal(s.plakietki, 0);
		assert.equal(s.zuzyte.length, 0);
	});

	test('limit na dziś wyczerpany: 429, nic się nie liczy', async () => {
		const s = zaleznosci({ checkQuota: async () => ({ allowed: false, limit: 3, used: 3, remaining: 0, plan: 'pro' }) });
		const r = await zloz(s, WIECZOR_25, o(A, 10));
		assert.equal(r.status, 429);
		assert.deepEqual(r.body.quota, { limit: 3, used: 3, remaining: 0 });
		assert.equal(s.plakietki, 0);
	});

	test('złe ustawienia: 400 z polami; złożenie w toku: 409', async () => {
		const s = zaleznosci();
		const zle = await zloz(s, { odds: 7, window: 'tydzien' }, o(A, 10));
		assert.equal(zle.status, 400);
		assert.deepEqual(zle.body.errors, ['odds', 'window']);
		const wToku = zaleznosci({ lock: { acquire: async () => false, release: async () => {} } });
		const zajety = await zloz(wToku, WIECZOR_25, o(A, 10));
		assert.equal(zajety.status, 409);
		assert.equal(zajety.body.error, 'busy');
		assert.equal(wToku.plakietki, 0);
	});

	test('limity planów: darmowy 0, Pro 3, VIP 10 dziennie; okres próbny 2 dziennie', () => {
		assert.equal(QUOTA_PERIODS.couponGen, 'day');
		assert.deepEqual([PLANS.free.limits.couponGen, PLANS.pro.limits.couponGen, PLANS.vip.limits.couponGen], [0, 3, 10]);
		assert.equal(trialAllowance({ plan: 'free', createdAt: new Date() }, 'couponGen'), 2);
		assert.equal(trialAllowance({ plan: 'free', createdAt: new Date('2020-01-01') }, 'couponGen'), 0);
		assert.equal(trialAllowance({ plan: 'pro', createdAt: new Date() }, 'couponGen'), 0);
	});
});

describe('złożenie kuponu', () => {
	let kluczA;

	test('wieczór, ok. 2,5: tylko mecze 18–23 z lig sprawdzonych, zapis na koncie, limit zużyty raz', async () => {
		const s = zaleznosci();
		const teraz = o(A, 10);
		const r = await zloz(s, WIECZOR_25, teraz);
		assert.equal(r.status, 200, JSON.stringify(r.body));
		assert.equal(r.body.ok, true);
		assert.equal(r.body.repeated, false);
		const k = r.body.coupon;
		const wieczorne = LISTY[A].slice(0, 4).map((w) => w.fixtureId);
		assert.equal(k.type, 'custom');
		assert.equal(k.legs.length, 3);
		assert.ok(k.legs.every((l) => wieczorne.includes(l.fixtureId)));
		assert.equal(k.totalOdds, 2.52);
		assert.equal(k.chance, 39);
		assert.equal(k.createdAt, teraz.toISOString());
		assert.deepEqual(k.params, { odds: '2.5', legs: 4, window: 'evening', leagues: [], skipPublished: false });
		assert.ok(k.newsCheck.checked >= 3);
		assert.ok(k.legs.every((l) => l.newsOk));
		assert.deepEqual(r.body.quota, { limit: 3, used: 1, remaining: 2 });

		assert.equal(s.zuzyte.length, 1);
		assert.equal(s.zuzyte[0].kind, 'couponGen');
		assert.deepEqual(s.uzycie.map((u) => [u.kind, String(u.userId)]), [['couponGen', String(USER)]]);

		const zapis = await Coupon.findOne({ key: k.key }).lean();
		kluczA = zapis.key;
		assert.match(zapis.key, new RegExp(`^custom:${USER}:\\d+$`));
		assert.equal(String(zapis.userId), String(USER));
		assert.equal(zapis.date, A);
		assert.equal(zapis.status, 'pending');
		assert.ok(zapis.legs.every((l) => l.status === 'pending' && l.news?.verdict === 'ok'));
		// Pomocnicze pola (drużyny, terminarz) nie trafiają do bazy — ten sam kształt nóg co kupony serwisu.
		assert.ok(zapis.legs.every((l) => l.teamSchedule === undefined && l.homeId === undefined));
	});

	test('powtórka tych samych ustawień: ten sam kupon, limit nietknięty, bez drugiego zapisu', async () => {
		const s = zaleznosci();
		const r = await zloz(s, WIECZOR_25, o(A, 10, 5));
		assert.equal(r.body.ok, true);
		assert.equal(r.body.repeated, true);
		assert.equal(r.body.coupon.key, kluczA);
		assert.equal(s.zuzyte.length, 0);
		assert.equal(await Coupon.countDocuments({ userId: USER, date: A }), 1);
	});

	test('za mało typów spełniających zasady: „nie da się" z liczbami, limit nietknięty, nic nie zapisane', async () => {
		const s = zaleznosci();
		const r = await zloz(s, WIECZOR_25, o(B, 10));
		assert.equal(r.status, 200);
		assert.equal(r.body.ok, false);
		assert.equal(r.body.reason, 'few_picks');
		assert.deepEqual(r.body.counts, { matches: 3, withOdds: 3, picks: 1, needed: 3 });
		assert.ok(r.body.suggest.includes('window'));
		assert.deepEqual(r.body.quota, { limit: 3, used: 0, remaining: 3 });
		assert.equal(s.zuzyte.length, 0);
		assert.equal(await Coupon.countDocuments({ userId: USER, date: B }), 0);
	});

	test('dwa mecze przy ok. 2,5 albo okno już puste: „nie da się" bez pobierania czegokolwiek', async () => {
		const s = zaleznosci();
		const dwa = await zloz(s, { ...WIECZOR_25, legs: 2 }, o(A, 10));
		assert.equal(dwa.body.reason, 'too_few_legs');
		assert.equal(dwa.body.needed, 3);
		const pozno = await zloz(s, WIECZOR_25, o(A, 22, 30));
		assert.equal(pozno.body.reason, 'window_closed');
		assert.equal(s.plakietki, 0);
		assert.equal(s.zuzyte.length, 0);
	});

	test('typ z ryzykiem w wiadomościach wypada, wchodzi następny i też jest sprawdzany', async () => {
		const s = zaleznosci();
		const r = await zloz(s, WIECZOR_25, o(C, 10));
		assert.equal(r.body.ok, true, JSON.stringify(r.body));
		const k = r.body.coupon;
		assert.ok(!k.legs.some((l) => l.fixtureId === RYZYKOWNY));
		assert.equal(k.legs.length, 3);
		assert.ok(k.totalOdds >= 2.4 && k.totalOdds <= 2.8);
		assert.deepEqual(k.newsCheck.dropped.map((d) => d.reason), ['kontuzja lidera']);
		assert.equal(k.newsCheck.checked, 4);
		assert.ok(s.wiadomosci.includes(RYZYKOWNY));
		assert.equal(s.zuzyte.length, 1);
	});

	test('dzienny próg wydatków na AI: kupon bez sprawdzenia wiadomości, oznaczony; limit zużyty jak zwykle', async () => {
		const s = zaleznosci({ newsBudget: async () => false });
		const r = await zloz(s, WIECZOR_25, o(E, 10), INNY);
		assert.equal(r.body.ok, true, JSON.stringify(r.body));
		assert.equal(r.body.coupon.newsSkipped, 'spend_cap');
		assert.equal(r.body.coupon.newsCheck, null);
		assert.deepEqual(s.wiadomosci, []);
		assert.equal(s.zuzyte.length, 1);
		assert.equal(s.uzycie[0].costUsd, 0);
	});

	test('„bez meczów z kuponów serwisu": mecze z dzisiejszego kuponu dnia nie wchodzą', async () => {
		const opublikowane = LISTY[D].slice(0, 3);
		await Coupon.create({
			key: `daily:${D}`,
			type: 'daily',
			date: D,
			legs: opublikowane.map((w) => ({
				fixtureId: w.fixtureId,
				homeName: w.home,
				awayName: w.away,
				kickoff: new Date(w.kickoff),
				key: 'home',
				selection: w.hint.selection,
				probability: w.hint.probability,
				odds: kursy.get(w.fixtureId),
			})),
			totalOdds: 2.52,
			chance: 39,
			status: 'pending',
		});
		const ids = opublikowane.map((w) => w.fixtureId);
		assert.deepEqual((await activeCouponFixtureIds(o(D, 10))).filter((id) => id.startsWith(PREFIX)).sort(), [...ids].sort());

		const s = zaleznosci();
		const bez = await zloz(s, { ...WIECZOR_25, skipPublished: true }, o(D, 10));
		assert.equal(bez.body.ok, true, JSON.stringify(bez.body));
		assert.ok(!bez.body.coupon.legs.some((l) => ids.includes(l.fixtureId)));
		assert.equal(bez.body.coupon.params.skipPublished, true);
	});
});

describe('rozliczenie i „Moje kupony"', () => {
	test('rozliczanie obejmuje kupony z kreatora: wszystkie trafione — wszedł, chybiony — nie wszedł', async () => {
		const [a, c] = await Promise.all([
			Coupon.findOne({ userId: USER, date: A }).lean(),
			Coupon.findOne({ userId: USER, date: C }).lean(),
		]);
		const pierwszyC = [...c.legs].sort((x, y) => new Date(x.kickoff) - new Date(y.kickoff))[0].fixtureId;
		const wiersze = async (ids) =>
			ids.map((id) => ({ fixture: { id, status: { short: 'FT' } }, goals: id === pierwszyC ? { home: 0, away: 1 } : { home: 2, away: 0 } }));
		const r = await settleCoupons({ now: o(C, 23, 59), fetchRows: wiersze, query: { key: { $in: [a.key, c.key] } } });
		assert.equal(r.settled, 2);
		const [poA, poC] = await Promise.all([Coupon.findOne({ key: a.key }).lean(), Coupon.findOne({ key: c.key }).lean()]);
		assert.equal(poA.status, 'won');
		assert.ok(poA.legs.every((l) => l.status === 'won' && l.score === '2:0'));
		assert.equal(poC.status, 'lost');
	});

	test('tylko własne kupony, od najnowszego; bilans ze wszystkich; `limit=0` — sam limit i bilans', async () => {
		await Coupon.create({
			key: `custom:${INNY}:${Date.now()}`,
			type: 'custom',
			userId: INNY,
			date: A,
			legs: [],
			totalOdds: 2.5,
			chance: 40,
			status: 'won',
			createdAt: o(A, 12),
		});
		const s = zaleznosci();
		const r = await customMineHttp({ userId: USER, now: o(D, 12), deps: s.deps });
		assert.equal(r.status, 200);
		assert.equal(r.body.access, true);
		assert.deepEqual(r.body.coupons.map((k) => k.date), [D, C, A]);
		assert.ok(r.body.coupons.every((k) => k.type === 'custom' && k.params));
		assert.deepEqual(
			[r.body.summary.total, r.body.summary.won, r.body.summary.lost, r.body.summary.pending],
			[3, 1, 1, 1]
		);
		assert.deepEqual(r.body.quota, { limit: 3, used: 0, remaining: 3 });

		const krotko = await customMineHttp({ userId: USER, limit: 0, deps: s.deps });
		assert.deepEqual(krotko.body.coupons, []);
		assert.equal(krotko.body.summary.total, 3);

		const bezPlanu = await customMineHttp({
			userId: USER,
			deps: { ...s.deps, checkQuota: async () => ({ allowed: false, limit: 0, used: 0 }) },
		});
		assert.equal(bezPlanu.body.access, false);
		assert.equal(bezPlanu.body.coupons.length, 3, 'po planie własne kupony zostają do wglądu');
	});

	test('publiczne zestawienia nie widzą kuponów z kreatora', async () => {
		const wlasne = (await Coupon.find({ userId: USER }).select('legs.fixtureId').lean()).flatMap((k) => k.legs.map((l) => l.fixtureId));
		assert.ok(wlasne.length >= 9);

		for (const date of [A, C]) {
			const plan = await couponsOverview({ now: o(date, 11), unlocked: true });
			const tekst = JSON.stringify(plan);
			assert.ok(!wlasne.some((id) => tekst.includes(id)), `couponsOverview ${date}`);
			assert.equal(plan.record.custom, undefined);
			const nogi = await couponLegsForDate(date, { unlocked: true });
			assert.ok(!nogi.some((l) => wlasne.includes(l.fixtureId)), `couponLegsForDate ${date}`);
		}
		await assert.rejects(couponStats({ type: 'custom' }), /publicznego bilansu/);
		// Kupony serwisu „w grze" (opcja „bez meczów z kuponów serwisu") też bez kuponów z kreatora.
		const aktywne = await activeCouponFixtureIds(o(A, 10));
		assert.ok(!aktywne.some((id) => wlasne.includes(id)));
	});
});
