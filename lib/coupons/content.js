import { COUPON_TYPES, LEG_MAX_ODDS } from '@/lib/coupons/build';
import { TRIAL } from '@/lib/billing/plans';

/**
 * Treść kuponów (karta, strona „Typy na dziś", strona główna, skuteczność).
 *
 * Tu — wyjątkowo w serwisie — mówimy o kursach: kupon bez kursu nie ma sensu (decyzja
 * właściciela, październik 2026). Zasady zostają te same co wszędzie: mediana kilku
 * bukmacherów bez nazw i linków, obok kursu zawsze szansa według modelu, wynik rozliczany
 * publicznie, dopisek 18+. Żadnych słów o wygranej ani zachęt do gry.
 *
 * Kupon dnia jest za darmo; 3- i 5-dniowy w planie Pro i VIP (i w okresie próbnym) — przed
 * rozliczeniem pozostali widzą kurs łączny, szansę i liczbę typów, bez meczów.
 */

const liczba = (locale, v, digits = 2) =>
	Number.isFinite(v)
		? v.toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits })
		: '—';

/** „1 typ", „3 typy", „5 typów" — polska odmiana. */
function typyOdmiana(n) {
	if (n === 1) return 'typ';
	return n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'typy' : 'typów';
}

export function couponContent(locale) {
	const kurs = (v) => liczba(locale, v);
	const cel = (type) => liczba(locale, COUPON_TYPES[type].target, 1);
	const prog = liczba(locale, LEG_MAX_ODDS);

	if (locale === 'en') {
		return {
			odds: kurs,
			sectionTitle: 'Coupons',
			sectionLead: `Several of the model’s surest picks on one coupon. The coupon of the day (about ${cel('daily')}) is free for everyone; the 3-day (about ${cel('days3')}) and 5-day (about ${cel('days5')}) coupons pick the surest picks from more matches — on Pro and VIP.`,
			label: {
				daily: 'Coupon of the day · free',
				days3: 'Coupon for 3 days · your plan',
				days5: 'Coupon for 5 days · your plan',
				weekend: 'Weekend coupon',
			},
			lockedLabel: { days3: 'Coupon for 3 days · Pro and VIP', days5: 'Coupon for 5 days · Pro and VIP' },
			tab: { daily: 'Coupon of the day', days3: '3-day coupon', days5: '5-day coupon', weekend: 'Weekend coupon', live: 'Live coupon' },
			filterLabel: 'Coupons and higher odds',
			yesterday: 'Yesterday’s coupon of the day',
			yesterdaySection: 'Yesterday',
			totalOdds: 'Total odds',
			chance: 'Model’s chance',
			legs: (n) => (n === 1 ? '1 pick' : `${n} picks`),
			lockedLegs: (n, od, doo) => `${n === 1 ? '1 pick' : `${n} picks`} · ${od === doo ? od : `${od} – ${doo}`}`,
			lockedNote: `The matches and picks are shown on Pro and VIP — and for ${TRIAL.days} days after you create an account. Settled coupons are public in Accuracy.`,
			unlock: 'Unlock the coupon',
			newsChecked: 'Before publishing, AI checked the news on every match: injuries, line-ups, rotation.',
			newsDropped: 'Dropped after the news check:',
			newsCheckedLocked: 'Picks checked by AI for injuries and squad rotation.',
			trialNote: `New account: ${TRIAL.days} days with all coupons for free.`,
			status: { pending: 'Before kick-off', live: 'In play', won: 'Landed', lost: 'Missed', void: 'Void — matches not played' },
			legStatus: { won: 'Hit', lost: 'Miss', void: 'Void (odds 1.00)', live: 'In play', pending: 'Before kick-off' },
			wonWith: (v) => `Landed at ${kurs(v)}`,
			later: {
				daily: 'The coupon of the day appears at 9:30.',
				paid: 'New 3-day and 5-day coupons appear at 9:30.',
			},
			none: {
				daily: 'Today the model did not build a coupon — not enough picks where the bookmakers agree with it. No coupon is an honest answer too.',
			},
			how: `How it’s built: we take the model’s picks where bookmakers pay below ${prog} — that’s where the model hits as often as it promises — and only matches kicking off between 12:00 and 23:00 Polish time. From the surest one until the total reaches the target. Each coupon uses different matches. Odds are the median of several bookmakers at the moment of choosing. The coupon never changes and is settled in public after 90 minutes; a cancelled match counts as 1.00.`,
			honest: (chance) => `A ${chance}% chance means it lands about ${Math.round(chance / 10)} times in 10 — not a sure thing.`,
			record: (type, won, total) =>
				`${{ daily: 'Coupons of the day', days3: '3-day coupons', days5: '5-day coupons', weekend: 'Weekend coupons', live: 'Live coupons' }[type]} so far: ${won} of ${total} landed.`,
			disclaimer: 'Median odds of several bookmakers, no links. Estimates, not sure things. We do not take bets. 18+.',
			statsEntered: (won, settled) => `${won} of ${settled} landed`,
			statsPromised: (chance, odds) => `The model promised ${chance}% on average · average total odds ${kurs(odds)}`,
			statsNone: (n) => `Days without a coupon: ${n}`,
			statsRecent: 'Recent coupons',
			statsSmall: 'small sample — the numbers still swing',
			statsCounts: { won: 'Landed', lost: 'Missed', pending: 'In play', none: 'No coupon' },
			statsEmpty: 'No settled coupons yet — the first ones are being played.',
			statsHint: 'Every coupon counts, landed or not. Days the model skipped are shown separately.',
			seeAll: 'Coupons and all of today’s picks',
		};
	}

	return {
		odds: kurs,
		sectionTitle: 'Kupony',
		sectionLead: `Kilka najpewniejszych typów modelu na jednym kuponie. Kupon dnia (ok. ${cel('daily')}) jest za darmo dla wszystkich; 3-dniowy (ok. ${cel('days3')}) i 5-dniowy (ok. ${cel('days5')}) wybierają najpewniejsze typy z większej liczby meczów — w planie Pro i VIP.`,
		label: {
			daily: 'Kupon dnia · za darmo',
			days3: 'Kupon na 3 dni · Twój plan',
			days5: 'Kupon na 5 dni · Twój plan',
			weekend: 'Kupon weekendowy',
		},
		lockedLabel: { days3: 'Kupon na 3 dni · Pro i VIP', days5: 'Kupon na 5 dni · Pro i VIP' },
		tab: { daily: 'Kupon dnia', days3: 'Kupon 3-dniowy', days5: 'Kupon 5-dniowy', weekend: 'Kupon weekendowy', live: 'Kupon live' },
		filterLabel: 'Kupony i wyższe kursy',
		yesterday: 'Wczorajszy kupon dnia',
		yesterdaySection: 'Wczoraj',
		totalOdds: 'Kurs łączny',
		chance: 'Szansa według modelu',
		legs: (n) => `${n} ${typyOdmiana(n)}`,
		lockedLegs: (n, od, doo) => `${n} ${typyOdmiana(n)} · ${od === doo ? od : `${od} – ${doo}`}`,
		lockedNote: `Mecze i typy widać w planie Pro i VIP — oraz przez ${TRIAL.days} dni po założeniu konta. Rozliczone kupony są jawne w Skuteczności.`,
		unlock: 'Odblokuj kupon',
		newsChecked: 'Przed publikacją AI sprawdziło wiadomości o każdym meczu: kontuzje, składy, rotacja.',
		newsDropped: 'Odrzucony po sprawdzeniu:',
		newsCheckedLocked: 'Typy sprawdzone przez AI pod kątem kontuzji i rotacji składu.',
		trialNote: `Nowe konto: ${TRIAL.days} dni ze wszystkimi kuponami za darmo.`,
		status: { pending: 'Przed meczami', live: 'W grze', won: 'Wszedł', lost: 'Nie wszedł', void: 'Anulowany — mecze się nie odbyły' },
		legStatus: { won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany (kurs 1,00)', live: 'Mecz trwa', pending: 'Przed meczem' },
		wonWith: (v) => `Wszedł po kursie ${kurs(v)}`,
		later: {
			daily: 'Kupon dnia pojawi się dziś o 9:30.',
			paid: 'Nowe kupony na 3 i 5 dni pojawią się dziś o 9:30.',
		},
		none: {
			daily: 'Dziś model nie złożył kuponu — za mało typów, przy których bukmacherzy się z nim zgadzają. Brak kuponu to też uczciwa odpowiedź.',
		},
		how: `Jak powstaje: bierzemy typy modelu, przy których bukmacherzy dają kurs poniżej ${prog} — tam model trafia tyle, ile obiecuje — i tylko mecze z początkiem od 12:00 do 23:00. Od najpewniejszego, aż kurs łączny dojdzie do celu; każdy kupon ma inne mecze. Kurs to mediana kilku bukmacherów z chwili wyboru. Kupon się nie zmienia, rozliczamy go publicznie po 90 minutach; mecz odwołany liczy się jak kurs 1,00.`,
		honest: (chance) => `Szansa ${chance}% to mniej więcej ${Math.round(chance / 10)} na 10 — nie pewniak.`,
		record: (type, won, total) =>
			`${{ daily: 'Kupony dnia', days3: 'Kupony 3-dniowe', days5: 'Kupony 5-dniowe', weekend: 'Kupony weekendowe', live: 'Kupony live' }[type]} dotąd: ${won} z ${total} weszło.`,
		disclaimer: 'Kursy to mediana kilku bukmacherów, bez linków. Szacunki, nie pewniaki. Serwis nie przyjmuje zakładów. 18+.',
		statsEntered: (won, settled) => `${won} z ${settled} weszło`,
		statsPromised: (chance, odds) => `Model zapowiadał średnio ${chance}% · średni kurs łączny ${kurs(odds)}`,
		statsNone: (n) => `Dni bez kuponu: ${n}`,
		statsRecent: 'Ostatnie kupony',
		statsSmall: 'mała próba — liczby jeszcze się wahają',
		statsCounts: { won: 'Weszły', lost: 'Nie weszły', pending: 'W grze', none: 'Bez kuponu' },
		statsEmpty: 'Nie ma jeszcze rozliczonych kuponów — pierwsze są w grze.',
		statsHint: 'Liczy się każdy kupon, który wszedł i który nie wszedł. Dni, w których model kuponu nie złożył, pokazujemy osobno.',
		seeAll: 'Kupony i wszystkie typy na dziś',
	};
}
