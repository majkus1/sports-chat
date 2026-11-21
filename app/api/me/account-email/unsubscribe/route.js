import connectToDb from '@/lib/db';
import User from '@/models/User';

/**
 * Wypisanie z wiadomości o koncie (mail 2. dnia i ostatniego dnia próby) — jednym kliknięciem,
 * bez logowania. Ten sam wzór co wypis z porannego maila: token z maila, nagłówek List-Unsubscribe,
 * nieznany token dostaje to samo potwierdzenie (nie zdradzamy, czy istniał). Poranny mail ma
 * osobną zgodę i osobny wypis — ten odnośnik go nie rusza.
 */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const token = String(searchParams.get('token') || '').trim();

	let locale = 'pl';
	if (/^[a-f0-9]{48}$/.test(token)) {
		await connectToDb();
		const user = await User.findOneAndUpdate(
			{ 'lifecycleEmail.unsubscribeToken': token },
			{ $set: { 'lifecycleEmail.optOut': true } },
			{ projection: { 'morningEmail.locale': 1 } }
		).lean();
		if (user?.morningEmail?.locale === 'en') locale = 'en';
	}

	const t =
		locale === 'en'
			? { title: 'Account messages turned off', body: 'We will not send you any more messages about your trial. Password resets and address confirmations still work.', back: 'Back to Czat Sportowy' }
			: { title: 'Wiadomości o koncie wyłączone', body: 'Nie wyślemy Ci już wiadomości o okresie próbnym. Reset hasła i potwierdzenia adresu działają jak dotąd.', back: 'Wróć do Czatu Sportowego' };

	const html = `<!DOCTYPE html><html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${t.title}</title></head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f1f1f1;color:#333;"><div style="max-width:520px;margin:60px auto;background:#fff;border-radius:8px;padding:32px;text-align:center;">
<h1 style="font-size:22px;font-weight:400;margin:0 0 12px;">${t.title}</h1><p style="font-size:15px;line-height:1.6;color:#555;margin:0 0 24px;">${t.body}</p>
<a href="/${locale}" style="display:inline-block;padding:12px 24px;background:#173b45;color:#fff;text-decoration:none;border-radius:4px;">${t.back}</a></div></body></html>`;

	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

/** Klienci poczty (RFC 8058) wypisują POST-em na ten sam adres. */
export async function POST(request) {
	return GET(request);
}
