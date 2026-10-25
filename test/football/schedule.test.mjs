import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Terminarz drużyn (`lib/football/schedule.js`) — czysty rachunek i tekst, bez sieci.
 *
 * Pilnujemy: rodzaju rozgrywek po identyfikatorze i nazwie; dni liczonych w kalendarzu polskim
 * (czwartek → niedziela = 3); pominięcia samego meczu (po identyfikatorze i po czasie); flag tylko
 * przy nietypowym terminarzu; uczciwego „brak danych"; tekstu dla AI (pl/en) i notki dla czytelnika
 * TYLKO przy fladze; polecenia sprawdzania wiadomości z terminarzem. Pobieranie — na podstawionym
 * `load` i na pamięci procesu, nigdy na prawdziwym API.
 */

setupEnv();
const S = await import('@/lib/football/schedule');
const { newsPrompt } = await import('@/lib/coupons/news');
const { legScheduleNote } = await import('@/lib/coupons/content');
const { buildMatchFacts } = await import('@/lib/ai/prompts/matchFacts');
const { ANALYSIS_SYSTEM_PROMPT, PROMPT_VERSION } = await import('@/lib/ai/prompts/matchAnalysis');
const { buildReportPrompt, REPORT_SYSTEM_PROMPT, REPORT_PROMPT_VERSION } = await import('@/lib/ai/prompts/report');
const { buildValueReportPrompt, VALUE_REPORT_SYSTEM_PROMPT } = await import('@/lib/ai/prompts/reportValue');

const LEGIA = 339;
const LECH = 347;
const RAPID = 781;
const MECZ_ID = 990001;

/** Wiersz `fixtures` dostawcy. Bez goli — mecz przed nami (NS). */
function wiersz(id, date, { leagueId, league, round = null, home, away, gh = null, ga = null, status, country = null }) {
	return {
		fixture: { id, date, status: { short: status ?? (gh === null ? 'NS' : 'FT') } },
		league: { id: leagueId, name: league, country, round },
		teams: { home: { id: home, name: `Drużyna ${home}` }, away: { id: away, name: `Drużyna ${away}` } },
		goals: { home: gh, away: ga },
	};
}

const EKSTRAKLASA = { leagueId: 106, league: 'Ekstraklasa', country: 'Poland' };
const LK = { leagueId: 848, league: 'UEFA Europa Conference League', country: 'World', round: 'League Stage - 3' };

/** Analizowany mecz: niedziela 25.10.2099, 17:30 czasu polskiego (dzień zmiany czasu — liczymy w kalendarzu). */
const MECZ = {
	fixtureId: String(MECZ_ID),
	kickoff: '2099-10-25T16:30:00Z',
	leagueId: 106,
	leagueName: 'Ekstraklasa',
	homeId: LEGIA,
	homeName: 'Legia',
	awayId: LECH,
	awayName: 'Lech',
};

// Legia: czwartek 22.10 Liga Konferencji u siebie 2:1, wcześniej liga; za 4 dni znów Liga Konferencji.
const LEGIA_OSTATNIE = [
	wiersz(1, '2099-10-22T19:00:00Z', { ...LK, home: LEGIA, away: RAPID, gh: 2, ga: 1 }),
	wiersz(2, '2099-10-18T14:00:00Z', { ...EKSTRAKLASA, home: 400, away: LEGIA, gh: 1, ga: 1 }),
	wiersz(3, '2099-09-20T14:00:00Z', { ...EKSTRAKLASA, home: LEGIA, away: 401, gh: 3, ga: 0 }),
];
const LEGIA_NASTEPNE = [
	wiersz(MECZ_ID, MECZ.kickoff, { ...EKSTRAKLASA, home: LEGIA, away: LECH }),
	wiersz(4, '2099-10-29T17:45:00Z', { ...LK, round: 'League Stage - 4', home: 402, away: LEGIA }),
	wiersz(5, '2099-11-01T14:00:00Z', { ...EKSTRAKLASA, home: LEGIA, away: 403 }),
];
// Lech: tydzień przerwy, następny mecz ligowy — zwykły terminarz.
const LECH_OSTATNIE = [wiersz(6, '2099-10-18T16:00:00Z', { ...EKSTRAKLASA, home: LECH, away: 404, gh: 2, ga: 0 })];
const LECH_NASTEPNE = [
	wiersz(MECZ_ID, MECZ.kickoff, { ...EKSTRAKLASA, home: LEGIA, away: LECH }),
	wiersz(7, '2099-11-01T17:00:00Z', { ...EKSTRAKLASA, home: 405, away: LECH }),
];

