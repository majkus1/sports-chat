import mongoose from 'mongoose';

/**
 * Cotygodniowy raport modelu (`lib/model/weeklyJob.js`) — historia w panelu administratora
 * (`/admin/model`) i treść maila do administratorów. Jeden dokument na przebieg.
 *
 * `summary` to liczby z `lib/model/weeklyReport.js` (log loss model–rynek, kubełki obietnica/fakt,
 * tabela źródeł szansy, kupony, CLV, strzały w modelu), `calibration` — decyzja tygodnia z powodami.
 * Treść maila trzymamy w całości (`text`): raport ma być czytelny także po zmianie kodu, który go liczy.
 */
const ModelReportSchema = new mongoose.Schema(
	{
		kind: { type: String, enum: ['weekly'], default: 'weekly' },
		scope: { type: String, default: 'prod', index: true },
		at: { type: Date, default: Date.now, index: true },
		/** Tydzień, którego dotyczą „ostatnie 7 dni" — daty dnia w czasie polskim. */
		from: { type: String, default: null },
		to: { type: String, default: null },
		dryRun: { type: Boolean, default: false },
		summary: { type: mongoose.Schema.Types.Mixed, default: null },
		calibration: {
			changed: { type: Boolean, default: false },
			activated: { type: String, default: null },
			previous: { type: String, default: null },
			selections: { type: mongoose.Schema.Types.Mixed, default: null },
			reasons: { type: [String], default: [] },
		},
		subject: { type: String, default: null },
		text: { type: String, default: null },
		emailedTo: { type: Number, default: 0 },
		/** Co się nie udało (np. wysyłka maila) — raport zapisujemy mimo to. */
		problems: { type: [String], default: [] },
	},
	{ timestamps: true }
);

export default mongoose.models.ModelReport || mongoose.model('ModelReport', ModelReportSchema);
