import ModelForecast from '@/models/ModelForecast';
import { oddsForSnapshot } from '@/lib/football/endpoints';
import { normalizeOddsFixture } from '@/lib/football/normalize';
import { oddsSnapshot } from '@/lib/model/oddsShadow';
import { localDate, localMidnight } from '@/lib/time';

/**
 * Tryb cienia — dopisywanie kursów do dziennika prognoz. Woła je harmonogram co 20 minut
 * (`/api/cron/odds-snapshot`); każdy przebieg robi tylko to, czego jeszcze brakuje.
 *
 * OTWARCIE: mecze z dziennika, które zaczynają się najwcześniej za godzinę i najpóźniej
 * o 9:00 następnego dnia. Pierwszy przebieg po 9:00 zdejmuje więc kursy całego dnia — to
 * moment, w którym zakładka pokazałaby typy. Prognozy dnia zapisuje poranny mail o 8:00.
 *
 * ZAMKNIĘCIE: mecze startujące w ciągu 30 minut. Przy przebiegu co 20 minut każdy mecz dostaje
 * zdjęcie 10–30 minut przed pierwszym gwizdkiem.
 *
 * KOSZT: jedno zapytanie na mecz na zdjęcie, ok. 300 dziennie przy limicie 7500. Mecz bez
 * kursów u dostawcy dostaje puste zdjęcie (`bookmakers: 0`), żeby nie pytać o niego co przebieg.
 */

export const OPEN_HOUR = 9;
export const OPEN_MIN_LEAD_MS = 60 * 60 * 1000;
export const CLOSE_WINDOW_MS = 30 * 60 * 1000;
const CONCURRENCY = 4;

/** Najbliższa 9:00 czasu polskiego po `now` — koniec okna otwarcia. */
export function openWindowEnd(now = new Date()) {
	const dzis = localMidnight(localDate(now)).getTime() + OPEN_HOUR * 3600_000;
	return new Date(dzis > now.getTime() ? dzis : localMidnight(localDate(now, 1)).getTime() + OPEN_HOUR * 3600_000);
}

async function pobierzKursy(fixtureId) {
	const raw = (await oddsForSnapshot(fixtureId))?.[0] ?? null;
	return oddsSnapshot(normalizeOddsFixture(raw), new Date());
}

/**
 * @param {{ now?: Date, budget?: number, fetchOdds?: (fixtureId: string) => Promise<object|null> }} [options]
 *   `fetchOdds` podmieniany w testach; domyślnie API-Football
 * @returns {Promise<{ open: number, close: number, empty: number, failed: number }>}
 */
export async function snapshotOdds({ now = new Date(), budget = 250, fetchOdds = pobierzKursy } = {}) {
	const t = now.getTime();
	const zamkniecie = await ModelForecast.find({
		'odds.close': null,
		kickoff: { $gt: now, $lte: new Date(t + CLOSE_WINDOW_MS) },
	})
		.select('fixtureId')
		.sort({ kickoff: 1 })
		.limit(budget)
		.lean();
	const otwarcie = await ModelForecast.find({
		'odds.open': null,
		kickoff: { $gte: new Date(t + OPEN_MIN_LEAD_MS), $lte: openWindowEnd(now) },
	})
		.select('fixtureId')
		.sort({ kickoff: 1 })
		.limit(Math.max(0, budget - zamkniecie.length))
		.lean();

	const zadania = [
		...zamkniecie.map((f) => ({ f, faza: 'close' })),
		...otwarcie.map((f) => ({ f, faza: 'open' })),
	];
	const podsumowanie = { open: 0, close: 0, empty: 0, failed: 0 };

	const wykonaj = async ({ f, faza }) => {
		let zdjecie;
		try {
			zdjecie = (await fetchOdds(f.fixtureId)) || { at: new Date(), bookmakers: 0 };
		} catch (error) {
			// Błąd dostawcy — spróbujemy przy następnym przebiegu, o ile mecz jest jeszcze w oknie.
			podsumowanie.failed += 1;
			console.warn(`[odds-shadow] ${f.fixtureId} (${faza}):`, error.message);
			return;
		}
		const pole = `odds.${faza}`;
		await ModelForecast.updateOne({ _id: f._id, [pole]: null }, { $set: { [pole]: zdjecie } });
		podsumowanie[faza] += 1;
		if (!zdjecie.bookmakers) podsumowanie.empty += 1;
	};

	for (let i = 0; i < zadania.length; i += CONCURRENCY) {
		await Promise.all(zadania.slice(i, i + CONCURRENCY).map(wykonaj));
	}
	return podsumowanie;
}
