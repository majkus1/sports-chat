import connectToDb from '@/lib/db';
import { couponStats } from '@/lib/coupons/service';

/**
 * Bilans kuponów jednego rodzaju dla zakładki „Skuteczność": `?type=daily|weekend&days=30|90|all`.
 */
export const dynamic = 'force-dynamic';

const TYPES = new Set(['daily', 'weekend']);
const DAYS = new Set(['30', '90', 'all']);

export async function GET(request) {
	const params = new URL(request.url).searchParams;
	const type = params.get('type');
	const days = params.get('days') || '90';
	if (!TYPES.has(type) || !DAYS.has(days)) return Response.json({ error: 'bad_request' }, { status: 400 });
	try {
		await connectToDb();
		const stats = await couponStats({ type, days: days === 'all' ? null : Number(days) });
		return Response.json(stats, { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' } });
	} catch (error) {
		console.warn('[coupons] statystyka niedostępna:', error.message);
		return Response.json({ error: 'unavailable' }, { status: 503 });
	}
}
