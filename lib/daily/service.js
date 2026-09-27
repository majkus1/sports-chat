import DailyPick from '@/models/DailyPick';
import Pick from '@/models/Pick';
import { hintsForDate } from '@/lib/model/hints';
import { predictFixture, MODEL_VERSION } from '@/lib/model';
import { leagueFixtures, oddsByFixture } from '@/lib/football/endpoints';
import { normalizeOddsFixture, impliedFromOdds } from '@/lib/football/normalize';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { SELECTION_SHAPES } from '@/lib/picks/markets';
import { MIN_PLAYED, marketProbabilityFor, meetsPolicy } from '@/lib/picks/policy';
import { recordPicks } from '@/lib/picks/service';
import { countPlayed } from '@/lib/reports/service';
import { localDate } from '@/lib/time';

/**
 * TYP DNIA — jeden typ modelu dziennie, za darmo, dla wszystkich.
 *
 * PO CO. Plan darmowy widział plakietki i panel „Model widzi" wyłącznie za kłódką, więc ktoś,
 * kto przyszedł z pytaniem „co dziś zagrać", nie dostawał niczego, co mógłby sprawdzić — ani
 * powodu, żeby wrócić. Jeden odkryty typ dziennie to próbka tego, za co się płaci, i materiał,
 * który da się pokazać na stronie „Typy na dziś", na liście meczów i w social mediach.
 *
 * WYBÓR. Spośród dzisiejszych typów modelu (te same, co plakietki): najpierw rozgrywki
 * z pierwszego poziomu (Liga Mistrzów, reprezentacje, czołowe ligi — mecze, o których ludzie
 * mówią), potem największa przewaga nad normą. Kandydat musi przejść to, co przechodzi typ
 * w raporcie: próbę meczów (`MIN_PLAYED`), sufit rynkowy (kursy — jedno zapytanie na
 * kandydata) i start meczu najwcześniej za 45 minut. Plakietki tych dwóch pierwszych
 * warunków nie sprawdzają, bo to kosztuje; tu kandydatów jest kilku, więc stać nas.
 *
 * RAZ I NA STAŁE. Pierwsze zapytanie o dzień wybiera i zapisuje; kolejne czytają zapis.
 * Unikalny indeks na dacie rozstrzyga wyścig dwóch równoczesnych pierwszych zapytań.
 */

const MIN_LEAD_MS = 45 * 60 * 1000;
const MAX_KANDYDATOW = 8;

/** Rozegrane mecze obu drużyn — z puli łączonej albo z terminarza ligi. */
async function rozegrane(kandydat, prediction) {
	if (prediction?.poolPlayed) return prediction.poolPlayed;
	try {
		const counts = countPlayed(await leagueFixtures({ leagueId: kandydat.leagueId, season: kandydat.season }));
		return { home: counts.get(kandydat.homeId) ?? 0, away: counts.get(kandydat.awayId) ?? 0 };
	} catch {
		return null;
	}
}

/** Prawdopodobieństwo rynkowe selekcji — do sufitu. Brak kursów to brak sufitu. */
async function rynek(fixtureId, normalized) {
	try {
		const kursy = (await oddsByFixture(fixtureId))?.[0] ?? null;
		return marketProbabilityFor(normalized, impliedFromOdds(normalizeOddsFixture(kursy)?.markets));
	} catch {
		return null;
	}
}

/**
 * Wybiera typ dnia spośród typów modelu na podany dzień. Czysta część wyboru — kolejność
 * kandydatów — jest osobno (`orderCandidates`), żeby dało się ją sprawdzić bez sieci.
 */
export function orderCandidates(list, { now = new Date() } = {}) {
	return (list || [])
		.filter((w) => w.hint && Date.parse(w.kickoff) - now.getTime() >= MIN_LEAD_MS)
		.map((w) => ({ ...w, tier: LEAGUE_TIERS.get(w.leagueId) ?? 3 }))
		.sort((a, b) => a.tier - b.tier || b.hint.lift - a.hint.lift);
}

