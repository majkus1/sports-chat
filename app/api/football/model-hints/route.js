import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { hasFeature } from '@/lib/billing/entitlements';
import { hintsForDate } from '@/lib/model/hints';

/**
 * Podpowiedzi modelu dla listy meczów z jednego dnia.
 *
 * Osobna trasa, nie pole w `/api/football/fixtures` — celowo. Lista ma się pokazać
 * natychmiast z terminarza, a plakietki dojść chwilę później; przy zimnym cache'u modeli
 * pierwsze liczenie dnia dopasowuje kilkanaście lig i trwa sekundy. Wpięcie tego w trasę
 * terminarza opóźniałoby całą listę o rzecz, która jest dodatkiem.
 *
 * ODPOWIEDŹ ZALEŻY OD PLANU, ALE LICZY SIĘ RAZ. Rachunek (`hintsForDate`) jest wspólny
 * z asystentem i trzymany w pamięci procesu dziesięć minut; plan decyduje wyłącznie o tym,
 * ile z wyniku wychodzi na zewnątrz.
 * Darmowy dostaje sam fakt („model ma tu typ"), płatny — selekcję i przewagę. Dzięki temu
 * darmowy użytkownik widzi, ILE model ma do powiedzenia, a nie CO — i to jest właściwy
 * powód, żeby zajrzeć do cennika.
 */

/**
 * Ile typów idzie do panelu „Model widzi". Tyle samo co w porannym mailu — to ta sama
 * piątka, żeby użytkownik nie widział rano jednego, a na stronie innego zestawu.
 */
const TOP = 5;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const date = searchParams.get('date');
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
		return Response.json({ error: 'invalid_date' }, { status: 400 });
	}

	// Plan ustalamy tą samą drogą co reszta tras; niezalogowany = darmowy.
	const session = await getAuthenticatedUser();
	let user = null;
	if (session?.userId) {
		await connectToDb();
		user = await User.findById(session.userId)
			.select('plan planStatus planValidUntil role grantedFeatures')
			.lean();
	}
	const full = hasFeature(user, 'model_hints');

	try {
		const { byId, list } = await hintsForDate(date);
		const out = {};
		for (const [fixtureId, hint] of byId) {
			out[fixtureId] = full
				? hint
				: // Sam fakt, bez liczb — patrz komentarz na górze.
					{ locked: true };
		}
		// Lista jest posortowana po przewadze; panel dostaje mecz, godzinę i ligę zawsze,
		// a selekcję z liczbami — według planu, tak samo jak plakietki.
		const top = list.slice(0, TOP).map((w) => ({
			fixtureId: w.fixtureId,
			home: w.home,
			away: w.away,
			league: w.league,
			kickoff: w.kickoff,
			hint: full ? w.hint : { locked: true },
		}));
		return Response.json({ hints: out, top, count: list.length, full });
	} catch (error) {
		console.warn('[model-hints] nie udało się policzyć podpowiedzi:', error.message);
		// Brak plakietek nie jest błędem listy — lista ma działać bez nich.
		return Response.json({ hints: {}, top: [], count: 0, full });
	}
}
