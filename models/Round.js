import mongoose from 'mongoose';

/**
 * Kolejka tygodniowa — wspólny zestaw meczów do typowania.
 *
 * Powód istnienia: przy swobodnym typowaniu ranking porównuje nieporównywalne. Kto obstawia
 * samych faworytów, ma wyższy procent, choć nie typuje lepiej. W kolejce wszyscy dostają
 * te same spotkania, więc wynik naprawdę mierzy umiejętność.
 *
 * Drugi efekt jest społecznościowy: wspólny zestaw daje czatowi temat, a cotygodniowy reset
 * sprawia, że ktoś dołączający w listopadzie nie zaczyna z beznadziejnej pozycji.
 */
const RoundSchema = new mongoose.Schema(
	{
		/** Klucz ISO-tygodnia, np. `2026-W34` — jedna kolejka na tydzień. */
		key: { type: String, required: true, unique: true },

		/** Mecze wybrane do kolejki, w kolejności rozpoczęcia. */
		fixtures: [
			{
				fixtureId: { type: String, required: true },
				homeName: String,
				awayName: String,
				leagueName: String,
				country: String,
				kickoff: Date,
			},
		],

		/**
		 * Typowanie zamyka się przed pierwszym meczem zestawu.
		 *
		 * Jeden termin dla całej kolejki, a nie osobny per mecz — inaczej ktoś typowałby
		 * niedzielne spotkania, znając już wyniki sobotnich, co psuje porównywalność.
		 */
		closesAt: { type: Date, required: true },

		status: { type: String, enum: ['open', 'closed', 'settled'], default: 'open', index: true },
		settledAt: { type: Date, default: null },
	},
	{ timestamps: true }
);

export default mongoose.models.Round || mongoose.model('Round', RoundSchema);
