import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Składy i nieobecni — część czysta (`lib/football/lineups.js`) i budżet zapytań (`createBudget`).
 *
 * Odpowiedzi dostawcy to zapisane przykłady w formacie z dokumentacji API-Football
 * (`test/fixtures/api-football/*.json`) — bez klucza i bez sieci. Historia drużyny do „podstawowej
 * jedenastki" jest składana w teście, bo potrzebuje dziesięciu meczów z kontrolowaną rotacją.
 */

setupEnv();

const L = await import('@/lib/football/lineups');
const { createBudget } = await import('@/lib/football/lineupsJob');

const przyklad = (nazwa) => JSON.parse(readFileSync(new URL(`../fixtures/api-football/${nazwa}`, import.meta.url), 'utf8'));

/* ------------------------------------------------------------------ dane pomocnicze */

const gracz = (id, pos = 'M') => ({ id, name: `Gracz ${id}`, number: id % 99, pos });
/** Jedenastka: bramkarz `gk` i dziesięciu z pola. */
const jedenastka = (gk, pole) => [gracz(gk, 'G'), ...pole.map((id) => gracz(id, id >= 9 ? 'F' : 'D'))];

const DRUZYNA = 7001;
const RYWAL = 7002;
const T0 = Date.parse('2099-03-01T18:00:00Z');
const DZIEN = 86_400_000;

/**
 * Dziesięć meczów drużyny: bramkarz 1 we wszystkich, gracze 2–11 w ośmiu z dziesięciu (w dwóch meczach
 * pucharowych 12–21 i bramkarz 22), napastnik 11 strzela 6 goli, 10 — dwa.
 */
