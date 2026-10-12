import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { TRIAL } from '@/lib/billing/plans';
import { leagueLabel } from '@/lib/social/posts';

/**
 * Strony „typ na mecz" (`/typ/<gospodarze>-<goście>-<id>`) — adresy i treść.
 *
 * PO CO. Ludzie szukają konkretnych meczów: „Galatasaray Barcelona typ", „Legia Lech
 * przewidywania". Pokoje meczowe (`/mecz/...`) są celowo poza indeksem — to krótko żyjące
 * strony czatu. Strona typu powstaje z dziennika prognoz (`ModelForecast`), więc istnieje
 * tylko dla meczów, które model policzył, i nie kosztuje ani jednego zapytania do dostawcy.
 *
 * CO JEST PUBLICZNE. Przed meczem: szanse 1-X-2 i spodziewane gole — liczby modelu, które
 * i tak stoją na karcie typu dnia. Sam typ (selekcja, procent, przewaga nad normą) zostaje
 * w planie płatnym, z wyjątkiem typu dnia. Po meczu: wynik i odkryty typ z rozliczeniem —
 * archiwum, które buduje wiarygodność i nic już nie odbiera płacącym.
 */

/** Nazwa drużyny → fragment adresu: bez polskich i innych znaków diakrytycznych, małe litery. */
export function slugify(name) {
	const s = String(name || '')
		.replace(/[łŁ]/g, 'l')
		.replace(/[øØ]/g, 'o')
		.replace(/ß/g, 'ss')
		.replace(/[æÆ]/g, 'ae')
		.replace(/[đĐ]/g, 'd')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return s || 'druzyna';
}

export function matchSlug({ fixtureId, homeName, awayName }) {
	return `${slugify(homeName)}-${slugify(awayName)}-${fixtureId}`;
}

/** Ścieżka bez prefiksu języka — do `Link` z `@/i18n/routing` i do mapy witryny. */
export function matchPath(f) {
	return `/typ/${matchSlug(f)}`;
}

/** Identyfikator meczu z końca adresu; nazwy przed nim mogą się zmienić (dostawca poprawia pisownię). */
export function fixtureIdFromSlug(slug) {
	const m = String(slug || '').match(/-(\d{3,})$/);
	return m ? m[1] : null;
}

/** Wynik typu z dziennika: trafiony, chybiony albo `null` (brak typu, brak wyniku, dogrywka). */
export function pickOutcome(forecast) {
	const key = forecast?.hint?.key;
	const r = forecast?.result;
	if (!key || r?.status !== 'FT' || !Number.isFinite(r.home) || !Number.isFinite(r.away)) return null;
	const h = r.home;
	const a = r.away;
	const weszlo = { home: h > a, away: a > h, '1X': h >= a, X2: a >= h, homeScores: h > 0, awayScores: a > 0, over25: h + a > 2 }[key];
	return weszlo === undefined ? null : weszlo ? 'won' : 'lost';
}

const procent = (x) => (Number.isFinite(x) ? Math.round(100 * x) : null);

/** Liczby do strony: szanse w procentach, spodziewane gole z jednym miejscem po przecinku. */
export function previewNumbers(forecast, locale = 'pl') {
	const m = forecast?.markets || {};
	const gole = (x) => (Number.isFinite(x) ? x.toFixed(1).replace('.', locale === 'en' ? '.' : ',') : null);
	return {
		home: procent(m.home),
		draw: procent(m.draw),
		away: procent(m.away),
		lambdaHome: gole(forecast?.lambdaHome),
		lambdaAway: gole(forecast?.lambdaAway),
	};
}

/** Rozgrywki do nagłówka: polska nazwa dla najważniejszych, inaczej nazwa i kraj od dostawcy. */
export function previewLeague(forecast) {
	const known = leagueLabel(forecast?.leagueId, null);
	if (known) return known;
	return [forecast?.leagueName, forecast?.leagueCountry].filter(Boolean).join(', ') || null;
}

