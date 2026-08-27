import mongoose from 'mongoose';

/**
 * Ulubiony mecz użytkownika.
 *
 * Obok identyfikatora trzymamy migawkę danych do wyświetlenia (nazwy, herby, liga,
 * godzina) — lista ulubionych w panelu renderuje się wtedy natychmiast, bez odpytywania
 * API piłkarskiego o każdy zapisany mecz. Migawkę buduje serwer z cache'owanego
 * `fixtures?id=`, więc klient nie może podstawić fałszywych danych.
 */
const FavoriteMatchSchema = new mongoose.Schema(
	{
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
		fixtureId: { type: String, required: true },

		homeName: { type: String, required: true },
		awayName: { type: String, required: true },
		leagueName: { type: String, default: null },
		country: { type: String, default: null },
		/** Godzina rozpoczęcia — po niej panel grupuje na nadchodzące / w grze / zakończone. */
		kickoff: { type: Date, default: null },
	},
	{ timestamps: true }
);

/** Jeden mecz raz na konto; lista czyta zawsze po właścicielu. */
FavoriteMatchSchema.index({ userId: 1, fixtureId: 1 }, { unique: true });

export default mongoose.models.FavoriteMatch ||
	mongoose.model('FavoriteMatch', FavoriteMatchSchema);
