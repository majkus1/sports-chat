import FixtureStats from '@/models/FixtureStats';
import { leagueFixtures, fixtureStatistics } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { EXCLUDED_COMPETITIONS, MIN_MATCHES, MIN_MATCHES_PER_TEAM, medianMatchesPerTeam } from '@/lib/model';
import { WINDOW } from '@/lib/model/goalsCalibration';

/**
 * Zbieracz strzałów z rozegranych meczów — nocne zadanie z budżetem zapytań.
 *
 * CO ZBIERA. Dla każdej ligi, w której liczy się model sił drużyn, ostatnie `WINDOW + 2`
 * rozegrane mecze każdej drużyny (dwa zapasowe, żeby zawsze było z czego liczyć okno
 * dziesięciu). Tylko te; starsze mecze do niczego nie służą. Na starcie to ~120 meczów na
 * ligę, potem ~150 nowych dziennie łącznie — 2 % dziennego limitu dostawcy.
 *
 * BUDŻET, NIE „WSZYSTKO". Pierwsze napełnienie to około 3 000 zapytań i celowo rozkłada się
 * na kilka nocy zamiast zjeść limit jednej. Kolejność: najnowsze mecze najpierw, bo to one
 * wchodzą do okien drużyn najszybciej; liga za ligą w kolejności `LEAGUE_TIERS`.
 *
 * SEZON. Terminarz dostawcy wymaga numeru sezonu, a ligi liczą go różnie (jesień–wiosna
 * albo rok kalendarzowy). Sprawdzamy dwa kandydackie i bierzemy ten, który ma mecze w oknie
 * ±45 dni od dziś — to samo `leagueFixtures`, z którego korzysta model, więc zwykle z cache'u.
 *
 * MECZ BEZ STATYSTYK TEŻ ZAPISUJEMY (z `null`), żeby nie pytać o niego co noc. Dostawca nie
 * ma strzałów dla części niższych lig i dla starszych sezonów; tam działa wariant `goals`.
 */

const FINISHED = new Set(['FT', 'AET', 'PEN']);
/** Odstęp między zapytaniami — limit minutowy dostawcy, a nie dobowy, gryzie przy seriach. */
const PAUSE_MS = 250;
const SEASON_WINDOW_DAYS = 45;

function finished(rows) {
	return (rows || [])
		.filter((r) => FINISHED.has(r?.fixture?.status?.short))
		.map((r) => ({
			fixtureId: String(r.fixture.id),
			date: new Date(r.fixture.date),
			homeId: r.teams?.home?.id,
			awayId: r.teams?.away?.id,
			homeGoals: r.goals?.home,
			awayGoals: r.goals?.away,
			season: r.league?.season,
		}))
		.filter((m) => m.homeId && m.awayId && !Number.isNaN(m.date.getTime()))
		.sort((a, b) => b.date - a.date);
}

/** Bieżący sezon ligi — ten z dwóch kandydackich, który ma mecze wokół dzisiejszej daty. */
export async function activeSeason(leagueId, now = new Date()) {
	const rok = now.getUTCFullYear();
	const okno = SEASON_WINDOW_DAYS * 86_400_000;
	for (const season of [rok, rok - 1]) {
		try {
			const rows = await leagueFixtures({ leagueId, season });
			const blisko = (rows || []).some((r) => Math.abs(Date.parse(r?.fixture?.date) - now.getTime()) <= okno);
			if (blisko) return season;
		} catch {
			// brak sezonu u dostawcy — próbujemy następnego kandydata
		}
	}
	return null;
}

/** Liczba z pola statystyki; dostawca daje liczby, `null` albo „45%" — procenty odrzucamy. */
function liczba(v) {
	if (typeof v === 'number') return Number.isFinite(v) ? v : null;
	if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v);
	return null;
}

