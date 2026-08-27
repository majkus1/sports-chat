import mongoose from 'mongoose';
import connectToDb from '@/lib/db';
import Pick from '@/models/Pick';
import User from '@/models/User';
import { getAuthenticatedUser } from '@/lib/auth';
import { fixtureById } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';
import { isAllowedUserPick, normalizePick } from '@/lib/picks/markets';
import Round from '@/models/Round';
import { roundKeyFor } from '@/lib/rounds/service';

/**
 * Typy wystawiane przez użytkowników.
 *
 * Rozliczają się tym samym zadaniem co typy AI — różni je wyłącznie pole `author`.
 * Dzięki temu ranking typerów i skuteczność AI liczą się z jednego źródła i tą samą metodą,
 * więc porównanie „AI kontra ludzie" jest uczciwe.
 */

const FIXTURE_ID = /^\d{1,12}$/;
const MAX_COMMENT = 280;

/** Lista typów społeczności dla jednego meczu. */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const fixtureId = (searchParams.get('fixtureId') || '').trim();
	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}

	const session = await getAuthenticatedUser();
	await connectToDb();

	const picks = await Pick.find({ fixtureId, author: 'user' })
		.sort({ createdAt: -1 })
		.limit(100)
		.lean();

	// Nazwy typujących jednym zapytaniem zamiast populate per rekord.
	const userIds = [...new Set(picks.map((p) => String(p.userId)))];
	const users = await User.find({ _id: { $in: userIds } })
		.select('username')
		.lean();
	const nameById = Object.fromEntries(users.map((u) => [String(u._id), u.username]));

	const me = session ? String(session.userId) : null;

	return Response.json({
		picks: picks.map((p) => ({
			id: String(p._id),
			username: nameById[String(p.userId)] || '?',
			isMine: me === String(p.userId),
			market: p.market,
			selection: p.selection,
			comment: p.comment,
			status: p.status,
			followerCount: p.followers?.length || 0,
			followedByMe: me ? (p.followers || []).some((f) => String(f) === me) : false,
			createdAt: p.createdAt,
		})),
	});
}

/** Wystawienie typu. Jeden na mecz, wyłącznie przed pierwszym gwizdkiem. */
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
	const market = String(body?.market || '').trim();
	const selection = String(body?.selection || '').trim();
	const comment = String(body?.comment || '').trim().slice(0, MAX_COMMENT);

	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}
	// Tylko rynki z zamkniętej listy — inaczej typ mógłby być nierozliczalny.
	if (!isAllowedUserPick(market, selection)) {
		return Response.json({ error: 'invalid_market' }, { status: 400 });
	}

	let fixture;
	try {
		fixture = normalizeFixture((await fixtureById(fixtureId))?.[0]);
	} catch {
		fixture = null;
	}
	if (!fixture) return Response.json({ error: 'fixture_not_found' }, { status: 404 });

	/*
	 * Blokada po pierwszym gwizdku.
	 *
	 * Bez niej cały ranking byłby bezwartościowy — typ wystawiony w 80. minucie przy
	 * znanym wyniku to nie prognoza. Sprawdzamy i godzinę, i status meczu, bo dostawca
	 * bywa spóźniony z jednym albo drugim.
	 */
	const kickoff = Date.parse(fixture.date);
	const started = fixture.status.isLive || fixture.status.isFinished;
	if (started || (Number.isFinite(kickoff) && kickoff <= Date.now())) {
		return Response.json({ error: 'match_started' }, { status: 409 });
	}
	if (fixture.status.isCancelled) {
		return Response.json({ error: 'match_cancelled' }, { status: 409 });
	}

	const normalized = normalizePick({
		market,
		selection,
		homeName: fixture.teams.home.name,
		awayName: fixture.teams.away.name,
	});
	if (!normalized) return Response.json({ error: 'invalid_market' }, { status: 400 });

	/*
	 * Przynależność do kolejki tygodniowej.
	 *
	 * Liczy się jeden termin dla całego zestawu, nie godzina konkretnego meczu: gdyby
	 * niedzielne spotkania można było typować po sobotnich wynikach, ranking kolejki
	 * przestałby porównywać to samo. Po zamknięciu typ nadal powstaje — wchodzi tylko
	 * do statystyki ogólnej, a nie do rywalizacji tygodnia.
	 */
	let roundKey = null;
	try {
		// Klucz bierzemy z wyliczenia, nie z dokumentu: projekcja go nie zwraca, więc
		// `round.key` byłoby `undefined` i typ wypadałby z rywalizacji tygodnia.
		const key = roundKeyFor();
		const round = await Round.findOne({ key }).select('fixtures.fixtureId closesAt');
		const inRound = round?.fixtures?.some((f) => f.fixtureId === fixtureId);
		if (inRound && round.closesAt > new Date()) roundKey = key;
	} catch {
		// Brak kolejki nie może blokować zwykłego typowania.
	}

	try {
		await Pick.create({
			author: 'user',
			kind: 'prematch',
			source: 'user',
			fixtureId,
			userId: session.userId,
			roundKey,
			market,
			selection,
			comment: comment || null,
			normalized,
			homeName: fixture.teams.home.name,
			awayName: fixture.teams.away.name,
			leagueName: fixture.league?.name ?? null,
			kickoff: Number.isFinite(kickoff) ? new Date(kickoff) : null,
			status: 'pending',
		});
	} catch (error) {
		// Indeks częściowy pilnuje jednego typu na mecz — duplikat to nie błąd serwera.
		if (error?.code === 11000) {
			return Response.json({ error: 'already_picked' }, { status: 409 });
		}
		throw error;
	}

	return Response.json({ ok: true });
}

/** Wycofanie własnego typu — dopuszczalne wyłącznie przed rozpoczęciem meczu. */
export async function DELETE(request) {
	const session = await getAuthenticatedUser();
	if (!session) return Response.json({ error: 'unauthorized' }, { status: 401 });

	const { searchParams } = new URL(request.url);
	const fixtureId = (searchParams.get('fixtureId') || '').trim();
	if (!FIXTURE_ID.test(fixtureId)) {
		return Response.json({ error: 'invalid_fixture_id' }, { status: 400 });
	}

	await connectToDb();

	const result = await Pick.deleteOne({
		fixtureId,
		author: 'user',
		userId: new mongoose.Types.ObjectId(String(session.userId)),
		status: 'pending',
		// Warunek na czas w zapytaniu, a nie po odczycie: dwa równoległe żądania
		// nie mogą się prześlizgnąć między sprawdzeniem a usunięciem.
		kickoff: { $gt: new Date() },
	});

	if (!result.deletedCount) return Response.json({ error: 'cannot_delete' }, { status: 409 });
	return Response.json({ ok: true });
}
