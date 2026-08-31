import * as api from '@/lib/football/endpoints';
import * as shape from '@/lib/football/normalize';

/**
 * Składa komplet danych o jednym meczu w jeden obiekt.
 *
 * To jest zamiennik dotychczasowego rozwiązania, w którym przeglądarka zbierała ~60 pól
 * statystyk i odsyłała je w treści żądania do generowania analizy. Poza tym, że było to
 * kruche, dawało też każdemu możliwość podstawienia dowolnego tekstu wprost do promptu.
 *
 * Sekcje pobierane są równolegle i niezależnie: brak dostępu do jednej (np. składów poza
 * planem) nie psuje pozostałych — ląduje w `missing` wraz z powodem.
 */

export const ALL_SECTIONS = [
	'core',
	'form',
	'prediction',
	'h2h',
	'lineups',
	'injuries',
	'events',
	'statistics',
	'standings',
	'recentForm',
	'transfers',
	'topScorers',
	'players',
	'teamStats',
];

/** Sekcje sensowne dla meczu, który jeszcze się nie zaczął. */
export const PREMATCH_SECTIONS = [
	'core',
	'form',
	'prediction',
	'h2h',
	'lineups',
	'injuries',
	'standings',
	'recentForm',
	'transfers',
	'topScorers',
	'teamStats',
];

/**
 * Sekcje sensowne dla meczu w trakcie.
 *
 * Tabela jest tu nieprzypadkowo: dotąd trafiała wyłącznie do zestawu przedmeczowego, więc
 * analiza meczu na żywo nie wiedziała nawet, kto jest wyżej. `players` daje oceny
 * zawodników z tego spotkania — w trakcie gry mówią więcej niż sama tablica statystyk.
 */
export const LIVE_SECTIONS = [
	'core',
	'form',
	'prediction',
	'h2h',
	'events',
	'statistics',
	'lineups',
	// Absencje też w trakcie meczu — pytanie „kogo brakuje" pada tak samo często
	// po pierwszym gwizdku, jak przed nim.
	'injuries',
	'standings',
	'recentForm',
	'transfers',
	'players',
	'topScorers',
	'teamStats',
];

/**
 * Sekcje sensowne dla meczu zakończonego.
 *
 * Dotąd mecz po końcowym gwizdku dostawał zestaw przedmeczowy — bez wydarzeń i statystyk.
 * Asystent w czacie znał więc formę i analizę sprzed meczu, ale nie umiał odpowiedzieć,
 * kto strzelił i jak wyglądało posiadanie piłki. Prognoza przedmeczowa celowo odpada:
 * po meczu to już nie prognoza, tylko relikt.
 */
export const FINISHED_SECTIONS = [
	'core',
	'form',
	'h2h',
	'events',
	'statistics',
	'lineups',
	'standings',
	'recentForm',
	'players',
	'topScorers',
];

/** Ile ostatnich meczów drużyny dociągamy. */
const RECENT_FIXTURES_COUNT = 10;

export function parseSections(input) {
	if (!input) return null;
	const requested = String(input)
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
	const valid = requested.filter((s) => ALL_SECTIONS.includes(s));
	return valid.length ? valid : null;
}

async function settle(name, loader) {
	try {
		return { name, ok: true, value: await loader() };
	} catch (error) {
		return { name, ok: false, reason: error.message };
	}
}

/**
 * @param {number|string} fixtureId
 * @param {{ sections?: string[] }} options
 */
