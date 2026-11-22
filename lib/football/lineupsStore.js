import mongoose from 'mongoose';
import FixtureLineup from '@/models/FixtureLineup';
import { regularXI, squadStrength, squadView, teamHistory, withCoreKeys } from '@/lib/football/lineups';

/**
 * Odczyt składów z bazy (`FixtureLineup`) — dla kuponów, typu dnia, plakietek, strony meczu, pakietu meczu
 * i asystenta. ZERO zapytań do dostawcy: dane zbiera wyłącznie `lineupsJob.js` w swoim budżecie.
 *
 * NIGDY NIE RZUCA I NIE CZEKA NA POŁĄCZENIE. Bez połączenia z bazą (np. trasa pakietu meczu, która bazy
 * nie otwiera) Mongoose buforowałby zapytanie do 10 s — wtedy po prostu nie ma danych o składach,
 * jak przy każdej innej brakującej sekcji.
 */

const polaczona = () => mongoose.connection?.readyState === 1;

/**
 * Połączenie dla miejsc, które same bazy nie otwierają (trasa pakietu meczu): próba najwyżej 2 s. Dłużej nie
 * czekamy — sekcja składów jest dodatkiem, a pakiet meczu ma przyjść tak samo szybko jak dotąd.
 */
async function zBaza() {
	if (polaczona()) return true;
	try {
		const { default: connectToDb } = await import('@/lib/db');
		let timer;
		await Promise.race([
			connectToDb(),
			new Promise((_, reject) => (timer = setTimeout(() => reject(new Error('db_timeout')), 2000))),
		]).finally(() => clearTimeout(timer));
	} catch {
		return false;
	}
	return polaczona();
}

/** Okno historii: 10 meczów drużyny mieści się w ~2–3 miesiącach także z przerwą reprezentacyjną. */
const HISTORIA_DNI = 120;

/**
 * Siła składu zapisanych meczów — mapa `fixtureId → { home, away, stage }`. Jedno zapytanie.
 *
 * @param {Iterable<string>} fixtureIds
 * @returns {Promise<Map<string, object>>}
 */
export async function squadsFor(fixtureIds) {
	const ids = [...new Set([...(fixtureIds || [])].map(String))];
	if (!ids.length || !polaczona()) return new Map();
	try {
		const wiersze = await FixtureLineup.find({ fixtureId: { $in: ids }, squad: { $ne: null } })
			.select('fixtureId squad')
			.lean();
		return new Map(wiersze.map((w) => [String(w.fixtureId), w.squad]));
	} catch (error) {
		console.warn('[lineups] odczyt siły składu nie powiódł się:', error.message);
		return new Map();
	}
}

/** Zapisane mecze z ostatecznym składem dla podanych drużyn, przed `before` — materiał do `regularXI`. */
export async function historyDocs(teamIds, before = new Date()) {
	const ids = [...new Set((teamIds || []).map(Number).filter(Boolean))];
	if (!ids.length || !polaczona()) return [];
	const t = before instanceof Date ? before : new Date(before);
	return FixtureLineup.find({
		final: true,
		kickoff: { $lt: t, $gte: new Date(t.getTime() - HISTORIA_DNI * 86_400_000) },
		$or: [{ homeId: { $in: ids } }, { awayId: { $in: ids } }],
	})
		// Bez rezerwowych: do „podstawowych" wystarczy wyjściowa jedenastka, a to połowa objętości zapisu.
		.select('fixtureId kickoff homeId awayId teams.teamId teams.startXI goals')
		.lean();
}

/**
 * Siła składu obu drużyn z historii w bazie i podanych danych dnia meczu (składy, nieobecni, terminarz).
 *
 * @param {{ kickoff, homeId, awayId }} match
 * @param {{ teams?: Array, injuries?: Array, schedule?: object|null, history?: Array }} data
 *   `teams` — składy z `parseLineups`; `injuries` — z `parseInjuries`; `schedule` — `buildMatchSchedule`
 * @returns {{ home: object|null, away: object|null, stage: string } | null}
 */
