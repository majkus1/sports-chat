import { liveFixtures } from '@/lib/football/endpoints';

/**
 * Mecze na żywo.
 *
 * Ta trasa nie miała żadnego cache'u — każde wejście na stronę „NA ŻYWO” i każde
 * odświeżenie szło wprost do płatnego API. Teraz odpowiedź jest trzymana przez 30 sekund,
 * co przy wielu użytkownikach oglądających te same mecze zmienia rachunek o rzędy wielkości.
 */
export async function GET() {
	try {
		const fixtures = await liveFixtures();
		return Response.json({ fixtures }, { status: 200 });
	} catch (error) {
		console.error('[live] błąd pobierania:', error.message);
		return Response.json({ error: 'Failed to fetch live fixtures' }, { status: 502 });
	}
}
