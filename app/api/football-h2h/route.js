import { NextResponse } from 'next/server';
import {
	renderApiSportsPage,
	readPresentation,
	escapeAttr,
	WIDGET_RESPONSE_HEADERS,
} from '@/lib/widgets/apiSportsPage';

/**
 * Widget bezpośrednich spotkań dwóch drużyn.
 *
 * Otwierany na dwa sposoby: jako pełnoekranowe okno z listy meczów oraz jako zakładka
 * w pokoju meczowym (`embed=1`) — patrz components/match/WidgetFrame.jsx.
 */

const TITLES = { pl: 'Statystyki bezpośrednie', en: 'Head to Head' };

/** Para identyfikatorów drużyn w formacie oczekiwanym przez widget, np. `33-40`. */
const TEAM_PAIR = /^\d{1,10}-\d{1,10}$/;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const { embed, theme, locale } = readPresentation(searchParams);
	const teamIds = (searchParams.get('teamIds') || '').trim();

	if (!TEAM_PAIR.test(teamIds)) {
		return new NextResponse('Error: teamIds parameter is required', { status: 400 });
	}

	const html = renderApiSportsPage({
		title: TITLES[locale],
		embed,
		theme,
		body: `
            <h2 class="widget-title">${TITLES[locale]}</h2>
            <div id="h2h-content">
                <api-sports-widget
                    data-type="h2h"
                    data-h2h="${escapeAttr(teamIds)}"
                    data-target-game="modal"
                    data-target-standings="modal"
                ></api-sports-widget>
            </div>`,
	});

	return new NextResponse(html, { headers: WIDGET_RESPONSE_HEADERS });
}
