import mongoose from 'mongoose';

/**
 * Pojedynczy typ wystawiony przez AI — osobna kolekcja, nie pole w analizie.
 *
 * Trzy powody, dla których typy nie mogą mieszkać w `MatchAnalysis.sections`:
 *  1. Analizy meczów na żywo mają TTL 15 minut i same się kasują — typ zniknąłby,
 *     zanim mecz się skończy i dałoby się go rozliczyć.
 *  2. Skuteczność liczymy agregacją po tysiącach typów; przeszukiwanie zagnieżdżonych
 *     tablic w dokumentach analiz byłoby wielokrotnie wolniejsze.
 *  3. Ten sam mecz może mieć analizę przedmeczową i live — potrzebujemy ich rozróżnić.
 *
 * Rekord powstaje w chwili wygenerowania typu (`status: 'pending'`), a zadanie wsadowe
 * uzupełnia wynik po zakończeniu meczu.
 */
const PickSchema = new mongoose.Schema(
	{
		/**
		 * Kto wystawił typ. Rozdzielone od `kind`, bo to dwie niezależne osie: użytkownik
		 * też typuje przedmeczowo, więc filtr „przedmeczowe" musi obejmować jedno i drugie.
		 * Dzięki temu da się też zestawić AI z ludźmi na tym samym rynku.
		 */
		author: { type: String, enum: ['ai', 'user'], default: 'ai', index: true },

		/** Kiedy typ powstaje względem meczu — decyduje o filtrach w statystykach. */
		kind: { type: String, enum: ['prematch', 'live', 'report'], required: true, index: true },

		source: { type: String, enum: ['analysis', 'report', 'user'], required: true },
		/** Dokument źródłowy; może już nie istnieć (analiza live kasuje się z TTL). */
		sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },

		fixtureId: { type: String, required: true, index: true },
		/** Kto wywołał generowanie — podstawa statystyk „moja skuteczność". */
		userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

		market: { type: String, required: true },
		selection: { type: String, required: true },
		/** Deklarowane przez model prawdopodobieństwo i pewność — do analizy kalibracji. */
		probability: { type: Number, default: null },
		confidence: { type: Number, default: null },

		/** Uzasadnienie od użytkownika — pokazywane innym przy typie. */
		comment: { type: String, default: null },
		/**
		 * Kto zadeklarował, że bierze ten sam typ.
		 *
		 * Tablica identyfikatorów zamiast licznika: bez tego nie dałoby się zablokować
		 * drugiego kliknięcia tej samej osoby ani pokazać, czy sam już wziąłeś.
		 */
		followers: { type: [mongoose.Schema.Types.ObjectId], default: [] },

		/** Znormalizowana postać typu; `null` gdy parser nie rozpoznał rynku. */
		normalized: { type: mongoose.Schema.Types.Mixed, default: null },

		homeName: { type: String, default: null },
		awayName: { type: String, default: null },
		leagueName: { type: String, default: null },
		kickoff: { type: Date, default: null, index: true },

		/*
		 * KONTEKST POWSTANIA TYPU — do porównywania wersji między sobą.
		 *
		 * Bez tych pól skuteczność jest jedną liczbą bez wyjaśnienia. Nie da się odpowiedzieć
		 * na pytanie „czy nowa wersja promptu jest lepsza", bo typy z obu wersji leżą w jednym
		 * worku; nie da się też sprawdzić, czy słabe wyniki biorą się z ubogich danych, czy
		 * z samego modelu. Zapisujemy w chwili powstania, bo później nie ma jak odtworzyć —
		 * analiza live kasuje się po 15 minutach.
		 */

		/** Wersja instrukcji, z której powstał typ (`match-analysis/7`, `report/2`). */
		promptVersion: { type: String, default: null, index: true },

		/** Model językowy, który go wygenerował — z datą wydania, tak jak zwraca dostawca. */
		modelVersion: { type: String, default: null },

		/** Samoocena kompletności danych z analizy: `good` / `limited` / `insufficient`. */
		dataQuality: { type: String, default: null },

		leagueId: { type: Number, default: null },
		/** Poziom rozgrywek z `lib/football/leagues.js`; `null` poza obsługiwaną listą. */
		leagueTier: { type: Number, default: null },

		/** Sekcje pakietu danych faktycznie obecne przy generowaniu. */
		sectionsPresent: { type: [String], default: [] },

		/*
		 * Czy typ wchodzi do publicznej statystyki skuteczności.
		 *
		 * Typ postawiony na szczątkowych danych rozstrzyga się tak samo jak każdy inny, ale
		 * wliczanie go do liczby pokazywanej na stronie głównej byłoby nieuczciwe w obie
		 * strony: przy trafieniu zawyża, przy chybieniu karze model za to, że dostawca nie
		 * ma danych o czwartej lidze. Typ zostaje widoczny przy meczu, tylko nie w statystyce.
		 */
		countsToStats: { type: Boolean, default: true, index: true },

		/**
		 * Dlaczego typ wypadł ze statystyki: `market_not_predictable`, `below_market_threshold`,
		 * `market_not_measured`. `null` znaczy, że przeszedł. Bez tego pola wiadomo tylko, że
		 * czegoś nie liczymy, ale nie wiadomo, czy to wina rynku, progu, czy danych.
		 */
		policyReason: { type: String, default: null },

		/**
		 * Kolejka tygodniowa, do której typ należy (`2026-W34`) albo `null` dla typów
		 * postawionych poza zestawem. Zapisywane przy tworzeniu typu, żeby późniejsza
		 * zmiana składu kolejki nie przepisywała historii rankingu.
		 */
		roundKey: { type: String, default: null, index: true },

		/*
		 * `void` to typ świadomie wyłączony ze statystyk: rynku nie da się rozstrzygnąć
		 * końcowym wynikiem (np. „następna bramka") albo parser go nie rozpoznał.
		 * Zgadywanie zamiast pomijania psułoby wiarygodność całej skuteczności.
		 */
		status: {
			type: String,
			enum: ['pending', 'won', 'lost', 'void'],
			default: 'pending',
			index: true,
		},
		voidReason: { type: String, default: null },

		settledAt: { type: Date, default: null },
		finalScore: {
			home: { type: Number, default: null },
			away: { type: Number, default: null },
		},
	},
	{ timestamps: true }
);

/** Zadanie wsadowe szuka typów czekających na rozliczenie po dacie meczu. */
PickSchema.index({ status: 1, kickoff: 1 });
/** Statystyki „moje" filtrują po użytkowniku i rodzaju. */
PickSchema.index({ userId: 1, status: 1, kind: 1 });
/** Ten sam typ nie może wpaść dwa razy przy ponownym generowaniu analizy. */
PickSchema.index({ fixtureId: 1, kind: 1, market: 1, selection: 1, userId: 1 }, { unique: true });

/**
 * Jeden typ użytkownika na mecz.
 *
 * Bez tego dałoby się obstawić wszystkie możliwe wyniki i mieć zawsze rację — indeks
 * częściowy obejmuje wyłącznie wpisy autorstwa użytkownika, żeby nie kolidował z typami AI.
 */
PickSchema.index(
	{ userId: 1, fixtureId: 1 },
	{ unique: true, partialFilterExpression: { author: 'user' } }
);

/** Ranking: skuteczność liczona per użytkownik po rozstrzygniętych typach. */
PickSchema.index({ author: 1, status: 1, userId: 1 });

export default mongoose.models.Pick || mongoose.model('Pick', PickSchema);
