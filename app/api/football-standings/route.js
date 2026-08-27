import { NextResponse } from 'next/server';
import {
	renderApiSportsPage,
	readPresentation,
	escapeAttr,
	WIDGET_RESPONSE_HEADERS,
} from '@/lib/widgets/apiSportsPage';

/**
 * Tabela ligi wraz z jej terminarzem.
 *
 * Otwierany na dwa sposoby: jako pełnoekranowe okno z listy meczów oraz jako zakładka
 * w pokoju meczowym (`embed=1`) — patrz components/match/WidgetFrame.jsx.
 */

const TRANSLATIONS = {
	pl: { standings: 'Tabela ligi', games: 'Mecze ligi' },
	en: { standings: 'League Standings', games: 'League Games' },
};

/**
 * Druga sekcja potrzebuje nagłówka także w trybie osadzonym — zakładka nazywa całość
 * „Tabela", więc bez tego terminarz wyglądałby na dalszą część tabeli.
 */
const STYLES = `
        .widget-section { margin-top: 22px; }
        .widget-section-title {
            margin-bottom: 10px;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.04em;
            color: #5c6b70;
            font-family: 'Roboto Condensed', sans-serif;
        }
        html.dark .widget-section-title { color: #93a4ab; }`;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const { embed, theme, locale } = readPresentation(searchParams);
	const leagueId = (searchParams.get('leagueId') || '').trim();
	const season = (searchParams.get('season') || '2025').trim();
	const t = TRANSLATIONS[locale];

	if (!/^\d{1,10}$/.test(leagueId) || !/^\d{4}$/.test(season)) {
		return new NextResponse('Error: leagueId parameter is required', { status: 400 });
	}

	const html = renderApiSportsPage({
		title: t.standings,
		embed,
		theme,
		styles: STYLES,
		body: `
            <h2 class="widget-title">${t.standings}</h2>
            <div id="standings-content">
                <api-sports-widget
                    data-type="standings"
                    data-league="${escapeAttr(leagueId)}"
                    data-season="${escapeAttr(season)}"
                    data-target-team="modal"
                ></api-sports-widget>
            </div>

            <div class="widget-section">
                <h3 class="widget-section-title">${t.games}</h3>
                <div id="games-content">
                    <api-sports-widget
                        data-type="games"
                        data-league="${escapeAttr(leagueId)}"
                        data-target-game="modal"
                        data-target-standings="modal"
                    ></api-sports-widget>
                </div>
            </div>`,
	});

	return new NextResponse(html, { headers: WIDGET_RESPONSE_HEADERS });
}