/** Strzały obu stron z odpowiedzi `fixtures/statistics`. */
export function parseShots(rawList, { homeId, awayId }) {
	const out = { hs: null, as: null, hst: null, ast: null };
	for (const entry of rawList || []) {
		const stats = Object.fromEntries((entry?.statistics || []).map((s) => [s.type, s.value]));
		const total = liczba(stats['Total Shots']);
		const onGoal = liczba(stats['Shots on Goal']);
		if (entry?.team?.id === homeId) {
			out.hs = total;
			out.hst = onGoal;
		} else if (entry?.team?.id === awayId) {
			out.as = total;
			out.ast = onGoal;
		}
	}
	return out;
}

/** Ostatnie `WINDOW + 2` mecze każdej drużyny — zbiór identyfikatorów do pobrania. */
export function neededFixtures(rowsNewestFirst) {
	const potrzebne = [];
	const perTeam = new Map();
	for (const m of rowsNewestFirst) {
		let wez = false;
		for (const id of [m.homeId, m.awayId]) {
			const n = perTeam.get(id) || 0;
			if (n < WINDOW + 2) {
				wez = true;
				perTeam.set(id, n + 1);
			}
		}
		if (wez) potrzebne.push(m);
	}
	return potrzebne;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jeden przebieg zbieracza.
 *
 * @param {{ budget?: number, leagues?: number[], now?: Date }} options
 * @returns {Promise<{ leagues: number, fetched: number, missing: number, skipped: string[] }>}
 *   `missing` — ile meczów zostało do pobrania po wyczerpaniu budżetu
 */
export async function collectFixtureStats({ budget = 1200, leagues = null, now = new Date() } = {}) {
	const kandydaci = (leagues || [...LEAGUE_TIERS.keys()]).filter((id) => !EXCLUDED_COMPETITIONS.has(id));
	const summary = { leagues: 0, fetched: 0, missing: 0, skipped: [] };
	let zostalo = budget;

	for (const leagueId of kandydaci) {
		const season = await activeSeason(leagueId, now);
		if (!season) {
			summary.skipped.push(`${leagueId}: brak bieżącego sezonu`);
			continue;
		}

		const rows = [];
		for (const s of [season, season - 1]) {
			try {
				rows.push(...finished(await leagueFixtures({ leagueId, season: s })));
			} catch {
				// jak w modelu: brak jednego sezonu nie przekreśla ligi
			}
		}
		rows.sort((a, b) => b.date - a.date);

		// Te same progi, co model — puchary z setkami drużyn po dwa mecze nie dostają strzałów.
		const wyniki = rows.map((m) => ({ homeId: m.homeId, awayId: m.awayId }));
		if (rows.length < MIN_MATCHES || medianMatchesPerTeam(wyniki) < MIN_MATCHES_PER_TEAM) {
			summary.skipped.push(`${leagueId}: poza progami modelu`);
			continue;
		}

		const potrzebne = neededFixtures(rows);
		const maja = new Set(
			(await FixtureStats.find({ fixtureId: { $in: potrzebne.map((m) => m.fixtureId) } })
				.select('fixtureId')
				.lean()).map((d) => d.fixtureId)
		);
		const brakuje = potrzebne.filter((m) => !maja.has(m.fixtureId));
		summary.leagues += 1;

		for (const m of brakuje) {
			if (zostalo <= 0) {
				summary.missing += 1;
				continue;
			}
			try {
				const raw = await fixtureStatistics(m.fixtureId);
				const strzaly = parseShots(raw, { homeId: m.homeId, awayId: m.awayId });
				await FixtureStats.updateOne(
					{ fixtureId: m.fixtureId },
					{
						$setOnInsert: {
							leagueId,
							season: m.season ?? season,
							date: m.date,
							homeId: m.homeId,
							awayId: m.awayId,
						},
						$set: { ...strzaly, fetchedAt: new Date() },
					},
					{ upsert: true }
				);
				summary.fetched += 1;
				zostalo -= 1;
				await sleep(PAUSE_MS);
			} catch (error) {
				console.warn(`[fixture-stats] mecz ${m.fixtureId}: ${error.message}`);
				// Błąd dostawcy kosztuje jak zapytanie — nie kręćmy się w miejscu.
				zostalo -= 1;
				summary.missing += 1;
			}
		}
	}

	return summary;
}
