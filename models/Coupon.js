import mongoose from 'mongoose';

/**
 * Kupon dnia (za darmo), 3-dniowy i 5-dniowy — dwa ostatnie w planie Pro i VIP. Od 25.10.2026
 * wszystkie z kursem łącznym 2,4–2,8 (wcześniej ok. 2,0, 2,0 i 3,0 — starsze zapisy zostają, jakie
 * były). Do 18.10.2026 był też weekendowy (zostaje w historii).
 *
 * Wybierany RAZ (pierwszy przebieg po 9:30, codziennie każdy rodzaj) i już się nie zmienia —
 * to obietnica publiczna, rozliczana po meczach. Gdy pula dnia nie pozwala złożyć kuponu
 * w ramach zasad, zapisujemy `status: 'none'`, żeby nie próbować w kółko.
 *
 * KURSY W INTERFEJSIE — świadoma decyzja właściciela (październik 2026): kupon bez kursu nie ma
 * sensu, więc pokazujemy medianę bukmacherów z chwili wyboru, bez nazw bukmacherów i linków.
 * Szczegóły wyboru i rozliczenia: `lib/coupons/build.js`.
 *
 * WŁASNE KUPONY (`custom`, od 25.10.2026): użytkownik planu z kreatorem składa kupon według swoich
 * ustawień (`lib/coupons/custom.js`). Ten sam kształt nóg, więc rozlicza go ten sam przebieg co 20
 * minut — ale to nie obietnica publiczna: należy do konta (`userId`) i nie wchodzi do żadnego
 * publicznego bilansu (`PUBLIC_COUPON_TYPES` w `build.js`).
 */
/** Werdykt sprawdzenia wiadomości przez AI (płatne kupony, `lib/coupons/news.js`). */
const LegNewsSchema = new mongoose.Schema(
	{
		verdict: { type: String, enum: ['ok', 'unknown'], default: 'unknown' },
		sources: { type: [{ title: String, url: String, _id: false }], default: [] },
	},
	{ _id: false }
);

/**
 * Notka terminarza przy typie (`lib/football/schedule.js`, od 25.10.2026) — zapisywana TYLKO, gdy
 * któraś drużyna ma sygnał: puchar w środku tygodnia, krótka przerwa, ważny mecz kilka dni później.
 * W obu językach, bo kupon zapisujemy raz, a karta renderuje się w języku czytelnika.
 */
const LegScheduleSchema = new mongoose.Schema({ pl: String, en: String }, { _id: false });

/** Typ odrzucony po sprawdzeniu wiadomości — pokazywany przy kuponie, żeby było widać, co AI odsiało. */
const DroppedLegSchema = new mongoose.Schema(
	{
		fixtureId: String,
		homeName: String,
		awayName: String,
		selection: String,
		reason: String,
	},
	{ _id: false }
);

const LegSchema = new mongoose.Schema(
	{
		fixtureId: { type: String, required: true },
		homeName: { type: String, required: true },
		awayName: { type: String, required: true },
		leagueId: { type: Number, default: null },
		league: { type: String, default: null },
		kickoff: { type: Date, required: true },
		/** Klucz plakietki (`home`, `X2`, `awayScores`…) i jej opis. */
		key: { type: String, required: true },
		selection: { type: String, required: true },
		probability: { type: Number, required: true },
		base: { type: Number, default: null },
		/** Mediana bukmacherów w chwili wyboru (kurs dziesiętny). */
		odds: { type: Number, required: true },
		/** Po meczu: `won` / `lost` / `void` (mecz odwołany) i wynik z 90 minut. */
		status: { type: String, enum: ['pending', 'won', 'lost', 'void'], default: 'pending' },
		score: { type: String, default: null },
		/** Tylko płatne kupony: czy AI sprawdziło wiadomości o tym meczu przed publikacją. */
		news: { type: LegNewsSchema, default: null },
		/** Terminarz drużyn tego meczu — krótka notka tylko przy sygnale, inaczej `null`. */
		schedule: { type: LegScheduleSchema, default: null },
		/** Kupon live: minuta i wynik w chwili wyboru oraz uzasadnienie AI. */
		minute: { type: Number, default: null },
		liveScore: { type: String, default: null },
		why: { type: String, default: null },
		/** Kupon live: skąd szansa — `model` (liga modelu) albo `market` (kursy sprzed meczu + wynik i minuta). */
		source: { type: String, enum: ['model', 'market', null], default: null },
	},
	{ _id: false }
);

