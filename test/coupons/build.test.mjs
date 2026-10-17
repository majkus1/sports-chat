import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kupon dnia i weekendowy — część czysta: wybór typów, rozliczenie, post na X. Bez bazy i sieci.
 *
 * Pilnujemy zasad, na których stoi uczciwość kuponu: tylko typy z kursem 1,05–1,40 (tam model
 * trafia tyle, ile obiecuje), jeden typ na mecz, od najpewniejszego, kurs łączny co najmniej
 * docelowy i bez przestrzelenia górnej granicy, gdy da się dobrać mniejszy typ. Rozliczenie
 * po 90 minutach, mecz odwołany jak kurs 1,00.
 */

setupEnv();
const { buildCoupon, legResult, couponStatus, settledOdds, legEligible, COUPON_TYPES } = await import('@/lib/coupons/build');
const { buildCouponPost, xLength, X_LIMIT } = await import('@/lib/social/posts');

const TERAZ = new Date('2026-10-17T08:00:00Z');
const za = (h) => new Date(TERAZ.getTime() + h * 3600_000);
let n = 0;
const typ = (probability, odds, extra = {}) => ({
	fixtureId: String(++n),
	homeName: `Gospodarz ${n}`,
	awayName: `Gość ${n}`,
	kickoff: za(5 + n / 10),
	key: 'home',
	selection: `Gospodarz ${n} wygra`,
	probability,
	odds,
	...extra,
});

describe('buildCoupon', () => {
	test('od najpewniejszego, aż kurs łączny dojdzie do celu; kolejność na kuponie po godzinie', () => {
		const a = typ(85, 1.2, { kickoff: za(9) });
		const b = typ(80, 1.25, { kickoff: za(3) });
		const c = typ(78, 1.35, { kickoff: za(6) });
		const d = typ(70, 1.3);
		const k = buildCoupon([d, c, a, b], { type: 'daily', now: TERAZ });
		assert.deepEqual(
			k.legs.map((l) => l.fixtureId),
			[b, c, a].map((x) => x.fixtureId)
		);
		assert.equal(k.totalOdds, Number((1.2 * 1.25 * 1.35).toFixed(2)));
		assert.ok(k.totalOdds >= COUPON_TYPES.daily.target);
		assert.equal(k.chance, Math.round(100 * 0.85 * 0.8 * 0.78));
	});

	test('pomija kursy spoza 1,05–1,40, mecze za mniej niż godzinę i wykluczone', () => {
		const zaNisko = typ(95, 1.03);
		const zaWysoko = typ(90, 1.45);
		const zaWczesnie = typ(90, 1.3, { kickoff: za(0.5) });
		const wykluczony = typ(90, 1.3);
		const ok = [typ(80, 1.3), typ(79, 1.3), typ(78, 1.3)];
		const k = buildCoupon([zaNisko, zaWysoko, zaWczesnie, wykluczony, ...ok], {
			type: 'daily',
			now: TERAZ,
			exclude: [wykluczony.fixtureId],
		});
		assert.deepEqual(
			k.legs.map((l) => l.fixtureId).sort(),
			ok.map((x) => x.fixtureId).sort()
		);
	});

	test('tylko mecze od 12:00 do 23:00 czasu polskiego — nocne MLS nie wchodzą', () => {
		// TERAZ = 10:00 w Polsce (CEST). 01:30 i 04:30 w nocy odpadają, 11:59 też, 23:00 wchodzi.
		const noc = [typ(95, 1.07, { kickoff: za(15.5) }), typ(94, 1.15, { kickoff: za(18.5) })];
		const dzien = [typ(80, 1.3), typ(79, 1.3), typ(78, 1.3)];
		const k = buildCoupon([...noc, ...dzien], { type: 'daily', now: TERAZ });
		assert.deepEqual(
			k.legs.map((l) => l.fixtureId).sort(),
			dzien.map((x) => x.fixtureId).sort()
		);
		assert.equal(legEligible(new Date('2026-10-17T09:59:00Z'), TERAZ), false);
		assert.equal(legEligible(new Date('2026-10-17T10:00:00Z'), TERAZ), true);
		assert.equal(legEligible(new Date('2026-10-17T21:00:00Z'), TERAZ), true);
		assert.equal(legEligible(new Date('2026-10-17T21:01:00Z'), TERAZ), false);
	});

	test('jeden typ na mecz', () => {
		const mecz = typ(85, 1.3);
		const drugiTypTegoMeczu = { ...mecz, key: 'X2', probability: 84 };
		const k = buildCoupon([mecz, drugiTypTegoMeczu, typ(80, 1.3), typ(79, 1.3)], { type: 'daily', now: TERAZ });
		assert.equal(new Set(k.legs.map((l) => l.fixtureId)).size, k.legs.length);
	});

	test('blisko celu przeskakuje typ, który przebiłby górną granicę, i bierze mniejszy', () => {
		// 1,39 × 1,39 = 1,93 (≥ 0,9 × 2,0); następny 1,39 dałby 2,69 > 2,6 — wchodzi 1,06.
		const k = buildCoupon([typ(90, 1.39), typ(89, 1.39), typ(88, 1.39), typ(70, 1.06)], { type: 'daily', now: TERAZ });
		assert.ok(k.totalOdds <= COUPON_TYPES.daily.max);
		assert.equal(k.legs.length, 3);
		assert.ok(k.legs.some((l) => l.odds === 1.06));
	});

	test('za mało typów do celu — brak kuponu, nie kupon za 1,5', () => {
		assert.equal(buildCoupon([typ(85, 1.2), typ(80, 1.2)], { type: 'daily', now: TERAZ }), null);
		assert.equal(buildCoupon([], { type: 'weekend', now: TERAZ }), null);
	});

	test('weekendowy celuje w ~3,0 i mieści więcej typów', () => {
		const pula = Array.from({ length: 10 }, (_, i) => typ(90 - i, 1.2));
		const k = buildCoupon(pula, { type: 'weekend', now: TERAZ });
		assert.ok(k.totalOdds >= 3 && k.totalOdds <= COUPON_TYPES.weekend.max);
		assert.ok(k.legs.length <= COUPON_TYPES.weekend.maxLegs);
	});
});