async function wybierz(date, now) {
	const { list } = await hintsForDate(date);
	for (const k of orderCandidates(list, { now }).slice(0, MAX_KANDYDATOW)) {
		const ksztalt = SELECTION_SHAPES[k.hint.key];
		if (!ksztalt) continue;

		const prediction = await predictFixture({ leagueId: k.leagueId, season: k.season, homeId: k.homeId, awayId: k.awayId });
		if (!prediction?.known) continue;

		const played = await rozegrane(k, prediction);
		if (!played || played.home < MIN_PLAYED || played.away < MIN_PLAYED) continue;

		const marketProbability = await rynek(k.fixtureId, ksztalt.normalized);
		const polityka = meetsPolicy(ksztalt.normalized, k.hint.probability, { base: k.hint.base, market: marketProbability });
		if (!polityka.ok) continue;

		return { kandydat: k, ksztalt, prediction, played, marketProbability };
	}
	return null;
}

/** Zapis typu dnia i jego rekordu w `Pick` (rozliczenie, skuteczność). */
async function zapisz(date, { kandydat: k, ksztalt, prediction, played, marketProbability }) {
	const doc = {
		date,
		fixtureId: k.fixtureId,
		leagueId: k.leagueId ?? null,
		league: k.league || null,
		home: k.home,
		away: k.away,
		kickoff: new Date(k.kickoff),
		key: k.hint.key,
		market: ksztalt.market,
		selection: k.hint.selection,
		probability: k.hint.probability,
		base: Math.round(k.hint.base),
		lift: k.hint.lift,
		explanation: {
			home: Math.round(100 * prediction.matchWinner.home),
			draw: Math.round(100 * prediction.matchWinner.draw),
			away: Math.round(100 * prediction.matchWinner.away),
			lambdaHome: Math.round(prediction.lambdaHome * 10) / 10,
			lambdaAway: Math.round(prediction.lambdaAway * 10) / 10,
			over25: prediction.over25 ? Math.round(100 * prediction.over25.probability) : null,
		},
	};

	let zapisany;
	try {
		zapisany = (await DailyPick.create(doc)).toObject();
	} catch (error) {
		// Równoczesne pierwsze zapytanie zdążyło przed nami — obowiązuje jego wybór.
		if (error?.code === 11000) return DailyPick.findOne({ date }).lean();
		throw error;
	}

	await recordPicks({
		picks: [{ market: ksztalt.market, selection: k.hint.selection, probability: k.hint.probability, baseRate: k.hint.base }],
		kind: 'daily',
		source: 'daily',
		sourceId: zapisany._id,
		userId: null,
		fixtureResolver: () => ({
			fixtureId: k.fixtureId,
			homeName: k.home,
			awayName: k.away,
			homeId: k.homeId ?? null,
			awayId: k.awayId ?? null,
			leagueName: k.league || null,
			kickoff: k.kickoff,
		}),
		context: {
			numericModelVersion: MODEL_VERSION,
			leagueId: k.leagueId ?? null,
			leagueTier: LEAGUE_TIERS.get(k.leagueId) ?? null,
			playedHome: played.home,
			playedAway: played.away,
			marketProbability,
		},
	});
	const pick = await Pick.findOne({ fixtureId: String(k.fixtureId), kind: 'daily', author: 'ai' }).select('_id').lean();
	if (pick) {
		await DailyPick.updateOne({ _id: zapisany._id }, { $set: { pickId: pick._id } });
		zapisany.pickId = pick._id;
	}
	return zapisany;
}

/**
 * Typ dnia na podany dzień: zapisany albo wybrany teraz. `null`, gdy tego dnia nie ma już
 * meczu z typem modelu (np. wieczorem wszystko już się zaczęło) — wtedy strona sięga po jutro.
 *
 * @param {string} date `YYYY-MM-DD` w czasie polskim
 * @param {{ create?: boolean, now?: Date }} [options] `create: false` tylko czyta
 */
