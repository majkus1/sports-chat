import connectToDb from '@/lib/db';
import User from '@/models/User';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';
import { checkQuota, currentPass, trialDaysLeft } from '@/lib/billing/entitlements';
import { WIN_FRESH_MS, pickBanner } from '@/lib/upsell/context';

/**
 * Kontekst okien zakupu dla zalogowanego: czy ma plan i który baner (jeśli w ogóle) pokazać.
 *
 * Osobno od `/api/me/entitlements`, bo tamto liczy sześć limitów i stan płatności przy każdym
 * wywołaniu, a ten adres woła baner na każdej stronie. Konto z planem kończy się na jednym
 * odczycie użytkownika — bez zapytań o limity i typy.
 *
 * Gość dostaje `{ isLoggedIn: false }` — zachęty przy zablokowanych kuponach widzi i tak, ale
 * banerów (próba, trafiony typ) nie ma czego mu pokazać.
 */
export const dynamic = 'force-dynamic';

const BEZ_CACHE = { headers: { 'Cache-Control': 'no-store' } };

export async function GET() {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ isLoggedIn: false, paid: false, banner: null }, BEZ_CACHE);

	try {
		await connectToDb();
		const user = await User.findById(session.userId)
			.select('plan planStatus planValidUntil planPeriod role credits createdAt')
			.lean();
		if (!user) return Response.json({ isLoggedIn: false, paid: false, banner: null }, BEZ_CACHE);

		const pass = currentPass(user);
		// Administrator ma plan bez limitów — dla okien zakupu liczy się jak płacący.
		const paid = Boolean(pass) || user.role === 'admin';
		if (paid) return Response.json({ isLoggedIn: true, paid: true, pass, banner: null }, BEZ_CACHE);

		const proba = trialDaysLeft(user);
		const usage = {};
		if (proba > 0) {
			for (const kind of ['analysis', 'aiChat', 'report']) {
				const q = await checkQuota({ kind, user, userId: session.userId });
				usage[kind] = { limit: q.limit, used: q.used };
			}
		}

		// Indeks `{ userId, status, kind }` — zapytanie dotyka kilku dokumentów, nie całej kolekcji.
		const recentWin = await Pick.findOne({
			userId: user._id,
			status: 'won',
			kind: { $in: ['prematch', 'live'] },
			source: 'analysis',
			settledAt: { $gte: new Date(Date.now() - WIN_FRESH_MS) },
		})
			.sort({ settledAt: -1 })
			.select('homeName awayName selection settledAt')
			.lean();

		const banner = pickBanner({ paid: false, trialDaysLeft: proba, usage, recentWin });
		return Response.json({ isLoggedIn: true, paid: false, pass: null, trialDaysLeft: proba, banner }, BEZ_CACHE);
	} catch (error) {
		console.warn('[upsell] kontekst niedostępny:', error.message);
		return Response.json({ isLoggedIn: true, paid: false, banner: null }, BEZ_CACHE);
	}
}
