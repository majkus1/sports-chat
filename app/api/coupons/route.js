import connectToDb from '@/lib/db';
import { couponsOverview } from '@/lib/coupons/service';
import { couponsUnlocked } from '@/lib/coupons/access';

/**
 * Kupony — kupon dnia dla wszystkich, 3- i 5-dniowy w planie z liczbami (przed rozliczeniem
 * bez meczów dla pozostałych; decyduje `couponDto`). Odpowiedź zależy od konta, więc bez
 * pamięci podręcznej — `max-age` sprawiał, że po zalogowaniu przeglądarka oddawała zakrytą wersję. Kupony powstają w przebiegu co 20 minut, tu tylko odczyt.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
	try {
		await connectToDb();
		const unlocked = await couponsUnlocked();
		return Response.json(await couponsOverview({ unlocked }), { headers: { 'Cache-Control': 'private, no-store' } });
	} catch (error) {
		console.warn('[coupons] niedostępne:', error.message);
		return Response.json({ today: null, yesterday: null, days3: null, days5: null, record: null });
	}
}
