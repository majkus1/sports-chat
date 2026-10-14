import connectToDb from '@/lib/db';
import ModelForecast from '@/models/ModelForecast';
import { summarizeHints } from '@/lib/stats/hintAccuracy';

/**
 * Skuteczność wszystkich plakietek modelu — publicznie, bez logowania.
 * Liczona z dziennika prognoz (`lib/stats/hintAccuracy.js`); wyniki zmieniają się raz na dobę
 * (rozliczenie nocą), więc dziesięć minut w pamięci podręcznej niczego nie przekłamuje.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		await connectToDb();
		const docs = await ModelForecast.find({ settledAt: { $ne: null }, 'result.status': 'FT', 'hint.key': { $ne: null } })
			.select('fixtureId homeName awayName kickoff hint result')
			.lean();
		return Response.json(summarizeHints(docs), {
			headers: { 'Cache-Control': 'public, max-age=300, s-maxage=600' },
		});
	} catch (error) {
		console.warn('[stats/model-hints] niedostępne:', error.message);
		return Response.json({ error: 'unavailable' }, { status: 503 });
	}
}
