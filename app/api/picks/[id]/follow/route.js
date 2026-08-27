import mongoose from 'mongoose';
import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * „Też biorę" — dołączenie do cudzego typu.
 *
 * Celowo nie ma odpowiednika negatywnego. Przy społeczności budowanej od zera minusy pod
 * pierwszym typem nowej osoby skutecznie zniechęcają do kolejnego, a wartości informacyjnej
 * dodają niewiele. Deklaracja „biorę to samo" niesie za to konkretną treść: widać, ile osób
 * faktycznie poszło za typem.
 */
export async function POST(request, { params }) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { id } = await params;
	if (!mongoose.Types.ObjectId.isValid(id)) {
		return Response.json({ error: 'not_found' }, { status: 404 });
	}

	await connectToDb();
	const userId = new mongoose.Types.ObjectId(String(session.userId));

	const pick = await Pick.findOne({ _id: id, author: 'user' }).select('userId followers kickoff status');
	if (!pick) return Response.json({ error: 'not_found' }, { status: 404 });

	// Własnego typu nie da się „wziąć" — licznik miałby wtedy zawsze co najmniej jeden.
	if (String(pick.userId) === String(session.userId)) {
		return Response.json({ error: 'own_pick' }, { status: 409 });
	}
	// Po gwizdku deklaracja nic już nie znaczy.
	if (pick.status !== 'pending' || (pick.kickoff && pick.kickoff <= new Date())) {
		return Response.json({ error: 'match_started' }, { status: 409 });
	}

	const alreadyFollows = (pick.followers || []).some((f) => String(f) === String(userId));

	// Przełącznik: `$addToSet`/`$pull` są idempotentne, więc podwójne kliknięcie
	// przy słabym łączu nie rozjedzie licznika.
	await Pick.updateOne(
		{ _id: id },
		alreadyFollows ? { $pull: { followers: userId } } : { $addToSet: { followers: userId } }
	);

	const updated = await Pick.findById(id).select('followers').lean();

	return Response.json({
		ok: true,
		following: !alreadyFollows,
		followerCount: updated?.followers?.length || 0,
	});
}
