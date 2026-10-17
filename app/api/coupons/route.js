import connectToDb from '@/lib/db';
import { couponsOverview } from '@/lib/coupons/service';

/**
 * Kupon dnia i weekendowy — publicznie, bez logowania (strona główna). Strona „Typy na dziś"
 * czyta to samo po stronie serwera. Kupony powstają w przebiegu co 20 minut, tu tylko odczyt.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		await connectToDb();
		return Response.json(await couponsOverview(), { headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' } });
	} catch (error) {
		console.warn('[coupons] niedostępne:', error.message);
		return Response.json({ today: null, yesterday: null, weekend: null, record: null });
	}
}
