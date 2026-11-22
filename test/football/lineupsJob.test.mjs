import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Zbieranie składów (`lib/football/lineupsJob.js`) na prawdziwej bazie — daty z 2099 roku, losowe
 * identyfikatory meczów i drużyn, sprzątanie po sobie. Dostawca podstawiony: odpowiedzi w kształcie
 * `fixtures?ids=` i `injuries` z dokumentacji API-Football (jak `test/fixtures/api-football`).
 *
 * Sprawdzamy: pełny przebieg (składy, nieobecni, historia w jednej paczce, miara, dziennik prognoz,
 * ostrzeżenie przy nodze opublikowanego kuponu bez zmiany nogi); twardy limit na przebieg i na dzień;
 * dziennik — zdjęcie z listy nieobecnych, potem pierwsze z potwierdzoną jedenastką, które już zostaje;
 * zapasową drogę per mecz, gdy dostawca odrzuci `injuries?ids=`.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const FixtureLineup = (await import('@/models/FixtureLineup')).default;
const ModelForecast = (await import('@/models/ModelForecast')).default;
const Coupon = (await import('@/models/Coupon')).default;
const { snapshotLineups, lineupTargets } = await import('@/lib/football/lineupsJob');
const { FootballApiError } = await import('@/lib/football/client');

const PREFIX = `9${crypto.randomInt(10_000_000, 99_999_999)}`;
let nr = 0;
const noweId = () => `${PREFIX}${String(++nr).padStart(3, '0')}`;
let druzyna = crypto.randomInt(700_000_000, 799_999_999);
const uzyteMecze = new Set();
const uzyteKupony = [];

const NOW = new Date('2099-04-14T16:10:00Z'); // 18:10 w Polsce
const DZIEN = 86_400_000;

/* ------------------------------------------------------------------ dane */

const gracz = (team, n, pos) => ({ player: { id: team * 100 + n, name: `G${team % 1000}-${n}`, number: n, pos, grid: null } });
/** Jedenastka w kształcie dostawcy: numery 1–11 to podstawowi; `zmiany` — numery zamieniane na rezerwowych 20+. */
function sklad(team, zmiany = {}) {
	const xi = Array.from({ length: 11 }, (_, i) => i + 1).map((n) => zmiany[n] ?? n);
	return {
		team: { id: team, name: `Drużyna ${team % 1000}`, logo: '' },
		formation: '4-4-2',
		startXI: xi.map((n) => gracz(team, n, n === 1 || n === 21 ? 'G' : n >= 10 ? 'F' : 'M')),
		substitutes: [1, 2, 3, 9, 10, 11, 21, 22, 23].filter((n) => !xi.includes(n)).map((n) => gracz(team, n, n === 1 || n === 21 ? 'G' : 'M')),
		coach: { id: 1, name: 'Trener' },
	};
}
/** Wiersz `fixtures?ids=`. */
function wiersz({ id, kickoff, homeId, awayId, status = 'FT', lineups = [], events = [] }) {
	return {
		fixture: { id: Number(id), date: new Date(kickoff).toISOString(), status: { short: status } },
		league: { id: 106, season: 2099, name: 'Ekstraklasa' },
		teams: { home: { id: homeId, name: `Drużyna ${homeId % 1000}` }, away: { id: awayId, name: `Drużyna ${awayId % 1000}` } },
		goals: { home: 1, away: 0 },
		events,
		lineups,
	};
}

/**
 * Mecz-cel za 50 minut i po 10 rozegranych meczów obu drużyn w dzienniku prognoz. W historii gospodarza
 * gol strzela zawsze numer 10 — to jego najlepszy strzelec.
 */