const TERAZ = Date.parse('2099-10-24T10:00:00Z');
const pelny = () =>
	S.buildMatchSchedule(
		MECZ,
		{ home: { recent: LEGIA_OSTATNIE, upcoming: LEGIA_NASTEPNE }, away: { recent: LECH_OSTATNIE, upcoming: LECH_NASTEPNE } },
		{ now: TERAZ }
	);

describe('rodzaj rozgrywek', () => {
	test('po identyfikatorze i po nazwie', () => {
		const k = S.competitionKind;
		assert.equal(k({ id: 2 }), 'europe');
		assert.equal(k({ id: 848 }), 'europe');
		assert.equal(k({ name: 'UEFA Europa League' }), 'europe');
		assert.equal(k({ id: 13, name: 'CONMEBOL Libertadores' }), 'continental');
		assert.equal(k({ name: 'FIFA Club World Cup' }), 'continental');
		assert.equal(k({ id: 32, name: 'World Cup - Qualification Europe' }), 'national');
		assert.equal(k({ id: 10, name: 'Friendlies' }), 'friendly');
		assert.equal(k({ name: 'Club Friendlies' }), 'friendly');
		assert.equal(k({ id: 45, name: 'FA Cup' }), 'domestic_cup');
		assert.equal(k({ name: 'Puchar Polski', country: 'Poland' }), 'domestic_cup');
		assert.equal(k({ name: 'DFB Pokal', country: 'Germany' }), 'domestic_cup');
		assert.equal(k({ id: 39, name: 'Premier League', country: 'England' }), 'league');
		// „Qualification" w lidze krajowej to nie reprezentacja.
		assert.equal(k({ name: 'Super League - Qualification', country: 'Greece' }), 'league');
		assert.equal(k({}), 'league');
	});
});

