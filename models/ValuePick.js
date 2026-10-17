import mongoose from 'mongoose';

/**
 * Typ z wyższym kursem (asystent i „Raport — wyższe kursy") — osobny bilans, osobna zakładka
 * w skuteczności, NIGDY w głównej liczbie. Zasady wyboru i dlaczego takie: `lib/value/select.js`.
 *
 * Jeden zapis na mecz i selekcję: ten sam typ pokazany dziesięć razy liczy się raz, od chwili,
 * w której pierwszy raz go ktoś zobaczył. Kurs i obie szanse — z tej chwili.
 */
const ValuePickSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true },
		/** Klucz plakietki (`home`, `X2`, `over25`…) i jej opis. */
		key: { type: String, required: true },
		selection: { type: String, required: true },
		homeName: { type: String, required: true },
		awayName: { type: String, required: true },
		leagueId: { type: Number, default: null },
		league: { type: String, default: null },
		kickoff: { type: Date, required: true, index: true },
		/** Mediana bukmacherów (kurs dziesiętny) i szanse w procentach: z kursu i z modelu. */
		odds: { type: Number, required: true },
		marketProbability: { type: Number, required: true },
		modelProbability: { type: Number, required: true },
		/** Gdzie pokazany pierwszy raz: w asystencie czy w raporcie. */
		source: { type: String, enum: ['assistant', 'report'], required: true },
		status: { type: String, enum: ['pending', 'won', 'lost', 'void'], default: 'pending', index: true },
		score: { type: String, default: null },
		settledAt: { type: Date, default: null },
	},
	{ timestamps: true }
);

ValuePickSchema.index({ fixtureId: 1, key: 1 }, { unique: true });

export default mongoose.models.ValuePick || mongoose.model('ValuePick', ValuePickSchema);
