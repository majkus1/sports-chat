import mongoose from 'mongoose';

/**
 * Zrzut danych meczowych użytych do konkretnej analizy AI.
 *
 * Dzięki temu analiza jest odtwarzalna („na jakich danych to powstało?”) i można pokazać
 * użytkownikowi godzinę pobrania. `payload` celowo jest luźny — kanoniczny kształt bywa
 * rozszerzany o kolejne sekcje i nie chcemy migracji schematu przy każdym nowym endpoincie.
 */
const FixtureSnapshotSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true, index: true },
		provider: { type: String, default: null },
		sections: { type: [String], default: [] },
		/** Skrót treści — pozwala rozpoznać, że dane się nie zmieniły od ostatniej analizy. */
		hash: { type: String, index: true },
		payload: { type: mongoose.Schema.Types.Mixed, required: true },
		fetchedAt: { type: Date, default: Date.now },
		/** Zrzuty są materiałem pomocniczym, nie archiwum — kasują się same po 30 dniach. */
		expiresAt: {
			type: Date,
			default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
			index: { expires: 0 },
		},
	},
	{ timestamps: true }
);

export default mongoose.models.FixtureSnapshot ||
	mongoose.model('FixtureSnapshot', FixtureSnapshotSchema);
