import connectToDb from '@/lib/db';
import { valueStats } from '@/lib/value/service';

/** Bilans typów z wyższym kursem dla zakładki „Wyższy kurs" w skuteczności: `?days=30|90|all`. */
export const dynamic = 'force-dynamic';

const DAYS = new Set(['30', '90', 'all']);

export async function GET(request) {
	const days = new URL(request.url).searchParams.get('days') || '90';
	if (!DAYS.has(days)) return Response.json({ error: 'bad_request' }, { status: 400 });
	try {
		await connectToDb();
		const stats = await valueStats({ days: days === 'all' ? null : Number(days) });
		return Response.json(stats, { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' } });
	} catch (error) {
		console.warn('[value] statystyka niedostępna:', error.message);
		return Response.json({ error: 'unavailable' }, { status: 503 });
	}
}
