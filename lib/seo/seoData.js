import connectToDb from '@/lib/db';
import ModelForecast from '@/models/ModelForecast';
import FixtureStats from '@/models/FixtureStats';
import Pick from '@/models/Pick';
import { localDate, localMidnight } from '@/lib/time';
import { LEAGUE_PAGES, leaguePageById } from '@/lib/seo/leagues';
import { shotAverages, teamForm } from '@/lib/seo/matchStory';

/**
 * Odczyty dla stron SEO (strony lig, zapowiedzi meczów, mapa witryny) — WYŁĄCZNIE z bazy.
 *
 * ZERO ZAPYTAŃ DO DOSTAWCY. Robot wyszukiwarki potrafi wejść na kilkaset adresów w godzinę; gdyby
 * każde wejście liczyło model albo pytało API-Football, jeden przebieg Googlebota zjadłby dzienny
 * limit (lokalnie ~100 zapytań). Tu czytamy tylko to, co już zapisano: dziennik prognoz
 * (`ModelForecast`, powstaje przy liczeniu list meczów do 48 h przed meczem), statystyki strzałów
 * (`FixtureStats`) i rozliczone typy (`Pick`).
 *
 * WYDAJNOŚĆ NA 512 MB. Każde zapytanie idzie po istniejącym indeksie (`leagueId`, `kickoff`,
 * `kind`, `{ leagueId, date }`), ma `limit` i `select` — kilkadziesiąt małych dokumentów zamiast
 * pełnych. Lista aktywnych lig (mapa witryny, linki na „Typach na dziś") siedzi 10 minut
 * w pamięci procesu: ta sama odpowiedź dla każdej strony i każdego robota.
 */

const H = 3600_000;

/** Okno „na dziś" stron lig: od dzisiejszej północy do końca jutra (czas polski) — dziennik sięga 48 h. */
export function todayWindow(now = new Date()) {
	return { start: localMidnight(localDate(now)), end: localMidnight(localDate(now, 2)) };
}

let aktywneCache = { at: 0, key: null, value: null };
const AKTYWNE_TTL_MS = 10 * 60_000;

/**
 * Strony lig, które mają dziś albo jutro mecze z prognozą — z liczbą meczów. Jedna agregacja na
 * 10 minut; przy błędzie bazy pusta lista (strona i mapa działają dalej, tylko bez linków do lig).
 *
 * @returns {Promise<Array<{ league: object, matches: number }>>}
 */
export async function activeLeaguePages(now = new Date()) {
	const { start, end } = todayWindow(now);
	const klucz = start.toISOString();
	if (aktywneCache.value && aktywneCache.key === klucz && now.getTime() - aktywneCache.at < AKTYWNE_TTL_MS) return aktywneCache.value;
	try {
		await connectToDb();
		const rows = await ModelForecast.aggregate([
			{ $match: { kickoff: { $gte: start, $lt: end }, leagueId: { $in: LEAGUE_PAGES.map((l) => l.id) } } },
			{ $group: { _id: '$leagueId', n: { $sum: 1 } } },
		]);
		const value = rows
			.map((r) => ({ league: leaguePageById(r._id), matches: r.n }))
			.filter((x) => x.league)
			.sort((a, b) => LEAGUE_PAGES.indexOf(a.league) - LEAGUE_PAGES.indexOf(b.league));
		aktywneCache = { at: now.getTime(), key: klucz, value };
		return value;
	} catch {
		return [];
	}
}

const POLA_MECZU = 'fixtureId leagueId leagueName leagueCountry homeId awayId homeName awayName kickoff markets lambdaHome lambdaAway hint result settledAt';

/**
 * Dane strony ligi: mecze dziś i jutro z dziennika oraz rozliczone typy modelu z 30 dni.
 *
 * Typy z `Pick` (`kind: 'hint'`, wliczane, bez duplikatów) — ta sama pula co skuteczność, więc
 * liczba na stronie ligi nie może się rozjechać z panelem skuteczności.
 */
export async function leaguePageData(league, now = new Date()) {
	const { start, end } = todayWindow(now);
	try {
		await connectToDb();
		const [matches, settled] = await Promise.all([
			ModelForecast.find({ leagueId: league.id, kickoff: { $gte: start, $lt: end } })
				.select(POLA_MECZU)
				.sort({ kickoff: 1 })
				.limit(40)
				.lean(),
			Pick.find({
				author: 'ai',
				kind: 'hint',
				leagueId: league.id,
				countsToStats: { $ne: false },
				duplicateOf: null,
				status: { $in: ['won', 'lost'] },
				kickoff: { $gte: new Date(now.getTime() - 30 * 24 * H), $lt: now },
			})
				.select('fixtureId homeName awayName selection status finalScore kickoff')
				.sort({ kickoff: -1 })
				.limit(200)
				.lean(),
		]);
		return { matches, settled };
	} catch {
		return { matches: [], settled: [] };
	}
}

/**
 * Forma i strzały obu drużyn do zapowiedzi meczu — dwa zapytania po indeksach ligi.
 *
 * Forma tylko z TYCH rozgrywek: zapytanie po `leagueId` idzie po indeksie, a „wszystkie mecze
 * drużyny" wymagałyby pełnego przeglądu dziennika (brak indeksu na `homeId`/`awayId`, a nowego
 * nie zakładamy na wspólnej bazie dla jednej sekcji strony).
 */
export async function matchContext(f) {
	const druzyny = [f.homeId, f.awayId].filter(Number.isFinite);
	if (!druzyny.length || !Number.isFinite(f.leagueId)) return { homeForm: [], awayForm: [], homeShots: null, awayShots: null };
	const kto = druzyny.flatMap((id) => [{ homeId: id }, { awayId: id }]);
	try {
		await connectToDb();
		const [formRows, shotRows] = await Promise.all([
			ModelForecast.find({ leagueId: f.leagueId, kickoff: { $lt: new Date(f.kickoff) }, settledAt: { $ne: null }, $or: kto })
				.select('homeId awayId homeName awayName kickoff result')
				.sort({ kickoff: -1 })
				.limit(40)
				.lean(),
			FixtureStats.find({ leagueId: f.leagueId, date: { $lt: new Date(f.kickoff) }, $or: kto })
				.select('homeId awayId hs as hst ast date')
				.sort({ date: -1 })
				.limit(40)
				.lean(),
		]);
		return {
			homeForm: teamForm(formRows, f.homeId),
			awayForm: teamForm(formRows, f.awayId),
			homeShots: shotAverages(shotRows, f.homeId),
			awayShots: shotAverages(shotRows, f.awayId),
		};
	} catch {
		return { homeForm: [], awayForm: [], homeShots: null, awayShots: null };
	}
}
