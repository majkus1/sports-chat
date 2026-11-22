import mongoose from 'mongoose';

/**
 * Dziennik NIEUDANYCH złożeń kreatora kuponu (`lib/coupons/attempts.js`) — od 22.11.2026.
 *
 * Po co: 4.11.2026 użytkownik w okresie próbnym dostał „nie da się" i nie wrócił, a w dzienniku użycia
 * (`UsageLog`) został tylko koszt — bez ustawień i powodu. Tu zapisujemy ustawienia, powód, pokazane
 * propozycje i to, czy którąś przyjęto, żeby widzieć, które „nie da się" są najczęstsze i czy
 * propozycje pomagają. Bez treści osobowych: tylko `userId` (do rozróżnienia prób jednej osoby) i plan.
 * Meczów nie zapisujemy — wystarczą liczby. 180 dni (TTL), potem wpis kasuje się sam.
 */
export const ATTEMPT_TTL_DAYS = 180;

const ParamsSchema = new mongoose.Schema(
	{
		odds: String,
		legs: Number,
		window: String,
		leagues: { type: [String], default: [] },
		skipPublished: Boolean,
	},
	{ _id: false }
);

const AlternativeSchema = new mongoose.Schema(
	{
		params: { type: ParamsSchema, required: true },
		/** Zmienione pola (`window`, `legs`, `odds`, `leagues`, `skipPublished`) — do zestawienia w panelu. */
		changes: { type: [String], default: [] },
		totalOdds: { type: Number, default: null },
		chance: { type: Number, default: null },
		legs: { type: Number, default: null },
	},
	{ _id: false }
);

const CouponGenAttemptSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		/** Plan z limitu w chwili próby (`free` przy okresie próbnym — wtedy `inTrial`). */
		plan: { type: String, default: null },
		inTrial: { type: Boolean, default: false },
		params: { type: ParamsSchema, required: true },
		/** Powód z `customPrecheck`/`customDiagnosis`: `too_few_legs`, `few_picks`, `news_dropped`… */
		reason: { type: String, required: true, index: true },
		counts: {
			type: new mongoose.Schema(
				{ matches: Number, withOdds: Number, picks: Number, needed: Number, otherLeagues: Number },
				{ _id: false }
			),
			default: null,
		},
		/** Ile typów odrzuciły wiadomości (same mecze nie są potrzebne). */
		dropped: { type: Number, default: 0 },
		partial: { type: Boolean, default: false },
		alternatives: { type: [AlternativeSchema], default: [] },
		/** Próba z przyjętej propozycji — wskazuje próbę, przy której propozycję pokazano. */
		fromAttempt: { type: mongoose.Schema.Types.ObjectId, default: null },
		/** Przyjęta propozycja: która i czym się skończyło (`ok` — kupon powstał). */
		accepted: {
			type: new mongoose.Schema(
				{ index: Number, at: Date, outcome: { type: String, enum: ['ok', 'impossible', 'other'] } },
				{ _id: false }
			),
			default: null,
		},
		expiresAt: {
			type: Date,
			default: () => new Date(Date.now() + ATTEMPT_TTL_DAYS * 24 * 3600_000),
			index: { expires: 0 },
		},
	},
	{ timestamps: true }
);

/** Panel: ostatnie N dni od najnowszych. */
CouponGenAttemptSchema.index({ createdAt: -1 });

export default mongoose.models.CouponGenAttempt || mongoose.model('CouponGenAttempt', CouponGenAttemptSchema);
