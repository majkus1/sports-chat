import mongoose from 'mongoose';
import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import { getAuthenticatedUser } from '@/lib/auth';
import { MARKET_GROUPS } from '@/lib/picks/markets';

/**
 * Skuteczność typów — globalna albo własna.
 *
 * Liczona agregacją w bazie, nie w JavaScripcie: przy kilkudziesięciu tysiącach typów
 * przesyłanie ich do aplikacji tylko po to, żeby je zliczyć, byłoby bezsensowne.
 *
 * Parametry:
 *   scope=global|me     zasięg (własny wymaga sesji)
 *   author=ai|user      kto wystawił typ; domyślnie `ai`
 *   kind=all|prematch|live|report
 *   days=30|90|all      okno czasowe liczone od daty meczu
 *
 * Filtr autora jest domyślnie ustawiony na `ai`, żeby dodanie typów użytkowników nie
 * zmieniło po cichu znaczenia liczby na stronie „skuteczność analiz AI".
 */

const KINDS = ['prematch', 'live', 'report'];
const AUTHORS = ['ai', 'user'];

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const scope = searchParams.get('scope') === 'me' ? 'me' : 'global';
	const kind = KINDS.includes(searchParams.get('kind')) ? searchParams.get('kind') : null;
	const daysParam = searchParams.get('days');
	const days = daysParam === 'all' ? null : Math.min(365, Math.max(1, Number(daysParam) || 90));

	const author = AUTHORS.includes(searchParams.get('author')) ? searchParams.get('author') : 'ai';

	const match = { author };
	if (kind) match.kind = kind;
	if (days) match.kickoff = { $gte: new Date(Date.now() - days * 24 * 3600 * 1000) };

	if (scope === 'me') {
		const session = await getAuthenticatedUser();
		if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });
		match.userId = new mongoose.Types.ObjectId(String(session.userId));
	}

	await connectToDb();

	/*
	 * Jedno przejście po kolekcji, trzy zestawienia naraz (`$facet`): licznik statusów,
	 * podział po rynkach i ostatnie rozstrzygnięcia. Trzy osobne zapytania czytałyby
	 * te same dokumenty trzy razy.
	 */
	const [result] = await Pick.aggregate([
		{ $match: match },
		{
			$facet: {
				statusy: [{ $group: { _id: '$status', n: { $sum: 1 } } }],
				wgRodzaju: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { kind: '$kind', status: '$status' }, n: { $sum: 1 } } },
				],
				wgRynku: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $group: { _id: { market: '$normalized.type', status: '$status' }, n: { $sum: 1 } } },
				],
				// Kalibracja: czy typy z wyższą deklarowaną pewnością faktycznie trafiają częściej.
				wgPewnosci: [
					{ $match: { status: { $in: ['won', 'lost'] }, confidence: { $ne: null } } },
					{
						$group: {
							_id: {
								bucket: {
									$switch: {
										branches: [
											{ case: { $gte: ['$confidence', 75] }, then: '75+' },
											{ case: { $gte: ['$confidence', 65] }, then: '65-74' },
										],
										default: '<65',
									},
								},
								status: '$status',
							},
							n: { $sum: 1 },
						},
					},
				],
				ostatnie: [
					{ $match: { status: { $in: ['won', 'lost'] } } },
					{ $sort: { settledAt: -1 } },
					{ $limit: 12 },
					{
						$project: {
							_id: 0,
							kind: 1,
							market: 1,
							selection: 1,
							status: 1,
							confidence: 1,
							homeName: 1,
							awayName: 1,
							leagueName: 1,
							kickoff: 1,
							finalScore: 1,
							fixtureId: 1,
						},
					},
				],
			},
		},
	]);

	const licz = (rows, keyName) => {
		const out = {};
		for (const row of rows) {
			const key = row._id[keyName];
			out[key] = out[key] || { won: 0, lost: 0 };
			out[key][row._id.status] = row.n;
		}
		return Object.entries(out)
			.map(([key, v]) => ({
				key,
				label: keyName === 'market' ? (MARKET_GROUPS[key] ?? key) : key,
				won: v.won,
				lost: v.lost,
				settled: v.won + v.lost,
				hitRate: v.won + v.lost ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
			}))
			.filter((row) => row.settled > 0)
			.sort((a, b) => b.settled - a.settled);
	};

	const statusy = Object.fromEntries((result?.statusy || []).map((r) => [r._id, r.n]));
	const won = statusy.won || 0;
	const lost = statusy.lost || 0;
	const settled = won + lost;

	return Response.json(
		{
			scope,
			author,
			kind: kind || 'all',
			days: days || null,
			summary: {
				total: won + lost + (statusy.pending || 0) + (statusy.void || 0),
				settled,
				won,
				lost,
				pending: statusy.pending || 0,
				// Typy pominięte pokazujemy jawnie — ukrywanie ich sugerowałoby,
				// że rozliczamy wszystko, a tak nie jest.
				skipped: statusy.void || 0,
				hitRate: settled ? Math.round((won / settled) * 100) : null,
			},
			byKind: licz(result?.wgRodzaju || [], 'kind'),
			byMarket: licz(result?.wgRynku || [], 'market'),
			byConfidence: licz(result?.wgPewnosci || [], 'bucket'),
			recent: result?.ostatnie || [],
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
}