async function scenariusz({ kickoffIn = 50 * 60_000 } = {}) {
	const H = ++druzyna;
	const A = ++druzyna;
	const cel = { fixtureId: noweId(), kickoff: new Date(NOW.getTime() + kickoffIn), homeId: H, awayId: A, homeName: 'Gospodarze', awayName: 'Goście', leagueId: 106, season: 2099, priority: 0 };
	const historia = [];
	for (let i = 0; i < 10; i++) {
		for (const [team, rywal] of [[H, ++druzyna], [A, ++druzyna]]) {
			historia.push({ fixtureId: noweId(), kickoff: new Date(NOW.getTime() - (i + 1) * 4 * DZIEN), homeId: team, awayId: rywal, team, rywal });
		}
	}
	const docs = [cel, ...historia].map((m) => ({
		fixtureId: m.fixtureId,
		leagueId: 106,
		season: 2099,
		homeId: m.homeId,
		awayId: m.awayId,
		kickoff: m.kickoff,
		forecastAt: new Date(m.kickoff.getTime() - 6 * 3600_000),
		hint: { key: 'home', selection: 'Gospodarze wygrają', probability: 70, base: 45, lift: 25 },
		...(m === cel ? {} : { result: { home: 1, away: 0, status: 'FT' }, settledAt: m.kickoff }),
	}));
	await ModelForecast.insertMany(docs);
	for (const d of docs) uzyteMecze.add(d.fixtureId);
	const wierszeHistorii = new Map(
		historia.map((m) => [
			m.fixtureId,
			wiersz({
				...m,
				id: m.fixtureId,
				lineups: [sklad(m.team), sklad(m.rywal)],
				events: m.team === H ? [{ type: 'Goal', detail: 'Normal Goal', team: { id: H }, player: { id: H * 100 + 10, name: 'Snajper' }, assist: { id: null } }] : [],
			}),
		])
	);
	return { H, A, cel, wierszeHistorii };
}

/** Dostawca z licznikiem wywołań. `skladyCelu` — wiersz meczu-celu (z jedenastkami albo bez). */
function dostawca(s, { skladyCelu = null, nieobecni = [], injuriesError = null } = {}) {
	const wolania = { fixtures: [], injuries: [], injuriesOne: [], teamRecent: [], schedule: 0 };
	const api = {
		fixtures: async (ids) => {
			wolania.fixtures.push(ids);
			return ids.map((id) => (id === s.cel.fixtureId ? skladyCelu : s.wierszeHistorii.get(id))).filter(Boolean);
		},
		injuries: async (ids) => {
			wolania.injuries.push(ids);
			if (injuriesError) throw injuriesError;
			return ids.includes(s.cel.fixtureId) ? nieobecni.map((n) => ({ ...n, fixture: { id: Number(s.cel.fixtureId) } })) : [];
		},
		injuriesOne: async (id) => {
			wolania.injuriesOne.push(id);
			return id === s.cel.fixtureId ? nieobecni : [];
		},
		teamRecent: async (teamId) => {
			wolania.teamRecent.push(teamId);
			return [];
		},
		schedule: async () => {
			wolania.schedule += 1;
			return null;
		},
		peekSchedule: () => null,
	};
	return { api, wolania };
}

function licznik(start = 0) {
	const dodane = [];
	return { dodane, get: async () => start, add: async (_day, n) => dodane.push(n) };
}

const nieobecny = (team, n, type = 'Missing Fixture', reason = 'Knee Injury') => ({
	player: { id: team * 100 + n, name: `G${team % 1000}-${n}`, type, reason },
	team: { id: team, name: `Drużyna ${team % 1000}` },
});

after(async () => {
	await FixtureLineup.deleteMany({ fixtureId: { $in: [...uzyteMecze] } });
	await ModelForecast.deleteMany({ fixtureId: { $in: [...uzyteMecze] } });
	await Coupon.deleteMany({ key: { $in: uzyteKupony } });
	await mongoose.disconnect();
});

/* ------------------------------------------------------------------ testy */

