import FixtureStats from '@/models/FixtureStats';
import { leagueFixtures } from '@/lib/football/endpoints';
import {
	WINDOW,
	teamProfile,
	leagueReference,
	featureVector,
	pickVariant,
	applyCalibration,
} from '@/lib/model/goalsCalibration';
import calibration from '@/lib/model/goalsCalibrationData';

/**
 * Rynek „powyżej 2,5 gola" na produkcji — Dixon-Coles skalibrowany cechami drużyn.
 *
 * Skąd co pochodzi:
 *   - stała ligowa i średnie ligowe: z terminarza ligi (bieżący i poprzedni sezon), tego
 *     samego, na którym uczy się model sił drużyn — zero dodatkowych zapytań;
 *   - gole za i przeciw z ostatnich 10 meczów każdej drużyny: z tego samego terminarza;
 *   - strzały i strzały celne: z `FixtureStats`, zbieranych nocą (`fixtureStats.js`);
 *   - prawdopodobieństwo Dixona-Colesa: z `predictFixture`, przekazywane tu jako liczba;
 *   - regresja: `goalsCalibrationData.js`, douczona eksperymentem na 17 822 meczach.
 *
 * WYŁĄCZNIE „POWYŻEJ". Ten sam rachunek daje „poniżej" jako dopełnienie, ale eksperyment
 * pokazał, że po polityce typów „poniżej" zostaje garstka o trafności bliskiej normie —
 * mało goli to brak przyczyny, nie przyczyna. Patrz README modelu.
 *
 * Kontekst ligi trzymamy w pamięci procesu tak długo jak model ligi (6 h): wyniki dochodzą
 * wieczorami, a w ciągu dnia nic się nie zmienia.
 */

const CACHE_TTL_MS = 6 * 3600 * 1000;
const cache = new Map();

const FINISHED = new Set(['FT', 'AET', 'PEN']);

/** Mecze zakończone z terminarza dostawcy, chronologicznie. */
function finishedRows(rows) {
	return (rows || [])
		.filter((r) => FINISHED.has(r?.fixture?.status?.short))
		.filter((r) => Number.isFinite(r?.goals?.home) && Number.isFinite(r?.goals?.away))
		.map((r) => ({
			fixtureId: String(r.fixture.id),
			t: Date.parse(r.fixture.date),
			homeId: r.teams?.home?.id,
			awayId: r.teams?.away?.id,
			hg: r.goals.home,
			ag: r.goals.away,
		}))
		.filter((m) => Number.isFinite(m.t) && m.homeId && m.awayId)
		.sort((a, b) => a.t - b.t);
}

/**
 * Kontekst ligi: historie drużyn i odniesienia ligowe — policzone raz, wspólne dla
 * wszystkich meczów tej ligi w danym dniu.
 *
 * @returns {Promise<null | { teams: Map<number, Array>, league: object }>}
 */
export async function goalsContext({ leagueId, season }) {
	if (!leagueId || !season) return null;
	const key = `${leagueId}:${season}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const rows = [];
	for (const s of [season - 1, season]) {
		try {
			rows.push(...finishedRows(await leagueFixtures({ leagueId, season: s })));
		} catch {
			// Brak jednego sezonu nie przekreśla rachunku — liczymy z tego, co jest.
		}
	}
	rows.sort((a, b) => a.t - b.t);

	/*
	 * Strzały tylko dla meczów, które mogą wejść do czyjegoś okna — ostatnich kilkunastu
	 * na drużynę. Jedno zapytanie do bazy na ligę, nie na mecz.
	 */
	const potrzebne = new Set();
	const perTeam = new Map();
	for (let i = rows.length - 1; i >= 0; i -= 1) {
		const m = rows[i];
		for (const id of [m.homeId, m.awayId]) {
			const n = perTeam.get(id) || 0;
			if (n < WINDOW) {
				potrzebne.add(m.fixtureId);
				perTeam.set(id, n + 1);
			}
		}
	}
	let strzaly = new Map();
	if (potrzebne.size) {
		try {
			const docs = await FixtureStats.find({ fixtureId: { $in: [...potrzebne] } })
				.select('fixtureId hs as hst ast')
				.lean();
			strzaly = new Map(docs.map((d) => [d.fixtureId, d]));
		} catch (error) {
			console.warn('[goals] statystyki meczów niedostępne:', error.message);
		}
	}

	const teams = new Map();
	const ligowe = [];
	for (const m of rows) {
		const s = strzaly.get(m.fixtureId);
		const hs = s?.hs ?? null;
		const as = s?.as ?? null;
		const hst = s?.hst ?? null;
		const ast = s?.ast ?? null;
		ligowe.push({ hg: m.hg, ag: m.ag, hs, as, hst, ast });
		if (!teams.has(m.homeId)) teams.set(m.homeId, []);
		if (!teams.has(m.awayId)) teams.set(m.awayId, []);
		teams.get(m.homeId).push({ gf: m.hg, ga: m.ag, sf: hs, sa: as, stf: hst, sta: ast });
		teams.get(m.awayId).push({ gf: m.ag, ga: m.hg, sf: as, sa: hs, stf: ast, sta: hst });
	}

	const value = { teams, league: leagueReference(ligowe) };
	cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
	return value;
}

/**
 * Skalibrowane „powyżej 2,5 gola" i „obie strzelą" dla pary drużyn — z jednego kontekstu.
 *
 * `over25` jest selekcją (idzie do typów). `btts` jest WYŁĄCZNIE liczbą do kafelka w analizie:
 * skalibrowany bije stałą, ale po polityce nie zostaje z niego nic — patrz README. Liczymy go
 * tu, żeby kafelek i typ pochodziły z tego samego rachunku, a nie z domysłu modelu językowego.
 *
 * @param {{ leagueId: number, season: number, homeId: number, awayId: number, dcOver25: number, dcBtts?: number }} input
 *   ułamki z Dixona-Colesa: `predictMarkets(...).totalGoals[2.5].over` i `.btts.yes`
 * @returns {Promise<null | { over25: { probability, base, variant }, btts: null | { probability, base, variant } }>}
 *   ułamki 0–1; `base` to stała ligowa — norma, wobec której liczy się przewaga typu
 */
export async function goalsFor({ leagueId, season, homeId, awayId, dcOver25, dcBtts = null }) {
	if (!Number.isFinite(dcOver25)) return null;
	const ctx = await goalsContext({ leagueId, season });
	if (!ctx?.league) return null;

	const home = teamProfile(ctx.teams.get(homeId));
	const away = teamProfile(ctx.teams.get(awayId));
	const variant = pickVariant({ league: ctx.league, home, away });
	if (!variant) return null;

	const licz = (market, league, dc) => {
		const params = calibration?.markets?.[market]?.[variant];
		if (!params || !Number.isFinite(dc)) return null;
		const p = applyCalibration(params, featureVector(variant, { league, dcOver: dc, home, away }));
		return Number.isFinite(p) ? { probability: p, base: league.rate, variant } : null;
	};

	const over25 = licz('over25', ctx.league, dcOver25);
	if (!over25) return null;
	const btts = licz('btts', { ...ctx.league, rate: ctx.league.bttsRate }, dcBtts);
	return { over25, btts };
}

/** Sama selekcja „powyżej 2,5" — dla wywołujących, którym kafelek nie jest potrzebny. */
export async function over25For(input) {
	const wynik = await goalsFor(input);
	return wynik ? wynik.over25 : null;
}

/** Czyści pamięć podręczną — do testów. */
export function clearGoalsCache() {
	cache.clear();
}
