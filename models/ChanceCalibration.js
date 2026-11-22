import mongoose from 'mongoose';

/**
 * Wersje korekty szansy modelu (`lib/model/chanceCalibration.js`) włączane przez cotygodniowe zadanie
 * (`lib/model/weeklyJob.js`) — z datą, powodem i poprzednikiem, żeby każdą dało się wycofać.
 *
 * DLACZEGO W BAZIE, A NIE TYLKO W PLIKU. Plik danych z repozytorium zmienia się przez commit
 * i wdrożenie; zadanie tygodniowe musi móc włączyć korektę samo, a administrator — cofnąć ją jednym
 * przyciskiem, bez wdrożenia. Plik zostaje zapasem: gdy żadna wersja nie jest aktywna, obowiązuje on.
 *
 * Najwyżej JEDNA aktywna wersja na `scope`. `scope: 'prod'` czyta produkcja; testy piszą pod własnym,
 * losowym `scope`, więc nawet przerwany test nie zmieni liczb, które widzi użytkownik.
 */
const ChanceCalibrationSchema = new mongoose.Schema(
	{
		version: { type: String, required: true },
		scope: { type: String, default: 'prod', index: true },
		/** `active` — obowiązuje; `superseded` — zastąpiona nowszą; `rolled_back` — wycofana ręcznie. */
		status: { type: String, enum: ['active', 'superseded', 'rolled_back'], default: 'active' },
		active: { type: Boolean, default: true, index: true },
		generatedAt: { type: String, default: null },
		through: { type: String, default: null },
		hints: { type: Number, default: null },
		/** Przesunięcia per selekcja — ten sam kształt co `chanceCalibrationData.js`. */
		selections: { type: mongoose.Schema.Types.Mixed, required: true },
		/** Wersja obowiązująca przed tą (z bazy albo z pliku) — do wycofania. */
		previousVersion: { type: String, default: null },
		source: { type: String, enum: ['weekly', 'manual'], default: 'weekly' },
		activatedAt: { type: Date, default: Date.now },
		deactivatedAt: { type: Date, default: null },
		/** Raport tygodnia, który tę wersję włączył. */
		reportId: { type: mongoose.Schema.Types.ObjectId, default: null },
	},
	{ timestamps: true }
);

ChanceCalibrationSchema.index({ scope: 1, version: 1 }, { unique: true });
ChanceCalibrationSchema.index({ scope: 1, active: 1, activatedAt: -1 });

export default mongoose.models.ChanceCalibration || mongoose.model('ChanceCalibration', ChanceCalibrationSchema);
