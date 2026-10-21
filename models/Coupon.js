import mongoose from 'mongoose';

/**
 * Kupon dnia (łączny kurs ok. 2,0, za darmo), 3-dniowy (ok. 2,0) i 5-dniowy (ok. 3,0) — dwa
 * ostatnie w planie Pro i VIP. Do 18.10.2026 był też weekendowy (zostaje w historii).
 *
 * Wybierany RAZ (pierwszy przebieg po 9:30, codziennie każdy rodzaj) i już się nie zmienia —
 * to obietnica publiczna, rozliczana po meczach. Gdy pula dnia nie pozwala złożyć kuponu
 * w ramach zasad, zapisujemy `status: 'none'`, żeby nie próbować w kółko.
 *
 * KURSY W INTERFEJSIE — świadoma decyzja właściciela (październik 2026): kupon bez kursu nie ma
 * sensu, więc pokazujemy medianę bukmacherów z chwili wyboru, bez nazw bukmacherów i linków.
 * Szczegóły wyboru i rozliczenia: `lib/coupons/build.js`.
 */
/** Werdykt sprawdzenia wiadomości przez AI (płatne kupony, `lib/coupons/news.js`). */
const LegNewsSchema = new mongoose.Schema(
	{
		verdict: { type: String, enum: ['ok', 'unknown'], default: 'unknown' },
		sources: { type: [{ title: String, url: String, _id: false }], default: [] },
	},
	{ _id: false }
);

/** Typ odrzucony po sprawdzeniu wiadomości — pokazywany przy kuponie, żeby było widać, co AI odsiało. */
const DroppedLegSchema = new mongoose.Schema(
	{
		fixtureId: String,
		homeName: String,
		awayName: String,
		selection: String,
		reason: String,
	},
	{ _id: false }
);

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
		/** Tylko płatne kupony: czy AI sprawdziło wiadomości o tym meczu przed publikacją. */
		news: { type: LegNewsSchema, default: null },
		/** Kupon live: minuta i wynik w chwili wyboru oraz uzasadnienie AI. */
		minute: { type: Number, default: null },
		liveScore: { type: String, default: null },
		why: { type: String, default: null },
		/** Kupon live: skąd szansa — `model` (liga modelu) albo `market` (kursy sprzed meczu + wynik i minuta). */
		source: { type: String, enum: ['model', 'market', null], default: null },
	},
	{ _id: false }
);

const CouponSchema = new mongoose.Schema(
	{
		/** `daily|days3|days5:YYYY-MM-DD` (dzień publikacji; dawny `weekend:` — data piątku). Jeden kupon na klucz. */
		key: { type: String, required: true, unique: true },
		type: { type: String, enum: ['daily', 'days3', 'days5', 'weekend', 'live'], required: true, index: true },
		/** Dzień publikacji w czasie polskim. */
		date: { type: String, required: true, index: true },
		legs: { type: [LegSchema], default: [] },
		/** Iloczyn kursów i iloczyn szans modelu (procent) — z chwili wyboru. */
		totalOdds: { type: Number, default: null },
		chance: { type: Number, default: null },
		status: { type: String, enum: ['pending', 'won', 'lost', 'void', 'none'], default: 'pending', index: true },
		settledAt: { type: Date, default: null },
		/**
		 * Sprawdzenie wiadomości przez AI przed publikacją (płatne kupony): ile typów sprawdzono,
		 * które odrzucono i dlaczego; `skipped` — powód, gdy sprawdzenia nie było (próg wydatków).
		 */
		newsCheck: {
			type: new mongoose.Schema(
				{
					checked: { type: Number, default: 0 },
					dropped: { type: [DroppedLegSchema], default: [] },
					skipped: { type: String, default: null },
					at: { type: Date, default: null },
				},
				{ _id: false }
			),
			default: null,
		},
	},
	{ timestamps: true }
);

export default mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