export async function buildFixtureBundle(fixtureId, { sections } = {}) {
	const fixtureRaw = (await api.fixtureById(fixtureId))[0];
	if (!fixtureRaw) return null;

	const fixture = shape.normalizeFixture(fixtureRaw);
	const homeId = fixture.teams.home.id;
	const awayId = fixture.teams.away.id;
	const leagueId = fixture.league?.id;
	const season = fixture.league?.season;

	// Domyślny zestaw dobierany po statusie meczu — nie ma sensu ciągnąć zdarzeń
	// przed pierwszym gwizdkiem ani predykcji przedmeczowych po końcowym.
	const wanted =
		sections ||
		(fixture.status.isLive
			? LIVE_SECTIONS
			: fixture.status.isFinished
				? FINISHED_SECTIONS
				: PREMATCH_SECTIONS);

	const jobs = [];
	if (wanted.includes('form') || wanted.includes('prediction')) {
		jobs.push(settle('predictions', () => api.predictions(fixtureId)));
	}
	if (wanted.includes('h2h') && homeId && awayId) {
		jobs.push(settle('h2h', () => api.headToHead(homeId, awayId)));
	}
	if (wanted.includes('lineups')) jobs.push(settle('lineups', () => api.lineups(fixtureId)));
	if (wanted.includes('injuries')) jobs.push(settle('injuries', () => api.injuries(fixtureId)));
	if (wanted.includes('events')) jobs.push(settle('events', () => api.fixtureEvents(fixtureId)));
	if (wanted.includes('statistics')) {
		jobs.push(settle('statistics', () => api.fixtureStatistics(fixtureId)));
	}
	if (wanted.includes('standings') && leagueId && season) {
		jobs.push(settle('standings', () => api.standings({ leagueId, season })));
	}
	if (wanted.includes('players')) jobs.push(settle('players', () => api.fixturePlayers(fixtureId)));
	if (wanted.includes('topScorers') && leagueId && season) {
		jobs.push(settle('topScorers', () => api.topScorers({ leagueId, season })));
	}

	/*
	 * Pełne statystyki sezonowe obu drużyn.
	 *
	 * Blok osadzony w `predictions` niesie bilanse i średnie, ale NIE niesie rozkładu goli
	 * w przedziałach minut ani listy używanych formacji. To pierwsze odpowiada na pytanie,
	 * czy drużyna rozstrzyga mecze wcześnie, czy dowozi je w końcówce — a od tego zależy
	 * ocena progów bramkowych zupełnie inaczej niż od samej średniej.
	 *
	 * Dwa wywołania na analizę przy cache dobowym i limicie 7500 dziennie.
	 */
	if (wanted.includes('teamStats') && leagueId && season && homeId && awayId) {
		jobs.push(settle('teamStats-home', () => api.teamStatistics({ leagueId, teamId: homeId, season })));
		jobs.push(settle('teamStats-away', () => api.teamStatistics({ leagueId, teamId: awayId, season })));
	}

	/*
	 * Ostatnie mecze i transfery lecą równolegle z resztą, a nie po niej.
	 *
	 * Wcześniej dociągałem je dopiero po sprawdzeniu, czy sezon jest ubogi — czyli dwoma
	 * turami zapytań. Teraz są potrzebne zawsze: w środku sezonu dają analizie konkretne
	 * wyniki kolejka po kolejce zamiast samych średnich, a przy starcie rozgrywek są
	 * jedynym źródłem formy. Cache (6h / 24h) sprawia, że koszt ponosimy raz.
	 */
	if (wanted.includes('recentForm') && homeId && awayId) {
		jobs.push(settle('recent-home', () => api.teamRecentFixtures(homeId, RECENT_FIXTURES_COUNT)));
		jobs.push(settle('recent-away', () => api.teamRecentFixtures(awayId, RECENT_FIXTURES_COUNT)));
	}
	if (wanted.includes('transfers') && homeId && awayId) {
		jobs.push(settle('transfers-home', () => api.teamTransfers(homeId)));
		jobs.push(settle('transfers-away', () => api.teamTransfers(awayId)));
	}

	const results = Object.fromEntries((await Promise.all(jobs)).map((r) => [r.name, r]));
	const missing = {};
	const take = (name) => {
		const result = results[name];
		if (!result) return null;
		if (!result.ok) {
			missing[name] = result.reason;
			return null;
		}
		return result.value;
	};

	const predictionsRaw = take('predictions')?.[0] ?? null;

	const bundle = {
		fetchedAt: new Date().toISOString(),
		sections: wanted,
		fixture,
	};

	if (wanted.includes('form')) {
		bundle.form = {
			home: shape.normalizeTeamForm(predictionsRaw?.teams?.home),
			away: shape.normalizeTeamForm(predictionsRaw?.teams?.away),
		};
	}
	if (wanted.includes('prediction')) {
		bundle.prediction = shape.normalizePrediction(predictionsRaw);
	}
	if (wanted.includes('h2h')) bundle.h2h = shape.normalizeH2H(take('h2h'));
	if (wanted.includes('lineups')) bundle.lineups = shape.normalizeLineups(take('lineups'));
	if (wanted.includes('injuries')) bundle.injuries = shape.normalizeInjuries(take('injuries'));
	if (wanted.includes('events')) bundle.events = shape.normalizeEvents(take('events'));
	if (wanted.includes('statistics')) {
		bundle.statistics = shape.normalizeFixtureStatistics(take('statistics'));
	}
	if (wanted.includes('standings')) bundle.standings = shape.normalizeStandings(take('standings'));
	if (wanted.includes('players')) bundle.players = shape.normalizeFixturePlayers(take('players'));
	if (wanted.includes('topScorers')) {
		bundle.topScorers = shape.normalizeTopScorers(take('topScorers'), [homeId, awayId]);
	}

	// Ranga meczu liczona względem TEGO spotkania — ten sam wynik jest „ligą bieżącego
	// sezonu" dla jednej analizy i „innymi rozgrywkami" dla drugiej.
	const context = { leagueId, season };
	if (wanted.includes('teamStats')) {
		bundle.teamStats = {
			home: shape.normalizeTeamStatistics(take('teamStats-home')),
			away: shape.normalizeTeamStatistics(take('teamStats-away')),
		};
	}
	if (wanted.includes('recentForm')) {
		bundle.recentForm = {
			home: shape.normalizeRecentFixtures(take('recent-home'), homeId, { context }),
			away: shape.normalizeRecentFixtures(take('recent-away'), awayId, { context }),
		};
	}
	if (wanted.includes('transfers')) {
		bundle.transfers = {
			home: shape.normalizeTransfers(take('transfers-home'), homeId),
			away: shape.normalizeTransfers(take('transfers-away'), awayId),
		};
	}

	// Jawna informacja, czego nie udało się pobrać — analiza AI może to uwzględnić
	// zamiast milcząco zgadywać na niepełnych danych.
	if (Object.keys(missing).length) bundle.missing = missing;

	return bundle;
}
