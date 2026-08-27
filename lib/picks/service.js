import Pick from '@/models/Pick';
import { fixturesByIds } from '@/lib/football/endpoints';
import { normalizePick, settlePick } from '@/lib/picks/markets';

/**
 * Zapis i rozliczanie typów.
 *
 * Typy zapisujemy w chwili wygenerowania, a wynik dopisujemy wsadowo po zakończeniu meczów.
 * Rozliczanie celowo NIE chodzi przy każdym wejściu na stronę: mecz kończy się raz, więc
 * wystarczy jeden przebieg na dobę. Dodatkowo pobieramy wyniki paczkami po 20 meczów
 * (`fixtures?ids=`), czyli jedno wywołanie API na dwadzieścia rozliczonych typów.
 */

/** Ile meczów mieści jedno wywołanie `fixtures?ids=` — limit dostawcy. */
const BATCH = 20;

/**
 * Mecz uznajemy za rozstrzygalny dopiero po tym czasie od gwizdka.
 *
 * 3,5 godziny pokrywa dogrywkę, karne i typowe opóźnienia w publikacji wyniku. Wcześniejsze
 * pytanie kończyłoby się statusem „w trakcie" i typ i tak zostałby na kolejny przebieg.
 */
export const SETTLE_AFTER_MS = 3.5 * 3600 * 1000;

/** Statusy, przy których mecz nie odbędzie się wcale — typ przepada bez winy modelu. */
const NOT_PLAYED = ['CANC', 'ABD', 'AWD', 'WO', 'PST'];

/**
 * Zapisuje typy z wygenerowanej analizy albo raportu.
 *
 * Świadomie nie przerywa działania przy błędzie: nieudany zapis statystyki nie może
 * zabrać użytkownikowi analizy, za którą już zapłacił limitem.
 *
 * @param {{ picks: Array, kind: 'prematch'|'live'|'report', source: 'analysis'|'report',
 *   sourceId?: any, userId?: any, fixtureResolver: (pick) => object }} input
 */
export async function recordPicks({ picks, kind, source, sourceId, userId, fixtureResolver }) {
	if (!Array.isArray(picks) || !picks.length) return 0;

	let saved = 0;

	for (const pick of picks) {
		try {
			const context = fixtureResolver(pick);
			if (!context?.fixtureId) continue;

			const normalized = normalizePick({
				market: pick.market,
				selection: pick.selection,
				homeName: context.homeName,
				awayName: context.awayName,
			});

			await Pick.updateOne(
				{
					fixtureId: String(context.fixtureId),
					kind,
					market: String(pick.market || ''),
					selection: String(pick.selection || ''),
					userId: userId || null,
				},
				{
					$setOnInsert: {
						source,
						sourceId: sourceId || null,
						probability: Number.isFinite(pick.probability) ? pick.probability : null,
						confidence: Number.isFinite(pick.confidence) ? pick.confidence : null,
						normalized,
						homeName: context.homeName ?? null,
						awayName: context.awayName ?? null,
						leagueName: context.leagueName ?? null,
						kickoff: context.kickoff ? new Date(context.kickoff) : null,
						// Rynek nierozpoznany od razu odpada ze statystyk — nie ma sensu
						// trzymać go jako „oczekujący" i pytać o wynik meczu bez potrzeby.
						status: normalized ? 'pending' : 'void',
						voidReason: normalized ? null : 'market_not_supported',
					},
				},
				{ upsert: true }
			);
			saved += 1;
		} catch (error) {
			// Duplikat (11000) jest normalny przy ponownym generowaniu tej samej analizy.
			if (error?.code !== 11000) {
				console.warn('[picks] nie udało się zapisać typu:', error.message);
			}
		}
	}

	return saved;
}

/**
 * Rozlicza typy oczekujące, których mecze już się zakończyły.
 *
 * @param {{ limit?: number }} [options] górny limit meczów na jeden przebieg
 * @returns {Promise<{ examined: number, settled: number, won: number, lost: number, voided: number, apiCalls: number }>}
 */
export async function settlePendingPicks({ limit = 400 } = {}) {
	const cutoff = new Date(Date.now() - SETTLE_AFTER_MS);

	const pending = await Pick.find({
		status: 'pending',
		kickoff: { $ne: null, $lte: cutoff },
	})
		.sort({ kickoff: 1 })
		.limit(limit)
		.lean();

	if (!pending.length) {
		return { examined: 0, settled: 0, won: 0, lost: 0, voided: 0, apiCalls: 0 };
	}

	// Jeden mecz bywa typowany wielokrotnie (analiza + raport, różni użytkownicy) —
	// pytamy o niego raz.
	const fixtureIds = [...new Set(pending.map((p) => p.fixtureId))];
	const results = new Map();
	let apiCalls = 0;

	for (let i = 0; i < fixtureIds.length; i += BATCH) {
		const chunk = fixtureIds.slice(i, i + BATCH);
		try {
			const rows = await fixturesByIds(chunk);
			apiCalls += 1;
			for (const row of rows) {
				results.set(String(row.fixture?.id), {
					status: row.fixture?.status?.short,
					home: row.goals?.home,
					away: row.goals?.away,
				});
			}
		} catch (error) {
			console.warn('[picks] nie udało się pobrać wyników paczki:', error.message);
		}
	}

	const summary = { examined: pending.length, settled: 0, won: 0, lost: 0, voided: 0, apiCalls };

	for (const pick of pending) {
		const result = results.get(String(pick.fixtureId));
		if (!result) continue;

		if (NOT_PLAYED.includes(result.status)) {
			await Pick.updateOne(
				{ _id: pick._id },
				{ $set: { status: 'void', voidReason: 'match_not_played', settledAt: new Date() } }
			);
			summary.voided += 1;
			continue;
		}

		// Mecz wciąż nierozstrzygnięty (przełożony w toku, dane spóźnione) — zostawiamy
		// na kolejny przebieg zamiast zgadywać.
		if (!['FT', 'AET', 'PEN'].includes(result.status)) continue;

		const outcome = settlePick(pick.normalized, { home: result.home, away: result.away });
		if (!outcome) {
			await Pick.updateOne(
				{ _id: pick._id },
				{ $set: { status: 'void', voidReason: 'not_settleable', settledAt: new Date() } }
			);
			summary.voided += 1;
			continue;
		}

		await Pick.updateOne(
			{ _id: pick._id },
			{
				$set: {
					status: outcome,
					settledAt: new Date(),
					finalScore: { home: result.home, away: result.away },
				},
			}
		);
		summary.settled += 1;
		summary[outcome] += 1;
	}

	return summary;
}
