import mongoose from 'mongoose';

/**
 * Licznik okien zakupu: jeden dokument na (dzień, miejsce), same sumy.
 *
 * CELOWO BEZ DANYCH OSOBOWYCH. Nie ma tu identyfikatora konta, adresu IP, przeglądarki ani
 * godziny — tylko „ile razy pokazano / kliknięto / zaczęto płatność / zapłacono" w danym miejscu
 * danego dnia. Do decyzji „które miejsce działa" więcej nie trzeba, a zbiór, z którego nie da się
 * odtworzyć zachowania jednej osoby, nie jest przetwarzaniem danych osobowych w rozumieniu RODO.
 *
 * Dzień w czasie polskim (`lib/time.js`), żeby wieczorne wejścia nie wpadały do następnej doby UTC.
 */
const UpsellStatSchema = new mongoose.Schema(
	{
		/** `YYYY-MM-DD` w strefie Europe/Warsaw. */
		day: { type: String, required: true },
		/** Klucz z `lib/upsell/placements.js`. */
		placement: { type: String, required: true },
		views: { type: Number, default: 0 },
		clicks: { type: Number, default: 0 },
		checkouts: { type: Number, default: 0 },
		purchases: { type: Number, default: 0 },
	},
	{ timestamps: false, versionKey: false }
);

UpsellStatSchema.index({ day: 1, placement: 1 }, { unique: true });

export default mongoose.models.UpsellStat || mongoose.model('UpsellStat', UpsellStatSchema);
