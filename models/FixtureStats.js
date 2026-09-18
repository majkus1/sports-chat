import mongoose from 'mongoose';

/**
 * Strzały z rozegranego meczu — cechy dla kalibracji rynku „powyżej 2,5 gola".
 *
 * DLACZEGO WŁASNA KOLEKCJA, A NIE CACHE. `fixtures/statistics` u dostawcy to jedno zapytanie
 * na mecz, a model potrzebuje ostatnich dziesięciu meczów KAŻDEJ drużyny — czyli setek meczów
 * wstecz na ligę, raz pobranych i już nigdy niezmienionych. Redis z krótkim TTL by je
 * wyrzucał i płacilibyśmy za nie w kółko. Tu leżą na stałe: mecz rozegrany nie zmienia
 * swoich statystyk.
 *
 * Cztery liczby, nie cały pakiet: eksperyment (`lib/model/goalsExperiment.mjs`) mierzył
 * strzały i strzały celne, i tylko te weszły do regresji. Reszty statystyk nie trzymamy, bo
 * niczego niezmierzonego nie użyjemy.
 *
 * `null` w polu strzałów to informacja: dostawca nie ma statystyk tego meczu (niższe ligi,
 * mecze sprzed lat). Rekord i tak zostaje, żeby zbieracz nie pytał o ten mecz drugi raz.
 */
const FixtureStatsSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true, unique: true },
		leagueId: { type: Number, required: true, index: true },
		season: { type: Number, required: true },
		date: { type: Date, required: true },
		homeId: { type: Number, required: true },
		awayId: { type: Number, required: true },
		/** Strzały gospodarzy / gości (Total Shots). */
		hs: { type: Number, default: null },
		as: { type: Number, default: null },
		/** Strzały celne gospodarzy / gości (Shots on Goal). */
		hst: { type: Number, default: null },
		ast: { type: Number, default: null },
		fetchedAt: { type: Date, default: Date.now },
	},
	{ timestamps: false }
);

FixtureStatsSchema.index({ leagueId: 1, date: -1 });

export default mongoose.models.FixtureStats || mongoose.model('FixtureStats', FixtureStatsSchema);