describe('terminarz drużyny', () => {
	test('puchar w czwartek przed niedzielą: 3 dni, flagi, następny mecz i licznik 14 dni', () => {
		const t = pelny();
		const legia = t.home;
		assert.equal(legia.last.fixtureId, '1');
		assert.equal(legia.last.kind, 'europe');
		assert.equal(legia.last.daysBefore, 3);
		assert.equal(legia.last.result, 'W');
		assert.equal(legia.last.isHome, true);
		assert.equal(legia.last.upcoming, false);
		assert.equal(legia.restDays, 3);
		assert.equal(legia.restHours, 70, 'czwartek 21:00 → niedziela 17:30 czasu polskiego');
		assert.equal(legia.next.fixtureId, '4');
		assert.equal(legia.next.daysAfter, 4);
		assert.equal(legia.matches14, 2);
		assert.deepEqual(legia.flags, { europeMidweek: true, shortRest: true, rotationRisk: true });
		assert.equal(legia.flagged, true);
		assert.equal(t.flagged, true);

		const lech = t.away;
		assert.equal(lech.restDays, 7);
		assert.equal(lech.next.daysAfter, 7);
		assert.deepEqual(lech.flags, { europeMidweek: false, shortRest: false, rotationRisk: false });
		assert.equal(lech.flagged, false);
	});

	test('sam mecz pominięty — po identyfikatorze i po czasie (inny identyfikator u dostawcy)', () => {
		const t = pelny();
		assert.notEqual(t.home.next.fixtureId, String(MECZ_ID));
		const podwojny = [wiersz(888, '2099-10-25T16:30:00Z', { ...EKSTRAKLASA, home: LEGIA, away: LECH }), ...LEGIA_NASTEPNE.slice(1)];
		const ts = S.teamSchedule({ teamId: LEGIA, recent: LEGIA_OSTATNIE, upcoming: podwojny, match: MECZ, now: TERAZ });
		assert.equal(ts.next.fixtureId, '4');
	});

	test('mecz z listy najbliższych, który już się odbył (stara pamięć), liczy się jako poprzedni — bez wyniku', () => {
		const ts = S.teamSchedule({
			teamId: LEGIA,
			recent: LEGIA_OSTATNIE.slice(1),
			upcoming: [wiersz(1, '2099-10-22T19:00:00Z', { ...LK, home: LEGIA, away: RAPID }), ...LEGIA_NASTEPNE],
			match: MECZ,
			now: TERAZ,
		});
		assert.equal(ts.last.fixtureId, '1');
		assert.equal(ts.last.result, null);
		assert.equal(ts.last.upcoming, false);
		assert.equal(ts.flags.europeMidweek, true);
	});

	test('mecz przełożony nie jest poprzednim meczem', () => {
		const ts = S.teamSchedule({
			teamId: LEGIA,
			recent: [wiersz(9, '2099-10-22T19:00:00Z', { ...LK, home: LEGIA, away: RAPID, status: 'PST' }), ...LEGIA_OSTATNIE.slice(1)],
			upcoming: LEGIA_NASTEPNE,
			match: MECZ,
			now: TERAZ,
		});
		assert.equal(ts.last.fixtureId, '2');
		assert.equal(ts.flags.europeMidweek, false);
		assert.equal(ts.flags.shortRest, false);
	});

	test('ryzyko rotacji: półfinał pucharu tak, ćwierćfinał nie; po meczu Ligi Mistrzów liga to nie rotacja', () => {
		const puchar = (round) => [
			wiersz(10, '2099-10-28T18:00:00Z', { leagueId: 81, league: 'DFB Pokal', round, home: LEGIA, away: 406 }),
		];
		const ryzyko = (round) =>
			S.teamSchedule({ teamId: LEGIA, recent: LEGIA_OSTATNIE.slice(1), upcoming: puchar(round), match: MECZ, now: TERAZ }).flags.rotationRisk;
		assert.equal(ryzyko('Semi-finals'), true);
		assert.equal(ryzyko('Final'), true);
		assert.equal(ryzyko('Quarter-finals'), false);
		assert.equal(ryzyko('Round of 16'), false);

		// Analizowany mecz w Lidze Mistrzów, następny — ligowy za 3 dni: brak ryzyka rotacji; liga 3 dni
		// wcześniej to krótka przerwa, ale nie „puchar w środku tygodnia".
		const meczLM = { ...MECZ, leagueId: 2, leagueName: 'UEFA Champions League' };
		const ts = S.teamSchedule({
			teamId: LEGIA,
			recent: [wiersz(11, '2099-10-22T17:00:00Z', { ...EKSTRAKLASA, home: LEGIA, away: 407, gh: 1, ga: 0 })],
			upcoming: [wiersz(12, '2099-10-28T17:00:00Z', { ...EKSTRAKLASA, home: 408, away: LEGIA })],
			match: meczLM,
			now: TERAZ,
		});
		assert.deepEqual(ts.flags, { europeMidweek: false, shortRest: true, rotationRisk: false });
	});

	test('brak danych: nic nie wiemy → null; bez listy najbliższych — „brak danych", nie „brak meczu"', () => {
		assert.equal(S.teamSchedule({ teamId: LEGIA, recent: null, upcoming: null, match: MECZ }), null);
		assert.equal(S.teamSchedule({ teamId: LEGIA, recent: [], upcoming: [], match: { ...MECZ, kickoff: 'nie data' } }), null);
		assert.equal(S.buildMatchSchedule(MECZ, {}), null);
		assert.equal(S.buildMatchSchedule(null, {}), null);

		const ts = S.teamSchedule({ teamId: LEGIA, recent: LEGIA_OSTATNIE, upcoming: null, match: MECZ, now: TERAZ });
		assert.equal(ts.next, null);
		assert.equal(ts.nextKnown, false);
		assert.equal(ts.flags.europeMidweek, true);
		const tekst = S.formatScheduleFacts({ home: ts, away: null }, { homeName: 'Legia', awayName: 'Lech' });
		assert.match(tekst, /następny mecz: brak danych/);
		assert.match(tekst, /Lech: brak danych o terminarzu/);

		// Pełna lista najbliższych, która kończy się przed meczem — następnego po nim nie widzimy.
		const krotka = S.teamSchedule({ teamId: LECH, recent: [], upcoming: [], match: MECZ, now: TERAZ });
		assert.equal(krotka.last, null);
		assert.equal(krotka.nextKnown, true, 'dostawca nie ma żadnego meczu — to wiedza, nie brak danych');
		assert.equal(krotka.flagged, false);
	});

	test('mecz z opisem z normalizeFixture', () => {
		const m = S.matchFromFixture({
			id: 5,
			date: '2099-01-01T12:00:00Z',
			league: { id: 39, name: 'Premier League', country: 'England', round: 'Regular Season - 3' },
			teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
		});
		assert.deepEqual(m, {
			fixtureId: '5',
			kickoff: '2099-01-01T12:00:00Z',
			leagueId: 39,
			leagueName: 'Premier League',
			leagueCountry: 'England',
			round: 'Regular Season - 3',
			homeId: 1,
			homeName: 'A',
			awayId: 2,
			awayName: 'B',
		});
	});
});

