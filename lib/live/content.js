import { TRIAL } from '@/lib/billing/plans';

/**
 * Treść generatora kuponu live. Kurs live zmienia się co chwilę — mówimy to wprost, obok kursu
 * zawsze szansa rynku i modelu, bez stawek i nazw bukmacherów, 18+.
 */

/** „1 mecz", „3 mecze", „5 meczów". */
const mecze = (n) => `${n} ${n === 1 ? 'mecz' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'mecze' : 'meczów'}`;

const liczba = (locale, v) =>
	Number.isFinite(v) ? v.toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export function liveContent(locale) {
	const kurs = (v) => liczba(locale, v);
	if (locale === 'en') {
		return {
			odds: kurs,
			title: 'Live coupon generator',
			lead: 'We scan matches in play: score, minute, live odds, live statistics, form and H2H. In our leagues the chance comes from the model, elsewhere from pre-match odds plus the score — AI checks each pick against how the game is going.',
			badge: 'Pro and VIP',
			generating: 'The model is calculating live matches, AI is checking the statistics…',
			refresh: 'Refresh',
			couponLabel: (time) => `Live coupon · ${time}`,
			singleLabel: (time) => `Best live pick · ${time}`,
			totalOdds: 'Total odds',
			odd: 'Odds',
			chance: 'Our chance',
			legs: (n) => (n === 1 ? '1 pick' : `${n} picks`),
			chances: (m, mo, source) => (source === 'market' ? `market ${m}% · pre-match odds + score ${mo}%` : `market ${m}% · model ${mo}%`),
			none: (n) =>
				n
					? `Right now nothing worth it: ${n === 1 ? '1 live match' : `${n} live matches`} checked, no pick passes the rules (our estimate and the market must agree). The panel refreshes itself every 3 minutes.`
					: 'No matches are in play right now. Come back when they kick off — the panel refreshes itself every 3 minutes.',
			rejected: 'Rejected by AI after the live statistics:',
			analyzed: (n, k, m) => `Checked ${n === 1 ? '1 live match' : `${n} live matches`} (${m ?? 0} in the model’s leagues), ${k} with live odds.`,
			noAi: 'AI check unavailable right now — picks from the model and the market only.',
			warning: 'Live odds change every few seconds — these are the median odds at the moment of generation. The coupon is settled in public (Accuracy → Live coupon). Estimates, not sure things. 18+.',
			lockedTitle: 'Live coupon · Pro and VIP',
			lockedReady: (odds, chance, n) => `Coupon ready: total odds ${kurs(odds)}, chance ${chance}%, ${n === 1 ? '1 pick' : `${n} picks`}.`,
			lockedNote: `Live matches, picks and AI reasoning are shown on Pro and VIP — and for ${TRIAL.days} days after you create an account.`,
			unlock: 'Unlock the live coupon',
			error: 'Could not build the live coupon — try again in a minute.',
		};
	}
	return {
		odds: kurs,
		title: 'Generator kuponu live',
		lead: 'Przeliczamy trwające mecze: wynik, minutę, kursy na żywo, statystyki meczu, formę i H2H. W naszych ligach szansę liczy model, w pozostałych — kursy sprzed meczu z doliczonym wynikiem. AI sprawdza każdy typ z przebiegiem gry.',
		badge: 'Pro i VIP',
		generating: 'Model liczy mecze na żywo, AI sprawdza statystyki…',
		refresh: 'Odśwież',
		couponLabel: (time) => `Kupon live · ${time}`,
		singleLabel: (time) => `Najlepszy typ live · ${time}`,
		totalOdds: 'Kurs łączny',
		odd: 'Kurs',
		chance: 'Nasza szansa',
		legs: (n) => `${n} ${n === 1 ? 'typ' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'typy' : 'typów'}`,
		chances: (m, mo, source) => (source === 'market' ? `rynek ${m}% · kursy sprzed meczu + wynik ${mo}%` : `rynek ${m}% · model ${mo}%`),
		none: (n) =>
			n
				? `Teraz nic wartego uwagi: sprawdzono ${mecze(n)} na żywo, żaden typ nie przechodzi zasad (nasze wyliczenie i rynek muszą się zgadzać). Panel sam odświeża się co 3 minuty.`
				: 'Teraz nie trwa żaden mecz, który da się typować. Wróć, gdy się zaczną — panel sam odświeża się co 3 minuty.',
		rejected: 'Odrzucone przez AI po statystykach na żywo:',
		analyzed: (n, k, m) => `Sprawdzono ${mecze(n)} na żywo (${m ?? 0} w ligach modelu), ${k} z kursami live.`,
		noAi: 'Sprawdzenie AI chwilowo niedostępne — typy tylko z wyliczeń i rynku.',
		warning: 'Kursy live zmieniają się co kilka sekund — to mediana z chwili wygenerowania. Kupon rozliczamy publicznie (Skuteczność → Kupon live). Szacunki, nie pewniaki. 18+.',
		lockedTitle: 'Kupon live · Pro i VIP',
		lockedReady: (odds, chance, n) => `Kupon gotowy: kurs łączny ${kurs(odds)}, szansa ${chance}%, ${n} ${n === 1 ? 'typ' : n < 5 ? 'typy' : 'typów'}.`,
		lockedNote: `Mecze, typy i uzasadnienie AI widać w planie Pro i VIP — oraz przez ${TRIAL.days} dni po założeniu konta.`,
		unlock: 'Odblokuj kupon live',
		error: 'Nie udało się złożyć kuponu live — spróbuj za minutę.',
	};
}
