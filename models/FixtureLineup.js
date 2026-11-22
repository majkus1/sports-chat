import mongoose from 'mongoose';

/**
 * Składy i nieobecni jednego meczu (`lib/football/lineupsJob.js`) — jeden dokument na mecz.
 *
 * DWIE ROLE. (1) Przed meczem: lista nieobecnych od dostawcy (`injuries`), potwierdzona wyjściowa
 * jedenastka (`teams`, zwykle 20–60 minut przed meczem) i policzona z nich siła składu (`squad`) —
 * to czytają kupony, typ dnia, plakietki, strona meczu i asystent. (2) Po meczu: ta sama jedenastka
 * i strzelcy (`goals`, `final: true`) — HISTORIA, z której liczy się „podstawowa jedenastka" kolejnych
 * meczów obu drużyn. Bez własnego zapisu każda drużyna kosztowałaby co mecz zapytanie o 10 poprzednich.
 *
 * TTL 150 dni, jak inne zdjęcia (`FixtureSnapshot` — 30): historia ma pokryć 10 ostatnich meczów także
 * drużyny po przerwie reprezentacyjnej i zimowej (ok. 2–3 miesiące), z zapasem. Pomiar trzyma liczby
 * w dzienniku prognoz (`ModelForecast.lineup`), który nie wygasa — stąd zapis tu może zniknąć.
 */
const PlayerSchema = new mongoose.Schema(
	{ id: Number, name: String, number: Number, pos: String },
	// `id: false` — pole `id` to identyfikator gracza u dostawcy, nie wirtualny `id` Mongoose'a.
	{ _id: false, id: false }
);

const TeamLineupSchema = new mongoose.Schema(
	{
		teamId: Number,
		teamName: String,
		formation: String,
		coach: String,
		startXI: { type: [PlayerSchema], default: [] },
		substitutes: { type: [PlayerSchema], default: [] },
	},
	{ _id: false }
);

const FixtureLineupSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true, unique: true },
		kickoff: { type: Date, default: null, index: true },
		leagueId: { type: Number, default: null },
		season: { type: Number, default: null },
		homeId: { type: Number, default: null, index: true },
		awayId: { type: Number, default: null, index: true },
		homeName: { type: String, default: null },
		awayName: { type: String, default: null },
		status: { type: String, default: null },

		/** Wyjściowe jedenastki i rezerwowi; pusto — dostawca jeszcze (albo w ogóle) ich nie podał. */
		teams: { type: [TeamLineupSchema], default: [] },
		/** Kiedy przyszła potwierdzona jedenastka przed meczem; `null` — jeszcze nie. */
		lineupAt: { type: Date, default: null },
		/** Zapis po meczu (`fixtures?ids=` ze statusem FT/AET/PEN): składy i strzelcy są ostateczne. */
		final: { type: Boolean, default: false, index: true },
		/** Gole z autorami (bez samobójów) — do „najlepszego strzelca" drużyny. */
		goals: { type: [{ teamId: Number, playerId: Number, playerName: String, assistId: Number, _id: false }], default: [] },

		/** Nieobecni od dostawcy: `type` „Missing Fixture" (pewny brak) albo „Questionable". */
		injuries: {
			type: [{ teamId: Number, playerId: Number, playerName: String, type: { type: String }, reason: String, _id: false }],
			default: [],
		},
		injuriesAt: { type: Date, default: null },

		/**
		 * Siła składu obu drużyn z ostatniego przeliczenia (`squadStrength` + klucze podstawowych do oznaczenia
		 * ich w jedenastce). Luźny kształt — miara bywa rozszerzana, a to zapis pomocniczy z TTL.
		 */
		squad: { type: mongoose.Schema.Types.Mixed, default: null },
		squadAt: { type: Date, default: null },

		expiresAt: {
			type: Date,
			default: () => new Date(Date.now() + 150 * 24 * 3600_000),
			index: { expires: 0 },
		},
	},
	{ timestamps: true }
);

export default mongoose.models.FixtureLineup || mongoose.model('FixtureLineup', FixtureLineupSchema);
