import mongoose from 'mongoose';

/**
 * Analiza meczu wygenerowana przez model.
 *
 * `sections` trzyma ustrukturyzowany wynik (podsumowanie, czynniki, prawdopodobieństwa,
 * typy). Pole `analysis` zostaje jako tekst — mamy w bazie starsze rekordy zapisane
 * wyłącznie w tej formie i front musi umieć je nadal wyświetlić.
 *
 * Pola kosztowe pozwalają odpowiedzieć na pytanie „ile nas kosztują analizy",
 * którego wcześniej nie dało się zadać — API zwraca tokeny, nie kwoty.
 */
const MatchAnalysisSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true },
		language: { type: String, required: true },

		/** Zapis tekstowy — dla zgodności ze starymi rekordami i jako materiał dla asystenta w czacie. */
		analysis: { type: String, required: true },

		/** Ustrukturyzowany wynik; kształt pilnowany schematem w lib/ai/schemas.js. */
		sections: { type: mongoose.Schema.Types.Mixed, default: null },

		provider: { type: String, default: null },
		model: { type: String, default: null },
		promptVersion: { type: String, default: null },

		tokensIn: { type: Number, default: null },
		tokensOut: { type: Number, default: null },
		costUsd: { type: Number, default: null },

		/** Zrzut danych, na których powstała analiza — pozwala ją odtworzyć. */
		snapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'FixtureSnapshot', default: null },
		/** Kto ją wywołał (null dla niezalogowanych). */
		generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

		/** Analizy meczów na żywo starzeją się w minutach — kasują się same. */
		expiresAt: { type: Date, default: null, index: { expires: 0 } },

		createdAt: { type: Date, default: Date.now },
	},
	{ timestamps: true }
);

MatchAnalysisSchema.index({ fixtureId: 1, language: 1 }, { unique: true });

export default mongoose.models.MatchAnalysis ||
	mongoose.model('MatchAnalysis', MatchAnalysisSchema);
