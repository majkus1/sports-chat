import connectToDb from '@/lib/db';
import { dailyOverview, dailyOverviewCached, withTimeout } from '@/lib/daily/service';

/**
 * Typ dnia — publicznie, bez logowania: dziś (albo jutro, gdy dziś już trwa), wczoraj
 * z wynikiem i dorobek. Dla strony głównej i listy meczów; strona „Typy na dziś" liczy
 * to samo po stronie serwera.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		await connectToDb();
		const dane = (await withTimeout(dailyOverview(), 8000, null)) || (await dailyOverviewCached());
		return Response.json(dane, { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' } });
	} catch (error) {
		console.warn('[daily-pick] niedostępny:', error.message);
		return Response.json({ today: null, tomorrow: null, yesterday: null, record: { won: 0, total: 0 } });
	}
}
