import { normalizeLineups } from '@/lib/football/normalize';

/**
 * SKŁADY I NIEOBECNI PRZED MECZEM — część czysta: parsowanie odpowiedzi dostawcy, „podstawowa
 * jedenastka", siła składu i weto typu. Bez sieci i bez bazy (to `lineupsJob.js` i `lineupsStore.js`).
 *
 * PO CO. Model (Dixon–Coles, `lib/model`) zna wyniki, nie ludzi: nie wie, że bramkarz złamał palec
 * albo że trener wystawia rezerwy przed Ligą Mistrzów. Dotąd wiedziało o tym tylko AI z wyszukiwarką
 * przy płatnych kuponach (`lib/coupons/news.js`) — raz rano, z wiadomości, bez liczb. Tu ten sam fakt
 * jest policzony z danych dostawcy: kto zwykle gra, kogo dziś nie ma.
 *
 * SKĄD „PODSTAWOWI". Bez płatnych ocen graczy — wyłącznie z API-Football: z ostatnich
 * `HISTORY_MATCHES` meczów drużyny, w których znamy wyjściową jedenastkę (`fixtures?ids=` oddaje składy
 * i zdarzenia 20 meczów na jedno zapytanie). Podstawowy = wychodził w co najmniej `CORE_SHARE` tych
 * meczów. Bramkarz = najczęściej wychodzący „G". Najlepszy strzelec = najwięcej goli z tych samych
 * meczów (zdarzenia `Goal`, bez samobójów), o ile wyraźnie prowadzi.
 *
 * LICZBY MODELU BEZ ZMIAN. Historii składów nie mamy, więc korekty szans nie da się zmierzyć, a nie
 * wolno jej zgadywać. Miara idzie do dziennika prognoz (`ModelForecast.lineup`) i do pomiaru
 * (`lib/model/lineupCheck.mjs`); od razu działa tylko WETO z jasnym progiem (`lineupVeto`).
 */

/** Tyle ostatnich meczów drużyny bierzemy do „podstawowej jedenastki" — ten sam horyzont co forma (`RECENT_COUNT`). */
export const HISTORY_MATCHES = 10;
/**
 * Poniżej tylu znanych składów nie mówimy, kto jest podstawowy. Przy pięciu meczach „60%" to trzy
 * występy — mniej i jeden mecz pucharowy z rezerwami przestawia całą jedenastkę.
 */
export const MIN_KNOWN = 5;
/** Podstawowy: wychodził w co najmniej 60% znanych meczów (6 z 10). Połowa łapałaby zmienników z rotacji. */
export const CORE_SHARE = 0.6;
export const CORE_MAX = 11;
/** Bramkarz numer jeden: ten sam „G" w co najmniej 60% meczów — przy rotacji bramkarzy (puchar/liga) nie ma „jedynki". */
export const GOALKEEPER_SHARE = 0.6;
/**
 * Najlepszy strzelec: co najmniej 3 gole w znanych meczach i co najmniej 30% goli drużyny. Bez tego
 * w drużynie, gdzie pięciu graczy strzeliło po golu, „lider" byłby losowy, a weto — szumem.
 */
export const TOP_SCORER_MIN_GOALS = 3;
export const TOP_SCORER_MIN_SHARE = 0.3;
/**
 * PRÓG WETA: brak co najmniej trzech podstawowych graczy ALBO bramkarza numer jeden ALBO najlepszego
 * strzelca u drużyny, na którą stawia typ. To ta sama granica, którą od 18.10.2026 dostaje AI przy
 * sprawdzaniu wiadomości (`lib/coupons/news.js`: „bez najlepszego strzelca, kapitana albo kilku
 * podstawowych graczy"; przy faworycie „kilku podstawowych, najlepszego strzelca albo bramkarza") —
 * tylko liczona z danych, a nie z artykułów. Jeden–dwóch brakujących to zwykła rotacja między kolejkami
 * i AI też ich nie odrzuca. Próg NIE jest dopasowany do wyników (tych jeszcze nie ma) — sprawdzi go
 * `lineupCheck.mjs`.
 */
export const VETO_MISSING_CORE = 3;
/** Rotacja przed ważnym meczem: sygnał terminarza (`schedule.js`) i co najmniej dwóch podstawowych na ławce. */
export const ROTATION_RESTED = 2;

