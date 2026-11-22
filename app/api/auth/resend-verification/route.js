import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkRateLimit, tooManyRequests } from '@/lib/rateLimit';
import { appBaseUrl, newVerificationToken, sendVerificationEmail } from '@/lib/auth/verificationEmail';

/**
 * „Wyślij link ponownie" — z paska „potwierdź adres" (`components/auth/VerifyEmailBar.jsx`).
 *
 * Tylko dla zalogowanego i tylko na adres jego konta, więc nie da się nią wysyłać maili na cudze
 * adresy. Limit 3 na godzinę na konto: każdy klik to mail z naszej skrzynki, a skrzynka Gmail
 * ma dzienny limit wysyłki wspólny z porannymi mailami.
 */
export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const rate = await checkRateLimit({ key: `auth-resend:user:${session.userId}`, limit: 3, windowSeconds: 3600 });
	if (!rate.allowed) return tooManyRequests(rate.retryAfter);

	await connectToDb();
	const user = await User.findById(session.userId).select('email username isEmailVerified googleId morningEmail.locale');
	if (!user || !user.email) return Response.json({ error: 'unauthorized' }, { status: 401 });
	if (user.isEmailVerified || user.googleId) return Response.json({ ok: true, alreadyVerified: true });

	const body = await request.json().catch(() => ({}));
	const locale = body?.locale === 'en' ? 'en' : user.morningEmail?.locale === 'en' ? 'en' : 'pl';
	const weryfikacja = newVerificationToken();
	user.emailVerificationTokenHash = weryfikacja.hash;
	user.emailVerificationTokenExp = weryfikacja.exp;
	await user.save();

	try {
		await sendVerificationEmail({ to: user.email, username: user.username, locale, baseUrl: appBaseUrl(request), token: weryfikacja.plain });
	} catch (error) {
		console.error('[resend-verification] wysyłka nie powiodła się:', error?.message);
		return Response.json({ error: 'send_failed' }, { status: 502 });
	}
	return Response.json({ ok: true });
}