function kiedy(iso, locale) {
	const d = new Date(iso);
	const loc = locale === 'en' ? 'en-GB' : 'pl-PL';
	return {
		data: d.toLocaleDateString(loc, { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', year: 'numeric' }),
		dzien: d.toLocaleDateString(loc, { timeZone: 'Europe/Warsaw', weekday: 'long', day: 'numeric', month: 'long' }),
		godzina: d.toLocaleTimeString(loc, { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }),
	};
}

/** Treść strony; bez języka zakładów — jak strona „Typy na dziś". */
export function matchPreviewContent(locale) {
	if (locale === 'en') {
		return {
			when: kiedy,
			title: (h, a, date) => `${h} vs ${a}: prediction and pick (${date})`,
			h1: (h, a) => `${h} vs ${a}: prediction and pick`,
			description: (h, a, n, liga, when) =>
				`Model chances: ${h} ${n.home}%, draw ${n.draw}%, ${a} ${n.away}%. Expected goals ${n.lambdaHome}–${n.lambdaAway}. ${[liga, when.data, when.godzina].filter(Boolean).join(', ')}.`,
			chances: 'Chances according to the model',
			draw: 'Draw',
			expectedGoals: 'Expected goals',
			pickTitle: 'The model’s pick',
			daily: 'Pick of the day · free',
			usually: 'usually',
			locked: `The model sees a pick above the norm in this match. The selection, the chance and the edge are shown on Pro and VIP — and for ${TRIAL.days} days after you create a free account.`,
			none: 'The model sees no pick above the norm here — the chances are close to what usually happens. No pick is information too.',
			noneAfter: 'The model had no pick in this match.',
			result: 'Result',
			won: 'hit',
			lost: 'miss',
			plans: 'See plans',
			room: 'Full AI analysis and match chat',
			others: 'Other matches that day with a model forecast',
			howTitle: 'Where the numbers come from',
			how: `A statistical model (Dixon–Coles) built from the teams’ results — not opinions. “Usually” is how often the event happens in an average match; we publish a pick only from ${MIN_PROBABILITY}% and at least ${MIN_LIFT} points above “usually”.`,
			disclaimer: 'Estimates, not sure things. We do not take bets. 18+.',
			home: 'Home',
			today: 'Today’s picks',
		};
	}
	return {
		when: kiedy,
		title: (h, a, date) => `${h} – ${a}: typ i przewidywania (${date})`,
		h1: (h, a) => `${h} – ${a}: typ i przewidywania`,
		description: (h, a, n, liga, when) =>
			`Szanse według modelu: ${h} ${n.home}%, remis ${n.draw}%, ${a} ${n.away}%. Spodziewane gole ${n.lambdaHome} – ${n.lambdaAway}. ${[liga, when.data, when.godzina].filter(Boolean).join(', ')}.`,
		chances: 'Szanse według modelu',
		draw: 'Remis',
		expectedGoals: 'Spodziewane gole',
		pickTitle: 'Typ modelu',
		daily: 'Typ dnia · za darmo',
		usually: 'zwykle',
		locked: `Model widzi w tym meczu typ ponad normę. Selekcję, procent i przewagę pokazujemy w planie Pro i VIP — oraz przez ${TRIAL.days} dni po założeniu darmowego konta.`,
		none: 'Model nie widzi w tym meczu typu ponad normę — szanse są blisko tego, co dzieje się zwykle. Brak typu to też informacja.',
		noneAfter: 'Model nie wystawił typu w tym meczu.',
		result: 'Wynik',
		won: 'trafiony',
		lost: 'chybiony',
		plans: 'Zobacz plany',
		room: 'Pełna analiza AI i czat meczu',
		others: 'Inne mecze tego dnia z prognozą modelu',
		howTitle: 'Skąd te liczby',
		how: `Model statystyczny (Dixon–Coles) liczony z wyników drużyn — nie z opinii. „Zwykle" to częstość zdarzenia w przeciętnym meczu; typ publikujemy tylko od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} pkt ponad „zwykle".`,
		disclaimer: 'To szacunki, nie pewniaki. Serwis nie przyjmuje zakładów. 18+.',
		home: 'Strona główna',
		today: 'Typy na dziś',
	};
}

/** Dane strukturalne meczu; `<` zamieniony, żeby nazwa drużyny nie zamknęła znacznika skryptu. */
export function sportsEventLd({ forecast, url, name }) {
	const data = {
		'@context': 'https://schema.org',
		'@type': 'SportsEvent',
		name,
		url,
		sport: 'Soccer',
		startDate: new Date(forecast.kickoff).toISOString(),
		eventStatus: 'https://schema.org/EventScheduled',
		homeTeam: { '@type': 'SportsTeam', name: forecast.homeName },
		awayTeam: { '@type': 'SportsTeam', name: forecast.awayName },
		...(previewLeague(forecast) ? { superEvent: { '@type': 'SportsEvent', name: previewLeague(forecast) } } : {}),
	};
	return { __html: JSON.stringify(data).replace(/</g, '\\u003c') };
}
