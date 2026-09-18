import ModelForecast from '@/models/ModelForecast';
import { fixturesByIds } from '@/lib/football/endpoints';

/**
 * Zapis i rozliczanie dziennika prognoz (`ModelForecast`).
 *
 * Zapis jest DODATKIEM do liczenia podpowiedzi (`hintsForDate`): nigdy nie rzuca i nie
 * czeka — lista meczów ma się pokazać tak samo szybko, z bazą czy bez. Jedno `bulkWrite`
 * z `$setOnInsert`, więc pierwsza prognoza w oknie zostaje, a kolejne policzenia tego
 * samego meczu nic nie zmieniają.
 */

/** Zapisujemy prognozy policzone najwyżej tyle godzin przed meczem — jedna miara dla wszystkich. */
export const LEAD_HOURS = 48;
/** Po tylu godzinach od rozpoczęcia pytamy o wynik (jak przy typach). */
const SETTLE_AFTER_MS = 3 * 3600 * 1000;
const NOT_PLAYED = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const BATCH = 20;

/**
 * @param {Array<{ fixture: object, prediction: object, hint: object|null }>} entries
 *   `fixture` znormalizowany, `prediction` z `predictFixture` (`known: true`), `hint` z `bestHint`
 * @returns {Promise<number>} ile prognoz zapisano po raz pierwszy
 */
export async function recordForecasts(entries, now = new Date()) {
	const ops = [];
	for (const { fixture: f, prediction: p, hint } of entries || []) {
		const kickoff = new Date(f?.date);
		if (!f?.id || !p || !p.known || Number.isNaN(kickoff.getTime())) continue;
		const leadHours = (kickoff.getTime() - now.getTime()) / 3600_000;
		if (leadHours < 0 || leadHours > LEAD_HOURS) continue;

		ops.push({
			updateOne: {
				filter: { fixtureId: String(f.id) },
				update: {
					$setOnInsert: {
						fixtureId: String(f.id),
						leagueId: f.league?.id ?? null,
						season: f.league?.season ?? null,
						homeId: f.teams?.home?.id ?? null,
						awayId: f.teams?.away?.id ?? null,
						homeName: f.teams?.home?.name ?? null,
						awayName: f.teams?.away?.name ?? null,
						kickoff,
						forecastAt: now,
						leadHours: Math.round(leadHours * 10) / 10,
						modelVersion: p.modelVersion ?? null,
						matchesUsed: p.matchesUsed ?? null,
						lambdaHome: p.lambdaHome ?? null,
						lambdaAway: p.lambdaAway ?? null,
						markets: {
							home: p.matchWinner?.home ?? null,
							draw: p.matchWinner?.draw ?? null,
							away: p.matchWinner?.away ?? null,
							dc1X: p.doubleChance?.['1X'] ?? null,
							dcX2: p.doubleChance?.X2 ?? null,
							homeScores: p.teamGoals?.home?.over ?? null,
							awayScores: p.teamGoals?.away?.over ?? null,
							over25: p.over25?.probability ?? null,
							btts: p.btts?.probability ?? null,
						},
						over25: { variant: p.over25?.variant ?? null, base: p.over25?.base ?? null },
						hint: hint
							? { key: hint.key, selection: hint.selection, probability: hint.probability, base: hint.base, lift: hint.lift }
							: { key: null, selection: null, probability: null, base: null, lift: null },
					},
				},
				upsert: true,
			},
		});
	}
	if (!ops.length) return 0;
	const wynik = await ModelForecast.bulkWrite(ops, { ordered: false });
	return wynik.upsertedCount ?? 0;
}

/**
 * Dopisuje wyniki do prognoz meczów, które już się skończyły. Jedno zapytanie na 20 meczów.
 *
 * @returns {Promise<{ examined: number, settled: number, notPlayed: number, apiCalls: number }>}
 */
export async function settleForecasts({ limit = 600, now = new Date() } = {}) {
	const cutoff = new Date(now.getTime() - SETTLE_AFTER_MS);
	const pending = await ModelForecast.find({ settledAt: null, kickoff: { $lte: cutoff } })
		.select('fixtureId')
		.sort({ kickoff: 1 })
		.limit(limit)
		.lean();
	const summary = { examined: pending.length, settled: 0, notPlayed: 0, apiCalls: 0 };
	if (!pending.length) return summary;

	const ids = [...new Set(pending.map((p) => p.fixtureId))];
	for (let i = 0; i < ids.length; i += BATCH) {
		const chunk = ids.slice(i, i + BATCH);
		let rows;
		try {
			rows = await fixturesByIds(chunk);
			summary.apiCalls += 1;
		} catch (error) {
			console.warn('[forecast-log] nie udało się pobrać wyników paczki:', error.message);
			continue;
		}
		for (const row of rows || []) {
			const status = row.fixture?.status?.short;
			const grane = FINISHED.has(status);
			const odwolane = NOT_PLAYED.has(status);
			// Mecz w toku albo przełożony bez decyzji — zostaje na kolejny przebieg.
			if (!grane && !odwolane) continue;
			await ModelForecast.updateOne(
				{ fixtureId: String(row.fixture?.id), settledAt: null },
				{
					$set: {
						result: {
							home: grane ? (row.goals?.home ?? null) : null,
							away: grane ? (row.goals?.away ?? null) : null,
							status,
						},
						settledAt: now,
					},
				}
			);
			if (grane) summary.settled += 1;
			else summary.notPlayed += 1;
		}
	}
	return summary;
}