/** Typ API-Football „Missing Fixture" — pewny brak; „Questionable" — pod znakiem zapytania (nie liczymy). */
export const INJURY_OUT = 'Missing Fixture';
export const INJURY_DOUBT = 'Questionable';

const ZAWIESZENIE = /suspend|red card|yellow card|disciplin/i;

/** Klucz gracza: identyfikator dostawcy, a gdy go brak (niższe ligi) — nazwa. */
const kluczGracza = (p) => (p?.id != null ? `id:${p.id}` : p?.name ? `n:${String(p.name).toLowerCase()}` : null);

/* ------------------------------------------------------------------ parsowanie */

/**
 * Zdarzenia meczu → gole z autorami. Samobój dostawca przypisuje drużynie, która gola ZYSKUJE, a strzelcem
 * jest gracz rywala (`lib/ai/prompts/matchFacts.js`) — do „najlepszego strzelca" go nie liczymy; niestrzelony
 * karny to też nie gol.
 */
export function parseGoals(events) {
	if (!Array.isArray(events)) return [];
	return events
		.filter((e) => e?.type === 'Goal' && e.detail !== 'Own Goal' && e.detail !== 'Missed Penalty' && e.team?.id != null)
		.map((e) => ({
			teamId: Number(e.team.id),
			playerId: e.player?.id ?? null,
			playerName: e.player?.name ?? null,
			assistId: e.assist?.id ?? null,
		}));
}

/** Wyjściowa jedenastka jest „potwierdzona", gdy dostawca podał co najmniej 11 nazwisk. */
export const lineupConfirmed = (team) => Array.isArray(team?.startXI) && team.startXI.length >= 11;

/** Składy w kształcie do zapisu: `normalizeLineups` (wspólny z pakietem meczu) + numer zawodnika rezerwowego. */
export function parseLineups(rawList) {
	const zNumerami = new Map(
		(Array.isArray(rawList) ? rawList : []).map((r) => [
			r?.team?.id,
			new Map((r?.substitutes || []).map((s) => [s?.player?.id, s?.player?.number ?? null])),
		])
	);
	return normalizeLineups(rawList).map((t) => ({
		teamId: t.teamId != null ? Number(t.teamId) : null,
		teamName: t.teamName ?? null,
		formation: t.formation,
		coach: t.coach,
		startXI: t.startXI.map((p) => ({ id: p.id ?? null, name: p.name ?? null, number: p.number, pos: p.position })),
		substitutes: t.substitutes.map((p) => ({
			id: p.id ?? null,
			name: p.name ?? null,
			number: zNumerami.get(t.teamId)?.get(p.id) ?? null,
			pos: p.position,
		})),
	}));
}

/**
 * Wiersz `fixtures?ids=` (do 20 meczów na zapytanie) → zapis składu meczu. Ten sam wiersz niesie
 * `lineups` i `events`, więc wyjściowa jedenastka i strzelcy z historii nie kosztują osobnych zapytań.
 *
 * @returns {null | { fixtureId, kickoff, status, leagueId, season, homeId, awayId, homeName, awayName,
 *   teams: Array, goals: Array, lineupsKnown: boolean, finished: boolean }}
 */
export function parseFixtureRow(row) {
	const id = row?.fixture?.id;
	if (id == null || !Number.isFinite(Number(id))) return null;
	const status = row.fixture?.status?.short ?? null;
	const teams = parseLineups(row.lineups);
	return {
		fixtureId: String(id),
		kickoff: row.fixture?.date ? new Date(row.fixture.date) : null,
		status,
		leagueId: row.league?.id ?? null,
		season: row.league?.season ?? null,
		homeId: row.teams?.home?.id ?? null,
		awayId: row.teams?.away?.id ?? null,
		homeName: row.teams?.home?.name ?? null,
		awayName: row.teams?.away?.name ?? null,
		teams,
		goals: parseGoals(row.events),
		// Pole `lineups` w ogóle nieobecne (inny kształt odpowiedzi) ≠ pusta lista (dostawca nie ma składów).
		lineupsField: Array.isArray(row.lineups),
		finished: ['FT', 'AET', 'PEN'].includes(status),
	};
}

