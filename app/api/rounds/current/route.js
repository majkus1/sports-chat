import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';
import { ensureCurrentRound, refreshRoundStatus, roundLeaderboard } from '@/lib/rounds/service';

/**
 * Bieżąca kolejka tygodniowa wraz z rankingiem i własnymi typami.
 *
 * Kolejka tworzy się sama przy pierwszym wejściu w danym tygodniu — nie ma osobnego zadania
 * cyklicznego do pilnowania. Dobór meczów korzysta z cache'owanych kursów, więc pierwsze
 * wywołanie w tygodniu jest wolniejsze, a kolejne czytają gotowy dokument z bazy.
 */
export async function GET() {
	await connectToDb();

	let round;
	try {
		round = await ensureCurrentRound();
	} catch (error) {
		console.error('[rounds] nie udało się przygotować kolejki:', error.message);
		return Response.json({ error: 'round_unavailable' }, { status: 503 });
	}

	if (!round) return Response.json({ round: null });
	await refreshRoundStatus(round);

	const session = await getAuthenticatedUser();

	// Typy zalogowanego w tej kolejce — front zaznacza je przy meczach.
	const myPicks = session
		? await Pick.find({ roundKey: round.key, author: 'user', userId: session.userId })
				.select('fixtureId market selection status comment')
				.lean()
		: [];

	const leaderboard = await roundLeaderboard(round.key);
	const me = session ? String(session.userId) : null;

	return Response.json(
		{
			round: {
				key: round.key,
				status: round.status,
				closesAt: round.closesAt,
				fixtures: round.fixtures.map((f) => ({
					fixtureId: f.fixtureId,
					homeName: f.homeName,
					awayName: f.awayName,
					leagueName: f.leagueName,
					country: f.country,
					kickoff: f.kickoff,
				})),
			},
			myPicks: myPicks.map((p) => ({
				fixtureId: p.fixtureId,
				market: p.market,
				selection: p.selection,
				status: p.status,
				comment: p.comment,
			})),
			leaderboard: leaderboard.map((row, index) => ({
				...row,
				userId: String(row.userId),
				rank: index + 1,
				isMe: me === String(row.userId),
			})),
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
}