export function computeSquad(match, { teams = [], injuries = [], schedule = null, history = [] } = {}) {
	const kickoff = new Date(match?.kickoff);
	if (Number.isNaN(kickoff.getTime())) return null;
	const strona = (teamId, ts) => {
		if (!teamId) return null;
		const regular = regularXI(teamHistory(history, teamId, kickoff));
		const lineup = (teams || []).find((t) => Number(t.teamId) === Number(teamId)) || null;
		const s = squadStrength({
			regular,
			lineup,
			injuries: (injuries || []).filter((i) => Number(i.teamId) === Number(teamId)),
			rotationRisk: Boolean(ts?.flags?.rotationRisk),
		});
		return withCoreKeys(s, regular);
	};
	const home = strona(match.homeId, schedule?.home);
	const away = strona(match.awayId, schedule?.away);
	if (!home && !away) return null;
	return { home, away, stage: home?.stage === 'confirmed' || away?.stage === 'confirmed' ? 'confirmed' : 'expected' };
}

/** Składy z pakietu meczu (`normalizeLineups`: `position`) w kształcie `parseLineups` (`pos`). */
export function teamsFromBundle(lineups) {
	return (lineups || []).map((t) => ({
		teamId: t.teamId != null ? Number(t.teamId) : null,
		teamName: t.teamName ?? null,
		formation: t.formation ?? null,
		startXI: (t.startXI || []).map((p) => ({ id: p.id ?? null, name: p.name ?? null, number: p.number ?? null, pos: p.position ?? p.pos ?? null })),
		substitutes: (t.substitutes || []).map((p) => ({ id: p.id ?? null, name: p.name ?? null, number: p.number ?? null, pos: p.position ?? p.pos ?? null })),
	}));
}

/**
 * Sekcja „Składy" pokoju meczowego (`lib/football/bundle.js`): składy i nieobecni z pakietu (świeże, 5 min
 * pamięci podręcznej), podstawowi z historii w bazie, rotacja z terminarza pakietu. Zero nowych zapytań.
 * `null`, gdy nie ma czego pokazać ponad dotychczasową zakładkę.
 */
export async function squadForBundle(fixture, { lineups, injuries, schedule } = {}) {
	try {
		const homeId = fixture?.teams?.home?.id;
		const awayId = fixture?.teams?.away?.id;
		if (!homeId || !awayId) return null;
		const match = { kickoff: fixture.date, homeId, awayId };
		const history = (await zBaza()) ? await historyDocs([homeId, awayId], new Date(fixture.date)) : [];
		const teams = teamsFromBundle(lineups);
		const squad = computeSquad(match, { teams, injuries: injuries || [], schedule, history });
		return squadView({
			squad,
			teams,
			injuries: injuries || [],
			homeId,
			awayId,
			homeName: fixture.teams.home.name,
			awayName: fixture.teams.away.name,
		});
	} catch (error) {
		console.warn('[lineups] sekcja składów pakietu:', error.message);
		return null;
	}
}

/**
 * Widok składów jednego meczu z zapisu (strona meczu `/typ`, asystent) — `null`, gdy zapisu nie ma.
 */
export async function squadViewFor(fixtureId) {
	if (!(await zBaza())) return null;
	try {
		const d = await FixtureLineup.findOne({ fixtureId: String(fixtureId) })
			.select('fixtureId kickoff homeId awayId homeName awayName teams injuries squad squadAt lineupAt injuriesAt')
			.lean();
		if (!d || (!d.squad && !d.injuries?.length && !d.teams?.length)) return null;
		return {
			...squadView({ squad: d.squad, teams: d.teams, injuries: d.injuries, homeId: d.homeId, awayId: d.awayId, homeName: d.homeName, awayName: d.awayName }),
			updatedAt: d.squadAt || d.lineupAt || d.injuriesAt || null,
		};
	} catch (error) {
		console.warn('[lineups] widok składów:', error.message);
		return null;
	}
}
