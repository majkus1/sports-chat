import connectToDb from '@/lib/db';
import FavoriteMatch from '@/models/FavoriteMatch';
import { getAuthenticatedUser } from '@/lib/auth';
import { fixtureById } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';

/**
 * Ulubione mecze zalogowanego użytkownika.
 *
 * POST przyjmuje wyłącznie identyfikator — migawkę wyświetlaną w panelu buduje serwer
 * z cache'owanej odpowiedzi dostawcy, żeby w bazie nie wylądowały dane podstawione
 * przez klienta.
 */

const FIXTURE_ID = /^\d{1,12}$/;

/** Górny limit — ulubione mają być podręczną listą, nie archiwum wszystkiego. */
const MAX_FAVORITES = 100;

export async function GET() {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	await connectToDb();
	const favorites = await FavoriteMatch.find({ userId: session.userId })
		.sort({ kickoff: -1 })
		.limit(MAX_FAVORITES)
		.lean();

	return Response.json({
		favorites: favorites.map((f) => ({
			fixtureId: f.fixtureId,
			homeName: f.homeName,
			awayName: f.awayName,
			leagueName: f.leagueName,
			country: f.country,
			kickoff: f.kickoff,
		})),
	});
}

export async function POST(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'invalid_body' }, { status: 400 });
	}

	const fixtureId = String(body?.fixtureId || '').trim();
	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}

	await connectToDb();

	const count = await FavoriteMatch.countDocuments({ userId: session.userId });
	if (count >= MAX_FAVORITES) {
		return Response.json({ error: 'limit_reached', limit: MAX_FAVORITES }, { status: 409 });
	}

	let fixture;
	try {
		fixture = normalizeFixture((await fixtureById(fixtureId))?.[0]);
	} catch {
		fixture = null;
	}
	if (!fixture) return Response.json({ error: 'fixture_not_found' }, { status: 404 });

	// Upsert: drugie kliknięcie w tę samą gwiazdkę nie może wywalić błędu duplikatu.
	await FavoriteMatch.updateOne(
		{ userId: session.userId, fixtureId },
		{
			$set: {
				homeName: fixture.teams.home.name || '?',
				awayName: fixture.teams.away.name || '?',
				leagueName: fixture.league?.name ?? null,
				country: fixture.league?.country ?? null,
				kickoff: fixture.date ? new Date(fixture.date) : null,
			},
		},
		{ upsert: true }
	);

	return Response.json({ ok: true });
}
