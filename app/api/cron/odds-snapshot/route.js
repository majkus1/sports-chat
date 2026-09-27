import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { snapshotOdds } from '@/lib/model/oddsShadowJob';

export const maxDuration = 120;

/**
 * Tryb cienia „kurs ≥ 1,50" — kursy do dziennika prognoz (`lib/model/oddsShadowJob.js`).
 *
 * Ten sam sekret, co pozostałe zadania; woła je harmonogram z `server.js` co 20 minut.
 * `?budget=N` ogranicza liczbę zapytań do dostawcy w jednym przebiegu (domyślnie 250).
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

	const budget = Number(new URL(request.url).searchParams.get('budget'));

	try {
		await connectToDb();
		const summary = await snapshotOdds(Number.isInteger(budget) && budget > 0 ? { budget } : {});
		return Response.json({ ok: true, ...summary });
	} catch (error) {
		console.error('[odds-shadow] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'odds_snapshot_failed' }, { status: 500 });
	}
}
