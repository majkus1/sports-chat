import { footballRequest } from '@/lib/football/client';
import { cachedFetch, TTL } from '@/lib/football/cache';

/**
 * Po jednej funkcji na endpoint API-Football, każda z własnym czasem życia cache'u.
 *
 * Sekcje oznaczone jako „plan płatny” są już podpięte, ale dopóki plan ich nie obejmuje,
 * API zwróci pustą tablicę i `bundle` po prostu je pominie. Dzięki temu włączenie nowych
 * danych po wykupieniu planu nie wymaga zmian w kodzie — najwyżej w normalizatorze.
 */

export function fixturesByDate(date) {
	return cachedFetch({
		namespace: 'fixtures',
		params: { date },
		ttlSeconds: TTL.fixturesByDate,
		fetcher: () => footballRequest('fixtures', { date }),
	});
}

/**
 * Cały sezon jednej ligi w jednym wywołaniu, z wynikami.
 *
 * To jest korpus, na którym uczy się i sprawdza model. Jedno zapytanie oddaje komplet
 * spotkań sezonu — 380 meczów Premier League to jedno wywołanie, nie 380. Dzięki temu
 * zestaw uczący z czterdziestu lig i dwóch sezonów mieści się w około osiemdziesięciu
 * zapytaniach, czyli w ułamku dziennego limitu.
 */
export function leagueFixtures({ leagueId, season }) {
	return cachedFetch({
		namespace: 'league-fixtures',
		params: { league: leagueId, season },
		// Zakończone sezony się nie zmieniają, a trwający dopuszcza dobowe opóźnienie.
		ttlSeconds: TTL.leagueFixtures,
		fetcher: () => footballRequest('fixtures', { league: leagueId, season }),
	});
}

export function liveFixtures() {
	return cachedFetch({
		namespace: 'fixtures-live',
		ttlSeconds: TTL.live,
		fetcher: () => footballRequest('fixtures', { live: 'all' }),
	});
}

export function fixtureById(fixtureId) {
	return cachedFetch({
		namespace: 'fixture',
		params: { id: fixtureId },
		ttlSeconds: TTL.live,
		fetcher: () => footballRequest('fixtures', { id: fixtureId }),
	});
}

/**
 * Wyniki wielu meczów jednym wywołaniem (do 20 identyfikatorów).
 *
 * Używane przez rozliczanie typów: dwadzieścia rozstrzygniętych zakładów kosztuje wtedy
 * jedno zapytanie zamiast dwudziestu. Krótki cache, bo wynik zakończonego meczu już się
 * nie zmieni, ale ten sam mecz bywa typowany przez wiele osób.
 */
export function fixturesByIds(ids) {
	const list = [...new Set(ids.map(String))].slice(0, 20);
	return cachedFetch({
		namespace: 'fixtures-by-ids',
		params: { ids: list.join('-') },
		ttlSeconds: TTL.fixtureEvents,
		fetcher: () => footballRequest('fixtures', { ids: list.join('-') }),
	});
}

export function predictions(fixtureId) {
	return cachedFetch({
		namespace: 'predictions',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.predictions,
		fetcher: () => footballRequest('predictions', { fixture: fixtureId }),
	});
}

