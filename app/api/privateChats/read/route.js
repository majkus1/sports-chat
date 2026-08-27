import connectToDb from '@/lib/db';
import PrivateChat from '@/models/PrivateChat';
import { getAuthenticatedUser, ensureString } from '@/lib/auth';
import { privateChatIdForUsers } from '@/lib/chatConstraints';

/**
 * Oznaczenie rozmowy jako przeczytanej.
 *
 * Zapisujemy jeden znacznik czasu zamiast flagi przy każdej wiadomości — otwarcie
 * rozmowy z setką wiadomości to wtedy jeden zapis, a nie sto.
 */
export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const peer = body?.peer;
	if (!ensureString(peer, 32)) return Response.json({ error: 'invalid_peer' }, { status: 400 });

	const peerNorm = peer.trim();
	if (peerNorm === session.username) {
		return Response.json({ error: 'invalid_peer' }, { status: 400 });
	}

	await connectToDb();

	// Aktualizujemy wyłącznie rozmowę, w której pytający faktycznie bierze udział —
	// sam identyfikator rozmowy nie wystarcza jako uprawnienie.
	await PrivateChat.updateOne(
		{
			chatId: privateChatIdForUsers(session.username, peerNorm),
			$or: [{ user1: session.username }, { user2: session.username }],
		},
		{ $set: { [`lastRead.${session.username}`]: new Date() } }
	);

	return Response.json({ ok: true });
}
