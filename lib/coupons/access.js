import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { hasFeature } from '@/lib/billing/entitlements';

/**
 * Czy pytający widzi płatne kupony (3- i 5-dniowy) przed rozliczeniem — ta sama funkcja planu
 * co plakietki modelu (`model_hints`: Pro, VIP, okres próbny). Gość i plan darmowy — nie.
 */
export async function couponsUnlocked() {
	const session = await getAuthenticatedUser();
	if (!session?.userId) return false;
	const user = await User.findById(session.userId)
		.select('plan planStatus planValidUntil role grantedFeatures createdAt')
		.lean();
	return hasFeature(user, 'model_hints');
}
