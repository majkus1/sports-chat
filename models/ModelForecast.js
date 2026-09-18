import mongoose from 'mongoose';

/**
 * Dziennik prognoz modelu — KAŻDY mecz, który model policzył, nie tylko opublikowany typ.
 *
 * PO CO. Typy (`Pick`) to ~40 rozliczonych na miesiąc — za mało, żeby w rozsądnym czasie
 * sprawdzić, czy „66 %" trafia w 66 %, i tym bardziej za mało, żeby czegokolwiek się z nich
 * nauczyć. Model tymczasem liczy codziennie prognozy dla ~150 meczów i większość przepada:
 * nie przeszła progu, nikt jej nie otworzył. Tu zostają wszystkie, z wynikiem dopisanym po
 * meczu. Po dwóch miesiącach to kilka tysięcy prognoz — materiał do kalibracji; po pół roku
 * — do przeliczenia regresji na własnych danych.
 *
 * PIERWSZA PROGNOZA ZOSTAJE. Mecz jest liczony wielokrotnie (lista, panel, mail, asystent),
 * a model ligi zmienia się co sześć godzin. Zapisujemy prognozę z pierwszego policzenia
 * w oknie `LEAD_HOURS` przed meczem i nie nadpisujemy — pomiar ma być uczciwy wobec tego,
 * co użytkownik mógł zobaczyć, a nie wobec ostatniej wersji tuż przed gwizdkiem.
 *
 * TO NIE JEST ŹRÓDŁO DLA INTERFEJSU. Nic tu nie czyta lista, analiza ani asystent. Czyta
 * `lib/model/forecastCheck.mjs` (pomiar) i — w przyszłości — uczenie.
 */
const ModelForecastSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true, unique: true },
		leagueId: { type: Number, required: true, index: true },
		season: { type: Number, default: null },
		homeId: { type: Number, required: true },
		awayId: { type: Number, required: true },
		homeName: { type: String, default: null },
		awayName: { type: String, default: null },
		kickoff: { type: Date, required: true, index: true },

		/** Kiedy policzono i ile godzin przed meczem. */
		forecastAt: { type: Date, required: true },
		leadHours: { type: Number, default: null },
		modelVersion: { type: String, default: null, index: true },
		matchesUsed: { type: Number, default: null },

		/** Średnie bramkowe Dixona-Colesa — z nich wynika cała macierz. */
		lambdaHome: { type: Number, default: null },
		lambdaAway: { type: Number, default: null },

		/** Prawdopodobieństwa rynków, ułamki 0–1 — dokładnie to, co poszło do `evaluateMarkets`. */
		markets: {
			home: { type: Number, default: null },
			draw: { type: Number, default: null },
			away: { type: Number, default: null },
			dc1X: { type: Number, default: null },
			dcX2: { type: Number, default: null },
			homeScores: { type: Number, default: null },
			awayScores: { type: Number, default: null },
			/** Skalibrowane; `null`, gdy kalibracja nie powstała (za krótka historia drużyn). */
			over25: { type: Number, default: null },
			btts: { type: Number, default: null },
		},
		/** Skąd wzięło się „powyżej 2,5": wariant regresji i norma ligowa. */
		over25: {
			variant: { type: String, default: null },
			base: { type: Number, default: null },
		},

		/** Co pokazałaby plakietka — najlepsza selekcja po polityce, albo nic. */
		hint: {
			key: { type: String, default: null },
			selection: { type: String, default: null },
			probability: { type: Number, default: null },
			base: { type: Number, default: null },
			lift: { type: Number, default: null },
		},

		/** Wynik dopisany po meczu; `status` z dostawcy (FT/AET/PEN albo odwołany). */
		result: {
			home: { type: Number, default: null },
			away: { type: Number, default: null },
			status: { type: String, default: null },
		},
		settledAt: { type: Date, default: null, index: true },
	},
	{ timestamps: true }
);

export default mongoose.models.ModelForecast || mongoose.model('ModelForecast', ModelForecastSchema);