export async function getDailyPick(date, { create = true, now = new Date() } = {}) {
	const istniejacy = await DailyPick.findOne({ date }).lean();
	if (istniejacy || !create) return istniejacy;
	const wybor = await wybierz(date, now);
	return wybor ? zapisz(date, wybor) : null;
}

/** Postać dla interfejsu: typ dnia + stan rozliczenia z rekordu `Pick`. */
export async function toDto(daily) {
	if (!daily) return null;
	const pick = daily.pickId ? await Pick.findById(daily.pickId).select('status finalScore').lean() : null;
	return {
		date: daily.date,
		fixtureId: daily.fixtureId,
		home: daily.home,
		away: daily.away,
		league: daily.league,
		kickoff: daily.kickoff,
		key: daily.key,
		selection: daily.selection,
		probability: daily.probability,
		base: daily.base,
		lift: daily.lift,
		explanation: daily.explanation || null,
		status: pick?.status || 'pending',
		score:
			Number.isFinite(pick?.finalScore?.home) && Number.isFinite(pick?.finalScore?.away)
				? `${pick.finalScore.home}:${pick.finalScore.away}`
				: null,
	};
}

/**
 * Obietnica z limitem czasu: po `ms` oddaje `fallback`, a właściwe liczenie biegnie dalej
 * w tle (i zasila pamięć podręczną na następne żądanie).
 *
 * Strona dla wyszukiwarki i publiczne API nie mogą wisieć, gdy dostawca danych odpowiada
 * wolno albo wcale — robot po kilkunastu sekundach odchodzi, a strona zostaje niezaindeksowana.
 */
export function withTimeout(promise, ms, fallback) {
	let timer;
	return Promise.race([
		promise.catch(() => fallback),
		new Promise((resolve) => {
			timer = setTimeout(() => resolve(fallback), ms);
		}),
	]).finally(() => clearTimeout(timer));
}

/** Tylko to, co już zapisane — gdy wybór nie zdążył, strona pokazuje zapisany stan. */
export async function dailyOverviewCached({ now = new Date() } = {}) {
	const [today, tomorrow, yesterday] = await Promise.all([
		getDailyPick(localDate(now), { create: false }),
		getDailyPick(localDate(now, 1), { create: false }),
		getDailyPick(localDate(now, -1), { create: false }),
	]);
	const juzTrwa = today && new Date(today.kickoff).getTime() <= now.getTime();
	return {
		today: await toDto(today),
		tomorrow: !today || juzTrwa ? await toDto(tomorrow) : null,
		yesterday: await toDto(yesterday),
		record: await dailyRecord(),
	};
}

/** Dorobek typu dnia: rozliczone, trafione. */
export async function dailyRecord() {
	const rows = await Pick.find({ kind: 'daily', author: 'ai', status: { $in: ['won', 'lost'] } })
		.select('status')
		.lean();
	return { won: rows.filter((r) => r.status === 'won').length, total: rows.length };
}

/**
 * Komplet dla strony i API: typ dnia na dziś (a gdy dziś nic nie zostało albo już trwa —
 * także na jutro), wczorajszy z wynikiem i dorobek.
 */
export async function dailyOverview({ now = new Date() } = {}) {
	const dzis = localDate(now);
	const jutro = localDate(now, 1);
	const wczoraj = localDate(now, -1);

	const today = await getDailyPick(dzis, { now });
	const juzTrwa = today && new Date(today.kickoff).getTime() <= now.getTime();
	const tomorrow = !today || juzTrwa ? await getDailyPick(jutro, { now }) : null;
	const yesterday = await getDailyPick(wczoraj, { create: false });

	return {
		today: await toDto(today),
		tomorrow: await toDto(tomorrow),
		yesterday: await toDto(yesterday),
		record: await dailyRecord(),
	};
}
