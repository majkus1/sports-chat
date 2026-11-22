import mongoose from 'mongoose';

/**
 * Zdjęcia kursów dla REJESTRU TYPÓW (`lib/trust`) — tam, gdzie dziennik prognoz ich nie ma.
 *
 * Dziennik (`ModelForecast.odds`) zdejmuje kursy rano i przed meczem, ale tylko meczom, które
 * policzył model liczbowy. Pomiar 21.11.2026: z 1342 opublikowanych typów 130 (raporty i analizy
 * z pucharów i lig spoza listy) nie miało dziennika, więc nie miało ani kursu z rana, ani
 * zamknięcia. Do tego 97 typów zapisano PO porannym zdjęciu — dla nich poranny kurs nie był
 * do wzięcia, więc potrzebują własnego zdjęcia z chwili publikacji.
 *
 * Osobna kolekcja, nie pole w `ModelForecast`: dziennik jest materiałem do pomiaru modelu
 * i nie powinien dostawać meczów, których model nie liczył. Jeden dokument na mecz.
 *
 * KOSZT: kilka–kilkanaście zapytań do dostawcy dziennie (ok. 2–3 mecze bez dziennika × 2 zdjęcia
 * + ok. 2 zdjęcia przy publikacji) przy budżecie 7500.
 */
const SnapshotSchema = new mongoose.Schema(
	{
		at: { type: Date, required: true },
		bookmakers: { type: Number, default: null },
		home: { type: Number, default: null },
		draw: { type: Number, default: null },
		away: { type: Number, default: null },
		dc1X: { type: Number, default: null },
		dcX2: { type: Number, default: null },
		homeScores: { type: Number, default: null },
		awayScores: { type: Number, default: null },
		over25: { type: Number, default: null },
	},
	{ _id: false }
);

const RegisterOddsSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true, unique: true },
		kickoff: { type: Date, required: true, index: true },
		/** Rano (to samo okno co dziennik) — tylko mecze bez dziennika. */
		open: { type: SnapshotSchema, default: null },
		/** 10–30 minut przed meczem — tylko mecze bez dziennika. */
		close: { type: SnapshotSchema, default: null },
		/** Zdjęcia po publikacji typu zapisanego, gdy poranne już było (każdy mecz). */
		after: { type: [SnapshotSchema], default: [] },
	},
	{ timestamps: true }
);

export default mongoose.models.RegisterOdds || mongoose.model('RegisterOdds', RegisterOddsSchema);
