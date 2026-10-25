import { predictions } from '@/lib/football/endpoints';
import { normalizePrediction, normalizeTeamForm, normalizeH2H } from '@/lib/football/normalize';
import { findValuePicks } from '@/lib/value/service';
import { VALUE_DEFAULT_MIN_ODDS } from '@/lib/value/select';
import { REPORT_WINDOWS, reportCandidateMatch } from '@/lib/reports/service';
import { attachSchedules } from '@/lib/football/schedule';

/**
 * Raport „Wyższe kursy" (24 h albo 3 dni) — kandydaci i związanie odpowiedzi modelu językowego.
 *
 * Mecze i typy wybiera `findValuePicks` (zasady i pomiar: `lib/value/select.js`), AI dostaje
 * do każdego formę, H2H i prognozę dostawcy, ocenia typ, może go odrzucić i pisze analizę.
 * Liczb nie zmienia: kurs, szansa rynku i szansa modelu wracają po odpowiedzi z kandydata.
 * Typy trafiają do osobnego bilansu (`ValuePick`), nie do głównej skuteczności.
 */

export const VALUE_REPORT_LIMIT = 8;

/** @returns {Promise<{ candidates: Array, poolSize: number, examined: number }>} */
export async function buildValueReportCandidates({ type, minOdds = VALUE_DEFAULT_MIN_ODDS }) {
	const hours = REPORT_WINDOWS[type] ?? REPORT_WINDOWS.soon;
	const { picks, stats } = await findValuePicks({
		hours,
		minOdds,
		limit: VALUE_REPORT_LIMIT,
		maxFetch: hours > 24 ? 80 : 50,
	});

	const candidates = [];
	for (let i = 0; i < picks.length; i += 4) {
		const paczka = await Promise.all(
			picks.slice(i, i + 4).map(async (p) => {
				let raw = null;
				try {
					raw = (await predictions(p.fixtureId))?.[0] ?? null;
				} catch {
					raw = null;
				}
				return {
					...p,
					kickoff: new Date(p.kickoff).toISOString(),
					prediction: raw ? normalizePrediction(raw) : null,
					formHome: raw ? normalizeTeamForm(raw.teams?.home) : null,
					formAway: raw ? normalizeTeamForm(raw.teams?.away) : null,
					h2h: raw ? normalizeH2H(raw.h2h, { limit: 5 }) : [],
				};
			})
		);
		candidates.push(...paczka);
	}
	// Terminarz obu drużyn tylko dla kandydatów z promptu (najwyżej `VALUE_REPORT_LIMIT` meczów).
	await attachSchedules(candidates, { toMatch: reportCandidateMatch });
	return { candidates, poolSize: stats.fixtures, examined: stats.withOdds };
}

/**
 * Typy z odpowiedzi AI związane z kandydatami: liczby, rynek i selekcja zawsze z kandydata,
 * od AI tylko ocena, analiza i fakty. Typ bez kandydata (zmyślony mecz) wypada.
 */
export function bindValuePicks(picks, candidates, { language = 'pl' } = {}) {
	return (picks || [])
		.map((pick) => {
			const k = candidates.find((c) => String(c.fixtureId) === String(pick.fixtureId));
			if (!k) return null;
			return {
				...pick,
				fixtureId: Number(k.fixtureId),
				match: `${k.homeName} vs ${k.awayName}`,
				league: k.league,
				kickoffUtc: k.kickoff,
				market: language === 'en' ? 'Higher odds' : 'Wyższy kurs',
				selection: k.selection,
				key: k.key,
				odds: k.odds,
				marketProbability: k.market,
				modelProbability: k.model,
				// Pole wymagane przez schemat raportu — tu uczciwa szansa, czyli rynkowa.
				probability: k.market,
			};
		})
		.filter(Boolean);
}
