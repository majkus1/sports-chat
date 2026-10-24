import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { hasFeature } from '@/lib/billing/entitlements';
import { hintsForDate } from '@/lib/model/hints';
import { getDailyPick, topWithDaily } from '@/lib/daily/service';
import { couponLegsForDate } from '@/lib/coupons/service';
import { hintPresenter } from '@/lib/coupons/marks';
import { localDate } from '@/lib/time';

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
			.select('plan planStatus planValidUntil role grantedFeatures createdAt')
			.lean();
	}
	const full = hasFeature(user, 'model_hints');

	try {
		const { byId, list } = await hintsForDate(date);
		/*
		 * Typ dnia jest odkryty dla wszystkich — to jego jedyny sens. Na dziś lista może go
		 * wybrać (pierwsze zapytanie dnia, kilka zapytań o kursy); na inne dni tylko czyta.
		 */
		let dzienny = null;
		try {
			dzienny = await getDailyPick(date, { create: date === localDate() });
		} catch {
			dzienny = null;
		}
		const dziennyId = dzienny ? String(dzienny.fixtureId) : null;
		/*
		 * Typ dnia i nogi kuponów z tego dnia — z zapisu, żeby przy meczu stała ta sama selekcja
		 * co na karcie typu dnia i na kuponie, ze znacznikiem „W kuponie…" (`lib/coupons/marks.js`).
		 * Kupon dnia jest za darmo; płatne kupony tylko z planem — bez planu nawet o nie nie pytamy.
		 */
		let nogi = [];
		try {
			await connectToDb();
			nogi = await couponLegsForDate(date, { unlocked: full });
		} catch {
			nogi = [];
		}
		const { present, fixtureIds } = hintPresenter({ full, daily: dzienny, couponLegs: nogi });
		// Bez planu: sam fakt, bez liczb — patrz komentarz na górze; typ dnia i kupon dnia odkryte.
		const pokaz = (fixtureId, hint) => present(fixtureId, hint) ?? { locked: true };

		const out = {};
		for (const [fixtureId, hint] of byId) out[fixtureId] = pokaz(fixtureId, hint);
		// Mecz z zapisu, którego plakietki model już nie pokazuje (przeliczył się po publikacji kuponu).
		for (const fixtureId of fixtureIds) if (!out[fixtureId]) out[fixtureId] = pokaz(fixtureId, null);

		/*
		 * Lista jest posortowana po przewadze; panel dostaje mecz, godzinę i ligę zawsze,
		 * a selekcję z liczbami — według planu, tak samo jak plakietki.
		 *
		 * TYP DNIA ZAWSZE NA GÓRZE. Wybiera się go najpierw po randze rozgrywek, potem po
		 * przewadze, więc bywa spoza piątki najmocniejszych — i wtedy darmowy użytkownik
		 * widział w panelu pięć kłódek, a jedynego odkrytego typu nie widział wcale.
		 */
		const top = topWithDaily(list, dziennyId, TOP).map((w) => ({
			fixtureId: w.fixtureId,
			home: w.home,
			away: w.away,
			league: w.league,
			kickoff: w.kickoff,
			hint: pokaz(w.fixtureId, w.hint),
		}));
		return Response.json({ hints: out, top, count: list.length, full });
	} catch (error) {
		console.warn('[model-hints] nie udało się policzyć podpowiedzi:', error.message);
		// Brak plakietek nie jest błędem listy — lista ma działać bez nich.
		return Response.json({ hints: {}, top: [], count: 0, full });
	}
}
