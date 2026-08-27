import connectToDb from '@/lib/db';
import Message from '@/models/Message';
import { CHAT_ID_PATTERN } from '@/lib/chatConstraints';
import { limitByIp, tooManyRequests } from '@/lib/rateLimit';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Historia publicznego pokoju meczowego.
 *
 * Odczyt jest celowo dostępny bez logowania — niezalogowani mogą czytać czat, tylko nie
 * mogą pisać. Wiadomości prywatne żyją w kolekcji PrivateChat i tędy nie przechodzą.
 *
 * `?before=<ISO>` służy do doładowywania starszych wiadomości przy scrollu w górę.
 * Odpowiedź to tablica posortowana rosnąco (od najstarszej), tak jak oczekuje czat.
 */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const chatId = searchParams.get('chatId');

	if (typeof chatId !== 'string' || !CHAT_ID_PATTERN.test(chatId)) {
		return Response.json({ success: false, message: 'Invalid chatId' }, { status: 400 });
	}

	// Wcześniej każde wejście na stronę ciągnęło CAŁĄ historię pokoju bez żadnego limitu.
	const rate = await limitByIp(request, {
		scope: 'get-messages',
		limit: 120,
		windowSeconds: 60,
		failOpen: true,
	});
	if (!rate.allowed) return tooManyRequests(rate.retryAfter);

	const parsedLimit = Number.parseInt(searchParams.get('limit') || '', 10);
	const limit = Number.isFinite(parsedLimit)
		? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT)
		: DEFAULT_LIMIT;

	const beforeParam = searchParams.get('before');
	const before = beforeParam ? new Date(beforeParam) : null;
	if (before && Number.isNaN(before.getTime())) {
		return Response.json({ success: false, message: 'Invalid before cursor' }, { status: 400 });
	}

	try {
		await connectToDb();

		const query = { chatId };
		if (before) query.timestamp = { $lt: before };

		// Bierzemy najnowsze `limit` wiadomości, a do klienta oddajemy je w kolejności rosnącej.
		const newestFirst = await Message.find(query).sort({ timestamp: -1 }).limit(limit).lean();

		return Response.json(newestFirst.reverse(), { status: 200 });
	} catch (error) {
		if (process.env.NODE_ENV === 'development') {
			console.error('Error fetching messages:', error);
		}
		return Response.json(
			{ success: false, message: 'Błąd podczas pobierania wiadomości.' },
			{ status: 500 }
		);
	}
}
