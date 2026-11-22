import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { TRIAL } from '@/lib/billing/plans';
import { localDate } from '@/lib/time';
import { matchPath, pickOutcome, previewNumbers } from '@/lib/seo/matchPreview';
import { leagueName } from '@/lib/seo/leagues';

/**
 * Strona „typy na dziś [liga]" — model strony (czysty) i treść pl/en.
 *
 * CO POKAZUJE. Mecze ligi dziś i jutro z dziennika prognoz: szanse 1-X-2, spodziewane gole i to,
 * czy model widzi typ. Sam typ — jak na stronie meczu (`/typ/...`) — odkryty tylko dla
 * typu dnia i od pierwszego gwizdka; wcześniej za kłódką planu. Niżej rozliczenie typów modelu
 * z tej ligi z 30 dni, z pudłami: liczba „7 z 10" bez listy, co nie weszło, nic nie znaczy.
 *
 * KIEDY INDEKSOWANA. Tylko gdy dziś albo jutro jest choć jeden mecz z liczbami modelu. W tygodniu
 * bez kolejki strona istnieje (link z meczu nie może prowadzić w 404), ale ma `noindex, follow`
 * i nie trafia do mapy witryny — pusta strona pod frazą „typy na dziś Premier League" to dokładnie
 * cienka treść, za którą wyszukiwarka obniża cały serwis.
 */

/** Ile ostatnich rozliczonych typów pokazujemy z nazwy (bilans liczy wszystkie z 30 dni). */
export const RECENT_SETTLED = 8;

/**
 * @param {{ matches: Array<object>, settled: Array<object>, dailyIds?: Set<string>, now?: Date }} input
 *   `matches` — dokumenty `ModelForecast` dziś i jutro, `settled` — rozliczone `Pick` z 30 dni
 */
export function leaguePageModel({ matches = [], settled = [], dailyIds = new Set(), now = new Date(), locale = 'pl' }) {
	const dzis = localDate(now);
	const zLiczbami = matches.filter((m) => Number.isFinite(previewNumbers(m, locale).home));
	const items = zLiczbami.map((m) => {
		const n = previewNumbers(m, locale);
		const rozpoczety = new Date(m.kickoff).getTime() <= now.getTime();
		const hint = m.hint?.key ? m.hint : null;
		const odkryty = Boolean(hint && (dailyIds.has(String(m.fixtureId)) || rozpoczety));
		return {
			fixtureId: String(m.fixtureId),
			home: m.homeName,
			away: m.awayName,
			kickoff: new Date(m.kickoff).toISOString(),
			day: localDate(new Date(m.kickoff)) === dzis ? 'today' : 'tomorrow',
			href: matchPath(m),
			numbers: n,
			pick: !hint ? { state: 'none' } : odkryty ? { state: 'open', selection: hint.selection, probability: hint.probability, base: Math.round(hint.base), outcome: pickOutcome(m) } : { state: 'locked' },
			score: Number.isFinite(m.result?.home) && Number.isFinite(m.result?.away) ? `${m.result.home}:${m.result.away}` : null,
			started: rozpoczety,
		};
	});
	const won = settled.filter((p) => p.status === 'won').length;
	return {
		indexable: items.length > 0,
		today: items.filter((i) => i.day === 'today'),
		tomorrow: items.filter((i) => i.day === 'tomorrow'),
		withPick: items.filter((i) => i.pick.state !== 'none').length,
		record: { won, total: settled.length },
		recent: settled.slice(0, RECENT_SETTLED).map((p) => ({
			fixtureId: String(p.fixtureId),
			home: p.homeName,
			away: p.awayName,
			selection: p.selection,
			status: p.status,
			score: Number.isFinite(p.finalScore?.home) && Number.isFinite(p.finalScore?.away) ? `${p.finalScore.home}:${p.finalScore.away}` : null,
			kickoff: new Date(p.kickoff).toISOString(),
		})),
	};
}

/** „1 mecz", „3 mecze", „12 meczów". */
function mecze(n) {
	if (n === 1) return 'mecz';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'mecze' : 'meczów';
}

