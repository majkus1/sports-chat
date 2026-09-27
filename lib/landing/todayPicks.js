import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { TRIAL } from '@/lib/billing/plans';

/**
 * Treść strony „Typy na dziś" (`/typy-na-dzis`) — publicznej, indeksowanej.
 *
 * Strona celuje w frazy, które ludzie wpisują codziennie: „typy na dziś", „typ dnia",
 * „analizy meczów". Treść jest zbudowana z liczb modelu, bez modelu językowego — każde zdanie
 * „dlaczego" pochodzi z tych samych prawdopodobieństw, które stoją przy typie. Bez języka
 * zakładów: nie mówimy o kursach, stawkach ani obstawianiu.
 */
export function todayPicksContent(locale) {
	if (locale === 'en') {
		return {
			title: (date) => `Today’s football picks — ${date}`,
			metaTitle: (date) => `Today’s football picks (${date}) — free pick of the day and AI analysis`,
			metaDescription:
				'A statistical model scans today’s matches and marks the ones where it sees an edge. One pick of the day is free for everyone — with the numbers and the reasons, settled in public.',
			lead: 'A statistical model scans today’s matches and shows the ones where it sees an edge. One pick a day is open to everyone — free.',
			dailyLabel: 'Pick of the day · free',
			tomorrowLabel: 'Pick of the day for tomorrow · free',
			usually: 'usually',
			why: 'Why',
			chances: (h, d, a) => `Model chances: home ${h}% · draw ${d}% · away ${a}%.`,
			goals: (lh, la) => `Expected goals: ${lh} – ${la}.`,
			over25: (p) => `Over 2.5 goals: ${p}%.`,
			edge: (base, lift) => `In an average match this happens ${base}% of the time — here the model sees ${lift} points more.`,
			openMatch: 'Full match analysis',
			status: { pending: 'Before kick-off', live: 'In play', won: 'Hit', lost: 'Miss', void: 'Void — match not played' },
			noPick: 'Today the model has no pick that clears its threshold. That happens — no pick is an honest answer.',
			listTitle: (n) => (n === 1 ? 'The model sees 1 pick today' : `The model sees ${n} picks today`),
			listLocked: 'The pick and the edge are shown on Pro and VIP — and for 7 days after you create an account.',
			listEmpty: 'No other picks today.',
			yesterday: 'Yesterday’s pick of the day',
			record: (won, total) => `Pick of the day so far: ${won} of ${total} hit.`,
			howTitle: 'How to read a pick',
			how: `“68% (usually 44%)” — 68 is the model’s chance, 44 is how often it happens anyway. We only publish a pick from ${MIN_PROBABILITY}% and at least ${MIN_LIFT} points above “usually”.`,
			howLink: 'How the model works',
			ctaMatches: 'See all of today’s matches',
			ctaTrial: `Create a free account — ${TRIAL.days} days with all picks visible and the morning email.`,
			disclaimer: 'Estimates, not sure things. We do not take bets. 18+.',
			breadcrumb: 'Today’s picks',
		};
	}

	return {
		title: (date) => `Typy na dziś — ${date}`,
		metaTitle: (date) => `Typy na dziś (${date}) — darmowy typ dnia i analizy meczów AI`,
		metaDescription:
			'Model statystyczny przelicza dzisiejsze mecze i oznacza te, w których widzi przewagę. Typ dnia za darmo dla wszystkich — z liczbami, powodami i publicznym rozliczeniem.',
		lead: 'Model statystyczny przelicza dzisiejsze mecze i pokazuje te, w których widzi przewagę. Jeden typ dziennie odkrywamy dla wszystkich — za darmo.',
		dailyLabel: 'Typ dnia · za darmo',
		tomorrowLabel: 'Typ dnia na jutro · za darmo',
		usually: 'zwykle',
		why: 'Dlaczego',
		chances: (h, d, a) => `Szanse według modelu: gospodarze ${h}% · remis ${d}% · goście ${a}%.`,
		goals: (lh, la) => `Spodziewane gole: ${lh} – ${la}.`,
		over25: (p) => `Powyżej 2,5 gola: ${p}%.`,
		edge: (base, lift) => `W przeciętnym meczu dzieje się to w ${base}% — tu model widzi o ${lift} punktów więcej.`,
		openMatch: 'Pełna analiza meczu',
		status: { pending: 'Przed meczem', live: 'Mecz trwa', won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany — mecz się nie odbył' },
		noPick: 'Dziś model nie ma typu, który przechodzi jego próg. Tak bywa — brak typu to uczciwa odpowiedź.',
		listTitle: (n) => `Model widzi dziś ${n} ${n === 1 ? 'typ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'typy' : 'typów'}`,
		listLocked: 'Typ i przewagę widać w planie Pro i VIP — oraz przez 7 dni po założeniu konta.',
		listEmpty: 'Poza typem dnia dziś nic więcej.',
		yesterday: 'Wczorajszy typ dnia',
		record: (won, total) => `Typ dnia dotąd: ${won} z ${total} trafionych.`,
		howTitle: 'Jak czytać typ',
		how: `„68% (zwykle 44%)" — 68 to szansa według modelu, 44 to ile dzieje się samo z siebie. Typ publikujemy tylko od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} pkt ponad „zwykle".`,
		howLink: 'Jak działa model',
		ctaMatches: 'Zobacz wszystkie dzisiejsze mecze',
		ctaTrial: `Załóż darmowe konto — przez ${TRIAL.days} dni widzisz wszystkie typy i dostajesz poranny mail.`,
		disclaimer: 'To szacunki, nie pewniaki. Serwis nie przyjmuje zakładów. 18+.',
		breadcrumb: 'Typy na dziś',
	};
}
