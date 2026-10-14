import { wilsonInterval } from '@/lib/picks/metrics';
import { pickOutcome } from '@/lib/seo/matchPreview';

/**
 * Skuteczność WSZYSTKICH plakietek modelu (✦ na liście meczów) — z dziennika prognoz.
 *
 * PO CO OSOBNO. Publiczna skuteczność liczy typy, które powstały w analizach, raportach i jako
 * typ dnia. Plakietki z listy wchodziły do niej tylko wtedy, gdy ktoś akurat zrobił analizę
 * meczu — z 374 rozliczonych meczów z plakietką typ w statystyce miało 29. Użytkownik widzi je
 * jako „typy modelu", więc powinien móc sprawdzić je wszystkie, bez wybierania.
 *
 * ŹRÓDŁO: `ModelForecast` — każdy mecz, który model policzył, z pierwszą prognozą (tą, którą
 * mógł zobaczyć czytelnik) i wynikiem dopisanym nocą. Rozliczenie po 90 minutach (`FT`);
 * mecze z dogrywką, karnymi albo odwołane nie wchodzą — tak samo jak na stronie meczu.
 */

const KUBELKI = [
	{ key: '60-69', od: 60, do: 70 },
	{ key: '70-79', od: 70, do: 80 },
	{ key: '80-89', od: 80, do: 90 },
	{ key: '90+', od: 90, do: 101 },
];

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Bilans zbioru plakietek: trafienia, obietnica modelu, norma i przewaga nad nią. */
function bilans(rows) {
	const n = rows.length;
	if (!n) return { settled: 0 };
	const won = rows.filter((r) => r.won).length;
	const hitRate = Math.round((100 * won) / n);
	const promised = Math.round(srednia(rows.map((r) => r.probability)));
	const base = Math.round(srednia(rows.map((r) => r.base)));
	return { settled: n, won, lost: n - won, hitRate, promised, base, edge: hitRate - base, interval: wilsonInterval(won, n) };
}

/**
 * @param {Array<object>} docs dokumenty `ModelForecast` z `hint`, `result`, `kickoff`, nazwami drużyn
 * @param {{ now?: Date, recentDays?: number, lastCount?: number }} [options] `recentDays` — okno „ostatnio" (dwa tygodnie: widać kierunek, a próba nie jest garstką)
 */
export function summarizeHints(docs, { now = new Date(), recentDays = 14, lastCount = 8 } = {}) {
	const rows = [];
	for (const d of docs || []) {
		if (!d?.hint?.key || !Number.isFinite(d.hint.probability)) continue;
		const outcome = pickOutcome(d);
		if (!outcome) continue;
		rows.push({
			won: outcome === 'won',
			key: d.hint.key,
			probability: d.hint.probability,
			base: Number.isFinite(d.hint.base) ? d.hint.base : null,
			kickoff: new Date(d.kickoff),
			fixtureId: d.fixtureId,
			homeName: d.homeName,
			awayName: d.awayName,
			selection: d.hint.selection,
			score: `${d.result.home}:${d.result.away}`,
		});
	}
	// Bez normy przewagi policzyć się nie da — taka plakietka liczy się do trafności, nie do normy.
	const zNorma = (rs) => rs.filter((r) => r.base !== null);

	const ogolem = bilans(rows);
	if (ogolem.settled) {
		const b = bilans(zNorma(rows));
		Object.assign(ogolem, { base: b.base, edge: b.settled ? b.hitRate - b.base : null });
	}
	const granica = new Date(now.getTime() - recentDays * 86_400_000);
	const ostatnie = rows.filter((r) => r.kickoff >= granica);

	const rynki = new Map();
	for (const r of rows) rynki.set(r.key, [...(rynki.get(r.key) || []), r]);

	return {
		since: rows.length ? new Date(Math.min(...rows.map((r) => r.kickoff.getTime()))).toISOString() : null,
		all: ogolem,
		recent: { days: recentDays, ...bilans(ostatnie) },
		byMarket: [...rynki.entries()]
			.map(([key, rs]) => ({ key, ...bilans(rs) }))
			.sort((a, b) => b.settled - a.settled),
		calibration: KUBELKI.map((k) => ({ bucket: k.key, ...bilans(rows.filter((r) => r.probability >= k.od && r.probability < k.do)) })).filter(
			(k) => k.settled > 0
		),
		last: [...rows]
			.sort((a, b) => b.kickoff - a.kickoff)
			.slice(0, lastCount)
			.map((r) => ({
				fixtureId: r.fixtureId,
				homeName: r.homeName,
				awayName: r.awayName,
				selection: r.selection,
				probability: r.probability,
				score: r.score,
				won: r.won,
				kickoff: r.kickoff.toISOString(),
			})),
	};
}
