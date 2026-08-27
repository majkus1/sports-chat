import mongoose from 'mongoose';

/**
 * Księga kredytów — każda zmiana salda z powodem i kluczem idempotencji.
 *
 * Dwa zadania w jednym miejscu.
 *
 * Po pierwsze IDEMPOTENCJA. Stripe gwarantuje dostarczenie zdarzenia CO NAJMNIEJ raz, nie
 * dokładnie raz; to samo `checkout.session.completed` potrafi przyjść kilkukrotnie. Unikalny
 * indeks na `idempotencyKey` sprawia, że drugi zapis po prostu się nie uda i doładowanie
 * nie zostanie naliczone dwa razy. Sprawdzenie MUSI iść przed dopisaniem kredytów.
 *
 * Po drugie AUDYT. Saldo w `User.credits` mówi „ile", ale nie mówi „skąd". Przy reklamacji
 * albo sporze o płatność liczy się historia: kiedy doładowano, z jakiej sesji Stripe, co
 * i kiedy zużyto. Bez księgi jedyną odpowiedzią byłoby „system tak wyliczył".
 */
const CreditLedgerSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

		/**
		 * Zmiana salda: dodatnia przy zakupie, ujemna przy zużyciu.
		 *
		 * Zapisujemy różnicę, a nie stan po operacji — stan da się odtworzyć sumą, a różnica
		 * jest odporna na zapisy przychodzące nie po kolei.
		 */
		amount: { type: Number, required: true },

		/** `purchase:pack_15`, `spend:analysis`, `refund:...`, `grant:admin`. */
		reason: { type: String, required: true },

		/**
		 * Klucz jednoznaczności zdarzenia.
		 *
		 * Dla Stripe'a to `stripe:event:evt_...` — identyfikator zdarzenia, nie sesji, bo
		 * jedna sesja może wygenerować kilka zdarzeń i każde ma być rozliczone osobno.
		 */
		idempotencyKey: { type: String, required: true, unique: true },

		/** Surowe szczegóły do wglądu przy reklamacji: id sesji, kwota, waluta, e-mail. */
		details: { type: mongoose.Schema.Types.Mixed, default: {} },
	},
	{ timestamps: true }
);

// Historia konta czytana jest od najnowszych — indeks złożony obsługuje to jednym przejściem.
CreditLedgerSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.models.CreditLedger || mongoose.model('CreditLedger', CreditLedgerSchema);
