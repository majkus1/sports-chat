import { NextResponse } from 'next/server';
import {
	renderApiSportsPage,
	readPresentation,
	escapeAttr,
	WIDGET_RESPONSE_HEADERS,
} from '@/lib/widgets/apiSportsPage';

/**
 * Szczegóły meczu (widget `game`) — wcześniej `public/api-sports-football-game-details.html`.
 * `gameId` jest wstawiany po stronie serwera zamiast przez skrypt czytający query string.
 */
export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const { embed, theme } = readPresentation(searchParams);
	const gameId = (searchParams.get('gameId') || '').trim();

	if (!/^\d{1,12}$/.test(gameId)) {
		return new NextResponse('Error: gameId parameter is required', { status: 400 });
	}

	const html = renderApiSportsPage({
		title: 'Game Details',
		embed,
		theme,
		body: `
            <div id="game-content">
                <api-sports-widget data-type="game" id="game-widget" data-game-id="${escapeAttr(gameId)}"></api-sports-widget>
            </div>`,
	});

	return new NextResponse(html, { headers: WIDGET_RESPONSE_HEADERS });
}
