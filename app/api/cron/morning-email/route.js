import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { sendMorningEmails } from '@/lib/morning/service';

export const maxDuration = 300;

/**
 * Poranny mail — zadanie wsadowe, raz dziennie o 8:00 czasu polskiego.
 *
 * Chronione tym samym sekretem co rozliczanie typów; woła je harmonogram z `server.js`.
 * `?dryRun=1` buduje treści i zwraca podglądy bez wysyłki i bez zapisu — do sprawdzenia,
 * co poszłoby dziś, zanim pójdzie.
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

	const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';

	try {
		await connectToDb();
		const summary = await sendMorningEmails({ dryRun });
		console.log('[morning] przebieg:', JSON.stringify({ ...summary, previews: undefined }));
		return Response.json({ ok: true, ...summary });
	} catch (error) {
		console.error('[morning] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'morning_failed' }, { status: 500 });
	}
}