describe('zbieranie składów — przebieg co 20 minut', () => {
	test('pełny przebieg: składy, nieobecni, historia w jednej paczce, miara, dziennik i ostrzeżenie przy nodze', async () => {
		const s = await scenariusz();
		// Gospodarz bez bramkarza nr 1 (na ławce gra 21) i bez najlepszego strzelca (10 → 22).
		const skladyCelu = wiersz({ id: s.cel.fixtureId, kickoff: s.cel.kickoff, homeId: s.H, awayId: s.A, status: 'NS', lineups: [sklad(s.H, { 1: 21, 10: 22 }), sklad(s.A)] });
		const { api, wolania } = dostawca(s, { skladyCelu, nieobecni: [nieobecny(s.H, 10, 'Missing Fixture', 'Hamstring')] });

		const key = `daily:2099-04-14:${PREFIX}`;
		uzyteKupony.push(key);
		await Coupon.create({
			key,
			type: 'daily',
			date: '2099-04-14',
			status: 'pending',
			totalOdds: 2.1,
			chance: 48,
			legs: [
				{ fixtureId: s.cel.fixtureId, homeName: 'Gospodarze', awayName: 'Goście', kickoff: s.cel.kickoff, key: 'home', selection: 'Gospodarze wygrają', probability: 70, odds: 1.45 },
			],
		});

		const c = licznik();
		const w = await snapshotLineups({ now: NOW, api, targets: [s.cel], counter: c });
		assert.equal(w.lineups, 1);
		assert.equal(w.injuries, 1);
		assert.equal(w.history, 20, '10 meczów każdej drużyny');
		assert.equal(w.measured, 1);
		assert.equal(w.logged, 1);
		assert.equal(w.warnings, 1);
		// Składy 1 + nieobecni 1 + historia 1 (20 meczów w jednej paczce); terminarz pilnego meczu — 2.
		assert.equal(wolania.fixtures.length, 2);
		assert.equal(wolania.fixtures[1].length, 20);
		assert.equal(wolania.teamRecent.length, 0, 'dziennik prognoz wystarcza — bez pytania o ostatnie mecze');
		assert.equal(w.budget.used, 5);
		assert.deepEqual(c.dodane, [5]);

		const doc = await FixtureLineup.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.ok(doc.lineupAt);
		assert.equal(doc.squad.stage, 'confirmed');
		assert.equal(doc.squad.home.missingGoalkeeper, true);
		assert.equal(doc.squad.home.missingTopScorer, true);
		assert.equal(doc.squad.home.weakened, true);
		assert.equal(doc.squad.away.weakened, false);
		assert.equal(doc.squad.away.missingCore, 0);
		assert.ok(new Date(doc.expiresAt) > NOW, 'TTL');

		const f = await ModelForecast.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.equal(f.lineup.confirmed.home.weakened, true);
		assert.equal(f.lineup.confirmed.home.missingCore, 2);
		assert.equal(f.lineup.confirmed.away.strength, 100);
		assert.equal(f.lineup.expected ?? null, null);

		// Opublikowana noga zostaje taka sama — dochodzi tylko jawne ostrzeżenie.
		const kupon = await Coupon.findOne({ key }).lean();
		assert.equal(kupon.legs.length, 1);
		assert.equal(kupon.legs[0].odds, 1.45);
		assert.equal(kupon.legs[0].status, 'pending');
		assert.equal(kupon.totalOdds, 2.1);
		assert.match(kupon.legs[0].lineup.pl, /^Gospodarze: osłabiony skład — bez bramkarza nr 1, bez najlepszego strzelca$/);
		assert.match(kupon.legs[0].lineup.en, /weakened line-up/);

		// Kolejny przebieg: nic nowego do pobrania (składy są, historia ostateczna) — zero zapytań.
		const drugi = await snapshotLineups({ now: new Date(NOW.getTime() + 20 * 60_000), api, targets: [s.cel], counter: licznik() });
		assert.equal(drugi.budget.used, 0);
	});

	test('twardy limit: na przebieg i na dzień', async () => {
		const s = await scenariusz();
		const skladyCelu = wiersz({ id: s.cel.fixtureId, kickoff: s.cel.kickoff, homeId: s.H, awayId: s.A, status: 'NS', lineups: [sklad(s.H), sklad(s.A)] });
		const { api, wolania } = dostawca(s, { skladyCelu });
		const w = await snapshotLineups({ now: NOW, api, targets: [s.cel], counter: licznik(), perRun: 1 });
		assert.equal(w.budget.used, 1);
		assert.ok(w.budget.refused >= 1);
		assert.equal(wolania.fixtures.length, 1, 'tylko składy — najpilniejsze');
		assert.equal(wolania.injuries.length, 0);
		assert.equal(w.history, 0);

		// Dzień: 599 z 600 zużyte wcześniej — zostaje jedno zapytanie. Składy już są (nieobecnych po nich nie
		// pytamy), więc idzie historia; na terminarz (2 zapytania) już nie starcza.
		const dzien = await snapshotLineups({ now: NOW, api, targets: [s.cel], counter: licznik(599), perDay: 600 });
		assert.equal(dzien.budget.used, 1);
		assert.equal(dzien.budget.usedToday, 600);
		assert.equal(dzien.history, 20);
		assert.equal(wolania.fixtures.length, 2);
		assert.equal(wolania.injuries.length, 0);
		assert.equal(wolania.schedule, 0);
	});

	test('dziennik prognoz: zdjęcie z listy nieobecnych, potem pierwsze z potwierdzoną jedenastką — i ono zostaje', async () => {
		const s = await scenariusz({ kickoffIn: 70 * 60_000 });
		const bezSkladow = wiersz({ id: s.cel.fixtureId, kickoff: s.cel.kickoff, homeId: s.H, awayId: s.A, status: 'NS', lineups: [] });
		const trzech = [2, 3, 4].map((n) => nieobecny(s.A, n));
		const { api } = dostawca(s, { skladyCelu: bezSkladow, nieobecni: trzech });
		await snapshotLineups({ now: NOW, api, targets: [s.cel], counter: licznik() });
		let f = await ModelForecast.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.equal(f.lineup.confirmed ?? null, null);
		assert.equal(f.lineup.expected.away.missingCore, 3);
		assert.equal(f.lineup.expected.away.weakened, true);

		// 20 minut później: jedenastki są, a trzej „nieobecni" jednak grają.
		const zSkladami = wiersz({ id: s.cel.fixtureId, kickoff: s.cel.kickoff, homeId: s.H, awayId: s.A, status: 'NS', lineups: [sklad(s.H), sklad(s.A)] });
		const t1 = new Date(NOW.getTime() + 20 * 60_000);
		await snapshotLineups({ now: t1, api: dostawca(s, { skladyCelu: zSkladami, nieobecni: trzech }).api, targets: [s.cel], counter: licznik() });
		f = await ModelForecast.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.equal(f.lineup.confirmed.away.missingCore, 0);
		assert.equal(f.lineup.confirmed.away.weakened, false);
		assert.equal(new Date(f.lineup.confirmed.at).getTime(), t1.getTime());
		assert.equal(f.lineup.expected.away.missingCore, 3, 'zdjęcie sprzed składów zostaje do porównania');

		// Kolejne przeliczenie (np. po 3 godzinach) nie nadpisuje potwierdzonego zdjęcia.
		await FixtureLineup.updateOne({ fixtureId: s.cel.fixtureId }, { $set: { squadAt: new Date('2000-01-01') } });
		await snapshotLineups({ now: new Date(t1.getTime() + 10 * 60_000), api: dostawca(s, { skladyCelu: zSkladami }).api, targets: [s.cel], counter: licznik() });
		f = await ModelForecast.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.equal(new Date(f.lineup.confirmed.at).getTime(), t1.getTime());
	});

	test('cele: pilne (typy, kupony) przed resztą lig, tylko ligi sprawdzone w reszcie', async () => {
		const s = await scenariusz({ kickoffIn: 5 * 3600_000 });
		const proba = { ...s.cel, fixtureId: noweId(), leagueId: 999_999 };
		await ModelForecast.create({ fixtureId: proba.fixtureId, leagueId: 999_999, homeId: s.H, awayId: s.A, kickoff: proba.kickoff, forecastAt: NOW });
		uzyteMecze.add(proba.fixtureId);
		const key = `days3:2099-04-14:${PREFIX}`;
		uzyteKupony.push(key);
		await Coupon.create({
			key,
			type: 'days3',
			date: '2099-04-14',
			status: 'pending',
			legs: [{ fixtureId: proba.fixtureId, homeName: 'A', awayName: 'B', kickoff: proba.kickoff, key: 'home', selection: 'A wygra', probability: 70, odds: 1.4 }],
		});
		const cele = await lineupTargets(NOW);
		const nasz = cele.find((c) => c.fixtureId === s.cel.fixtureId);
		const zKuponu = cele.find((c) => c.fixtureId === proba.fixtureId);
		assert.equal(nasz?.priority, 1, 'liga sprawdzona z dziennika');
		assert.equal(zKuponu?.priority, 0, 'noga kuponu — pilna, nawet spoza lig sprawdzonych');
		assert.ok(cele.indexOf(zKuponu) < cele.indexOf(nasz));
	});

	test('dostawca odrzuca `injuries?ids=` — nieobecni per mecz, w tym samym budżecie', async () => {
		const s = await scenariusz({ kickoffIn: 5 * 3600_000 });
		const { api, wolania } = dostawca(s, {
			nieobecni: [nieobecny(s.H, 1, 'Missing Fixture', 'Red Card')],
			injuriesError: new FootballApiError('API zgłosiło błąd: {"ids":"unknown"}', { endpoint: 'injuries' }),
		});
		const w = await snapshotLineups({ now: NOW, api, targets: [s.cel], counter: licznik() });
		assert.equal(wolania.injuries.length, 1);
		assert.deepEqual(wolania.injuriesOne, [s.cel.fixtureId]);
		assert.equal(w.injuries, 1);
		const doc = await FixtureLineup.findOne({ fixtureId: s.cel.fixtureId }).lean();
		assert.equal(doc.injuries[0].reason, 'Red Card');
		assert.equal(doc.squad.stage, 'expected');
		assert.equal(doc.squad.home.missingGoalkeeper, true);
		assert.equal(doc.squad.home.missing[0].kind, 'suspension');
	});
});
