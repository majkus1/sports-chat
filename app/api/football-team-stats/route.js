import { NextResponse } from 'next/server';
import {
	renderApiSportsPage,
	readPresentation,
	escapeAttr,
	WIDGET_RESPONSE_HEADERS,
} from '@/lib/widgets/apiSportsPage';

/**
 * Statystyki i kadry obu drużyn obok siebie.
 *
 * Otwierany na dwa sposoby: jako pełnoekranowe okno z listy meczów oraz jako zakładka
 * w pokoju meczowym (`embed=1`) — patrz components/match/WidgetFrame.jsx.
 */

const TITLES = { pl: 'Statystyki drużyn', en: 'Team Statistics' };

/**
 * Dwie kolumny tylko wtedy, gdy jest na nie miejsce. W pokoju meczowym panel danych
 * bywa węższy niż 900 px, więc drużyny układają się jedna pod drugą.
 */
const STYLES = `
        .team-stats-grid { display: grid; gap: 20px; }
        @media (min-width: 900px) {
            .team-stats-grid { grid-template-columns: 1fr 1fr; }
        }
        .team-stats-name {
            margin-bottom: 10px;
            font-size: 15px;
            font-weight: 700;
            color: #0f1c20;
            font-family: 'Roboto Condensed', sans-serif;
        }
        html.dark .team-stats-name { color: #e8eef0; }`;

function teamColumn(teamId, teamName) {
	return `
            <div class="team-stats">
                <h3 class="team-stats-name">${escapeAttr(teamName)}</h3>
                <api-sports-widget
                    data-type="team"
                    data-team-id="${escapeAttr(teamId)}"
                    data-team-squad="true"
                    data-team-statistics="true"
                    data-target-player="modal"
                ></api-sports-widget>
            </div>`;
}

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const { embed, theme, locale } = readPresentation(searchParams);
	const homeTeamId = (searchParams.get('homeTeamId') || '').trim();
	const awayTeamId = (searchParams.get('awayTeamId') || '').trim();

	if (!/^\d{1,10}$/.test(homeTeamId) || !/^\d{1,10}$/.test(awayTeamId)) {
		return new NextResponse('Error: homeTeamId and awayTeamId parameters are required', {
			status: 400,
		});
	}

	const homeTeamName = searchParams.get('homeTeamName') || 'Home Team';
	const awayTeamName = searchParams.get('awayTeamName') || 'Away Team';

	const html = renderApiSportsPage({
		title: TITLES[locale],
		embed,
		theme,
		styles: STYLES,
		body: `
            <h2 class="widget-title">${TITLES[locale]}</h2>
            <div class="team-stats-grid">
                ${teamColumn(homeTeamId, homeTeamName)}
                ${teamColumn(awayTeamId, awayTeamName)}
            </div>`,
	});

	return new NextResponse(html, { headers: WIDGET_RESPONSE_HEADERS });
}
