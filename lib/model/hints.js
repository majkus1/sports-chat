import { predictFixture } from '@/lib/model';
import { evaluateMarkets } from '@/lib/reports/service';
import { SELECTION_SHAPES, sameSelection } from '@/lib/picks/markets';
import { fixturesByDate } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';
import { LEAGUE_TIERS } from '@/lib/football/leagues';

/**
 * Podpowiedź modelu przy meczu na liście — najlepsza selekcja i jej przewaga nad normą.
 *
 * PO CO. Lista meczów pokazywała godzinę, nazwy i dwa przyciski widgetów; wartość modelu
 * użytkownik poznawał dopiero po wejściu w mecz i wygenerowaniu analizy. Plakietka „X2 +18"
 * przy wierszu zamienia listę w narzędzie do skanowania oferty: widać, gdzie model w ogóle
 * ma coś do powiedzenia, zanim wyda się jakikolwiek limit.
 *
 * DLACZEGO TO NIC NIE KOSZTUJE. Model ligi dopasowuje się raz na sześć godzin i siedzi
 * w pamięci procesu, a prognoza dla meczu to czysty rachunek na macierzy wyników — bez
 * zapytania do dostawcy. Sto pięćdziesiąt meczów dziennie liczy się w ułamku sekundy.
 *
 * TEN SAM RACHUNEK CO PRZY TYPIE. Selekcje pochodzą z `evaluateMarkets`, czyli przechodzą
 * ten sam próg przewagi nad normą, który decyduje o typie w raporcie. Plakietka nie może
 * pokazać niczego, czego raport by nie wystawił — inaczej lista obiecywałaby coś innego
 * niż analiza. Jedyna różnica: nie ma tu sufitu rynkowego, bo ten wymaga kursów, a kursy
 * to osobne zapytanie na mecz. Plakietka jest sygnałem, nie opublikowanym typem.
 */

/**
 * Skrót selekcji na plakietkę — konwencja kuponowa, znana każdemu kibicowi.
 * Pełny opis idzie w podpowiedzi po najechaniu.
 */
export const COMPACT_LABELS = {
	home: '1',
	away: '2',
	'1X': '1X',
	X2: 'X2',
	homeScores: 'G1',
	awayScores: 'G2',
};

/** Klucz z `SELECTION_SHAPES` dla postaci znormalizowanej — do skrótu i do testów. */
function keyFor(normalized) {
	for (const [key, ksztalt] of Object.entries(SELECTION_SHAPES)) {
		if (sameSelection(ksztalt.normalized, normalized)) return key;
	}
	return null;
}

/**
 * Najlepsza selekcja z listy przechodzących próg — po przewadze nad normą, nie po procencie.
 *
 * Sortowanie po procencie dawałoby zawsze „gospodarz strzeli" przy 90%, czyli truizm.
 * Przewaga mierzy, o ile ten mecz różni się od przeciętnego, i to jest jedyna rzecz,
 * dla której warto na plakietkę spojrzeć.
 *
 * @param {Array} markets wynik `evaluateMarkets`
 * @returns {null | { key: string, label: string, selection: string, probability: number, base: number, lift: number }}
 */
export function bestHint(markets) {
	if (!markets?.length) return null;
	const najlepszy = [...markets].sort((a, b) => b.lift - a.lift)[0];
	const key = keyFor(najlepszy.normalized);
	if (!key) return null;
	return {
		key,
		label: COMPACT_LABELS[key],
		selection: najlepszy.selection,
		probability: najlepszy.pModel,
		base: najlepszy.base,
		lift: najlepszy.lift,
	};
}

/**
 * Podpowiedzi dla listy meczów — mapa `fixtureId → podpowiedź`.
 *
 * Mecz bez modelu ligi albo z drużyną nieznaną modelowi (`known: false`) nie dostaje nic:
 * prognoza dla nieznanej drużyny to prognoza dla drużyny przeciętnej i nic nie mówi o tej
 * parze. Brak plakietki jest wtedy prawdą, a nie brakiem danych.
 *
 * @param {Array} fixtures znormalizowane mecze (`normalizeFixture`)
 * @returns {Promise<Map<string, object>>}
 */
export async function modelHintsFor(fixtures) {
	const out = new Map();
	for (const f of fixtures || []) {
		const modelPrediction = await predictFixture({
			leagueId: f.league?.id,
			season: f.league?.season,
			homeId: f.teams?.home?.id,
			awayId: f.teams?.away?.id,
		});
		if (!modelPrediction || !modelPrediction.known) continue;

		const rynki = evaluateMarkets({
			modelPrediction,
			homeName: f.teams?.home?.name ?? null,
			awayName: f.teams?.away?.name ?? null,
		});
		const hint = bestHint(rynki);
		if (hint) out.set(String(f.id), hint);
	}
	return out;
}

/**
 * Podpowiedzi dla całego dnia — z pamięcią procesu, wspólne dla listy meczów i asystenta.
 *
 * Dziesięć minut: terminarz dnia zmienia się rzadko, a model ligi i tak trzyma się sześć
 * godzin. Wynik niesie też dane meczu (nazwy, liga, godzina), bo asystent potrzebuje ich
 * do odpowiedzi, a lista — tylko identyfikatora.
 *
 * @returns {Promise<{ byId: Map<string, object>, list: Array<object> }>}
 */
const DAY_CACHE_TTL_MS = 10 * 60 * 1000;
const dayCache = new Map();

export async function hintsForDate(date) {
	const cached = dayCache.get(date);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const now = Date.now();
	const fixtures = (await fixturesByDate(date))
		.map(normalizeFixture)
		.filter(Boolean)
		// Tylko obsługiwane ligi i mecze jeszcze nierozpoczęte — dla trwających liczy się
		// co innego (model w trakcie meczu).
		.filter((f) => LEAGUE_TIERS.has(f.league?.id) && Date.parse(f.date) > now);

	const byId = await modelHintsFor(fixtures);
	const list = fixtures
		.filter((f) => byId.has(String(f.id)))
		.map((f) => ({
			fixtureId: String(f.id),
			home: f.teams?.home?.name ?? '?',
			away: f.teams?.away?.name ?? '?',
			league: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
			kickoff: f.date,
			hint: byId.get(String(f.id)),
		}))
		.sort((a, b) => b.hint.lift - a.hint.lift);

	const value = { byId, list };
	dayCache.set(date, { value, expiresAt: Date.now() + DAY_CACHE_TTL_MS });
	return value;
}
