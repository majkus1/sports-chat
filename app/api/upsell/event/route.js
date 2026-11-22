import { checkRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/requestIp';
import { CLIENT_EVENTS } from '@/lib/upsell/placements';
import { recordUpsell } from '@/lib/upsell/stats';

/**
 * Wyświetlenie albo kliknięcie okna zakupu — sam licznik, bez konta i bez sesji.
 *
 * Działa też dla gości: zablokowane kupony widzi każdy, a to właśnie goście są najczęstszymi
 * oglądającymi. Do kolekcji idą wyłącznie sumy (dzień, miejsce, liczba) — patrz `models/UpsellStat`.
 *
 * Adres IP służy tylko do limitu 60 zdarzeń na minutę (klucz w Redisie wygasa po minucie) i nie
 * trafia do licznika. Limit chroni statystykę przed nabiciem pętlą, a `failOpen`, bo zgubione
 * wyświetlenie przy awarii Redisa jest mniej szkodliwe niż zablokowany pomiar.
 *
 * Przeglądarka wysyła to `navigator.sendBeacon`, więc odpowiedź nie ma znaczenia — 204 bez treści.
 */
export const dynamic = 'force-dynamic';

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return new Response(null, { status: 204 });
	}

	const event = CLIENT_EVENTS.includes(body?.event) ? body.event : null;
	if (!event) return new Response(null, { status: 204 });

	const limit = await checkRateLimit({ key: `upsell:${getClientIp(request)}`, limit: 60, windowSeconds: 60, failOpen: true });
	if (limit.allowed) await recordUpsell({ placement: body?.placement, event });

	return new Response(null, { status: 204 });
}
