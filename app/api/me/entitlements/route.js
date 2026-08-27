import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { getClientIp } from '@/lib/requestIp';
import { checkQuota, getEntitlements } from '@/lib/billing/entitlements';
import { QUOTA_KINDS } from '@/lib/billing/plans';
import { getStripeConfig } from '@/lib/stripe/config';

/**
 * Uprawnienia i bieżące zużycie zalogowanego użytkownika.
 *
 * Interfejs pytał dotąd o limity osobno przy każdej funkcji (i trzymał część stanu
 * w localStorage). Tutaj jest jedna odpowiedź: jaki plan, jakie limity, ile już zużyto.
 * Niezalogowani dostają limity planu darmowego liczone po adresie IP.
 */
export async function GET(request) {
	const session = await getAuthenticatedUser();
	const ip = getClientIp(request);

	let user = null;
	if (session) {
		try {
			await connectToDb();
			user = await User.findById(session.userId)
				.select('plan planStatus planValidUntil role credits grantedFeatures createdAt')
				.lean();
		} catch {
			user = null;
		}
	}

	const entitlements = getEntitlements(user);

	const usage = {};
	for (const kind of QUOTA_KINDS) {
		const quota = await checkQuota({ kind, user, userId: session?.userId, ip });
		usage[kind] = {
			limit: quota.limit,
			used: quota.used,
			remaining: quota.remaining,
		};
	}

	/*
	 * Czy da się dziś cokolwiek kupić.
	 *
	 * Interfejs nie ma jak sam sprawdzić, czy klucze Stripe'a są ustawione, a przycisk
	 * „Kup" prowadzący do komunikatu o błędzie jest gorszy niż przycisk wyłączony.
	 * Zwracamy dwie flagi, bo to dwie różne ścieżki: doładowania są gotowe, subskrypcje
	 * czekają na obsługę trybu cyklicznego.
	 */
	const payments = {
		credits: getStripeConfig().ready,
		subscriptions: false,
	};

	return Response.json(
		{ ...entitlements, usage, payments, isLoggedIn: Boolean(session) },
		// Zużycie zmienia się po każdym wywołaniu — odpowiedź nie może trafić do cache'u.
		{ status: 200, headers: { 'Cache-Control': 'no-store' } }
	);
}
