import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { TRIAL } from '@/lib/billing/plans';

/**
 * Treść strony „Typy na dziś" (`/typy-na-dzis`) — publicznej, indeksowanej.
 *
 * Strona celuje w frazy, które ludzie wpisują codziennie: „typy na dziś", „typ dnia",
 * „analizy meczów". Treść jest zbudowana z liczb modelu, bez modelu językowego — każde zdanie
 * „dlaczego" pochodzi z tych samych prawdopodobieństw, które stoją przy typie. Bez języka
 * zakładów: ta treść nie mówi o kursach, stawkach ani obstawianiu — kursy na tej stronie
 * stoją wyłącznie przy kuponach i typach z wyższym kursem (`lib/coupons/content.js`, `lib/value/content.js`).
 */
/** „1 typ", „3 typy", „12 typów", „22 typy" — polska odmiana liczebnika. */
function typyOdmiana(n) {
	if (n === 1) return 'typ';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'typy' : 'typów';
}

export function todayPicksContent(locale) {
	if (locale === 'en') {
		return {
			title: (date) => `Today’s football picks — ${date}`,
			metaTitle: (date) => `Today’s football picks (${date}) — free pick of the day and AI analysis`,
			metaDescription:
				'A statistical model scans today’s matches and marks the ones where it sees an edge. One pick of the day is free for everyone — with the numbers and the reasons, settled in public.',
			// Jedno zdanie o tym, co tu jest — metoda siedzi w „Jak czytać typ” (`details`) i na /jak-to-dziala.
			lead: 'Free pick of the day, coupons and all of the model’s picks for today.',
			dailyLabel: 'Pick of the day · free',
			tomorrowLabel: 'Pick of the day for tomorrow · free',
			usually: 'usually',
			why: 'Why',
			chances: (h, d, a) => `Model chances: home ${h}% · draw ${d}% · away ${a}%.`,
			goals: (lh, la) => `Expected goals: ${lh} – ${la}.`,
			over25: (p) => `Over 2.5 goals: ${p}%.`,
			edge: (base, lift) => `In an average match this happens ${base}% of the time — here the chance is ${lift} points higher.`,
			source: { market: 'from the market', model: 'model’s estimate' },
			openMatch: 'Full match analysis',
			status: { pending: 'Before kick-off', live: 'In play', won: 'Hit', lost: 'Miss', void: 'Void — match not played' },
			noPick: 'Today no pick cleared the model’s threshold.',
			listTitle: (n) => (n === 1 ? 'The model sees 1 pick today' : `The model sees ${n} picks today`),
			listTitleTomorrow: (n) => (n === 1 ? 'Tomorrow the model sees 1 pick' : `Tomorrow the model sees ${n} picks`),
			listLocked: `Picks are shown on Pro and VIP — or free for ${TRIAL.days} days on a new account.`,
			listEmpty: 'No other picks today.',
			yesterday: 'Yesterday’s pick of the day',
			record: (won, total) => `Pick of the day so far: ${won} of ${total} hit.`,
			howTitle: 'How to read a pick',
			how: `“68% (usually 44%)”: 68 is the chance, 44 is how often it happens in an average match. We show a pick from ${MIN_PROBABILITY}% and at least ${MIN_LIFT} points above “usually”. The label next to the number says where the chance comes from.`,
			howLink: 'How the model works',
			ctaMatches: 'All of today’s matches',
			ctaRegister: 'Create a free account',
			ctaTrial: `${TRIAL.days} days of all picks and the morning email for free.`,
			planLabel: 'The model’s strongest pick · your plan',
			lockedLabel: 'The model’s strongest pick · Pro and VIP',
			planLabelTomorrow: 'The model’s strongest pick for tomorrow · your plan',
			lockedLabelTomorrow: 'The model’s strongest pick for tomorrow · Pro and VIP',
			lockedNote: 'The pick, the chance and the edge over “usually” are shown on Pro and VIP.',
			unlock: 'Unlock the pick',
			// Gość: przycisk otwiera rejestrację (okres próbny odkrywa typy), a nie cennik, w którym i tak musiałby założyć konto.
			unlockGuest: 'Reveal the pick for free',
			listUnlockGuest: 'Reveal the picks for free',
			trialNote: `New account: ${TRIAL.days} days with the model’s picks for free.`,
			disclaimer: 'Estimates, not sure things. We do not take bets. 18+.',
			breadcrumb: 'Today’s picks',
		};
	}

	return {
		title: (date) => `Typy na dziś — ${date}`,
		metaTitle: (date) => `Typy na dziś (${date}) — darmowy typ dnia i analizy meczów AI`,
		metaDescription:
			'Model statystyczny przelicza dzisiejsze mecze i oznacza te, w których widzi przewagę. Typ dnia za darmo dla wszystkich — z liczbami, powodami i publicznym rozliczeniem.',
		// Jedno zdanie o tym, co tu jest — metoda siedzi w „Jak czytać typ” (`details`) i na /jak-to-dziala.
		lead: 'Typ dnia za darmo, kupony i wszystkie typy modelu na dziś.',
		dailyLabel: 'Typ dnia · za darmo',
		tomorrowLabel: 'Typ dnia na jutro · za darmo',
		usually: 'zwykle',
		why: 'Dlaczego',
		chances: (h, d, a) => `Szanse według modelu: gospodarze ${h}% · remis ${d}% · goście ${a}%.`,
		goals: (lh, la) => `Spodziewane gole: ${lh} – ${la}.`,
		over25: (p) => `Powyżej 2,5 gola: ${p}%.`,
		edge: (base, lift) => `W przeciętnym meczu dzieje się to w ${base}% — tu szansa jest o ${lift} punktów wyższa.`,
		source: { market: 'z rynku', model: 'według modelu' },
		openMatch: 'Pełna analiza meczu',
		status: { pending: 'Przed meczem', live: 'Mecz trwa', won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany — mecz się nie odbył' },
		noPick: 'Dziś żaden typ nie przeszedł progu modelu.',
		listTitle: (n) => `Model widzi dziś ${n} ${typyOdmiana(n)}`,
		listTitleTomorrow: (n) => `Jutro model widzi ${n} ${typyOdmiana(n)}`,
		listLocked: `Typy widać w Pro i VIP — albo za darmo przez ${TRIAL.days} dni na nowym koncie.`,
		listEmpty: 'Poza typem dnia dziś nic więcej.',
		yesterday: 'Wczorajszy typ dnia',
		record: (won, total) => `Typ dnia dotąd: ${won} z ${total} trafionych.`,
		howTitle: 'Jak czytać typ',
		how: `„68% (zwykle 44%)”: 68 to szansa, 44 — jak często dzieje się to w przeciętnym meczu. Typ pokazujemy od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} pkt ponad „zwykle”. Podpis przy liczbie mówi, skąd jest szansa.`,
		howLink: 'Jak działa model',
		ctaMatches: 'Wszystkie dzisiejsze mecze',
		ctaRegister: 'Załóż darmowe konto',
		ctaTrial: `${TRIAL.days} dni wszystkich typów i porannego maila za darmo.`,
		planLabel: 'Najmocniejszy typ modelu · Twój plan',
		lockedLabel: 'Najmocniejszy typ modelu · Pro i VIP',
		planLabelTomorrow: 'Najmocniejszy typ modelu na jutro · Twój plan',
		lockedLabelTomorrow: 'Najmocniejszy typ modelu na jutro · Pro i VIP',
		lockedNote: 'Typ, procent i przewagę nad „zwykle” widać w planie Pro i VIP.',
		unlock: 'Odblokuj typ',
		// Gość: przycisk otwiera rejestrację (okres próbny odkrywa typy), a nie cennik, w którym i tak musiałby założyć konto.
		unlockGuest: 'Odkryj typ za darmo',
		listUnlockGuest: 'Odkryj typy za darmo',
		trialNote: `Nowe konto: ${TRIAL.days} dni z typami modelu za darmo.`,
		disclaimer: 'To szacunki, nie pewniaki. Serwis nie przyjmuje zakładów. 18+.',
		breadcrumb: 'Typy na dziś',
	};
}