/**
 * Ustawienia, z którymi użytkownik złożył własny kupon w kreatorze (`lib/coupons/custom.js`) —
 * zapisane przy kuponie, żeby „Moje kupony" pokazywały, o co prosił, a nie tylko, co wyszło.
 */
const CustomParamsSchema = new mongoose.Schema(
	{
		/** Cel kursu łącznego: `2.0`, `2.5` albo `3.0` (widełki w `CUSTOM_ODDS`). */
		odds: String,
		/** Najwyżej tyle meczów (2–5). */
		legs: Number,
		/** Okno pierwszego gwizdka: `today`, `evening`, `h24`, `days3`. */
		window: String,
		/** Grupy rozgrywek (`LEAGUE_GROUPS`); pusto — wszystkie. */
		leagues: { type: [String], default: [] },
		/** Bez meczów z kuponów serwisu (dnia, 3- i 5-dniowego). */
		skipPublished: Boolean,
	},
	{ _id: false }
);

const CouponSchema = new mongoose.Schema(
	{
		/**
		 * `daily|days3|days5:YYYY-MM-DD` (dzień publikacji; dawny `weekend:` — data piątku), `live:<slot>`,
		 * a własny kupon z kreatora — `custom:<userId>:<znacznik czasu>`. Jeden kupon na klucz.
		 */
		key: { type: String, required: true, unique: true },
		/**
		 * `custom` — własny kupon użytkownika z kreatora. Rozliczany jak każdy inny, ale NIGDY nie wchodzi
		 * do publicznej skuteczności, bilansów ani znaczników przy meczach (`PUBLIC_COUPON_TYPES`).
		 */
		type: { type: String, enum: ['daily', 'days3', 'days5', 'weekend', 'live', 'custom'], required: true, index: true },
		/** Dzień publikacji (przy `custom` — złożenia) w czasie polskim. */
		date: { type: String, required: true, index: true },
		/** Tylko `custom`: właściciel kuponu. Kupony serwisu tego pola nie mają. */
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
		/** Tylko `custom`: ustawienia z kreatora. */
		params: { type: CustomParamsSchema, default: undefined },
		legs: { type: [LegSchema], default: [] },
		/** Iloczyn kursów i iloczyn szans modelu (procent) — z chwili wyboru. */
		totalOdds: { type: Number, default: null },
		chance: { type: Number, default: null },
		status: { type: String, enum: ['pending', 'won', 'lost', 'void', 'none'], default: 'pending', index: true },
		settledAt: { type: Date, default: null },
		/**
		 * Sprawdzenie wiadomości przez AI przed publikacją (płatne kupony): ile typów sprawdzono,
		 * które odrzucono i dlaczego; `skipped` — powód, gdy sprawdzenia nie było (próg wydatków).
		 */
		newsCheck: {
			type: new mongoose.Schema(
				{
					checked: { type: Number, default: 0 },
					dropped: { type: [DroppedLegSchema], default: [] },
					skipped: { type: String, default: null },
					at: { type: Date, default: null },
				},
				{ _id: false }
			),
			default: null,
		},
	},
	{ timestamps: true }
);

/**
 * „Moje kupony": ostatnie kupony jednego użytkownika. Indeks częściowy — tylko kupony z kreatora,
 * więc kupony serwisu (bez `userId`) nie zajmują w nim miejsca.
 */
CouponSchema.index({ userId: 1, createdAt: -1 }, { partialFilterExpression: { type: 'custom' } });

export default mongoose.models.Coupon || mongoose.model('Coupon', CouponSchema);
