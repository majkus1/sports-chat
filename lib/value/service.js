import ValuePick from '@/models/ValuePick';
import ModelForecast from '@/models/ModelForecast';
import { predictFixture } from '@/lib/model';
import { fixturesByDate, fixturesByIds } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { SELECTION_SHAPES } from '@/lib/picks/markets';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import { legResult } from '@/lib/coupons/build';
import { localDate, localDatesBetween } from '@/lib/time';
import { byValueRank, modelMarkets, valueKickoffOk, valueSelections } from '@/lib/value/select';

/**
 * Typy z wyższym kursem — wyszukiwanie (asystent, raport), zapis, rozliczenie, bilans.
 *
 * KURSY. Najpierw te, które już mamy w dzienniku prognoz (poranne zdjęcie), resztę dociągamy:
 * najwyżej `maxFetch` zapytań, od najważniejszych rozgrywek i najbliższych meczów. Każde
 * zdjęcie siedzi 10 minut w pamięci podręcznej, więc powtórzone pytanie nic nie kosztuje.
 *
 * MODEL. `predictFixture` — model ligi siedzi w pamięci procesu, prognoza meczu to rachunek
 * bez zapytania do dostawcy. Drużyna, której model nie zna, nie dostaje typu.
 */

const CONCURRENCY = 4;
const LEG_SETTLE_AFTER_MS = 2 * 3600_000;
const LEG_VOID_AFTER_MS = 72 * 3600_000;

/**
 * @param {{ hours?: number, minOdds?: number, limit?: number, maxFetch?: number, now?: Date,
 *   fetchOdds?: Function, fixturesFor?: Function, predict?: Function }} options
 *   trzy ostatnie podmieniane w testach
 * @returns {Promise<{ picks: Array, stats: { fixtures: number, modelled: number, withOdds: number, fetched: number, failed: number } }>}
 */
export async function findValuePicks({
	hours = 24,
	minOdds,
	limit = 3,
	maxFetch = 25,
	now = new Date(),
	fetchOdds = fetchOddsSnapshot,
	fixturesFor = fixturesByDate,
	predict = predictFixture,
} = {}) {
	const stats = { fixtures: 0, modelled: 0, withOdds: 0, fetched: 0, failed: 0 };
	const koniec = now.getTime() + hours * 3600_000;

	const widziane = new Set();
	const mecze = [];
	for (const d of localDatesBetween(now, koniec)) {
		let rows = [];
		try {
			rows = await fixturesFor(d);
		} catch (error) {
			stats.failed += 1;
			console.warn(`[value] terminarz ${d}:`, error.message);
		}
		for (const f of (rows || []).map(normalizeFixture).filter(Boolean)) {
			if (widziane.has(f.id) || !LEAGUE_TIERS.has(f.league?.id)) continue;
			if (Date.parse(f.date) > koniec || !valueKickoffOk(f.date, now)) continue;
			widziane.add(f.id);
			mecze.push(f);
		}
	}
	stats.fixtures = mecze.length;

	const zModelem = [];
	for (const f of mecze) {
		const p = await predict({
			leagueId: f.league?.id,
			season: f.league?.season,
			homeId: f.teams?.home?.id,
			awayId: f.teams?.away?.id,
		});
		if (p?.known) zModelem.push({ f, markets: modelMarkets(p) });
	}
	stats.modelled = zModelem.length;

	const kursy = new Map(
		(await ModelForecast.find({ fixtureId: { $in: zModelem.map(({ f }) => String(f.id)) } })
			.select('fixtureId odds')
			.lean())
			.map((r) => [String(r.fixtureId), r.odds?.close?.bookmakers ? r.odds.close : r.odds?.open || null])
			.filter(([, z]) => z)
	);
	const doPobrania = zModelem
		.filter(({ f }) => !kursy.has(String(f.id)))
		.sort(
			(a, b) =>
				(LEAGUE_TIERS.get(a.f.league?.id) ?? 9) - (LEAGUE_TIERS.get(b.f.league?.id) ?? 9) ||
				Date.parse(a.f.date) - Date.parse(b.f.date)
		)
		.slice(0, maxFetch);
	for (let i = 0; i < doPobrania.length; i += CONCURRENCY) {
		await Promise.all(
			doPobrania.slice(i, i + CONCURRENCY).map(async ({ f }) => {
				try {
					const z = await fetchOdds(String(f.id));
					stats.fetched += 1;
					if (z) kursy.set(String(f.id), z);
				} catch (error) {
					stats.failed += 1;
					console.warn(`[value] kursy ${f.id}:`, error.message);
				}
			})
		);
	}

	const picks = [];
	for (const { f, markets } of zModelem) {
		const odds = kursy.get(String(f.id));
		if (!odds?.bookmakers) continue;
		stats.withOdds += 1;
		const [najlepsza] = valueSelections({ markets, odds, minOdds });
		if (!najlepsza) continue;
		const nazwy = { homeName: f.teams?.home?.name ?? '?', awayName: f.teams?.away?.name ?? '?' };
		picks.push({
			fixtureId: String(f.id),
			...nazwy,
			league: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
			leagueId: f.league?.id ?? null,
			season: f.league?.season ?? null,
			homeId: f.teams?.home?.id ?? null,
			awayId: f.teams?.away?.id ?? null,
			kickoff: new Date(f.date),
			key: najlepsza.key,
			selection: SELECTION_SHAPES[najlepsza.key]?.label(nazwy) ?? najlepsza.key,
			odds: najlepsza.odds,
			market: najlepsza.market,
			model: najlepsza.model,
			tier: LEAGUE_TIERS.get(f.league?.id) ?? 9,
		});
	}
	picks.sort((a, b) => byValueRank(a, b) || a.tier - b.tier);
	return { picks: picks.slice(0, limit), stats };
}

