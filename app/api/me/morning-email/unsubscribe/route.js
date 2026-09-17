import connectToDb from '@/lib/db';
import User from '@/models/User';

/**
 * Wypisanie z porannego maila jednym kliknięciem — bez logowania.
 *
 * Odnośnik z maila niesie token; ten sam token służy nagłówkowi List-Unsubscribe, więc
 * klient poczty może wypisać użytkownika własnym przyciskiem. Odpowiedź to najprostsza
 * możliwa strona: potwierdzenie i odnośnik z powrotem. Nieznany token dostaje to samo
 * potwierdzenie — nie zdradzamy, czy token istniał.
 */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const token = String(searchParams.get('token') || '').trim();

	let locale = 'pl';
	if (/^[a-f0-9]{48}$/.test(token)) {
		await connectToDb();
		const user = await User.findOneAndUpdate(
			{ 'morningEmail.unsubscribeToken': token },
			{ $set: { 'morningEmail.enabled': false } },
			{ projection: { 'morningEmail.locale': 1 } }
		).lean();
		if (user?.morningEmail?.locale === 'en') locale = 'en';
	}

	const t =
		locale === 'en'
			? { title: 'Morning email turned off', body: 'You will not receive the morning briefing any more. You can turn it back on in your account panel.', back: 'Back to Czat Sportowy' }
			: { title: 'Poranny mail wyłączony', body: 'Nie będziesz już dostawać porannego przeglądu. Możesz go włączyć ponownie w panelu konta.', back: 'Wróć do Czatu Sportowego' };

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
