import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { dailyBrief } from '@/lib/integrations/dailyBrief';

/**
 * Dzienny skrót dla n8n (`integrations/n8n/`) — typ dnia, kupon dnia, wyniki, skuteczność
 * i dane operacyjne. Tylko odczyt.
 *
 * Chronione tym samym sekretem co zadania cykliczne (`x-internal-secret`): część `ops`
 * (wydatki na AI, rejestracje) nie jest publiczna.
 */
export async function GET(request) {
	const expected = process.env.INTERNAL_API_SECRET || '';
	const provided = request.headers.get('x-internal-secret') || '';
	if (!expected) return Response.json({ error: 'internal_secret_not_configured' }, { status: 503 });

	const a = Buffer.from(expected);
	const b = Buffer.from(provided);
	if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		await connectToDb();
		return Response.json(await dailyBrief(), { headers: { 'Cache-Control': 'no-store' } });
	} catch (error) {
		console.error('[integrations] skrót dnia nie powiódł się:', error.message);
		return Response.json({ error: 'brief_failed' }, { status: 500 });
	}
}
