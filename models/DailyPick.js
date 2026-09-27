import mongoose from 'mongoose';

/**
 * Typ dnia — jeden typ modelu dziennie, odkryty dla wszystkich, także bez konta.
 *
 * Wybierany RAZ na dzień (pierwsze zapytanie o dany dzień) i już się nie zmienia, nawet gdy
 * model w ciągu dnia przeliczy siły drużyn. Typ dnia jest obietnicą publiczną: pokazujemy go
 * na stronie „Typy na dziś", na liście meczów i na stronie głównej, więc musi być jeden i ten
 * sam, a po meczu rozliczony. Rozliczenie idzie przez zwykły rekord `Pick` (rodzaj `daily`),
 * więc typ dnia wchodzi do publicznej skuteczności na tych samych zasadach co reszta.
 *
 * `explanation` to liczby, z których strona składa „dlaczego" — bez modelu językowego.
 */
const DailyPickSchema = new mongoose.Schema(
	{
		/** Dzień w czasie polskim, `YYYY-MM-DD`. Jeden typ na dzień. */
		date: { type: String, required: true, unique: true },
		fixtureId: { type: String, required: true },
		leagueId: { type: Number, default: null },
		league: { type: String, default: null },
		home: { type: String, required: true },
		away: { type: String, required: true },
		kickoff: { type: Date, required: true },
		/** Klucz selekcji z `SELECTION_SHAPES` (home, X2, over25…). */
		key: { type: String, required: true },
		market: { type: String, required: true },
		selection: { type: String, required: true },
		probability: { type: Number, required: true },
		base: { type: Number, required: true },
		lift: { type: Number, required: true },
		/** Rekord typu w `Pick` — z niego status i wynik po meczu. */
		pickId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pick', default: null },
		explanation: {
			home: { type: Number, default: null },
			draw: { type: Number, default: null },
			away: { type: Number, default: null },
			lambdaHome: { type: Number, default: null },
			lambdaAway: { type: Number, default: null },
			over25: { type: Number, default: null },
		},
	},
	{ timestamps: true }
);

export default mongoose.models.DailyPick || mongoose.model('DailyPick', DailyPickSchema);