/**
 * Odpowiedź `injuries` (per mecz albo `ids=` do 20 meczów) → mapa `fixtureId → lista`. API potrafi zwrócić
 * tego samego gracza kilka razy (osobny wpis na rozgrywki) — jak w `normalizeInjuries`, jeden wpis na gracza.
 *
 * @param {Array} rows
 * @param {string|number|null} [fixtureId] mecz, gdy zapytanie było per mecz (wiersz nie musi go nieść)
 * @returns {Map<string, Array<{ teamId: number, playerId: number|null, playerName: string|null, type: string|null, reason: string|null }>>}
 */
export function parseInjuries(rows, fixtureId = null) {
	const out = new Map();
	const seen = new Set();
	for (const raw of Array.isArray(rows) ? rows : []) {
		const mecz = raw?.fixture?.id ?? fixtureId;
		if (mecz == null || raw?.team?.id == null) continue;
		const key = `${mecz}:${raw.team.id}:${raw.player?.id ?? raw.player?.name}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (!out.has(String(mecz))) out.set(String(mecz), []);
		out.get(String(mecz)).push({
			teamId: Number(raw.team.id),
			playerId: raw.player?.id ?? null,
			playerName: raw.player?.name ?? null,
			type: raw.player?.type ?? null,
			reason: raw.player?.reason ?? null,
		});
	}
	return out;
}

/* ------------------------------------------------------------------ podstawowa jedenastka */

/**
 * Historia jednej drużyny ze składów meczów: ostatnie `HISTORY_MATCHES` meczów PRZED `before`, w których
 * znamy jej wyjściową jedenastkę.
 *
 * @param {Array<{ fixtureId, kickoff, teams, goals }>} docs zapisane składy meczów (dowolna kolejność)
 * @returns {Array<{ fixtureId: string, kickoff: Date, startXI: Array, goals: Array }>} od najnowszego
 */
export function teamHistory(docs, teamId, before = Date.now()) {
	const id = Number(teamId);
	const granica = before instanceof Date ? before.getTime() : Number(before);
	return (docs || [])
		.map((d) => ({ d, t: new Date(d?.kickoff).getTime(), team: (d?.teams || []).find((t) => Number(t.teamId) === id) }))
		// Mecz bliżej niż 3 godziny przed analizowanym to on sam albo dubel u dostawcy.
		.filter((x) => Number.isFinite(x.t) && x.t < granica - 3 * 3600_000 && lineupConfirmed(x.team))
		.sort((a, b) => b.t - a.t)
		.slice(0, HISTORY_MATCHES)
		.map((x) => ({
			fixtureId: String(x.d.fixtureId),
			kickoff: new Date(x.t),
			startXI: x.team.startXI,
			goals: (x.d.goals || []).filter((g) => Number(g.teamId) === id),
		}));
}

/**
 * „Podstawowa jedenastka" drużyny z jej historii.
 *
 * @param {Array} history z `teamHistory`
 * @returns {{ known: number, reliable: boolean, core: Array<{ key, id, name, pos, starts, share, goals }>,
 *   goalkeeper: object|null, topScorer: object|null, teamGoals: number }}
 */
export function regularXI(history) {
	const known = (history || []).length;
	const gracze = new Map();
	let teamGoals = 0;
	for (const mecz of history || []) {
		for (const p of mecz.startXI || []) {
			const k = kluczGracza(p);
			if (!k) continue;
			const g = gracze.get(k) || { key: k, id: p.id ?? null, name: p.name ?? null, starts: 0, goals: 0, poz: new Map() };
			g.starts += 1;
			if (p.pos) g.poz.set(p.pos, (g.poz.get(p.pos) || 0) + 1);
			if (!g.name && p.name) g.name = p.name;
			gracze.set(k, g);
		}
		for (const gol of mecz.goals || []) {
			teamGoals += 1;
			const k = kluczGracza({ id: gol.playerId, name: gol.playerName });
			if (!k) continue;
			const g = gracze.get(k) || { key: k, id: gol.playerId ?? null, name: gol.playerName ?? null, starts: 0, goals: 0, poz: new Map() };
			g.goals += 1;
			gracze.set(k, g);
		}
	}
	const lista = [...gracze.values()].map(({ poz, ...g }) => ({
		...g,
		pos: [...poz.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
		share: known ? g.starts / known : 0,
	}));
	const reliable = known >= MIN_KNOWN;
	const core = reliable
		? lista
				.filter((g) => g.share >= CORE_SHARE - 1e-9)
				.sort((a, b) => b.starts - a.starts || b.goals - a.goals || String(a.name).localeCompare(String(b.name)))
				.slice(0, CORE_MAX)
		: [];
	const bramkarze = lista.filter((g) => g.pos === 'G').sort((a, b) => b.starts - a.starts);
	const goalkeeper = reliable && bramkarze[0]?.share >= GOALKEEPER_SHARE - 1e-9 ? bramkarze[0] : null;
	const strzelcy = [...lista].sort((a, b) => b.goals - a.goals || b.starts - a.starts);
	const lider = strzelcy[0];
	const topScorer =
		reliable &&
		lider &&
		lider.goals >= TOP_SCORER_MIN_GOALS &&
		teamGoals > 0 &&
		lider.goals / teamGoals >= TOP_SCORER_MIN_SHARE - 1e-9 &&
		// Remis w prowadzeniu to brak lidera — jeden z dwóch po 4 gole nie jest „najlepszym strzelcem".
		!(strzelcy[1] && strzelcy[1].goals === lider.goals)
			? lider
			: null;
	return { known, reliable, core, goalkeeper, topScorer, teamGoals };
}

/* ------------------------------------------------------------------ siła składu */

/** Rodzaj nieobecności do opisu: kontuzja, zawieszenie, ławka (jest w składzie meczowym), brak w kadrze. */
function rodzaj(injury, onBench) {
	if (injury) return ZAWIESZENIE.test(`${injury.reason || ''}`) ? 'suspension' : 'injury';
	return onBench ? 'bench' : 'absent';
}

/**
 * Siła składu jednej drużyny przed meczem.
 *
 * Etap `confirmed` — gdy dostawca podał wyjściową jedenastkę (zwykle 20–60 minut przed meczem): podstawowy
 * spoza niej brakuje, z jakiegokolwiek powodu (kontuzja, ławka, rotacja). Etap `expected` — bez składów, z listy
 * nieobecnych: liczy się tylko „Missing Fixture"; „Questionable" pokazujemy, ale nie liczymy (dziś połowa takich
 * graczy wychodzi w składzie — to plotka, nie fakt, ta sama zasada co w `news.js`).
 *
 * @param {{ regular: object, lineup?: object|null, injuries?: Array, rotationRisk?: boolean }} args
 *   `regular` z `regularXI`; `lineup` — skład drużyny z `parseLineups` (potwierdzony albo `null`);
 *   `injuries` — nieobecni TEJ drużyny z `parseInjuries`
 */
export function squadStrength({ regular, lineup = null, injuries = [], rotationRisk = false }) {
	const potwierdzony = lineupConfirmed(lineup);
	const stage = potwierdzony ? 'confirmed' : 'expected';
	const wyjsciowi = potwierdzony ? new Set(lineup.startXI.map(kluczGracza).filter(Boolean)) : null;
	const lawka = potwierdzony ? new Set((lineup.substitutes || []).map(kluczGracza).filter(Boolean)) : new Set();
	const nieobecni = new Map();
	const watpliwi = [];
	for (const i of injuries || []) {
		const k = kluczGracza({ id: i.playerId, name: i.playerName });
		if (!k) continue;
		if (i.type === INJURY_DOUBT) watpliwi.push(i);
		else nieobecni.set(k, i);
	}

	const base = {
		stage,
		known: regular?.known ?? 0,
		reliable: Boolean(regular?.reliable),
		coreSize: regular?.core?.length ?? 0,
		rotationRisk: Boolean(rotationRisk),
	};
	if (!regular?.reliable) {
		return { ...base, missingCore: 0, missing: [], doubtful: watpliwi.map(opisWatpliwego), missingGoalkeeper: false, missingTopScorer: false, rested: 0, strength: null, rotation: false, weakened: false };
	}

	const brakuje = (g) => (potwierdzony ? !wyjsciowi.has(g.key) : nieobecni.has(g.key));
	const missingCore = regular.core.filter(brakuje).length;
	const missing = regular.core.filter(brakuje).map((g) => ({
		id: g.id,
		name: g.name,
		pos: g.pos,
		kind: rodzaj(nieobecni.get(g.key), lawka.has(g.key)),
		reason: nieobecni.get(g.key)?.reason ?? null,
		goalkeeper: regular.goalkeeper?.key === g.key,
		topScorer: regular.topScorer?.key === g.key,
		core: true,
	}));
	const missingGoalkeeper = Boolean(regular.goalkeeper && brakuje(regular.goalkeeper));
	const missingTopScorer = Boolean(regular.topScorer && brakuje(regular.topScorer));
	// Lider strzelców spoza podstawowych (wchodzi z ławki) też trafia na listę — jego brak jest powodem weta.
	if (missingTopScorer && !missing.some((m) => m.topScorer)) {
		const g = regular.topScorer;
		missing.push({ id: g.id, name: g.name, pos: g.pos, kind: rodzaj(nieobecni.get(g.key), lawka.has(g.key)), reason: nieobecni.get(g.key)?.reason ?? null, goalkeeper: false, topScorer: true, core: false });
	}
	const waga = regular.core.reduce((s, g) => s + g.share, 0);
	const obecni = regular.core.filter((g) => !brakuje(g)).reduce((s, g) => s + g.share, 0);
	const rested = potwierdzony ? missing.filter((m) => m.kind === 'bench').length : 0;
	return {
		...base,
		missingCore,
		missing,
		doubtful: watpliwi.map(opisWatpliwego),
		missingGoalkeeper,
		missingTopScorer,
		goalkeeper: regular.goalkeeper ? { id: regular.goalkeeper.id, name: regular.goalkeeper.name } : null,
		topScorer: regular.topScorer ? { id: regular.topScorer.id, name: regular.topScorer.name, goals: regular.topScorer.goals } : null,
		rested,
		strength: waga > 0 ? Math.round((100 * obecni) / waga) : null,
		rotation: Boolean(rotationRisk) && rested >= ROTATION_RESTED,
		weakened: missingCore >= VETO_MISSING_CORE || missingGoalkeeper || missingTopScorer,
	};
}

function opisWatpliwego(i) {
	return { id: i.playerId ?? null, name: i.playerName ?? null, reason: i.reason ?? null };
}

/**
 * Miara do dziennika prognoz (`ModelForecast.lineup`) — same liczby, bez nazwisk.
 */
export function measureForLog(s) {
	if (!s) return null;
	return {
		known: s.known,
		reliable: s.reliable,
		coreSize: s.coreSize,
		missingCore: s.missingCore,
		missingGoalkeeper: s.missingGoalkeeper,
		missingTopScorer: s.missingTopScorer,
		rested: s.rested,
		strength: s.strength,
		rotationRisk: s.rotationRisk,
		weakened: s.weakened,
	};
}

/* ------------------------------------------------------------------ weto */

/**
 * Na którą drużynę stawia typ (klucze plakietek z `SELECTION_SHAPES`). „Powyżej 2,5" nie stawia na żadną —
 * tam liczy się atak obu, więc weto tylko za brak najlepszego strzelca którejkolwiek.
 */
export const BACKED_SIDES = {
	home: ['home'],
	'1X': ['home'],
	homeScores: ['home'],
	away: ['away'],
	X2: ['away'],
	awayScores: ['away'],
	over25: ['home', 'away'],
};

/**
 * WSPÓLNE WETO — kupony (dnia, 3-, 5-dniowy), kreator (przez `composeCoupon`), typ dnia, ostrzeżenie przy
 * plakietce i przy nodze opublikowanego kuponu. Jedna definicja, żeby lista i kupon mówiły to samo.
 *
 * @param {string} key klucz selekcji
 * @param {{ home?: object, away?: object }|null} squad siła składu obu drużyn (`squadStrength`)
 * @returns {{ veto: boolean, side: 'home'|'away'|null, reasons: string[] }}
 *   `reasons`: `missing_core`, `goalkeeper`, `top_scorer` — do opisu w interfejsie
 */
export function lineupVeto(key, squad) {
	const strony = BACKED_SIDES[key];
	if (!strony || !squad) return { veto: false, side: null, reasons: [] };
	for (const side of strony) {
		const s = squad[side];
		if (!s?.reliable) continue;
		const reasons = [];
		if (key === 'over25') {
			if (s.missingTopScorer) reasons.push('top_scorer');
		} else {
			if (s.missingCore >= VETO_MISSING_CORE) reasons.push('missing_core');
			if (s.missingGoalkeeper) reasons.push('goalkeeper');
			if (s.missingTopScorer) reasons.push('top_scorer');
		}
		if (reasons.length) return { veto: true, side, reasons };
	}
	return { veto: false, side: null, reasons: [] };
}

/**
 * Kandydaci na kupon bez typów z wetem. Brak danych o meczu = brak weta (nie wiemy, więc nie karzemy).
 *
 * @param {Array<{ fixtureId: string, key: string }>} candidates
 * @param {Map<string, object>} squads `fixtureId → { home, away }`
 * @returns {{ kept: Array, dropped: Array<{ fixtureId, homeName, awayName, selection, reason }> }}
 */
export function splitByLineupVeto(candidates, squads) {
	const kept = [];
	const dropped = [];
	for (const c of candidates || []) {
		const w = lineupVeto(c?.key, squads?.get(String(c?.fixtureId)) ?? null);
		if (!w.veto) {
			kept.push(c);
			continue;
		}
		dropped.push({
			fixtureId: String(c.fixtureId),
			homeName: c.homeName,
			awayName: c.awayName,
			selection: c.selection,
			reason: vetoReasonPl(w, squads.get(String(c.fixtureId)), { homeName: c.homeName, awayName: c.awayName }),
		});
	}
	return { kept, dropped };
}

/* ------------------------------------------------------------------ opis */

const POWODY_PL = { missing_core: 'brak podstawowych', goalkeeper: 'bez bramkarza nr 1', top_scorer: 'bez najlepszego strzelca' };
const POWODY_EN = { missing_core: 'regulars missing', goalkeeper: 'no first-choice keeper', top_scorer: 'no top scorer' };

/** Krótki powód weta po polsku (zapis przy kuponie, log), np. „Legia: osłabiony skład — bez bramkarza nr 1, brak 3 podstawowych". */
export function vetoReasonPl(w, squad, { homeName = 'gospodarze', awayName = 'goście' } = {}) {
	return vetoNote(w, squad, { homeName, awayName }).pl;
}

/** Notka ostrzeżenia w obu językach — zapisywana przy nodze i typie dnia (karta renderuje się w języku czytelnika). */
export function vetoNote(w, squad, { homeName = '?', awayName = '?' } = {}) {
	if (!w?.veto) return null;
	const s = squad?.[w.side];
	const nazwa = w.side === 'home' ? homeName : awayName;
	const ile = s?.missingCore ?? 0;
	const pl = w.reasons.map((r) => (r === 'missing_core' ? `brak ${ile} podstawowych` : POWODY_PL[r]));
	const en = w.reasons.map((r) => (r === 'missing_core' ? `${ile} regulars missing` : POWODY_EN[r]));
	return {
		pl: `${nazwa}: osłabiony skład — ${pl.join(', ')}`,
		en: `${nazwa}: weakened line-up — ${en.join(', ')}`,
		side: w.side,
		reasons: w.reasons,
	};
}

/**
 * Widok dla interfejsu i asystenta: potwierdzone jedenastki (gdy są) z zaznaczeniem podstawowych, nieobecni,
 * wątpliwi i miara. Ten sam kształt dla strony meczu (`/typ`, z zapisu) i pokoju meczowego (pakiet meczu).
 *
 * @param {{ squad: { home, away, stage }|null, teams?: Array, injuries?: Array, homeId, awayId, homeName, awayName }} args
 */
export function squadView({ squad, teams = [], injuries = [], homeId, awayId, homeName, awayName }) {
	const strona = (side, teamId, name) => {
		const lineup = (teams || []).find((t) => Number(t.teamId) === Number(teamId)) || null;
		const s = squad?.[side] || null;
		const podstawowi = new Set((s?.coreKeys || []).map(String));
		const potwierdzony = lineupConfirmed(lineup);
		const nieobecniDruzyny = (injuries || []).filter((i) => Number(i.teamId) === Number(teamId));
		return {
			teamId: teamId ?? null,
			name,
			formation: potwierdzony ? lineup.formation ?? null : null,
			startXI: potwierdzony
				? lineup.startXI.map((p) => ({ id: p.id, name: p.name, number: p.number ?? null, pos: p.pos ?? null, regular: podstawowi.has(String(kluczGracza(p))) }))
				: [],
			// Lista nieobecnych: z miary (podstawowi, z rodzajem), potem pozostali z listy dostawcy.
			absent: [
				...(s?.missing || []).map(({ core, ...m }) => ({ ...m, regular: core !== false })),
				...nieobecniDruzyny
					.filter((i) => i.type !== INJURY_DOUBT && !(s?.missing || []).some((m) => (m.id ?? m.name) === (i.playerId ?? i.playerName)))
					.map((i) => ({ id: i.playerId, name: i.playerName, pos: null, kind: rodzaj(i, false), reason: i.reason, goalkeeper: false, topScorer: false, regular: false })),
			],
			doubtful: nieobecniDruzyny.filter((i) => i.type === INJURY_DOUBT).map(opisWatpliwego),
			measure: s ? measureForLog(s) : null,
			topScorer: s?.topScorer ?? null,
			goalkeeper: s?.goalkeeper ?? null,
			rotation: Boolean(s?.rotation),
		};
	};
	const home = strona('home', homeId, homeName);
	const away = strona('away', awayId, awayName);
	const stage = home.startXI.length || away.startXI.length ? 'confirmed' : squad?.home || squad?.away || injuries?.length ? 'expected' : 'none';
	return { stage, home, away };
}

/** Dodaje do miary klucze podstawowych graczy (do oznaczenia ich w jedenastce) — zapisywane razem z miarą. */
export function withCoreKeys(strength, regular) {
	if (!strength) return strength;
	return { ...strength, coreKeys: (regular?.core || []).map((g) => g.key) };
}

/**
 * Wniosek jednym zdaniem dla asystenta i promptu analizy (po polsku albo po angielsku). `null`, gdy nie ma czego
 * powiedzieć (brak danych o obu drużynach).
 */
export function squadConclusion(view, language = 'pl') {
	if (!view || view.stage === 'none') return null;
	const en = language === 'en';
	const zdanie = (t) => {
		const m = t.measure;
		if (!m?.reliable) return en ? `${t.name}: too few known line-ups to tell the regulars` : `${t.name}: za mało znanych składów, żeby wskazać podstawowych`;
		const braki = [];
		if (m.missingGoalkeeper) braki.push(en ? 'first-choice keeper' : 'bramkarza nr 1');
		if (m.missingTopScorer) braki.push(en ? `top scorer${t.topScorer?.name ? ` (${t.topScorer.name})` : ''}` : `najlepszego strzelca${t.topScorer?.name ? ` (${t.topScorer.name})` : ''}`);
		const ile = m.missingCore;
		const sila = Number.isFinite(m.strength) ? (en ? `, line-up strength ${m.strength}%` : `, siła składu ${m.strength}%`) : '';
		const rotacja = t.rotation ? (en ? ' — rotation before an important match' : ' — rotacja przed ważnym meczem') : '';
		if (!ile && !braki.length) return en ? `${t.name}: no regulars missing${sila}` : `${t.name}: bez braków w podstawowym składzie${sila}`;
		const lista = t.absent.filter((a) => a.regular).map((a) => a.name).filter(Boolean).slice(0, 4).join(', ');
		const ostrz = m.weakened ? (en ? 'WEAKENED' : 'OSŁABIONY SKŁAD') : '';
		const tekst = en
			? `${t.name}: ${ile} of ${m.coreSize} regulars missing${lista ? ` (${lista})` : ''}${braki.length ? `, without ${braki.join(' and ')}` : ''}${sila}`
			: `${t.name}: brak ${ile} z ${m.coreSize} podstawowych${lista ? ` (${lista})` : ''}${braki.length ? `, bez ${braki.join(' i ')}` : ''}${sila}`;
		return `${ostrz ? `${ostrz} — ` : ''}${tekst}${rotacja}`;
	};
	const etap =
		view.stage === 'confirmed'
			? en ? 'Confirmed line-ups' : 'Potwierdzone składy'
			: en ? 'No line-ups yet, provider absence list' : 'Bez składów, lista nieobecnych od dostawcy';
	return `${etap}. ${zdanie(view.home)}. ${zdanie(view.away)}.`;
}
