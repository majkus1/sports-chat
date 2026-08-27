import mongoose from 'mongoose';

/**
 * Oświadczenie konsumenta odebrane przed płatnością.
 *
 * Zapisujemy DOSŁOWNE brzmienie tekstu, który kupujący zobaczył, a nie sam znacznik „zgodził
 * się". Przy sporze pytanie nie brzmi „czy kliknął", tylko „na co dokładnie". Tekst z czasem
 * się zmienia; wersja regulaminu i data mówią, która redakcja obowiązywała w tej chwili.
 *
 * Rekord powstaje PRZED utworzeniem sesji Stripe'a i dopiero potem dostaje jej identyfikator.
 * Odwrotna kolejność zostawiałaby okno, w którym płatność już istnieje, a oświadczenia nie ma.
 */
const PurchaseConsentSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

		/** `credits` albo `plan`. */
		itemKind: { type: String, required: true },

		/** Identyfikator z cennika: `pack_15`, `pro`, `vip`. */
		itemId: { type: String, required: true },

		/** Cena w groszach, taka jaką pokazano przy oświadczeniu. */
		priceGrosze: { type: Number, required: true },

		/** Język, w którym wyświetlono tekst. */
		locale: { type: String, required: true },

		/** Dosłowna treść oświadczenia — dowód, nie opis. */
		statement: { type: String, required: true },

		/** Wersja regulaminu obowiązująca w chwili odebrania oświadczenia. */
		termsVersion: { type: String, required: true },

		/**
		 * Identyfikator sesji Stripe'a. Pusty tylko w wąskim oknie między zapisem oświadczenia
		 * a utworzeniem sesji — albo gdy Stripe odrzucił żądanie i do płatności nie doszło.
		 */
		sessionId: { type: String, default: null, index: true },

		/** Kontekst techniczny do odtworzenia okoliczności. */
		ip: { type: String, default: null },
		userAgent: { type: String, default: null },
	},
	{ timestamps: true }
);

// Historia oświadczeń użytkownika czytana od najnowszych.
PurchaseConsentSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.PurchaseConsent ||
	mongoose.model('PurchaseConsent', PurchaseConsentSchema);
