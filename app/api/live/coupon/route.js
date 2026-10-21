import connectToDb from '@/lib/db';
import { couponsUnlocked } from '@/lib/coupons/access';
import { getLiveCoupon, peekLiveCoupon, lockedLiveDto } from '@/lib/live/service';

/**
 * Kupon live (`lib/live`). Plan z liczbami (Pro, VIP, okres próbny) dostaje kupon — wspólny
 * dla wszystkich przez 3 minuty, liczony, gdy wygasł. Pozostali: zapowiedź z liczbami ostatniego
 * kuponu (bez meczów), jeśli jest świeży — gość nigdy nie uruchamia liczenia z AI.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function GET() {
	try {
		await connectToDb();
		const unlocked = await couponsUnlocked();
		const naglowki = { headers: { 'Cache-Control': 'private, no-store' } };
		if (!unlocked) return Response.json({ unlocked: false, teaser: lockedLiveDto(peekLiveCoupon()) }, naglowki);
		return Response.json({ unlocked: true, result: await getLiveCoupon() }, naglowki);
	} catch (error) {
		console.warn('[live] kupon live niedostępny:', error.message);
		return Response.json({ error: 'unavailable' }, { status: 503 });
	}
}
