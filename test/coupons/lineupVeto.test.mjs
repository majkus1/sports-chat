import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Weto składu w kuponach, kreatorze i typie dnia (`lineupVeto`, `lib/football/lineups.js`).
 *
 * Kupon składa `composeCoupon` — ta sama droga dla kuponu dnia, 3- i 5-dniowego i kreatora, więc weto
 * sprawdzamy na niej: z podstawioną siłą składu i z prawdziwym zapisem `FixtureLineup` w bazie (losowe
 * identyfikatory, rok 2099, sprzątanie). Bez wiadomości AI i bez terminarza (podstawione).
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const FixtureLineup = (await import('@/models/FixtureLineup')).default;
const { composeCoupon } = await import('@/lib/coupons/service');
const { wybierz } = await import('@/lib/daily/service');
const { localMidnight } = await import('@/lib/time');

const PREFIX = `9${crypto.randomInt(10_000_000, 99_999_999)}`;
const DATA = '2099-08-12';
const o = (h, m = 0) => new Date(localMidnight(DATA).getTime() + (h * 60 + m) * 60_000);
const NOW = o(9, 30);
const zapisane = [];

/** Miara drużyny w kształcie `squadStrength`. */
const pelny = { reliable: true, coreSize: 11, missingCore: 0, missingGoalkeeper: false, missingTopScorer: false, weakened: false };
const bezBramkarza = { ...pelny, missingCore: 1, missingGoalkeeper: true, weakened: true };

/** Kandydaci jak z `couponCandidates`: potwierdzeni kursem, po 1,45 — dwóch daje kupon ~2,1. */
const kandydat = (n, probability) => ({
	fixtureId: `${PREFIX}${n}`,
	homeName: `Gospodarz ${n}`,
	awayName: `Gość ${n}`,
	homeId: 1000 + n,
	awayId: 2000 + n,
	leagueId: 106,
	league: 'Ekstraklasa, Poland',
	kickoff: o(15 + n),
	key: 'home',
	selection: `Gospodarz ${n} wygra`,
	probability,
	modelProbability: probability,
	chanceSource: 'market',
	chanceConfirmed: true,
	base: 45,
	odds: 1.45,
});
const KANDYDACI = [kandydat(1, 75), kandydat(2, 74), kandydat(3, 73), kandydat(4, 72)];
const BEZ_SIECI = { withNews: false, scheduleFor: async () => null, now: NOW };

after(async () => {
	await FixtureLineup.deleteMany({ fixtureId: { $in: zapisane } });
	await mongoose.disconnect();
});

describe('weto składu przed publikacją kuponu', () => {
	test('bez danych o składach kupon jak dotąd — dwóch najpewniejszych', async () => {
		const { kupon, lineupCheck } = await composeCoupon(KANDYDACI, { type: 'daily', ...BEZ_SIECI, squadsFor: async () => new Map() });
		assert.deepEqual(kupon.legs.map((l) => l.fixtureId), [`${PREFIX}1`, `${PREFIX}2`]);
		assert.equal(lineupCheck, null);
	});

	test('typ na drużynę bez bramkarza nr 1 wypada, wchodzi następny; powód zapisany', async () => {
		const squads = new Map([[`${PREFIX}1`, { home: bezBramkarza, away: pelny }]]);
		const { kupon, lineupCheck } = await composeCoupon(KANDYDACI, { type: 'daily', ...BEZ_SIECI, squadsFor: async () => squads });
		assert.deepEqual(kupon.legs.map((l) => l.fixtureId), [`${PREFIX}2`, `${PREFIX}3`]);
		assert.equal(lineupCheck.dropped.length, 1);
		assert.equal(lineupCheck.dropped[0].fixtureId, `${PREFIX}1`);
		assert.match(lineupCheck.dropped[0].reason, /Gospodarz 1: osłabiony skład — bez bramkarza nr 1/);
	});

	test('osłabiony RYWAL to nie powód weta (typ „1" przy osłabionych gościach zostaje)', async () => {
		const squads = new Map([[`${PREFIX}1`, { home: pelny, away: bezBramkarza }]]);
		const { kupon, lineupCheck } = await composeCoupon(KANDYDACI, { type: 'daily', ...BEZ_SIECI, squadsFor: async () => squads });
		assert.equal(kupon.legs[0].fixtureId, `${PREFIX}1`);
		assert.equal(lineupCheck, null);
	});

	test('kreator (własne widełki) przez tę samą funkcję — to samo weto', async () => {
		const squads = new Map([[`${PREFIX}2`, { home: { ...pelny, missingCore: 3, weakened: true }, away: pelny }]]);
		const { kupon } = await composeCoupon(KANDYDACI, {
			type: 'custom',
			rules: { target: 2.0, max: 2.5, maxLegs: 3 },
			...BEZ_SIECI,
			squadsFor: async () => squads,
		});
		assert.ok(!kupon.legs.some((l) => l.fixtureId === `${PREFIX}2`));
	});

	test('błąd odczytu składów nie blokuje kuponu', async () => {
		const { kupon } = await composeCoupon(KANDYDACI, {
			type: 'daily',
			...BEZ_SIECI,
			squadsFor: async () => {
				throw new Error('baza niedostępna');
			},
		});
		assert.equal(kupon.legs.length, 2);
	});

	test('domyślnie siła składu z bazy (`FixtureLineup.squad`)', async () => {
		const id = `${PREFIX}1`;
		zapisane.push(id);
		await FixtureLineup.create({
			fixtureId: id,
			kickoff: o(16),
			homeId: 1001,
			awayId: 2001,
			squad: { stage: 'expected', home: { ...pelny, missingTopScorer: true, weakened: true }, away: pelny },
			squadAt: NOW,
		});
		const { kupon, lineupCheck } = await composeCoupon(KANDYDACI, { type: 'daily', ...BEZ_SIECI });
		assert.ok(!kupon.legs.some((l) => l.fixtureId === id));
		assert.match(lineupCheck.dropped[0].reason, /bez najlepszego strzelca/);
	});
});

describe('weto składu w typie dnia', () => {
	const lista = [1, 2].map((n) => ({
		fixtureId: `${PREFIX}${n}`,
		home: `Gospodarz ${n}`,
		away: `Gość ${n}`,
		league: 'Ekstraklasa, Poland',
		leagueId: 106,
		season: 2099,
		homeId: 1000 + n,
		awayId: 2000 + n,
		kickoff: o(18 + n).toISOString(),
		hint: { key: 'home', selection: `Gospodarz ${n} wygra`, probability: 74, base: 45, lift: 30 - n },
	}));

	test('kandydat z osłabionym składem odpada, zanim policzymy cokolwiek (zero zapytań)', async () => {
		const liczone = [];
		const wynik = await wybierz(DATA, NOW, {
			hintsFor: async () => ({ list: lista }),
			squadsFor: async () => new Map([[`${PREFIX}1`, { home: bezBramkarza, away: pelny }]]),
			predict: async (args) => {
				liczone.push(args.homeId);
				return { known: false };
			},
			checkNews: async () => assert.fail('bez wiadomości'),
			scheduleFor: async () => null,
		});
		assert.equal(wynik, null);
		assert.deepEqual(liczone, [1002], 'pierwszy (osłabiony) pominięty, drugi liczony');
	});
});
