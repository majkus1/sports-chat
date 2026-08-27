import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { settlePendingPicks } from '@/lib/picks/service';

export const maxDuration = 300;

/**
 * Rozliczenie typów — zadanie wsadowe uruchamiane raz na dobę.
 *
 * Trasa jest chroniona wspólnym sekretem, a nie sesją: woła ją harmonogram (cron na VPS
 * albo zewnętrzny scheduler), nie przeglądarka. Bez tego każdy mógłby wywoływać
 * rozliczanie w kółko i palić zapytania do API piłkarskiego.
 *
 * Przykład wpisu w cronie (codziennie 4:00, po zakończeniu meczów z całej doby):
 *   0 4 * * * curl -s -X POST http://127.0.0.1:3001/api/cron/settle-picks \
 *     -H "x-internal-secret: $INTERNAL_API_SECRET"
 */
export async function POST(request) {
	const expected = process.env.INTERNAL_API_SECRET || '';
	const provided = request.headers.get('x-internal-secret') || '';

	if (!expected) {
		return Response.json({ error: 'internal_secret_not_configured' }, { status: 503 });
	}

	// Porównanie o stałym czasie — zwykłe `===` przecieka informację o prefiksie sekretu.
	const expectedBuf = Buffer.from(expected);
	const providedBuf = Buffer.from(provided);
	if (
		expectedBuf.length !== providedBuf.length ||
		!crypto.timingSafeEqual(expectedBuf, providedBuf)
	) {
		return Response.json({ error: 'unauthorized' }, { status: 401 });
	}

	try {
		await connectToDb();
		const summary = await settlePendingPicks();
		console.log('[picks] rozliczenie:', JSON.stringify(summary));
		return Response.json({ ok: true, ...summary });
	} catch (error) {
		console.error('[picks] rozliczenie nie powiodło się:', error.message);
		return Response.json({ error: 'settlement_failed' }, { status: 500 });
	}
}
