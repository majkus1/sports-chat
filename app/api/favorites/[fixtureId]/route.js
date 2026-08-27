import connectToDb from '@/lib/db';
import FavoriteMatch from '@/models/FavoriteMatch';
import { getAuthenticatedUser } from '@/lib/auth';

/** Zdjęcie meczu z ulubionych — wyłącznie własnego wpisu. */
export async function DELETE(request, { params }) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { fixtureId } = await params;
	if (!/^\d{1,12}$/.test(fixtureId || '')) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}

	await connectToDb();
	await FavoriteMatch.deleteOne({ userId: session.userId, fixtureId });

	// Idempotentnie: usunięcie nieistniejącego wpisu też jest sukcesem — stan końcowy
	// jest ten sam, a klient nie musi rozróżniać tych przypadków.
	return Response.json({ ok: true });
}
