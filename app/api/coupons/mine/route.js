import connectToDb from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { customMineHttp } from '@/lib/coupons/customService';

/**
 * „Moje kupony" — własne kupony z kreatora (`lib/coupons/customService.js`): ostatnie z rozliczeniem,
 * bilans ze wszystkich i stan dziennego limitu. `?limit=0` — sam limit i bilans (kreator na „Typach
 * na dziś" pyta tak, żeby pokazać „zostało X z Y"). Tylko z sesją; nigdy w pamięci podręcznej.
 */
export const dynamic = 'force-dynamic';

const NAGLOWKI = { 'Cache-Control': 'private, no-store' };

export async function GET(request) {
	const surowy = new URL(request.url).searchParams.get('limit');
	const limit = surowy === null ? undefined : Number.parseInt(surowy, 10);
	try {
		const session = await getAuthenticatedUser();
		await connectToDb();
		const { status, body } = await customMineHttp({ userId: session?.userId || null, limit: Number.isNaN(limit) ? undefined : limit });
		return Response.json(body, { status, headers: NAGLOWKI });
	} catch (error) {
		console.warn('[coupons] moje kupony niedostępne:', error.message);
		return Response.json({ ok: false, error: 'unavailable' }, { status: 503, headers: NAGLOWKI });
	}
}
