import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { hasFeature } from '@/lib/billing/entitlements';
import { newUnsubscribeToken } from '@/lib/morning/service';

/**
 * Ustawienie porannego maila — odczyt i zmiana z panelu konta.
 *
 * Włączyć może tylko plan z cechą `morning_email` (Pro, VIP). Wyłączyć — każdy, zawsze:
 * wycofanie zgody nie może być trudniejsze niż jej udzielenie. Token do wypisania z maila
 * powstaje raz, przy pierwszym włączeniu, i nie zmienia się — stare maile mają działać.
 */

const POLA = 'plan planStatus planValidUntil role grantedFeatures morningEmail';

function widok(user) {
	return {
		enabled: Boolean(user.morningEmail?.enabled),
		locale: user.morningEmail?.locale || 'pl',
		available: hasFeature(user, 'morning_email'),
	};
}

export async function GET() {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
	await connectToDb();
	const user = await User.findById(session.userId).select(POLA).lean();
	if (!user) return Response.json({ error: 'not_found' }, { status: 404 });
	return Response.json(widok(user));
}

export async function PATCH(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}
	const enabled = body?.enabled === true;
	const locale = body?.locale === 'en' ? 'en' : 'pl';

	await connectToDb();
	const user = await User.findById(session.userId).select(POLA).lean();
	if (!user) return Response.json({ error: 'not_found' }, { status: 404 });

	if (enabled && !hasFeature(user, 'morning_email')) {
		return Response.json({ error: 'plan_required', ...widok(user) }, { status: 403 });
	}

	const set = { 'morningEmail.enabled': enabled, 'morningEmail.locale': locale };
	if (enabled) {
		set['morningEmail.enabledAt'] = new Date();
		if (!user.morningEmail?.unsubscribeToken) set['morningEmail.unsubscribeToken'] = newUnsubscribeToken();
	}
	await User.updateOne({ _id: user._id }, { $set: set });

	const po = await User.findById(session.userId).select(POLA).lean();
	return Response.json(widok(po));
}
