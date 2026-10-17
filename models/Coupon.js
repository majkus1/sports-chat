import mongoose from 'mongoose';

/**
 * Kupon dnia (łączny kurs ok. 2,0) i kupon weekendowy (ok. 3,0) — za darmo dla wszystkich.
 *
 * Wybierany RAZ (pierwszy przebieg po 9:30; weekendowy w piątek) i już się nie zmienia —
 * to obietnica publiczna, rozliczana po meczach. Gdy pula dnia nie pozwala złożyć kuponu
 * w ramach zasad, zapisujemy `status: 'none'`, żeby nie próbować w kółko.
 *
 * KURSY W INTERFEJSIE — świadoma decyzja właściciela (październik 2026): kupon bez kursu nie ma
 * sensu, więc pokazujemy medianę bukmacherów z chwili wyboru, bez nazw bukmacherów i linków.
 * Szczegóły wyboru i rozliczenia: `lib/coupons/build.js`.
 */
const LegSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true },
		homeName: { type: String, required: true },
		awayName: { type: String, required: true },
		leagueId: { type: Number, default: null },
		league: { type: String, default: null },
		kickoff: { type: Date, required: true },
		/** Klucz plakietki (`home`, `X2`, `awayScores`…) i jej opis. */
		key: { type: String, required: true },
		selection: { type: String, required: true },
		probability: { type: Number, required: true },
		base: { type: Number, default: null },
		/** Mediana bukmacherów w chwili wyboru (kurs dziesiętny). */
		odds: { type: Number, required: true },
		/** Po meczu: `won` / `lost` / `void` (mecz odwołany) i wynik z 90 minut. */
		status: { type: String, enum: ['pending', 'won', 'lost', 'void'], default: 'pending' },
		score: { type: String, default: null },
	},
	{ _id: false }
);

const CouponSchema = new mongoose.Schema(
	{
		/** `daily:YYYY-MM-DD` albo `weekend:YYYY-MM-DD` (data piątku) — jeden kupon na klucz. */
		key: { type: String, required: true, unique: true },
		type: { type: String, enum: ['daily', 'weekend'], required: true, index: true },
		/** Dzień publikacji w czasie polskim. */
		date: { type: String, required: true, index: true },
		legs: { type: [LegSchema], default: [] },
		/** Iloczyn kursów i iloczyn szans modelu (procent) — z chwili wyboru. */
		totalOdds: { type: Number, default: null },
		chance: { type: Number, default: null },
		status: { type: String, enum: ['pending', 'won', 'lost', 'void', 'none'], default: 'pending', index: true },
		settledAt: { type: Date, default: null },
	},
	{ timestamps: true }
);

export default mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
