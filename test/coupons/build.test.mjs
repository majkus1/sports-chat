import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kupony — część czysta: wybór typów, rozliczenie, post na X. Bez bazy i sieci.
 *
 * Pilnujemy zasad, na których stoi uczciwość kuponu (od 21.11.2026, `lib/coupons/build.js`):
 * tylko typy potwierdzone kursem (`chanceConfirmed` z `lib/picks/chance.js`) z kursem
 * 1,05–1,60 (5-dniowy: do 1,40); jeden typ na mecz; kurs łączny 2,0–2,5 z najwyżej 3 meczów
 * (dnia i 3-dniowy), 2,4–2,8 z najwyżej 5 (5-dniowy); jak najmniej typów, a przy tej samej liczbie —
 * najwyższa szansa, co sprawdzamy przejrzeniem wszystkich zestawów na losowych pulach. Rozliczenie
 * po 90 minutach, mecz odwołany jak kurs 1,00.
 */

setupEnv();
const { buildCoupon, legResult, couponStatus, settledOdds, legEligible, legOddsFit, COUPON_TYPES, LEG_MAX_ODDS } =
	await import('@/lib/coupons/build');
const { buildCouponPost, xLength, X_LIMIT } = await import('@/lib/social/posts');

const TERAZ = new Date('2026-10-17T08:00:00Z');
const za = (h) => new Date(TERAZ.getTime() + h * 3600_000);
let n = 0;
// Mecze od 15:00 do 20:54 czasu polskiego — zawsze w oknie kuponu, ile by typów nie było.
const typ = (probability, odds, extra = {}) => ({
	fixtureId: String(++n),
	homeName: `Gospodarz ${n}`,
	awayName: `Gość ${n}`,
	kickoff: za(5 + (n % 60) / 10),
	key: 'home',
	selection: `Gospodarz ${n} wygra`,
	probability,
	odds,
	// Kandydaci z `couponCandidates` są już potwierdzeni kursem; niepotwierdzonych test podaje wprost.
	chanceConfirmed: true,
	...extra,
});
const iloczyn = (xs) => xs.reduce((a, b) => a * b, 1);

/** Wzorzec: wszystkie zestawy po kolei — najmniej typów, potem najwyższa szansa. */
function najlepszyWzorzec(kandydaci, { target, max, maxLegs, legMaxOdds = 1.6 }) {
	const pula = kandydaci.filter((c) => c.odds >= 1.05 && c.odds < legMaxOdds && c.chanceConfirmed === true);
	let najlepszy = null;
	const przejdz = (od, wybrane) => {
		if (wybrane.length) {
			const k = iloczyn(wybrane.map((c) => c.odds));
			const s = iloczyn(wybrane.map((c) => c.probability / 100));
			if (k >= target - 1e-9 && k <= max + 1e-9) {
				if (!najlepszy || wybrane.length < najlepszy.n || (wybrane.length === najlepszy.n && s > najlepszy.szansa + 1e-12)) {
					najlepszy = { n: wybrane.length, szansa: s };
				}
			}
		}
		if (wybrane.length === maxLegs) return;
		for (let j = od; j < pula.length; j++) przejdz(j + 1, [...wybrane, pula[j]]);
	};
	przejdz(0, []);
	return najlepszy;
}

/** Powtarzalne liczby losowe (mulberry32) — test ma dawać zawsze ten sam wynik. */
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

describe('zasady typu na kupon', () => {
	test('kurs 1,05–1,60 (5-dniowy do 1,40) i szansa potwierdzona kursem', () => {
		assert.equal(LEG_MAX_ODDS, 1.6);
		const ok = { chanceConfirmed: true };
		assert.equal(legOddsFit({ probability: 62, odds: 1.59, ...ok }), true, 'od 21.11.2026 nogi do 1,60');
		assert.equal(legOddsFit({ probability: 62, odds: 1.6, ...ok }), false);
		assert.equal(legOddsFit({ probability: 70, odds: 1.45, ...ok }, { maxOdds: COUPON_TYPES.days5.legMaxOdds }), false, '5-dniowy do 1,40');
		assert.equal(legOddsFit({ probability: 96, odds: 1.04, ...ok }), false, 'kurs musi coś wnosić');
		assert.equal(legOddsFit({ probability: 85, odds: 1.3, chanceSource: 'market' }), false, 'bez potwierdzenia kursem — nie');
		assert.equal(legOddsFit({ probability: 85, odds: 1.3, chanceConfirmed: false }), false);
		// Potwierdzony typ z szansą modelu („2", „1X", „gospodarze strzelą" — `MARKET_CHANCE_KEYS`) wchodzi.
		assert.equal(legOddsFit({ probability: 85, odds: 1.3, chanceSource: 'model', ...ok }), true);
		assert.equal(legOddsFit({ probability: null, odds: 1.3, ...ok }), false);
	});

	test('dnia i 3-dniowy: 2,0–2,5 z najwyżej 3 meczów; 5-dniowy bez zmian: 2,4–2,8, 5 meczów, nogi do 1,40', () => {
		for (const t of ['daily', 'days3']) {
			assert.deepEqual([COUPON_TYPES[t].target, COUPON_TYPES[t].max, COUPON_TYPES[t].maxLegs], [2.0, 2.5, 3]);
			assert.equal(COUPON_TYPES[t].legMaxOdds, undefined, 'nogi według ogólnej granicy');
		}
		assert.deepEqual([COUPON_TYPES.days5.target, COUPON_TYPES.days5.max, COUPON_TYPES.days5.maxLegs], [2.4, 2.8, 5]);
		assert.equal(COUPON_TYPES.days5.legMaxOdds, 1.4);
	});
});

