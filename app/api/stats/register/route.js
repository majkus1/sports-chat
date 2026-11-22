import connectToDb from '@/lib/db';
import { isPageParam, readParam } from '@/lib/urlState';
import {
	DEFAULT_LEAGUE,
	DEFAULT_MARKET,
	DEFAULT_PERIOD,
	isLeagueParam,
	REGISTER_MARKETS,
	REGISTER_PERIODS,
} from '@/lib/trust/params';
import { registerResponse, registerTeaser } from '@/lib/trust/service';

/**
 * Publiczny rejestr typów AI (`lib/trust`) — bez logowania, jeden widok dla wszystkich.
 *
 * Parametry (nieznana wartość wraca do domyślnej, jak w adresie strony):
 *   period=7|30|90|all     okres po dacie meczu (domyślnie 30)
 *   market=all|matchWinner|doubleChance|teamGoals|totalGoals
 *   league=all|<id ligi>
 *   page=1..               strona listy, po 25 typów
 *   teaser=1               skrót na stronę główną (sumy całości i 30 dni + 5 ostatnich typów)
 *
 * Pamięć: wiersze rejestru 5 minut w procesie (`lib/trust/service.js`), odpowiedź minutę
 * w przeglądarce i 5 minut w pośrednikach. Ta sama odpowiedź dla każdego — nic tu nie zależy
 * od sesji, a typy przed meczem są w niej zamknięte dla wszystkich jednakowo.
 */
const NAGLOWKI = { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600' };

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	try {
		await connectToDb();
		if (searchParams.get('teaser') === '1') {
			return Response.json(await registerTeaser(), { headers: NAGLOWKI });
		}
		const filters = {
			period: readParam(searchParams.get('period'), REGISTER_PERIODS, DEFAULT_PERIOD),
			market: readParam(searchParams.get('market'), REGISTER_MARKETS, DEFAULT_MARKET),
			league: readParam(searchParams.get('league'), isLeagueParam, DEFAULT_LEAGUE),
			page: Number(readParam(searchParams.get('page'), isPageParam, '1')),
		};
		return Response.json(await registerResponse(filters), { headers: NAGLOWKI });
	} catch (error) {
		console.error('[register] odczyt rejestru nie powiódł się:', error.message);
		return Response.json({ error: 'register_failed' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
	}
}
