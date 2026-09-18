import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { collectFixtureStats } from '@/lib/model/fixtureStats';

export const maxDuration = 300;

/**
 * Strzały z rozegranych meczów — zadanie wsadowe, raz na dobę w nocy.
 *
 * Ten sam sekret, co rozliczanie typów i poranny mail; woła je harmonogram z `server.js`.
 * `?budget=N` ogranicza liczbę zapytań do dostawcy w tym przebiegu (domyślnie 1200 —
 * 16 % dziennego limitu; przy pierwszym napełnieniu to kilka nocy, potem ~150 na dobę).
 * `?leagues=39,140` zawęża do wybranych lig — do ręcznego sprawdzenia.
 */
export async function POST(request) {
	const expected = process.env.INTERNAL_API_SECRET || '';
	const provided = request.headers.get('x-internal-secret') || '';
	if (!expected) return Response.json({ error: 'internal_secret_not_configured' }, { status: 503 });

	const a = Buffer.from(expected);
	const b = Buffer.from(provided);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const budget = Number(searchParams.get('budget'));
	const leagues = (searchParams.get('leagues') || '')
		.split(',')
		.map((s) => Number(s.trim()))
		.filter(Boolean);

	try {
		await connectToDb();
		const summary = await collectFixtureStats({
			...(Number.isInteger(budget) && budget > 0 ? { budget } : {}),
			...(leagues.length ? { leagues } : {}),
		});
		console.log('[fixture-stats] przebieg:', JSON.stringify(summary));
		return Response.json({ ok: true, ...summary });
	} catch (error) {
		console.error('[fixture-stats] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'fixture_stats_failed' }, { status: 500 });
	}
}
