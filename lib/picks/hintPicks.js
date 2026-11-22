import Pick from '@/models/Pick';
import { recordPicks } from '@/lib/picks/service';
import { SELECTION_SHAPES } from '@/lib/picks/markets';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { calibrationVersion } from '@/lib/model/chanceCalibration';

/**
 * Plakietki modelu (✦ na liście meczów) jako typy w publicznej skuteczności — od października 2026.
 *
 * PO CO. Skuteczność liczyła typy z analiz, raportów i typ dnia; plakietkę tylko wtedy, gdy
 * ktoś akurat zrobił analizę meczu. Użytkownik widzi plakietki jako „typy modelu", więc liczba
 * na stronie „Skuteczność" ma obejmować je wszystkie. Bez cofania się wstecz: zapis zaczyna się
 * z chwilą wdrożenia (wcześniejsze plakietki zostają tylko w dzienniku prognoz).
 *
 * JEDNA PLAKIETKA NA MECZ — pierwsza. Model ligi przelicza się co kilka godzin i plakietka
 * meczu potrafi zmienić selekcję; liczy się ta, którą czytelnik zobaczył pierwszą, tak jak
 * w dzienniku prognoz. Zapis tylko dla meczów, które zaczną się w ciągu 48 godzin (te same
 * ramy co dziennik) — plakietka na mecz za pięć dni zapisze się, gdy będzie już blisko.
 *
 * Plakietka ustępuje typowi dnia, analizie i raportowi z tą samą selekcją — patrz
 * `DEDUPE_GROUP` w `lib/picks/service.js`.
 */

export const HINT_LEAD_HOURS = 48;

/**
 * ZAPIS DOPIERO Z KURSEM (od 21.11.2026). Plakietka liczona przed porannym zdjęciem kursów jest
 * wstępna — rano kurs może jej nie potwierdzić i wtedy z listy znika (`lib/picks/chance.js`). Do
 * skuteczności idzie więc plakietka z chwili, gdy kursy już są (albo wiadomo, że ich nie będzie:
 * puste zdjęcie, `bookmakers: 0`). Mecz, który do godziny przed startem nie dostał zdjęcia (zdjęcie
 * otwarcia bierze tylko mecze dalej niż godzinę), zapisuje się z szansą modelu, jak dawniej.
 */
export const HINT_WAIT_FOR_ODDS_UNTIL_MS = 60 * 60 * 1000;

/**
 * @param {Array<{ fixture: object, prediction: object, hint: object|null, odds?: object|null }>} entries
 *   wpisy z `hintsForDate` (mecz znormalizowany, prognoza modelu, plakietka z listy albo `null`,
 *   poranne zdjęcie kursów albo `null`, gdy jeszcze go nie ma)
 * @returns {Promise<number>} ile plakietek zapisano po raz pierwszy
 */
export async function recordHintPicks(entries, { now = new Date() } = {}) {
	const kandydaci = (entries || []).filter(({ fixture: f, hint, odds }) => {
		if (!f?.id || !hint?.key || !SELECTION_SHAPES[hint.key]) return false;
		const doMeczu = Date.parse(f.date) - now.getTime();
		if (!(Number.isFinite(doMeczu) && doMeczu > 0 && doMeczu <= HINT_LEAD_HOURS * 3600_000)) return false;
		return Boolean(odds) || doMeczu <= HINT_WAIT_FOR_ODDS_UNTIL_MS;
	});
	if (!kandydaci.length) return 0;

	const juzSa = new Set(
		await Pick.distinct('fixtureId', { kind: 'hint', fixtureId: { $in: kandydaci.map((k) => String(k.fixture.id)) } })
	);

	let zapisane = 0;
	for (const { fixture: f, prediction: p, hint } of kandydaci) {
		if (juzSa.has(String(f.id))) continue;
		zapisane += await recordPicks({
			picks: [
				{
					market: SELECTION_SHAPES[hint.key].market,
					selection: hint.selection,
					probability: hint.probability,
					baseRate: hint.base,
					modelProbability: hint.modelProbability ?? null,
					chanceSource: hint.chanceSource ?? null,
				},
			],
			kind: 'hint',
			source: 'hint',
			userId: null,
			fixtureResolver: () => ({
				fixtureId: String(f.id),
				homeName: f.teams?.home?.name ?? null,
				awayName: f.teams?.away?.name ?? null,
				homeId: f.teams?.home?.id ?? null,
				awayId: f.teams?.away?.id ?? null,
				leagueName: f.league?.name ?? null,
				kickoff: f.date,
			}),
			context: {
				// Szansa z kursu — do sufitu i zapisu; ta sama, którą plakietka pokazuje.
				marketProbability: hint.marketProbability ?? null,
				calibrationVersion: calibrationVersion(),
				numericModelVersion: p?.modelVersion ?? null,
				leagueId: f.league?.id ?? null,
				leagueTier: LEAGUE_TIERS.get(f.league?.id) ?? null,
				// Próba meczów jest znana tylko w pulach (puchary, reprezentacje); w ligach plakietka
				// i tak powstaje wyłącznie dla drużyn, które model zna.
				playedHome: p?.poolPlayed?.home ?? null,
				playedAway: p?.poolPlayed?.away ?? null,
			},
		});
	}
	return zapisane;
}
