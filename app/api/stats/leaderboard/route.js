import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';

/**
 * Ranking typerów.
 *
 * Sortowanie po SKUTECZNOŚCI, nie po liczbie trafień — inaczej wygrywa ten, kto wystawił
 * najwięcej typów, a nie ten, kto typuje najlepiej. Do rankingu wchodzi się dopiero po
 * `MIN_SETTLED` rozliczonych typach: przy trzech typach 100% skuteczności nic nie znaczy,
 * a zepchnęłoby na dalsze miejsca kogoś z realnym dorobkiem.
 *
 * AI dopisujemy jako osobny wiersz z tych samych danych i tą samą metodą — to jedyne
 * uczciwe porównanie „AI kontra ludzie", jakie da się zrobić.
 */

const MIN_SETTLED = 10;
const LIMIT = 50;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const days = searchParams.get('days') === 'all' ? null : Math.min(365, Number(searchParams.get('days')) || 90);

	const match = { status: { $in: ['won', 'lost'] } };
	if (days) match.kickoff = { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) };

	await connectToDb();
	const session = await getAuthenticatedUser();

	const [rows, aiRow] = await Promise.all([
		Pick.aggregate([
			{ $match: { ...match, author: 'user', userId: { $ne: null } } },
			{
				$group: {
					_id: '$userId',
					settled: { $sum: 1 },
					won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
				},
			},
			{ $match: { settled: { $gte: MIN_SETTLED } } },
			{ $addFields: { hitRate: { $multiply: [{ $divide: ['$won', '$settled'] }, 100] } } },
			// Skuteczność główna, liczba typów jako rozstrzygnięcie remisów — przy równym
			// procencie wyżej stoi ten, kto udowodnił to na większej próbie.
			{ $sort: { hitRate: -1, settled: -1 } },
			{ $limit: LIMIT },
			{
				$lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' },
			},
			{
				$project: {
					_id: 0,
					userId: '$_id',
					username: { $ifNull: [{ $first: '$user.username' }, '?'] },
					settled: 1,
					won: 1,
					hitRate: { $round: ['$hitRate', 0] },
				},
			},
		]),
		Pick.aggregate([
			{ $match: { ...match, author: 'ai' } },
			{
				$group: {
					_id: null,
					settled: { $sum: 1 },
					won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
				},
			},
		]),
	]);

	const ai = aiRow[0];
	const me = session ? String(session.userId) : null;

	const entries = rows.map((r, index) => ({
		...r,
		userId: String(r.userId),
		rank: index + 1,
		isMe: me === String(r.userId),
	}));

	/*
	 * Własna pozycja podana osobno.
	 *
	 * Widget w profilu pokazuje ją bez ładowania całej listy, a jeśli użytkownik nie zebrał
	 * jeszcze progu, dostaje informację ILE typów brakuje — samo „brak pozycji" wyglądałoby
	 * jak usterka.
	 */
	let myRank = null;
	if (me) {
		const mine = entries.find((e) => e.isMe);
		if (mine) {
			myRank = { rank: mine.rank, total: entries.length, hitRate: mine.hitRate, settled: mine.settled };
		} else {
			const own = await Pick.countDocuments({ ...match, author: 'user', userId: session.userId });
			myRank = { rank: null, settled: own, needed: Math.max(0, MIN_SETTLED - own) };
		}
	}

	return Response.json(
		{
			minSettled: MIN_SETTLED,
			days: days || null,
			myRank,
			entries,
			ai: ai
				? {
						settled: ai.settled,
						won: ai.won,
						hitRate: ai.settled ? Math.round((ai.won / ai.settled) * 100) : null,
					}
				: null,
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
}
