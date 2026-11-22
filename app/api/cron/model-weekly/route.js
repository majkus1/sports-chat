import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { runWeeklyModelJob } from '@/lib/model/weeklyJob';

export const maxDuration = 300;

/**
 * Cotygodniowa kalibracja korekty szansy i raport modelu mailem do administratora
 * (`lib/model/weeklyJob.js`). Woła ją harmonogram z `server.js` w poniedziałek o 6:30 czasu polskiego.
 *
 * Ten sam sekret co pozostałe zadania. `?dryRun=1` — policz i oddaj raport, niczego nie włączaj,
 * nie zapisuj i nie wysyłaj (podgląd ręczny); `?send=0` — zapisz i włącz, ale bez maila.
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
	const dryRun = searchParams.get('dryRun') === '1';
	const send = searchParams.get('send') !== '0';

	try {
		await connectToDb();
		const wynik = await runWeeklyModelJob({ dryRun, send });
		return Response.json({
			ok: true,
			dryRun,
			reportId: wynik.reportId,
			subject: wynik.subject,
			activated: wynik.activated,
			emailedTo: wynik.emailedTo,
			problems: wynik.problems,
			...(dryRun ? { text: wynik.text } : {}),
		});
	} catch (error) {
		console.error('[model-weekly] przebieg nie powiódł się:', error.message);
		return Response.json({ error: 'model_weekly_failed' }, { status: 500 });
	}
}
