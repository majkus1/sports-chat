import mongoose from 'mongoose';

/**
 * Raport AI zapisany na koncie użytkownika.
 *
 * Zastępuje wysyłkę mailową ze starego agenta Pythona — raport należy do konta
 * i jest dostępny w sekcji „Moje raporty" tak długo, jak istnieje konto.
 * Wzorzec pól kosztowych i metadanych jak w MatchAnalysis.
 */
const ReportSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

		/** Okno czasowe raportu: najbliższe 24 h albo 3 dni. */
		type: { type: String, enum: ['soon', 'threeDays'], required: true },
		language: { type: String, required: true },

		status: { type: String, enum: ['ready', 'failed'], default: 'ready' },

		/** Wynik REPORT_SCHEMA: intro, picks[], summary. */
		sections: { type: mongoose.Schema.Types.Mixed, default: null },

		/** Ile typów weszło do raportu i z ilu kandydatów wybierał model. */
		fixtureCount: { type: Number, default: 0 },
		candidateCount: { type: Number, default: 0 },

		provider: { type: String, default: null },
		model: { type: String, default: null },
		promptVersion: { type: String, default: null },

		tokensIn: { type: Number, default: null },
		tokensOut: { type: Number, default: null },
		costUsd: { type: Number, default: null },
	},
	{ timestamps: true }
);

/** Lista „Moje raporty" czyta zawsze po właścicielu, od najnowszego. */
ReportSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.Report || mongoose.model('Report', ReportSchema);