export function headToHead(homeTeamId, awayTeamId, last = 10) {
	return cachedFetch({
		namespace: 'h2h',
		params: { h2h: `${homeTeamId}-${awayTeamId}`, last },
		ttlSeconds: TTL.h2h,
		fetcher: () => footballRequest('fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}`, last }),
	});
}

export function teamStatistics({ leagueId, teamId, season }) {
	return cachedFetch({
		namespace: 'team-statistics',
		params: { league: leagueId, team: teamId, season },
		ttlSeconds: TTL.teamStatistics,
		fetcher: () => footballRequest('teams/statistics', { league: leagueId, team: teamId, season }),
	});
}

/**
 * Kursy przedmeczowe dla wszystkich meczów danego dnia.
 *
 * To pula kandydatów do raportu: mecz, który bukmacherzy wycenili, jest z definicji
 * spotkaniem o jakiejś randze. Odpowiedź jest stronicowana po 10 meczów — stronę
 * wskazuje wywołujący, bo tylko on wie, ile puli faktycznie potrzebuje.
 */
export function oddsByDate(date, page = 1) {
	return cachedFetch({
		namespace: 'odds',
		params: { date, page },
		ttlSeconds: TTL.odds,
		fetcher: () => footballRequest('odds', { date, page }),
	});
}

/**
 * Kursy przedmeczowe jednego meczu.
 *
 * Używane WYŁĄCZNIE jako sufit „to już wszyscy wiedzą" w polityce typów i jako materiał
 * do pomiaru modelu wobec rynku po rozliczeniu. Żadna liczba stąd nie trafia do treści
 * analizy, raportu ani interfejsu — patrz `lib/picks/policy.js`, `MARKET_CEILING`.
 */
export function oddsByFixture(fixtureId) {
	return cachedFetch({
		namespace: 'odds-fixture',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.odds,
		fetcher: () => footballRequest('odds', { fixture: fixtureId }),
	});
}

/**
 * Ostatnie rozegrane mecze drużyny — we WSZYSTKICH rozgrywkach.
 *
 * `teams/statistics` i `predictions` liczą wyłącznie bieżący sezon jednej ligi, więc na
 * starcie rozgrywek zwracają zera i analiza nie ma z czego powstać. Ten endpoint nie zna
 * takiego ograniczenia: zwraca sparingi, puchary i końcówkę poprzedniego sezonu.
 */
export function teamRecentFixtures(teamId, last = 10) {
	return cachedFetch({
		namespace: 'team-recent',
		params: { team: teamId, last },
		ttlSeconds: TTL.teamRecentFixtures,
		fetcher: () => footballRequest('fixtures', { team: teamId, last }),
	});
}

/** Ruchy kadrowe — przy nowym sezonie często ważniejsze niż zeszłoroczna forma. */
export function teamTransfers(teamId) {
	return cachedFetch({
		namespace: 'transfers',
		params: { team: teamId },
		ttlSeconds: TTL.transfers,
		fetcher: () => footballRequest('transfers', { team: teamId }),
	});
}

// --- Poniżej: sekcje zwykle dostępne dopiero w planie płatnym ---

export function lineups(fixtureId) {
	return cachedFetch({
		namespace: 'lineups',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.lineups,
		fetcher: () => footballRequest('fixtures/lineups', { fixture: fixtureId }),
	});
}

export function fixtureEvents(fixtureId) {
	return cachedFetch({
		namespace: 'fixture-events',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.fixtureEvents,
		fetcher: () => footballRequest('fixtures/events', { fixture: fixtureId }),
	});
}

export function fixtureStatistics(fixtureId) {
	return cachedFetch({
		namespace: 'fixture-statistics',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.fixtureStatistics,
		fetcher: () => footballRequest('fixtures/statistics', { fixture: fixtureId }),
	});
}

export function injuries(fixtureId) {
	return cachedFetch({
		namespace: 'injuries',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.injuries,
		fetcher: () => footballRequest('injuries', { fixture: fixtureId }),
	});
}

export function standings({ leagueId, season }) {
	return cachedFetch({
		namespace: 'standings',
		params: { league: leagueId, season },
		ttlSeconds: TTL.standings,
		fetcher: () => footballRequest('standings', { league: leagueId, season }),
	});
}

export function topScorers({ leagueId, season }) {
	return cachedFetch({
		namespace: 'topscorers',
		params: { league: leagueId, season },
		ttlSeconds: TTL.players,
		fetcher: () => footballRequest('players/topscorers', { league: leagueId, season }),
	});
}

/**
 * Oceny i statystyki zawodników w konkretnym meczu.
 *
 * W trwającym spotkaniu to najlepszy dostępny sygnał, kto realnie ciągnie grę — sama
 * tablica strzałów i posiadania nie mówi, czy napastnik marnuje sytuacje, czy bramkarz
 * trzyma wynik.
 */
export function fixturePlayers(fixtureId) {
	return cachedFetch({
		namespace: 'fixture-players',
		params: { fixture: fixtureId },
		ttlSeconds: TTL.fixtureStatistics,
		fetcher: () => footballRequest('fixtures/players', { fixture: fixtureId }),
	});
}