describe('buildCoupon', () => {
	test('jak najmniej typów: trzy po 1,36 zamiast czterech pewniejszych po 1,25; kolejność po godzinie', () => {
		const cztery = [typ(80, 1.25), typ(80, 1.25), typ(80, 1.25), typ(80, 1.25)];
		const trzy = [typ(73, 1.36, { kickoff: za(9) }), typ(73, 1.36, { kickoff: za(6) }), typ(73, 1.36, { kickoff: za(7) })];
		const k = buildCoupon([...cztery, ...trzy], { type: 'days5', now: TERAZ });
		assert.equal(k.legs.length, 3);
		assert.deepEqual(
			k.legs.map((l) => l.fixtureId),
			[trzy[1], trzy[2], trzy[0]].map((x) => x.fixtureId)
		);
		assert.equal(k.totalOdds, Number((1.36 ** 3).toFixed(2)));
		assert.equal(k.chance, Math.round(100 * 0.73 ** 3));
	});

	test('kupon dnia z dwóch meczów po ~1,45 zamiast trzech pewniejszych — mniej typów to mniej marży', () => {
		const dwa = [typ(66, 1.45), typ(65, 1.46)];
		const trzy = [typ(78, 1.27), typ(78, 1.27), typ(78, 1.27)];
		const k = buildCoupon([...trzy, ...dwa], { type: 'daily', now: TERAZ });
		assert.deepEqual(k.legs.map((l) => l.fixtureId).sort(), dwa.map((x) => x.fixtureId).sort());
		assert.equal(k.chance, Math.round(100 * 0.66 * 0.65), 'szansa kuponu = iloczyn szans typów');
		// 5-dniowy takich nóg nie bierze (do 1,40) — tam zostają trzy po 1,27 + ... albo nic.
		assert.ok(!buildCoupon([...trzy, ...dwa], { type: 'days5', now: TERAZ })?.legs.some((l) => l.odds > 1.4));
	});

	test('przy tej samej liczbie typów — zestaw z najwyższą szansą, nie pierwszy z brzegu', () => {
		const pula = [typ(74, 1.35), typ(74, 1.34), typ(73, 1.36), typ(72, 1.38), typ(71, 1.39), typ(70, 1.3)];
		const k = buildCoupon(pula, { type: 'days5', now: TERAZ });
		const wzor = najlepszyWzorzec(pula, COUPON_TYPES.days5);
		assert.equal(k.legs.length, wzor.n);
		assert.ok(Math.abs(iloczyn(k.legs.map((l) => l.probability / 100)) - wzor.szansa) < 1e-12);
		assert.ok(k.totalOdds >= 2.4 && k.totalOdds <= 2.8);
	});

	test('na losowych pulach wynik równa się przejrzeniu wszystkich zestawów', () => {
		const los = losowe(20261024);
		let zKuponem = 0;
		for (let proba = 0; proba < 250; proba++) {
			const type = proba % 2 ? 'daily' : 'days5';
			const pula = Array.from({ length: 6 + Math.floor(los() * 9) }, () => {
				const odds = Number((1.03 + los() * 0.62).toFixed(2));
				const probability = Math.min(95, Math.floor(100 / odds - los() * 12));
				// Większość potwierdzona kursem, część z samą szansą modelu — ma odpaść.
				return typ(probability, odds, los() < 0.2 ? { chanceConfirmed: false } : {});
			});
			const k = buildCoupon(pula, { type, now: TERAZ });
			const wzor = najlepszyWzorzec(pula, COUPON_TYPES[type]);
			if (!wzor) {
				assert.equal(k, null, `próba ${proba}: wzorzec nie znalazł kuponu`);
				continue;
			}
			zKuponem += 1;
			assert.ok(k, `próba ${proba}: brak kuponu, a wzorzec ma ${wzor.n} typy`);
			assert.equal(k.legs.length, wzor.n, `próba ${proba}`);
			assert.ok(Math.abs(iloczyn(k.legs.map((l) => l.probability / 100)) - wzor.szansa) < 1e-12, `próba ${proba}`);
			assert.ok(k.legs.every((l) => legOddsFit(l, { maxOdds: COUPON_TYPES[type].legMaxOdds ?? LEG_MAX_ODDS })));
		}
		assert.ok(zKuponem > 50, `za mało prób z kuponem: ${zKuponem}`);
	});

	test('pomija typ bez potwierdzenia kursem, kursy spoza 1,05–1,60, mecze za mniej niż godzinę i wykluczone', () => {
		const pewniejszyOdRynku = typ(90, 1.3, { chanceConfirmed: false });
		const zaNisko = typ(97, 1.03);
		const zaWysoko = typ(60, 1.65);
		const zaWczesnie = typ(76, 1.31, { kickoff: za(0.5) });
		const wykluczony = typ(76, 1.31);
		const ok = [typ(75, 1.33), typ(74, 1.34), typ(73, 1.36)];
		const k = buildCoupon([pewniejszyOdRynku, zaNisko, zaWysoko, zaWczesnie, wykluczony, ...ok], {
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
		const noc = [typ(75, 1.33, { kickoff: za(15.5) }), typ(75, 1.33, { kickoff: za(18.5) })];
		const dzien = [typ(74, 1.34), typ(73, 1.36), typ(72, 1.37)];
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

	test('jeden typ na mecz — przy dwóch typach jednego meczu zostaje pewniejszy', () => {
		const mecz = typ(75, 1.33);
		const drugiTypTegoMeczu = { ...mecz, key: 'X2', probability: 74, odds: 1.34 };
		const k = buildCoupon([mecz, drugiTypTegoMeczu, typ(74, 1.35), typ(73, 1.36), typ(72, 1.37)], { type: 'daily', now: TERAZ });
		assert.equal(new Set(k.legs.map((l) => l.fixtureId)).size, k.legs.length);
		assert.ok(!k.legs.some((l) => l.key === 'X2'));
	});

	test('kurs łączny nie przekracza górnej granicy — zestaw ponad nią odpada, wchodzi niższy', () => {
		// 5-dniowy: trzy po 1,39 to 2,69; z czwartym 1,05 byłoby 2,82 > 2,8 — ale trzy wystarczą i tak.
		const k = buildCoupon([typ(71, 1.39), typ(71, 1.39), typ(71, 1.39), typ(95, 1.05)], { type: 'days5', now: TERAZ });
		assert.ok(k.totalOdds >= 2.4 && k.totalOdds <= COUPON_TYPES.days5.max);
		assert.equal(k.legs.length, 3);
		// Cztery po 1,32 to 3,04 — za dużo; trzy to 2,30 — za mało. Kuponu nie ma.
		assert.equal(buildCoupon([typ(75, 1.32), typ(75, 1.32), typ(75, 1.32), typ(75, 1.32)], { type: 'days5', now: TERAZ }), null);
		// Kupon dnia: dwa po 1,58 to 2,50 — wchodzi; dwa po 1,59 to 2,53 > 2,5 — nie.
		assert.equal(buildCoupon([typ(62, 1.58), typ(62, 1.58)], { type: 'daily', now: TERAZ })?.totalOdds, 2.5);
		assert.equal(buildCoupon([typ(62, 1.59), typ(62, 1.59)], { type: 'daily', now: TERAZ }), null);
	});

	test('za mało typów do celu — brak kuponu, nie kupon za 1,5; dnia nie sięga po czwarty typ', () => {
		assert.equal(buildCoupon([typ(80, 1.2), typ(80, 1.2)], { type: 'daily', now: TERAZ }), null);
		assert.equal(buildCoupon([], { type: 'days3', now: TERAZ }), null);
		// Cztery po 1,20 to 2,07 — kupon dnia (najwyżej 3 mecze) nie; pięć po 1,20 to 2,49 — 5-dniowy tak.
		assert.equal(buildCoupon(Array.from({ length: 4 }, () => typ(83, 1.2)), { type: 'daily', now: TERAZ }), null);
		const k = buildCoupon(Array.from({ length: 5 }, () => typ(83, 1.2)), { type: 'days5', now: TERAZ });
		assert.equal(k.legs.length, 5);
		assert.equal(k.totalOdds, Number((1.2 ** 5).toFixed(2)));
	});

	test('pula 5 dni ze 150 typami liczy się szybko', () => {
		const los = losowe(7);
		const pula = Array.from({ length: 150 }, () => {
			const odds = Number((1.05 + los() * 0.34).toFixed(2));
			return typ(Math.floor(100 / odds - los() * 8), odds);
		});
		const start = performance.now();
		const k = buildCoupon(pula, { type: 'days5', now: TERAZ });
		assert.ok(k && k.totalOdds >= 2.4 && k.totalOdds <= 2.8);
		assert.ok(performance.now() - start < 2000, 'przeszukanie nie może blokować przebiegu co 20 minut');
	});

	test('weekendowy (historia) dalej składa się po swoich zasadach: ~3,0, do 8 typów', () => {
		const pula = Array.from({ length: 10 }, () => typ(83, 1.2));
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
