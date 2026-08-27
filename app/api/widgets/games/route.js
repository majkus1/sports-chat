import { NextResponse } from 'next/server';
import {
	renderApiSportsPage,
	readPresentation,
	WIDGET_RESPONSE_HEADERS,
} from '@/lib/widgets/apiSportsPage';

/**
 * Lista meczów (widget `games`) — wcześniej `public/api-sports-football-widget.html`.
 * Kliknięcie meczu leci do rodzica przez postMessage, a strona nadrzędna otwiera szczegóły.
 */

const GAME_CLICK_SCRIPT = `
    function findGameId(element) {
        var gameId = element.getAttribute('data-game-id') ||
                     element.getAttribute('data-id') ||
                     element.getAttribute('data-fixture-id');
        if (!gameId) {
            var idAttr = element.getAttribute('id');
            var idMatch = idAttr && idAttr.match(/\\d+/);
            if (idMatch) gameId = idMatch[0];
        }
        if (!gameId) {
            var parent = element.closest('[data-game-id], [data-id], [data-fixture-id]');
            if (parent) {
                gameId = parent.getAttribute('data-game-id') ||
                         parent.getAttribute('data-id') ||
                         parent.getAttribute('data-fixture-id');
            }
        }
        if (!gameId) {
            var link = element.closest('a[href]');
            if (link) {
                var match = link.getAttribute('href').match(/[\\/=](\\d+)/);
                if (match) gameId = match[1];
            }
        }
        return gameId;
    }

    function findTeamIds(element) {
        var teamIds = element.getAttribute('data-team-ids') ||
                      element.getAttribute('data-teams');
        if (!teamIds) {
            var holder = element.closest('[data-team-ids], [data-teams]');
            if (holder) {
                teamIds = holder.getAttribute('data-team-ids') || holder.getAttribute('data-teams');
            }
        }
        if (!teamIds) {
            var homeHolder = element.closest('[data-home-team-id]');
            var awayHolder = element.closest('[data-away-team-id]');
            var homeTeamId = element.getAttribute('data-home-team-id') ||
                             (homeHolder && homeHolder.getAttribute('data-home-team-id'));
            var awayTeamId = element.getAttribute('data-away-team-id') ||
                             (awayHolder && awayHolder.getAttribute('data-away-team-id'));
            if (homeTeamId && awayTeamId) teamIds = homeTeamId + '-' + awayTeamId;
        }
        if (!teamIds) {
            var game = element.closest('[data-game-id], [data-id], [data-fixture-id]');
            if (game) {
                var home = game.querySelector('[data-home-team-id], [data-team-id="home"], .home-team[data-team-id]');
                var away = game.querySelector('[data-away-team-id], [data-team-id="away"], .away-team[data-team-id]');
                if (home && away) {
                    var homeId = home.getAttribute('data-home-team-id') || home.getAttribute('data-team-id') || home.getAttribute('data-id');
                    var awayId = away.getAttribute('data-away-team-id') || away.getAttribute('data-team-id') || away.getAttribute('data-id');
                    if (homeId && awayId) teamIds = homeId + '-' + awayId;
                }
            }
        }
        return teamIds;
    }

    document.addEventListener('click', function (event) {
        var clickable = event.target.closest('[data-game-id], [data-id], [data-fixture-id], a[href*="game"], .game-item, .match-item, .fixture-item');
        if (!clickable) return;
        var gameId = findGameId(event.target);
        if (!gameId) return;
        event.preventDefault();
        event.stopPropagation();
        window.parent.postMessage({
            type: 'OPEN_GAME_DETAILS',
            gameId: gameId,
            teamIds: findTeamIds(event.target) || null
        }, window.location.origin);
    }, true);

    var observer = new MutationObserver(function () {
        var elements = document.querySelectorAll('[data-game-id], [data-id], [data-fixture-id], .game-item, .match-item, .fixture-item');
        elements.forEach(function (element) {
            if (!element.hasAttribute('data-click-handler')) {
                element.setAttribute('data-click-handler', 'true');
                element.style.cursor = 'pointer';
            }
        });
    });

    function startObserving() {
        observer.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserving);
    } else {
        startObserving();
    }`;

export async function GET(request) {
	const { searchParams } = new URL(request.url);
	const { embed, theme } = readPresentation(searchParams);

	const html = renderApiSportsPage({
		title: 'API Sports Widget',
		embed,
		theme,
		body: `
            <div id="games-list">
                <api-sports-widget data-type="games" data-target-game="modal" data-target-standings="modal"></api-sports-widget>
            </div>`,
		scripts: [GAME_CLICK_SCRIPT],
	});

	return new NextResponse(html, { headers: WIDGET_RESPONSE_HEADERS });
}