describe('rozliczenie', () => {
	const leg = (key) => ({ key });
	const wiersz = (short, goals, fulltime) => ({ fixture: { status: { short } }, goals, score: { fulltime } });

	test('po 90 minutach: dogrywka i karne liczą się z regulaminowego czasu', () => {
		assert.deepEqual(legResult(leg('home'), wiersz('FT', { home: 2, away: 1 })), { status: 'won', score: '2:1' });
		assert.deepEqual(legResult(leg('home'), wiersz('AET', { home: 2, away: 1 }, { home: 1, away: 1 })), {
			status: 'lost',
			score: '1:1',
		});
		assert.deepEqual(legResult(leg('X2'), wiersz('PEN', { home: 1, away: 1 }, { home: 1, away: 1 })), {
			status: 'won',
			score: '1:1',
		});
		assert.deepEqual(legResult(leg('awayScores'), wiersz('FT', { home: 3, away: 0 })), { status: 'lost', score: '3:0' });
	});

	test('mecz odwołany — anulowany; trwający albo bez danych — jeszcze nic', () => {
		assert.deepEqual(legResult(leg('home'), wiersz('PST', { home: null, away: null })), { status: 'void', score: null });
		assert.equal(legResult(leg('home'), wiersz('2H', { home: 1, away: 0 })), null);
		assert.equal(legResult(leg('home'), undefined), null);
	});

	test('kupon: przegrany od pierwszego chybionego, wygrany po wszystkich, odwołane jak 1,00', () => {
		const L = (status, odds = 1.3) => ({ status, odds });
		assert.equal(couponStatus([L('won'), L('lost'), L('pending')]), 'lost');
		assert.equal(couponStatus([L('won'), L('pending')]), 'pending');
		assert.equal(couponStatus([L('won'), L('void')]), 'won');
		assert.equal(couponStatus([L('void'), L('void')]), 'void');
		assert.equal(settledOdds([L('won', 1.3), L('void', 1.2), L('won', 1.25)]), Number((1.3 * 1.25).toFixed(2)));
	});
});

describe('post z kuponem', () => {
	const SITE = 'https://czatsportowy.pl';
	const noga = (i, extra = {}) => ({
		fixtureId: String(i),
		home: `Borussia Mönchengladbach ${i}`,
		away: `Wolverhampton Wanderers ${i}`,
		kickoff: new Date(Date.now() + (3 + i) * 3600_000).toISOString(),
		label: 'X2',
		selection: `Wolverhampton Wanderers ${i} lub remis`,
		probability: 80,
		odds: 1.12,
		status: 'pending',
		...extra,
	});
	const kupon = (legs, extra = {}) => ({ type: 'daily', status: 'pending', totalOdds: 2.05, chance: 46, legs, ...extra });

	test('mieści się w limicie nawet przy sześciu długich nazwach; kurs z przecinkiem, szansa i 18+ zostają', () => {
		const post = buildCouponPost({
			coupon: kupon(Array.from({ length: 6 }, (_, i) => noga(i))),
			previous: { status: 'won', totalOdds: 2.1, settledOdds: 2.1 },
			siteUrl: SITE,
		});
		assert.ok(post.length <= X_LIMIT, `${post.length} znaków`);
		assert.equal(post.length, xLength(post.text));
		assert.match(post.text, /kurs 2,05/);
		assert.match(post.text, /Szansa według modelu: 46%/);
		assert.match(post.text, /18\+/);
		assert.match(post.text, /utm_campaign=kupon-dnia/);
		// Sześć długich nazw się nie mieści — ostatnie typy przechodzą do „więcej na stronie".
		assert.match(post.text, /…i \d więcej na stronie/);
	});

	test('krótki kupon: pełny opis typu i wczorajszy wynik', () => {
		const post = buildCouponPost({
			coupon: kupon([noga(1, { home: 'Lech', away: 'Legia', selection: 'Legia lub remis' }), noga(2, { home: 'Ajax', away: 'PSV', selection: 'PSV lub remis' })]),
			previous: { status: 'lost' },
			siteUrl: SITE,
		});
		assert.match(post.text, /Lech – Legia: Legia lub remis \(1,12\)/);
		assert.match(post.text, /Wczorajszy kupon: ❌ nie wszedł/);
	});

	test('bez kuponu, po pierwszym gwizdku albo po rozliczeniu — nie ma czego publikować', () => {
		assert.equal(buildCouponPost({ coupon: null, siteUrl: SITE }), null);
		assert.equal(buildCouponPost({ coupon: kupon([noga(1, { kickoff: new Date(Date.now() - 60_000).toISOString() })]), siteUrl: SITE }), null);
		assert.equal(buildCouponPost({ coupon: kupon([noga(1)], { status: 'won' }), siteUrl: SITE }), null);
	});
});
