import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { sendMorningEmails } from '@/lib/morning/service';
import { sendLifecycleEmails } from '@/lib/onboarding/lifecycle';

export const maxDuration = 300;

/**
 * Poranny mail — zadanie wsadowe, raz dziennie o 8:00 czasu polskiego.
 *
 * Chronione tym samym sekretem co rozliczanie typów; woła je harmonogram z `server.js`.
 * `?dryRun=1` buduje treści i zwraca podglądy bez wysyłki i bez zapisu — do sprawdzenia,
 * co poszłoby dziś, zanim pójdzie.
 *
 * Ten sam przebieg wysyła wiadomości o okresie próbnym (`lib/onboarding/lifecycle.js`: 2. dzień
 * i ostatni dzień próby) — po porannych mailach, bo korzystają z wybranego już typu dnia.
 * Ich błąd nie unieważnia porannej wysyłki: każda część ma własne podsumowanie.
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
		let lifecycle;
		try {
			lifecycle = await sendLifecycleEmails({ dryRun });
			console.log('[lifecycle] przebieg:', JSON.stringify({ ...lifecycle, previews: undefined }));
		} catch (error) {
			console.error('[lifecycle] przebieg nie powiódł się:', error.message);
			lifecycle = { error: 'lifecycle_failed' };
		}
		return Response.json({ ok: true, ...summary, lifecycle });
	} catch (error) {
		console.error('[morning] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'morning_failed' }, { status: 500 });
	}
}