export function leaguePageContent(locale) {
	if (locale === 'en') {
		return {
			metaTitle: (l, date) => `${leagueName(l, 'en')} picks today (${date}): predictions and match analysis`,
			metaDescription: (l, n, rec) =>
				`${leagueName(l, 'en')} today and tomorrow: ${n} ${n === 1 ? 'match' : 'matches'} with model chances, expected goals and whether the model sees a pick.` +
				(rec.total > 0 ? ` Last 30 days: ${rec.won} of ${rec.total} picks hit.` : ''),
			metaEmpty: (l) => `${leagueName(l, 'en')}: model forecasts appear up to 48 hours before each match, together with the public record of past picks.`,
			h1: (l) => `Today’s picks: ${leagueName(l, 'en')}`,
			lead: 'Model numbers for today’s and tomorrow’s matches: home-draw-away chances, expected goals and whether the model sees a pick.',
			today: 'Today',
			tomorrow: 'Tomorrow',
			draw: 'Draw',
			goals: 'Expected goals',
			pickNone: 'No model pick',
			pickLocked: 'Model pick · Pro and VIP',
			usually: 'usually',
			won: 'hit',
			lost: 'miss',
			result: 'Result',
			open: 'Preview and numbers',
			lockedNote: `You’ll see the pick on Pro and VIP — or free for ${TRIAL.days} days after you create an account.`,
			register: 'Create a free account',
			empty: 'No matches from this competition with a model forecast today or tomorrow. Forecasts appear up to 48 hours before kick-off.',
			recordTitle: 'How the model did here (last 30 days)',
			record: (w, t) => `${w} of ${t} picks hit`,
			recordEmpty: 'No settled model picks from this competition in the last 30 days.',
			accuracy: 'Full public record of the model',
			others: 'Today’s picks in other competitions',
			all: 'All of today’s picks',
			howTitle: 'How to read it',
			how: `Chances come from a statistical model built on the teams’ results. We mark a pick from ${MIN_PROBABILITY}% and at least ${MIN_LIFT} points above an average match.`,
			disclaimer: 'Estimates, not sure things. We do not take bets. 18+.',
			home: 'Home',
			todayPicks: 'Today’s picks',
		};
	}
	return {
		metaTitle: (l, date) => `${leagueName(l, 'pl')}: typy na dziś (${date}) — prognozy i analizy meczów`,
		metaDescription: (l, n, rec) =>
			`${leagueName(l, 'pl')} dziś i jutro: ${n} ${mecze(n)} z szansami według modelu, spodziewanymi golami i informacją, czy model widzi typ.` +
			(rec.total > 0 ? ` Ostatnie 30 dni: ${rec.won} z ${rec.total} typów trafionych.` : ''),
		metaEmpty: (l) => `${leagueName(l, 'pl')}: prognozy modelu pojawiają się do 48 godzin przed meczem, razem z publicznym rozliczeniem wcześniejszych typów.`,
		h1: (l) => `Typy na dziś: ${leagueName(l, 'pl')}`,
		lead: 'Liczby modelu dla meczów dziś i jutro: szanse gospodarzy, remisu i gości, spodziewane gole i informacja, czy model widzi typ.',
		today: 'Dziś',
		tomorrow: 'Jutro',
		draw: 'Remis',
		goals: 'Spodziewane gole',
		pickNone: 'Bez typu modelu',
		pickLocked: 'Typ modelu · Pro i VIP',
		usually: 'zwykle',
		won: 'trafiony',
		lost: 'chybiony',
		result: 'Wynik',
		open: 'Zapowiedź i liczby',
		lockedNote: `Typ odkryjesz w Pro i VIP — albo za darmo przez ${TRIAL.days} dni po założeniu konta.`,
		register: 'Załóż darmowe konto',
		empty: 'Dziś i jutro brak meczów z tych rozgrywek z prognozą modelu. Prognozy pojawiają się do 48 godzin przed meczem.',
		recordTitle: 'Jak model trafiał w tych rozgrywkach (30 dni)',
		record: (w, t) => `${w} z ${t} typów trafionych`,
		recordEmpty: 'Brak rozliczonych typów modelu z tych rozgrywek w ostatnich 30 dniach.',
		accuracy: 'Pełne publiczne rozliczenie modelu',
		others: 'Typy na dziś w innych rozgrywkach',
		all: 'Wszystkie typy na dziś',
		howTitle: 'Jak to czytać',
		how: `Szanse liczy model statystyczny z wyników drużyn. Typ oznaczamy od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} pkt ponad przeciętny mecz.`,
		disclaimer: 'To szacunki, nie pewniaki. Serwis nie przyjmuje zakładów. 18+.',
		home: 'Strona główna',
		todayPicks: 'Typy na dziś',
	};
}
