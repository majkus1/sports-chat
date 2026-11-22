import { TRIAL } from '@/lib/billing/plans';
import { LIVE_COUPON } from '@/lib/live/select';

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
			// Skąd szansa, mówi linia przy każdym typie („rynek · model” albo „kursy sprzed meczu + wynik”).
			lead: 'Picks from matches in play: score, minute and live statistics. AI checks each pick against the game.',
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
					? `Nothing passes the rules right now (${n === 1 ? '1 live match' : `${n} live matches`} checked). The panel refreshes every 3 minutes.`
					: 'No match in play right now. The panel refreshes every 3 minutes.',
			rejected: 'Rejected by AI after the live statistics:',
			topLabel: (time) => `No coupon right now — strongest live picks · ${time}`,
			topNote: `They passed the rules and the AI check, but don’t add up to a coupon of about ${kurs(LIVE_COUPON.target)}. Watch the minute and the score.`,
			noOdds: (n) => `No live odds from the data provider right now (${n === 1 ? '1 live match' : `${n} live matches`} checked). We’ll try again in 3 minutes.`,
			analyzed: (n, k, m) => `Checked ${n === 1 ? '1 live match' : `${n} live matches`} (${m ?? 0} in the model’s leagues), ${k} with live odds.`,
			noAi: 'AI check unavailable right now — picks from the model and the market only.',
			warning: 'Live odds change constantly — median at the moment of generation. Settled in public: Accuracy → Live coupon. Estimates, not sure things. 18+.',
			lockedTitle: 'Live coupon · Pro and VIP',
			lockedReady: (odds, chance, n) => `Coupon ready: total odds ${kurs(odds)}, chance ${chance}%, ${n === 1 ? '1 pick' : `${n} picks`}.`,
			lockedNote: `Matches, picks and AI reasoning on Pro and VIP — free for ${TRIAL.days} days on a new account.`,
			unlock: 'Unlock the live coupon',
			unlockGuest: 'Reveal it for free',
			error: 'Could not build the live coupon — try again in a minute.',
		};
	}
	return {
		odds: kurs,
		title: 'Generator kuponu live',
		// Skąd szansa, mówi linia przy każdym typie („rynek · model” albo „kursy sprzed meczu + wynik”).
		lead: 'Typy z trwających meczów: wynik, minuta i statystyki na żywo. AI sprawdza każdy typ z przebiegiem gry.',
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
				? `Teraz nic nie przechodzi zasad (sprawdzono ${mecze(n)}). Panel odświeża się co 3 minuty.`
				: 'Teraz nie trwa żaden mecz do typowania. Panel odświeża się co 3 minuty.',
		rejected: 'Odrzucone przez AI po statystykach na żywo:',
		topLabel: (time) => `Bez kuponu — najmocniejsze typy w tej chwili · ${time}`,
		topNote: `Przeszły zasady i sprawdzenie AI, ale nie składają się w kupon ok. ${kurs(LIVE_COUPON.target)}. Patrz na minutę i wynik.`,
		// Brak kursów to awaria dostawcy, nie „nic nie przechodzi zasad" — mówimy, co się stało.
		noOdds: (n) => `Dostawca danych nie oddał teraz kursów live (sprawdzono ${mecze(n)}). Spróbujemy znów za 3 minuty.`,
		analyzed: (n, k, m) => `Sprawdzono ${mecze(n)} na żywo (${m ?? 0} w ligach modelu), ${k} z kursami live.`,
		noAi: 'Sprawdzenie AI chwilowo niedostępne — typy tylko z wyliczeń i rynku.',
		warning: 'Kursy live zmieniają się co chwilę — to mediana z chwili wygenerowania. Rozliczenie: Skuteczność → Kupon live. Szacunki, nie pewniaki. 18+.',
		lockedTitle: 'Kupon live · Pro i VIP',
		lockedReady: (odds, chance, n) => `Kupon gotowy: kurs łączny ${kurs(odds)}, szansa ${chance}%, ${n} ${n === 1 ? 'typ' : n < 5 ? 'typy' : 'typów'}.`,
		lockedNote: `Mecze, typy i uzasadnienie AI w Pro i VIP — za darmo przez ${TRIAL.days} dni na nowym koncie.`,
		unlock: 'Odblokuj kupon live',
		unlockGuest: 'Odkryj za darmo',
		error: 'Nie udało się złożyć kuponu live — spróbuj za minutę.',
	};
}
