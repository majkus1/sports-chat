import connectToDb from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/auth';
import { customGenerateHttp } from '@/lib/coupons/customService';

/**
 * Kreator kuponu — złożenie własnego kuponu (`lib/coupons/customService.js`).
 *
 * `POST { params: { odds, legs, window, leagues, skipPublished } }`. Sesja z ciasteczka, limit
 * `couponGen` (dziennie) i blokada na użytkownika po stronie serwera. Odpowiedzi: 200 z kuponem
 * (`ok: true`) albo z powodem „nie da się" (`ok: false`, limit nietknięty), 400 złe ustawienia,
 * 401 bez sesji, 403 plan bez kreatora (zapowiedź), 409 złożenie już trwa, 429 limit na dziś.
 *
 * Limit czasu jak u asystenta: sprawdzenie wiadomości to kilka wyszukań AI po kilka sekund, w najgorszym
 * razie w kilku rundach (typ odrzucony → następny), do tego dociąganie brakujących kursów.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const NAGLOWKI = { 'Cache-Control': 'private, no-store' };

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ ok: false, error: 'invalid_body' }, { status: 400, headers: NAGLOWKI });
	}
	try {
		const session = await getAuthenticatedUser();
		await connectToDb();
		const { status, body: odpowiedz } = await customGenerateHttp({ userId: session?.userId || null, body });
		return Response.json(odpowiedz, { status, headers: NAGLOWKI });
	} catch (error) {
		console.warn('[coupons] kreator kuponu nie zadziałał:', error.message);
		return Response.json({ ok: false, error: 'unavailable' }, { status: 503, headers: NAGLOWKI });
	}
}