function historia() {
	const docs = [];
	for (let i = 0; i < 10; i++) {
		const rezerwy = i === 3 || i === 7;
		const xi = rezerwy ? jedenastka(22, [12, 13, 14, 15, 16, 17, 18, 19, 20, 21]) : jedenastka(1, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		const goals = rezerwy ? [] : [{ teamId: DRUZYNA, playerId: 11, playerName: 'Gracz 11' }];
		if (i === 0 || i === 5) goals.push({ teamId: DRUZYNA, playerId: 10, playerName: 'Gracz 10' });
		docs.push({
			fixtureId: `h${i}`,
			kickoff: new Date(T0 - (i + 1) * 4 * DZIEN),
			teams: [
				{ teamId: DRUZYNA, startXI: xi },
				{ teamId: RYWAL, startXI: jedenastka(900 + i, [901, 902, 903, 904, 905, 906, 907, 908, 909, 910]) },
			],
			goals,
		});
	}
	return docs;
}

/* ------------------------------------------------------------------ parsowanie */

describe('parsowanie odpowiedzi API-Football', () => {
	test('fixtures/lineups: jedenastki, ustawienie, trener, rezerwowi z numerami', () => {
		const teams = L.parseLineups(przyklad('fixtures-lineups.json').response);
		assert.equal(teams.length, 2);
		const city = teams.find((t) => t.teamId === 50);
		assert.equal(city.formation, '4-3-3');
		assert.equal(city.coach, 'Guardiola');
		assert.equal(city.startXI.length, 11);
		assert.deepEqual(city.startXI[0], { id: 617, name: 'Ederson', number: 31, pos: 'G' });
		assert.deepEqual(city.substitutes[0], { id: 50828, name: 'Z. Steffen', number: 13, pos: 'G' });
		assert.ok(L.lineupConfirmed(city));
	});

	test('fixtures?ids=: składy i gole z autorami — bez samobójów i niestrzelonych karnych', () => {
		const [ft, ns] = przyklad('fixtures-ids.json').response.map(L.parseFixtureRow);
		assert.equal(ft.fixtureId, '592871');
		assert.equal(ft.finished, true);
		assert.equal(ft.homeId, 50);
		assert.equal(ft.teams.length, 2);
		// Gabriel Jesus x2 (w tym karny), James Rodriguez; samobój Keane'a i pudło z karnego — nie.
		assert.deepEqual(
			ft.goals.map((g) => [g.teamId, g.playerId]),
			[
				[50, 643],
				[45, 18758],
				[50, 643],
			]
		);
		assert.equal(ft.goals[0].assistId, 629);
		// Mecz przed pierwszym gwizdkiem: pusta lista składów to „jeszcze nie ma", nie brak pola.
		assert.equal(ns.finished, false);
		assert.equal(ns.lineupsField, true);
		assert.deepEqual(ns.teams, []);
	});

	test('injuries (ids=): grupowanie po meczu, jeden wpis na gracza, typ i powód', () => {
		const mapa = L.parseInjuries(przyklad('injuries.json').response);
		assert.deepEqual([...mapa.keys()].sort(), ['592872', '592873']);
		const mecz = mapa.get('592872');
		assert.equal(mecz.length, 4, 'De Bruyne dwa razy (dwie rozgrywki) — ma zostać raz');
		assert.deepEqual(mecz.find((i) => i.playerId === 645), {
			teamId: 50,
			playerId: 645,
			playerName: 'R. Sterling',
			type: 'Questionable',
			reason: 'Knock',
		});
		// Odpowiedź per mecz bez `fixture` w wierszu — mecz z parametru.
		const pojedynczy = L.parseInjuries([{ player: { id: 1, name: 'X', type: 'Missing Fixture', reason: 'Knee' }, team: { id: 9 } }], 55);
		assert.deepEqual([...pojedynczy.keys()], ['55']);
		assert.deepEqual(L.parseInjuries(null), new Map());
	});
});

/* ------------------------------------------------------------------ podstawowa jedenastka */

describe('podstawowa jedenastka i siła składu', () => {
	const regular = L.regularXI(L.teamHistory(historia(), DRUZYNA, T0));

	test('podstawowi = ≥ 6 z 10 meczów, bramkarz nr 1, najlepszy strzelec z wyraźną przewagą', () => {
		assert.equal(regular.known, 10);
		assert.ok(regular.reliable);
		assert.deepEqual(regular.core.map((g) => g.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		assert.equal(regular.goalkeeper.id, 1);
		assert.equal(regular.topScorer.id, 11);
		assert.equal(regular.topScorer.goals, 8);
		// Rezerwowi z dwóch meczów pucharowych (2 z 10) nie są podstawowi.
		assert.ok(!regular.core.some((g) => g.id === 12));
	});

	test('historia: tylko mecze PRZED analizowanym, najwyżej 10, bez meczów bez jedenastki', () => {
		const docs = [...historia(), { fixtureId: 'pozniej', kickoff: new Date(T0 + DZIEN), teams: [{ teamId: DRUZYNA, startXI: jedenastka(1, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) }] }, { fixtureId: 'pusty', kickoff: new Date(T0 - DZIEN), teams: [] }];
		const h = L.teamHistory(docs, DRUZYNA, T0);
		assert.equal(h.length, 10);
		assert.ok(!h.some((x) => x.fixtureId === 'pozniej' || x.fixtureId === 'pusty'));
		assert.equal(h[0].fixtureId, 'h0', 'od najnowszego');
	});

	test('za mało znanych składów (< 5) — bez podstawowych, bez weta', () => {
		const krotka = L.regularXI(L.teamHistory(historia().slice(0, 4), DRUZYNA, T0));
		assert.equal(krotka.reliable, false);
		assert.deepEqual(krotka.core, []);
		const s = L.squadStrength({ regular: krotka, injuries: [{ teamId: DRUZYNA, playerId: 1, playerName: 'Gracz 1', type: 'Missing Fixture', reason: 'Knee' }] });
		assert.equal(s.weakened, false);
		assert.equal(s.strength, null);
	});

	test('lider strzelców nie istnieje przy remisie w prowadzeniu albo za małej liczbie goli', () => {
		const docs = historia().map((d) => ({ ...d, goals: [] }));
		docs[0].goals = [{ teamId: DRUZYNA, playerId: 9 }, { teamId: DRUZYNA, playerId: 10 }];
		docs[1].goals = [{ teamId: DRUZYNA, playerId: 9 }, { teamId: DRUZYNA, playerId: 10 }];
		docs[2].goals = [{ teamId: DRUZYNA, playerId: 9 }, { teamId: DRUZYNA, playerId: 10 }];
		assert.equal(L.regularXI(L.teamHistory(docs, DRUZYNA, T0)).topScorer, null, '3:3 — remis w prowadzeniu');
		docs[3].goals = [{ teamId: DRUZYNA, playerId: 9 }];
		assert.equal(L.regularXI(L.teamHistory(docs, DRUZYNA, T0)).topScorer.id, 9);
	});

	test('lista nieobecnych (przed składami): liczy się „Missing Fixture", „Questionable" tylko do pokazania', () => {
		const s = L.squadStrength({
			regular,
			injuries: [
				{ teamId: DRUZYNA, playerId: 2, playerName: 'Gracz 2', type: 'Missing Fixture', reason: 'Knee Injury' },
				{ teamId: DRUZYNA, playerId: 3, playerName: 'Gracz 3', type: 'Missing Fixture', reason: 'Suspended' },
				{ teamId: DRUZYNA, playerId: 4, playerName: 'Gracz 4', type: 'Questionable', reason: 'Knock' },
			],
		});
		assert.equal(s.stage, 'expected');
		assert.equal(s.missingCore, 2);
		assert.equal(s.weakened, false, 'dwóch brakujących to zwykła rotacja');
		assert.deepEqual(s.missing.map((m) => m.kind), ['injury', 'suspension']);
		assert.deepEqual(s.doubtful.map((d) => d.id), [4]);
		// 9 z 11 podstawowych o tej samej liczbie występów.
		assert.equal(s.strength, 82);
	});

	test('potwierdzona jedenastka: podstawowy na ławce też brakuje; bramkarz rezerwowy = weto', () => {
		const lineup = {
			teamId: DRUZYNA,
			startXI: jedenastka(22, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
			substitutes: [gracz(1, 'G')],
		};
		const s = L.squadStrength({ regular, lineup, injuries: [] });
		assert.equal(s.stage, 'confirmed');
		assert.equal(s.missingCore, 1);
		assert.equal(s.missingGoalkeeper, true);
		assert.equal(s.missing[0].kind, 'bench');
		assert.equal(s.weakened, true);
	});

	test('rotacja: sygnał terminarza i co najmniej dwóch podstawowych na ławce', () => {
		const lineup = { teamId: DRUZYNA, startXI: jedenastka(1, [12, 13, 4, 5, 6, 7, 8, 9, 10, 11]), substitutes: [gracz(2), gracz(3)] };
		const bez = L.squadStrength({ regular, lineup });
		assert.equal(bez.rested, 2);
		assert.equal(bez.rotation, false);
		const z = L.squadStrength({ regular, lineup, rotationRisk: true });
		assert.equal(z.rotation, true);
		assert.equal(z.weakened, false, 'rotacja dwóch podstawowych sama nie jest wetem');
	});
});

/* ------------------------------------------------------------------ weto */

describe('weto typu (`lineupVeto`) — wspólne dla kuponów, typu dnia i plakietek', () => {
	const regular = L.regularXI(L.teamHistory(historia(), DRUZYNA, T0));
	const pelny = L.squadStrength({ regular, injuries: [] });
	const bezTrzech = L.squadStrength({
		regular,
		injuries: [2, 3, 4].map((id) => ({ teamId: DRUZYNA, playerId: id, playerName: `Gracz ${id}`, type: 'Missing Fixture', reason: 'Injury' })),
	});
	const bezStrzelca = L.squadStrength({ regular, injuries: [{ teamId: DRUZYNA, playerId: 11, playerName: 'Gracz 11', type: 'Missing Fixture', reason: 'Injury' }] });

	test('próg: 3 podstawowych, bramkarz nr 1 albo najlepszy strzelec drużyny typu', () => {
		assert.equal(L.VETO_MISSING_CORE, 3);
		assert.deepEqual(L.lineupVeto('home', { home: bezTrzech, away: pelny }), { veto: true, side: 'home', reasons: ['missing_core'] });
		assert.deepEqual(L.lineupVeto('1X', { home: bezStrzelca, away: pelny }).reasons, ['top_scorer']);
		assert.equal(L.lineupVeto('home', { home: pelny, away: bezTrzech }).veto, false, 'osłabiony rywal to nie powód weta');
		assert.equal(L.lineupVeto('X2', { home: pelny, away: bezTrzech }).side, 'away');
		assert.equal(L.lineupVeto('awayScores', { home: bezTrzech, away: pelny }).veto, false);
	});

	test('„powyżej 2,5": tylko brak najlepszego strzelca którejkolwiek drużyny', () => {
		assert.equal(L.lineupVeto('over25', { home: bezTrzech, away: pelny }).veto, false);
		assert.deepEqual(L.lineupVeto('over25', { home: pelny, away: bezStrzelca }), { veto: true, side: 'away', reasons: ['top_scorer'] });
	});

	test('brak danych albo niewiarygodna historia — bez weta', () => {
		assert.equal(L.lineupVeto('home', null).veto, false);
		assert.equal(L.lineupVeto('home', { home: { ...bezTrzech, reliable: false } }).veto, false);
		assert.equal(L.lineupVeto('draw', { home: bezTrzech }).veto, false);
	});

	test('kandydaci kuponu: typ z wetem wypada z powodem, reszta zostaje w tej samej kolejności', () => {
		const kandydaci = [
			{ fixtureId: 'a', key: 'home', homeName: 'Legia', awayName: 'Lech', selection: 'Legia wygra' },
			{ fixtureId: 'b', key: 'home', homeName: 'Wisła', awayName: 'Cracovia', selection: 'Wisła wygra' },
			{ fixtureId: 'c', key: 'away', homeName: 'Górnik', awayName: 'Raków', selection: 'Raków wygra' },
		];
		const squads = new Map([
			['a', { home: bezTrzech, away: pelny }],
			['c', { home: bezTrzech, away: pelny }],
		]);
		const { kept, dropped } = L.splitByLineupVeto(kandydaci, squads);
		assert.deepEqual(kept.map((k) => k.fixtureId), ['b', 'c']);
		assert.equal(dropped.length, 1);
		assert.equal(dropped[0].fixtureId, 'a');
		assert.match(dropped[0].reason, /^Legia: osłabiony skład — brak 3 podstawowych$/);
	});

	test('notka ostrzeżenia w obu językach', () => {
		const w = L.lineupVeto('home', { home: bezStrzelca, away: pelny });
		const n = L.vetoNote(w, { home: bezStrzelca, away: pelny }, { homeName: 'Legia', awayName: 'Lech' });
		assert.equal(n.pl, 'Legia: osłabiony skład — bez najlepszego strzelca');
		assert.equal(n.en, 'Legia: weakened line-up — no top scorer');
		assert.equal(L.vetoNote({ veto: false }, null), null);
	});

	test('widok i wniosek: podstawowi zaznaczeni w jedenastce, nieobecni z rolą, zdanie dla asystenta', () => {
		const lineup = { teamId: DRUZYNA, formation: '4-4-2', startXI: jedenastka(22, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), substitutes: [] };
		const injuries = [{ teamId: DRUZYNA, playerId: 1, playerName: 'Gracz 1', type: 'Missing Fixture', reason: 'Finger Injury' }];
		const s = L.withCoreKeys(L.squadStrength({ regular, lineup, injuries }), regular);
		const view = L.squadView({
			squad: { home: s, away: null },
			teams: [lineup],
			injuries,
			homeId: DRUZYNA,
			awayId: RYWAL,
			homeName: 'Legia',
			awayName: 'Lech',
		});
		assert.equal(view.stage, 'confirmed');
		assert.equal(view.home.formation, '4-4-2');
		assert.equal(view.home.startXI.filter((p) => p.regular).length, 10, 'rezerwowy bramkarz nie jest podstawowy');
		assert.deepEqual(view.home.absent.map((a) => [a.name, a.kind, a.goalkeeper]), [['Gracz 1', 'injury', true]]);
		const zdanie = L.squadConclusion(view, 'pl');
		assert.match(zdanie, /^Potwierdzone składy\. OSŁABIONY SKŁAD — Legia: brak 1 z 11 podstawowych \(Gracz 1\), bez bramkarza nr 1/);
		assert.match(zdanie, /Lech: za mało znanych składów/);
		assert.match(L.squadConclusion(view, 'en'), /WEAKENED — Legia: 1 of 11 regulars missing/);
	});
});

/* ------------------------------------------------------------------ budżet */

describe('budżet zapytań — twardy limit na przebieg i na dzień', () => {
	test('limit przebiegu', () => {
		const b = createBudget({ perRun: 3, perDay: 100, usedToday: 0 });
		assert.ok(b.take(1) && b.take(2));
		assert.equal(b.take(1), false);
		assert.equal(b.used, 3);
		assert.equal(b.left, 0);
		assert.equal(b.refused, 1);
	});

	test('limit dnia z licznikiem wcześniejszych przebiegów', () => {
		const b = createBudget({ perRun: 40, perDay: 600, usedToday: 598 });
		assert.equal(b.left, 2);
		assert.ok(b.take(2));
		assert.equal(b.take(1), false);
		assert.equal(b.usedToday, 600);
	});

	test('rezerwacja kilku zapytań naraz (terminarz: 2) — wszystko albo nic', () => {
		const b = createBudget({ perRun: 5, perDay: 600 });
		assert.ok(b.take(4));
		assert.equal(b.take(2), false);
		assert.equal(b.used, 4);
	});
});
