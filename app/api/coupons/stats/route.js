import connectToDb from '@/lib/db';
import { couponStats } from '@/lib/coupons/service';
import { couponsUnlocked } from '@/lib/coupons/access';

/**
 * Bilans kuponów jednego rodzaju dla zakładki „Skuteczność":
 * `?type=daily|days3|days5|weekend&days=30|90|all`. Rozliczone kupony jawne dla wszystkich,
 * płatne w grze — z meczami tylko w planie z liczbami.
 */
export const dynamic = 'force-dynamic';

const TYPES = new Set(['daily', 'days3', 'days5', 'weekend']);
const DAYS = new Set(['30', '90', 'all']);

export async function GET(request) {
	const params = new URL(request.url).searchParams;
	const type = params.get('type');
	const days = params.get('days') || '90';
	if (!TYPES.has(type) || !DAYS.has(days)) return Response.json({ error: 'bad_request' }, { status: 400 });
	try {
		await connectToDb();
		const unlocked = await couponsUnlocked();
		const stats = await couponStats({ type, days: days === 'all' ? null : Number(days), unlocked });
		return Response.json(stats, { headers: { 'Cache-Control': 'private, max-age=60' } });
	} catch (error) {
		console.warn('[coupons] statystyka niedostępna:', error.message);
		return Response.json({ error: 'unavailable' }, { status: 503 });
	}
}
