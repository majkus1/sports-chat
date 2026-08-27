import mongoose from 'mongoose';

/**
 * Ślad po każdym płatnym wywołaniu modelu.
 *
 * Do tej pory jedynym zapisem zużycia był licznik w Redisie, który resetuje się o północy
 * i nic nie mówi o koszcie. Bez tego dziennika nie da się odpowiedzieć ani „ile nas
 * kosztuje jeden użytkownik", ani „za co dokładnie zapłaciliśmy w zeszłym tygodniu",
 * a jedno i drugie jest potrzebne przed wystawieniem planów płatnych.
 */
const UsageLogSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
		/** Dla niezalogowanych — jedyny sposób powiązania zużycia z kimkolwiek. */
		ip: { type: String, default: null },

		kind: { type: String, required: true, enum: ['analysis', 'aiChat', 'report'], index: true },
		plan: { type: String, default: null },

		provider: { type: String, default: null },
		model: { type: String, default: null },
		tokensIn: { type: Number, default: null },
		tokensOut: { type: Number, default: null },
		costUsd: { type: Number, default: null },

		/** Kontekst, żeby dało się dojść, czego dotyczyło wywołanie. */
		fixtureId: { type: String, default: null },
		chatId: { type: String, default: null },

		/** Rok historii wystarcza do rozliczeń; starsze wpisy kasują się same. */
		expiresAt: {
			type: Date,
			default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
			index: { expires: 0 },
		},
	},
	{ timestamps: true }
);

/** Typowe zapytanie: „ile ten użytkownik zużył w danym okresie". */
UsageLogSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.UsageLog || mongoose.model('UsageLog', UsageLogSchema);