describe('tekst — fakty dla AI i notka dla czytelnika', () => {
	const NAZWY = { homeName: 'Legia', awayName: 'Lech' };

	test('blok TERMINARZ po polsku: rozgrywki, rodzaj, wynik, dni i sygnały', () => {
		const tekst = S.formatScheduleFacts(pelny(), NAZWY);
		assert.match(tekst, /^TERMINARZ — POPRZEDNI I NASTĘPNY MECZ OBU DRUŻYN/);
		assert.match(tekst, /Legia: poprzedni mecz czw\. 22\.10 — Liga Konferencji \(puchar europejski\), u siebie z Drużyna 781, wygrana 2:1 — 3 dni przerwy/);
		assert.match(tekst, /następny mecz czw\. 29\.10 — Liga Konferencji \(puchar europejski\), na wyjeździe z Drużyna 402, jeszcze do rozegrania — 4 dni po tym meczu/);
		assert.match(tekst, /w 14 dniach przed tym meczem 2 mecze/);
		assert.match(tekst, /SYGNAŁY: mecz w pucharach europejskich 3 dni przed tym meczem; krótki odpoczynek: 3 dni od poprzedniego meczu; ważny mecz 4 dni po tym \(Liga Konferencji\) — ryzyko rotacji składu/);
		assert.match(tekst, /Lech: poprzedni mecz niedz\. 18\.10 — Ekstraklasa \(liga\)/);
		assert.match(tekst, /bez sygnałów zmęczenia i rotacji/);
		assert.equal(S.formatScheduleFacts(null, NAZWY), null);
	});

	test('po angielsku', () => {
		const tekst = S.formatScheduleFacts(pelny(), { ...NAZWY, language: 'en' });
		assert.match(tekst, /^SCHEDULE — PREVIOUS AND NEXT MATCH/);
		assert.match(tekst, /Legia: previous match Thu 22 Oct — Conference League \(European cup\), home vs Drużyna 781, won 2-1 — 3 days before this one/);
		assert.match(tekst, /SIGNALS: European cup match 3 days before this one/);
		assert.match(tekst, /no fatigue or rotation signals/);
	});

	test('jedna linia do raportów i kuponu live', () => {
		const linia = S.formatScheduleLine(pelny(), NAZWY);
		assert.match(linia, /^Legia: poprzedni czw\. 22\.10 Liga Konferencji \(puchar europejski\), 3 dni przerwy, następny czw\. 29\.10 Liga Konferencji \(puchar europejski\), 4 dni po \[SYGNAŁ: /);
		assert.match(linia, /; Lech: poprzedni niedz\. 18\.10 Ekstraklasa \(liga\), 7 dni przerwy, następny niedz\. 01\.11 Ekstraklasa \(liga\), 7 dni po$/);
		assert.equal(S.formatScheduleLine(null, NAZWY), null);
	});

	test('notka dla czytelnika tylko przy fladze, bez czasowników z rodzajem', () => {
		const t = pelny();
		assert.equal(
			S.teamScheduleNote(t.home, 'Legia'),
			'Legia: w czwartek mecz w Lidze Konferencji (3 dni przerwy); za 4 dni (czw.) mecz w Lidze Konferencji — ryzyko rotacji składu'
		);
		assert.equal(
			S.teamScheduleNote(t.home, 'Legia', 'en'),
			"Legia: Conference League match on Thursday (3 days' rest); Conference League match in 4 days (Thu) — rotation risk"
		);
		assert.equal(S.teamScheduleNote(t.away, 'Lech'), null);
		assert.deepEqual(S.scheduleNotes(t, NAZWY), [S.teamScheduleNote(t.home, 'Legia')]);
		assert.deepEqual(S.scheduleNoteBoth(t, NAZWY), {
			pl: S.teamScheduleNote(t.home, 'Legia'),
			en: S.teamScheduleNote(t.home, 'Legia', 'en'),
		});

		// Zwykły terminarz obu drużyn — żadnej notki.
		const zwykly = S.buildMatchSchedule(MECZ, {
			home: { recent: [wiersz(30, '2099-10-18T14:00:00Z', { ...EKSTRAKLASA, home: LEGIA, away: 411, gh: 0, ga: 0 })], upcoming: [] },
			away: { recent: LECH_OSTATNIE, upcoming: LECH_NASTEPNE },
		});
		assert.equal(zwykly.flagged, false);
		assert.deepEqual(S.scheduleNotes(zwykly, NAZWY), []);
		assert.equal(S.scheduleNoteBoth(zwykly, NAZWY), null);
	});

	test('półfinał pucharu krajowego i puchar z polską nazwą w notce', () => {
		const ts = S.teamSchedule({
			teamId: LEGIA,
			recent: [wiersz(20, '2099-10-22T17:00:00Z', { leagueId: 999, league: 'Puchar Polski', country: 'Poland', home: LEGIA, away: 409, gh: 1, ga: 0 })],
			upcoming: [wiersz(21, '2099-10-28T17:00:00Z', { leagueId: 81, league: 'DFB Pokal', round: 'Semi-finals', home: LEGIA, away: 410 })],
			match: MECZ,
			now: TERAZ,
		});
		assert.equal(
			S.teamScheduleNote(ts, 'Legia'),
			'Legia: w czwartek mecz w Pucharze Polski (3 dni przerwy); za 3 dni (śr.) półfinał w Pucharze Niemiec — ryzyko rotacji składu'
		);
		assert.match(S.teamScheduleNote(ts, 'Legia', 'en'), /DFB-Pokal semi-final in 3 days \(Wed\) — rotation risk/);
	});

	test('karta kuponu: notka w języku czytelnika, bez zapisu — nic', () => {
		const noga = { schedule: { pl: 'Legia: w czwartek mecz w Lidze Konferencji (3 dni przerwy)', en: "Legia: Conference League match on Thursday (3 days' rest)" } };
		assert.equal(legScheduleNote(noga, 'pl'), noga.schedule.pl);
		assert.equal(legScheduleNote(noga, 'en'), noga.schedule.en);
		assert.equal(legScheduleNote({ schedule: { pl: 'tylko pl' } }, 'en'), 'tylko pl');
		assert.equal(legScheduleNote({ schedule: null }, 'pl'), null);
		assert.equal(legScheduleNote({}, 'pl'), null);
	});
});

describe('prompty z terminarzem', () => {
	const LEG = {
		fixtureId: String(MECZ_ID),
		homeName: 'Legia',
		awayName: 'Lech',
		league: 'Ekstraklasa',
		kickoff: MECZ.kickoff,
		selection: 'Lech (goście) lub remis',
	};

	test('sprawdzanie wiadomości: fakty z terminarza i zasada rotacji tylko przy sygnale', () => {
		const zSygnalem = newsPrompt({ ...LEG, teamSchedule: pelny() });
		assert.match(zSygnalem, /TERMINARZ — POPRZEDNI I NASTĘPNY MECZ/);
		assert.match(zSygnalem, /Legia: poprzedni mecz czw\. 22\.10 — Liga Konferencji/);
		assert.match(zSygnalem, /oceń ryzyko rotacji i zmęczenia/);
		assert.match(zSygnalem, /Samo zestawienie dat to jeszcze nie RYZYKO/);
		assert.match(zSygnalem, /WERDYKT: RYZYKO — <powód/);

		const zwykly = S.buildMatchSchedule(MECZ, { away: { recent: LECH_OSTATNIE, upcoming: LECH_NASTEPNE } });
		const bezSygnalu = newsPrompt({ ...LEG, teamSchedule: zwykly });
		assert.match(bezSygnalu, /TERMINARZ/);
		assert.doesNotMatch(bezSygnalu, /oceń ryzyko rotacji i zmęczenia/);

		const bezTerminarza = newsPrompt(LEG);
		assert.doesNotMatch(bezTerminarza, /TERMINARZ/);
		assert.match(bezTerminarza, /Sprawdzany typ: Lech \(goście\) lub remis/);
	});

	test('analiza meczu: sekcja TERMINARZ w faktach i zasada 22; wersja promptu podniesiona', () => {
		const fakty = buildMatchFacts({
			fetchedAt: '2099-10-24T10:00:00Z',
			fixture: {
				teams: { home: { id: LEGIA, name: 'Legia' }, away: { id: LECH, name: 'Lech' } },
				league: { name: 'Ekstraklasa', country: 'Poland' },
				status: { code: 'NS', label: 'Not Started' },
				goals: {},
			},
			schedule: pelny(),
		});
		assert.match(fakty, /TERMINARZ — POPRZEDNI I NASTĘPNY MECZ OBU DRUŻYN/);
		assert.match(fakty, /SYGNAŁY: mecz w pucharach europejskich 3 dni przed tym meczem/);
		assert.equal(PROMPT_VERSION, 'match-analysis/16');
		assert.match(ANALYSIS_SYSTEM_PROMPT, /22\. Sekcja TERMINARZ/);
		assert.match(ANALYSIS_SYSTEM_PROMPT, /WYŁĄCZNIE jako ryzyko rotacji składu/);
		assert.match(ANALYSIS_SYSTEM_PROMPT, /nie wspominaj o terminarzu na siłę/);
	});

	test('raporty: linia TERMINARZ przy kandydacie i wspólna zasada', () => {
		const kandydat = {
			fixtureId: MECZ_ID,
			home: 'Legia',
			away: 'Lech',
			league: 'Ekstraklasa, Poland',
			kickoff: MECZ.kickoff,
			best: { market: 'Wynik meczu', selection: 'Legia', pModel: 60, base: 45, lift: 15, support: 1 },
			otherMarkets: [],
			schedule: pelny(),
		};
		const p = buildReportPrompt([kandydat], { type: 'soon', language: 'pl' });
		assert.match(p, /TERMINARZ: Legia: poprzedni czw\. 22\.10 Liga Konferencji/);
		assert.doesNotMatch(buildReportPrompt([{ ...kandydat, schedule: null }], { type: 'soon', language: 'pl' }), /TERMINARZ:/);
		assert.equal(REPORT_PROMPT_VERSION, 'report/6');
		assert.match(REPORT_SYSTEM_PROMPT, /6a\. TERMINARZ:/);

		const v = buildValueReportPrompt([{ ...kandydat, homeName: 'Legia', awayName: 'Lech', selection: 'Lech', odds: 2.1, market: 47, model: 50 }], {
			type: 'soon',
			language: 'pl',
		});
		assert.match(v, /TERMINARZ: Legia: poprzedni/);
		assert.match(VALUE_REPORT_SYSTEM_PROMPT, /6a\. TERMINARZ:/);
	});
});

describe('pobieranie — bez prawdziwego API', () => {
	beforeEach(() => S.clearScheduleMemory());

	test('loadMatchSchedule: podstawione listy, błąd jednej drużyny, brak drużyn, limit czasu', async () => {
		const listy = { [LEGIA]: { recent: LEGIA_OSTATNIE, upcoming: LEGIA_NASTEPNE }, [LECH]: { recent: LECH_OSTATNIE, upcoming: LECH_NASTEPNE } };
		const wolane = [];
		const load = async (id) => {
			wolane.push(id);
			return listy[id];
		};
		const t = await S.loadMatchSchedule(MECZ, { load, now: TERAZ });
		assert.deepEqual(wolane.sort(), [LEGIA, LECH].sort());
		assert.equal(t.home.flags.europeMidweek, true);

		const polowa = await S.loadMatchSchedule(MECZ, {
			load: async (id) => {
				if (id === LECH) throw new Error('API zwróciło 429');
				return listy[id];
			},
			now: TERAZ,
		});
		assert.equal(polowa.away, null);
		assert.equal(polowa.home.flagged, true);

		let zawolano = false;
		const bezDruzyn = await S.loadMatchSchedule({ ...MECZ, homeId: null, awayId: null }, { load: async () => (zawolano = true) });
		assert.equal(bezDruzyn, null);
		assert.equal(zawolano, false);

		const powoli = await S.loadMatchSchedule(MECZ, {
			load: () => new Promise((resolve) => setTimeout(() => resolve(listy[LEGIA]), 200)),
			timeoutMs: 20,
		});
		assert.equal(powoli, null);
	});

	test('pamięć procesu: pakiet meczu zapamiętuje listy, kolejne miejsca czytają bez zapytania', async () => {
		assert.equal(S.peekMatchSchedule(MECZ), null);
		const fixture = {
			id: MECZ_ID,
			date: MECZ.kickoff,
			league: { id: 106, name: 'Ekstraklasa', country: 'Poland' },
			teams: { home: { id: LEGIA, name: 'Legia' }, away: { id: LECH, name: 'Lech' } },
		};
		const zPakietu = S.scheduleForBundle(
			fixture,
			{ recentHome: LEGIA_OSTATNIE, nextHome: LEGIA_NASTEPNE, recentAway: LECH_OSTATNIE, nextAway: LECH_NASTEPNE },
			{ now: TERAZ }
		);
		assert.equal(zPakietu.notes.pl.length, 1);
		assert.match(zPakietu.notes.pl[0], /^Legia: w czwartek mecz w Lidze Konferencji \(3 dni przerwy\)/);
		assert.match(zPakietu.notes.en[0], /^Legia: Conference League match on Thursday/);

		const zPamieci = S.peekMatchSchedule(MECZ, { now: TERAZ });
		assert.deepEqual(zPamieci.home.flags, zPakietu.home.flags);
		// `loadTeamFixtures` bierze z pamięci — gdyby poszło do API, test wywróciłby się bez klucza/limitu.
		assert.deepEqual(await S.loadTeamFixtures(LEGIA), { recent: LEGIA_OSTATNIE, upcoming: LEGIA_NASTEPNE });

		// Pakiet bez list (błąd pobrania) — terminarza nie ma i nic nie zostaje w pamięci.
		S.clearScheduleMemory();
		assert.equal(S.scheduleForBundle(fixture, {}), null);
		assert.equal(S.peekMatchSchedule(MECZ), null);
	});

	test('attachSchedules dokleja wynik pod wskazanym kluczem; błąd to null, nie wyjątek', async () => {
		const pozycje = [{ fixtureId: 1 }, { fixtureId: 2 }];
		await S.attachSchedules(pozycje, {
			toMatch: (p) => p,
			key: 'teamSchedule',
			scheduleFor: async (m) => {
				if (m.fixtureId === 2) throw new Error('x');
				return { ok: m.fixtureId };
			},
		});
		assert.deepEqual(pozycje, [
			{ fixtureId: 1, teamSchedule: { ok: 1 } },
			{ fixtureId: 2, teamSchedule: null },
		]);
	});
});