/** Zapis pokazanych typów — pierwszy zapis meczu i selekcji zostaje. @returns {Promise<number>} nowe */
export async function recordValuePicks(picks, { source }) {
	const ops = (picks || []).map((p) => ({
		updateOne: {
			filter: { fixtureId: String(p.fixtureId), key: p.key },
			update: {
				$setOnInsert: {
					fixtureId: String(p.fixtureId),
					key: p.key,
					selection: p.selection,
					homeName: p.homeName,
					awayName: p.awayName,
					leagueId: p.leagueId ?? null,
					league: p.league || null,
					kickoff: new Date(p.kickoff),
					odds: p.odds,
					marketProbability: p.market,
					modelProbability: p.model,
					source,
				},
			},
			upsert: true,
		},
	}));
	if (!ops.length) return 0;
	const wynik = await ValuePick.bulkWrite(ops, { ordered: false });
	return wynik.upsertedCount ?? 0;
}

/** Rozlicza typy po meczach — jak typy kuponów, po 90 minutach. */
export async function settleValuePicks({ now = new Date(), fetchRows = fixturesByIds, query = {} } = {}) {
	const prog = new Date(now.getTime() - LEG_SETTLE_AFTER_MS);
	const pending = await ValuePick.find({ ...query, status: 'pending', kickoff: { $lte: prog } }).lean();
	const summary = { examined: pending.length, settled: 0, apiCalls: 0 };
	if (!pending.length) return summary;

	const ids = [...new Set(pending.map((p) => p.fixtureId))];
	const wiersze = new Map();
	for (let i = 0; i < ids.length; i += 20) {
		try {
			const rows = await fetchRows(ids.slice(i, i + 20));
			summary.apiCalls += 1;
			for (const row of rows || []) wiersze.set(String(row.fixture?.id), row);
		} catch (error) {
			console.warn('[value] nie udało się pobrać wyników paczki:', error.message);
		}
	}
	for (const p of pending) {
		const wynik =
			legResult(p, wiersze.get(p.fixtureId)) ||
			(now.getTime() - new Date(p.kickoff).getTime() > LEG_VOID_AFTER_MS ? { status: 'void', score: null } : null);
		if (!wynik) continue;
		await ValuePick.updateOne({ _id: p._id, status: 'pending' }, { $set: { ...wynik, settledAt: now } });
		summary.settled += 1;
	}
	return summary;
}

export function valueDto(p) {
	return {
		fixtureId: p.fixtureId,
		home: p.homeName,
		away: p.awayName,
		league: p.league,
		kickoff: new Date(p.kickoff).toISOString(),
		key: p.key,
		selection: p.selection,
		odds: p.odds,
		market: p.marketProbability ?? p.market,
		model: p.modelProbability ?? p.model,
		status: p.status ?? 'pending',
		score: p.score ?? null,
		source: p.source ?? null,
	};
}

/** Bilans typów z wyższym kursem — do zakładki w skuteczności i do asystenta. */
export async function valueStats({ days = null, now = new Date(), recent = 20 } = {}) {
	const filtr = days ? { kickoff: { $gte: new Date(`${localDate(now, -Number(days))}T00:00:00Z`) } } : {};
	const rows = await ValuePick.find(filtr).sort({ kickoff: -1 }).lean();
	const rozliczone = rows.filter((r) => r.status === 'won' || r.status === 'lost');
	const won = rozliczone.filter((r) => r.status === 'won').length;
	const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const okr = (v, d = 0) => (v === null ? null : Number(v.toFixed(d)));
	return {
		summary: {
			won,
			lost: rozliczone.length - won,
			settled: rozliczone.length,
			pending: rows.filter((r) => r.status === 'pending').length,
			hitRate: rozliczone.length ? Math.round((100 * won) / rozliczone.length) : null,
			avgOdds: okr(srednia(rozliczone.map((r) => r.odds)), 2),
			avgMarket: okr(srednia(rozliczone.map((r) => r.marketProbability))),
			avgModel: okr(srednia(rozliczone.map((r) => r.modelProbability))),
		},
		recent: rows.slice(0, recent).map(valueDto),
	};
}
