import { fixturesByDate } from '@/lib/football/endpoints';

/**
 * Mecze w danym dniu — stronicowane po stronie serwera.
 *
 * Dostawca oddaje cały dzień jednym (cache'owanym) wywołaniem, ale przeglądarka nie musi
 * dostawać kompletu: pełna sobota to 800+ meczów i ~2 MB JSON-a, z których lista i tak
 * pokazuje 50. Filtr wyszukiwania i odsiew meczów już rozpoczętych też muszą siedzieć
 * tutaj — inaczej numeracja stron nie zgadzałaby się z tym, co widzi użytkownik.
 *
 * Kształt elementów `response` pozostaje surowy (kontrakt FixtureRow); nowe jest pole
 * `paging` i parametry `page`, `pageSize`, `search`, `upcoming`.
 */

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const dateParam = searchParams.get('date');

	const today = new Date();
	const fallback = `${today.getFullYear()}-${(today.getMonth() + 1)
		.toString()
		.padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

	const date = /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam : fallback;

	const page = Math.max(1, Number(searchParams.get('page')) || 1);
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE)
	);
	const search = (searchParams.get('search') || '').trim().toLowerCase();
	// `upcoming=1` — tylko mecze, które jeszcze się nie zaczęły (widok przedmeczowy).
	const upcomingOnly = searchParams.get('upcoming') === '1';

	try {
		const all = await fixturesByDate(date);
		const now = Date.now();

		const filtered = all.filter((fixture) => {
			if (upcomingOnly) {
				const kickoff = Date.parse(fixture?.fixture?.date);
				if (!Number.isFinite(kickoff) || kickoff <= now) return false;
			}
			if (!search) return true;

			const haystack = [
				fixture?.league?.name,
				fixture?.league?.country,
				fixture?.teams?.home?.name,
				fixture?.teams?.away?.name,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return haystack.includes(search);
		});

		const total = filtered.length;
		const totalPages = Math.max(1, Math.ceil(total / pageSize));
		const safePage = Math.min(page, totalPages);
		const slice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

		return Response.json(
			{
				response: slice,
				paging: { page: safePage, pageSize, total, totalPages },
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('[fixtures] błąd pobierania:', error.message);
		return Response.json({ message: 'Error fetching fixtures' }, { status: 502 });
	}
}
