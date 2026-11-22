import { COUPON_TYPES, LEG_MAX_ODDS, LEG_MIN_ODDS } from '@/lib/coupons/build';
import { CUSTOM_ODDS, customOdds } from '@/lib/coupons/custom';
import { PLANS, TRIAL } from '@/lib/billing/plans';
import { KUPONY, MECZE, TYPY, odmien } from '@/lib/landing/plural';

/**
 * Treść kuponów (karta, strona „Typy na dziś", strona główna, skuteczność, znaczniki przy meczach).
 *
 * Tu — wyjątkowo w serwisie — mówimy o kursach: kupon bez kursu nie ma sensu (decyzja
 * właściciela, październik 2026). Zasady zostają te same co wszędzie: mediana kilku
 * bukmacherów bez nazw i linków, obok kursu zawsze szansa (od 21.11.2026 typy potwierdzone kursami), wynik rozliczany
 * publicznie, dopisek 18+. Żadnych słów o wygranej ani zachęt do gry.
 *
 * UCZCIWIE O KURSIE (od 25.10.2026): mediana z API-Football bywa wyższa niż kurs u polskiego
 * bukmachera, a podatek 12% od stawki dodatkowo zmniejsza wypłatę — mówimy to przy każdym
 * kuponie, żeby „2,5 u nas" nie udawało „2,5 u Ciebie".
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

/**
 * Notka terminarza przy meczu w karcie kuponu, w języku czytelnika — albo `null`. Zapis ma ją tylko
 * przy sygnale (puchar w środku tygodnia, ważny mecz za kilka dni — `lib/football/schedule.js`),
 * więc zwykły mecz nie dostaje żadnego dopisku. Zakryte typy płatnych kuponów w ogóle nie
 * przychodzą z trasy (`couponDto({ unlocked })`), więc i notki nie ma skąd pokazać.
 */
export function legScheduleNote(leg, locale) {
	const notka = leg?.schedule;
	if (!notka) return null;
	return (locale === 'en' ? notka.en || notka.pl : notka.pl || notka.en) || null;
}

/** Data, od której obowiązują zasady z `build.js` (2,0–2,5 z 2–3 meczów, typy potwierdzone kursami). */
const ZASADY_OD = { pl: '21.11.2026', en: '21 Nov 2026' };

export function couponContent(locale) {
	const kurs = (v) => liczba(locale, v);
	// „2,0–2,5" — od celu do górnej granicy; kupon dnia i 3-dniowy mają ten sam przedział, 5-dniowy własny.
	const zakres = (type) => `${liczba(locale, COUPON_TYPES[type].target, 1)}–${liczba(locale, COUPON_TYPES[type].max, 1)}`;
	const nogi = (type) => COUPON_TYPES[type].maxLegs;
	const prog = liczba(locale, LEG_MAX_ODDS);
	const prog5 = liczba(locale, COUPON_TYPES.days5.legMaxOdds ?? LEG_MAX_ODDS);

	if (locale === 'en') {
		return {
			odds: kurs,
			sectionTitle: 'Coupons',
			// O okresie próbnym mówi karta z kłódką — tu tylko, co jest za darmo, a co w planie.
			sectionLead: `Coupon of the day for free. ${COUPON_TYPES.days3.days}-day and ${COUPON_TYPES.days5.days}-day coupons — on Pro and VIP.`,
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
			// Podpis idzie za zapisem (`couponDto().chanceSource`): wszystkie typy z kursów, typy potwierdzone
			// kursami (część z szansą modelu — `MARKET_CHANCE_KEYS`), kupony sprzed 21.11.2026 — szansa modelu.
			chance: 'Chance from the odds',
			chanceConfirmed: 'Chance · picks confirmed by the odds',
			chanceModel: 'Model’s chance',
			legs: (n) => (n === 1 ? '1 pick' : `${n} picks`),
			lockedLegs: (n, od, doo) => `${n === 1 ? '1 pick' : `${n} picks`} · ${od === doo ? od : `${od} – ${doo}`}`,
			lockedNote: `Matches and picks on Pro and VIP — free for ${TRIAL.days} days on a new account.`,
			unlock: 'Unlock the coupon',
			// Gość: rejestracja (okres próbny odkrywa kupony), a nie cennik — bez konta i tak nic tam nie kupi.
			unlockGuest: 'Reveal it for free',
			newsChecked: 'AI checked injuries and line-ups before publishing.',
			newsDropped: 'Dropped after the news check:',
			newsCheckedLocked: 'AI checked injuries and line-ups.',
			status: { pending: 'Before kick-off', live: 'In play', won: 'Landed', lost: 'Missed', void: 'Void — matches not played' },
			legStatus: { won: 'Hit', lost: 'Miss', void: 'Void (odds 1.00)', live: 'In play', pending: 'Before kick-off' },
			wonWith: (v) => `Landed at ${kurs(v)}`,
			later: {
				daily: 'The coupon of the day appears at 9:30.',
				paid: 'New 3-day and 5-day coupons appear at 9:30.',
			},
			none: {
				daily: 'Today the model did not build a coupon — not enough picks confirmed by the odds.',
			},
			howTitle: 'How a coupon is built',
			// Skrót zasad z `build.js` (liczby z `COUPON_TYPES` i `LEG_MAX_ODDS`) — pod rozwinięciem, pełniej w FAQ i na /jak-to-dziala.
			how: `The model picks, the odds confirm: the chance read from the odds must clear the threshold too. Coupon of the day and 3-day: at most ${nogi('daily')} picks, total odds ${zakres('daily')}; 5-day: at most ${nogi('days5')}, ${zakres('days5')}. Each pick priced below ${prog} (5-day: ${prog5}), matches 12:00–23:00. The coupon’s chance is the product of the picks’ chances. The coupon never changes; we settle it in public after 90 minutes, a cancelled match counts as 1.00.`,
			honest: (chance) => `A ${chance}% chance is about ${Math.round(chance / 10)} in 10 — not a sure thing.`,
			record: (type, won, total) =>
				`${{ daily: 'Coupons of the day', days3: '3-day coupons', days5: '5-day coupons', weekend: 'Weekend coupons', live: 'Live coupons' }[type]} so far: ${won} of ${total} landed.`,
			// Raz pod blokiem kuponów, nie w każdej karcie.
			disclaimer: 'Odds are the median of several bookmakers — Polish bookmakers may pay less, and the 12% tax lowers the payout. Estimates, not sure things. 18+.',
			rulesNote: `Since ${ZASADY_OD.en} the coupon of the day and the 3-day one aim at ${zakres('daily')} from 2–3 matches and every pick is confirmed by the odds; older coupons (2.4–2.8, about 2.0 and 3.0) stay in the record.`,
			mark: { daily: 'In the coupon of the day', days3: 'In the 3-day coupon', days5: 'In the 5-day coupon' },
			markTitle: (type) =>
				`This pick is on the ${{ daily: 'coupon of the day', days3: '3-day coupon', days5: '5-day coupon' }[type]} — the whole coupon is on the “Today’s picks” page.`,
			statsEntered: (won, settled) => `${won} of ${settled} landed`,
			statsPromised: (chance, odds) => `Promised chance ${chance}% on average · average total odds ${kurs(odds)}`,
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
		// O okresie próbnym mówi karta z kłódką — tu tylko, co jest za darmo, a co w planie.
		sectionLead: `Kupon dnia za darmo. Kupony na ${COUPON_TYPES.days3.days} i ${COUPON_TYPES.days5.days} dni — w Pro i VIP.`,
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
		chance: 'Szansa z kursów',
		chanceConfirmed: 'Szansa · typy potwierdzone kursami',
		chanceModel: 'Szansa według modelu',
		legs: (n) => `${n} ${typyOdmiana(n)}`,
		lockedLegs: (n, od, doo) => `${n} ${typyOdmiana(n)} · ${od === doo ? od : `${od} – ${doo}`}`,
		lockedNote: `Mecze i typy w Pro i VIP — za darmo przez ${TRIAL.days} dni na nowym koncie.`,
		unlock: 'Odblokuj kupon',
		// Gość: rejestracja (okres próbny odkrywa kupony), a nie cennik — bez konta i tak nic tam nie kupi.
		unlockGuest: 'Odkryj za darmo',
		newsChecked: 'AI sprawdziło kontuzje i składy przed publikacją.',
		newsDropped: 'Odrzucony po sprawdzeniu:',
		newsCheckedLocked: 'AI sprawdziło kontuzje i składy.',
		status: { pending: 'Przed meczami', live: 'W grze', won: 'Wszedł', lost: 'Nie wszedł', void: 'Anulowany — mecze się nie odbyły' },
		legStatus: { won: 'Trafiony', lost: 'Chybiony', void: 'Anulowany (kurs 1,00)', live: 'Mecz trwa', pending: 'Przed meczem' },
		wonWith: (v) => `Wszedł po kursie ${kurs(v)}`,
		later: {
			daily: 'Kupon dnia pojawi się dziś o 9:30.',
			paid: 'Nowe kupony na 3 i 5 dni pojawią się dziś o 9:30.',
		},
		none: {
			daily: 'Dziś model nie złożył kuponu — za mało typów potwierdzonych kursami.',
		},
		howTitle: 'Jak powstaje kupon',
		// Skrót zasad z `build.js` (liczby z `COUPON_TYPES` i `LEG_MAX_ODDS`) — pod rozwinięciem, pełniej w FAQ i na /jak-to-dziala.
		how: `Model wybiera typy, kursy je potwierdzają: szansa z kursu też musi przejść próg. Kupon dnia i 3-dniowy: najwyżej ${nogi('daily')} ${odmien(nogi('daily'), TYPY)}, kurs łączny ${zakres('daily')}; 5-dniowy: najwyżej ${nogi('days5')}, ${zakres('days5')}. Kurs typu poniżej ${prog} (5-dniowy: ${prog5}), mecze 12:00–23:00. Szansa kuponu to iloczyn szans typów. Kupon się nie zmienia; rozliczamy go publicznie po 90 minutach, mecz odwołany liczy się jak kurs 1,00.`,
		honest: (chance) => `Szansa ${chance}% to ok. ${Math.round(chance / 10)} na 10 — nie pewniak.`,
		record: (type, won, total) =>
			`${{ daily: 'Kupony dnia', days3: 'Kupony 3-dniowe', days5: 'Kupony 5-dniowe', weekend: 'Kupony weekendowe', live: 'Kupony live' }[type]} dotąd: ${won} z ${total} weszło.`,
		// Raz pod blokiem kuponów, nie w każdej karcie.
		disclaimer: 'Kursy to mediana kilku bukmacherów — u polskich bywają niższe, a podatek 12% zmniejsza wypłatę. Szacunki, nie pewniaki. 18+.',
		rulesNote: `Od ${ZASADY_OD.pl} kupon dnia i 3-dniowy celują w kurs łączny ${zakres('daily')} z 2–3 meczów, a każdy typ jest potwierdzony kursami; starsze kupony (2,4–2,8, ok. 2,0 i 3,0) zostają w bilansie.`,
		mark: { daily: 'W kuponie dnia', days3: 'W kuponie 3-dniowym', days5: 'W kuponie 5-dniowym' },
		markTitle: (type) =>
			`Ten typ jest na ${{ daily: 'kuponie dnia', days3: 'kuponie 3-dniowym', days5: 'kuponie 5-dniowym' }[type]} — cały kupon na stronie „Typy na dziś".`,
		statsEntered: (won, settled) => `${won} z ${settled} weszło`,
		statsPromised: (chance, odds) => `Zapowiadana szansa średnio ${chance}% · średni kurs łączny ${kurs(odds)}`,
		statsNone: (n) => `Dni bez kuponu: ${n}`,
		statsRecent: 'Ostatnie kupony',
		statsSmall: 'mała próba — liczby jeszcze się wahają',
		statsCounts: { won: 'Weszły', lost: 'Nie weszły', pending: 'W grze', none: 'Bez kuponu' },
		statsEmpty: 'Nie ma jeszcze rozliczonych kuponów — pierwsze są w grze.',
		statsHint: 'Liczy się każdy kupon, który wszedł i który nie wszedł. Dni, w których model kuponu nie złożył, pokazujemy osobno.',
		seeAll: 'Kupony i wszystkie typy na dziś',
	};
}

/** Nazwy grup rozgrywek z `LEAGUE_GROUPS` (`lib/football/leagues.js`) — test pilnuje kompletu. */
const GRUPY_LIG = {
	pl: {
		cups: 'Puchary europejskie',
		national: 'Reprezentacje',
		poland: 'Polska',
		england: 'Anglia',
		spain: 'Hiszpania',
		italy: 'Włochy',
		germany: 'Niemcy',
		france: 'Francja',
		europe: 'Reszta Europy',
		americas: 'Ameryki',
		world: 'Azja i Afryka',
	},
	en: {
		cups: 'European cups',
		national: 'National teams',
		poland: 'Poland',
		england: 'England',
		spain: 'Spain',
		italy: 'Italy',
		germany: 'Germany',
		france: 'France',
		europe: 'Rest of Europe',
		americas: 'Americas',
		world: 'Asia and Africa',
	},
};

/**
 * Treść kreatora kuponu i „Moich kuponów" (`lib/coupons/custom.js`, `customService.js`).
 *
 * Te same zasady słów co przy kuponach serwisu: obok kursu zawsze szansa, dopisek, że
 * wyższy kurs to mniejsza szansa, że to szacunki, a kursy to mediana bukmacherów (u polskich bywa
 * niższy, podatek 12%), 18+ — i żadnej zachęty do gry. Do tego dwie rzeczy własne kreatora: powód
 * „nie da się" po ludzku (z liczbami: ile meczów, ile typów przeszło zasady) i informacja, że własne
 * kupony nie wchodzą do publicznej skuteczności. Liczby limitów idą z `PLANS` i `TRIAL`.
 */
export function couponBuilderContent(locale) {
	const en = locale === 'en';
	const kurs = (v, d = 2) => liczba(locale, v, d);
	const zakres = (id) => {
		const o = customOdds(id);
		return o ? `${kurs(o.target, 1)}–${kurs(o.max, 1)}` : '';
	};
	const nazwaKursu = (id) => `${en ? 'about' : 'ok.'} ${kurs(customOdds(id)?.nominal, 1)}`;
	// „ok. 3,0 wchodzi rzadziej niż ok. 2,0" — skrajne cele z `CUSTOM_ODDS`, nie wpisane na sztywno.
	const najnizszy = nazwaKursu(CUSTOM_ODDS[0].id);
	const najwyzszy = nazwaKursu(CUSTOM_ODDS[CUSTOM_ODDS.length - 1].id);
	const pro = PLANS.pro.limits.couponGen;
	const vip = PLANS.vip.limits.couponGen;
	const proba = TRIAL.limits.couponGen;
	const progTypu = kurs(LEG_MAX_ODDS);
	const zasadyTypu = en
		? `odds ${kurs(LEG_MIN_ODDS)}–${progTypu} and the pick confirmed by the odds`
		: `kurs ${kurs(LEG_MIN_ODDS)}–${progTypu} i typ potwierdzony kursami`;
	const ligi = GRUPY_LIG[en ? 'en' : 'pl'];
	const okna = en
		? { today: 'Today until 23:00', evening: 'Tonight 18–23', tomorrow: 'Tomorrow 12–23', h24: 'Next 24 h', days3: 'Next 3 days' }
		: { today: 'Dziś do 23:00', evening: 'Dziś 18–23', tomorrow: 'Jutro 12–23', h24: 'Najbliższe 24 h', days3: 'Najbliższe 3 dni' };
	/** „ok. 2,5 · najwyżej 4 mecze · Dziś 18–23 · Anglia, Hiszpania" — ustawienia zapisane przy kuponie. */
	const opisUstawien = (p) => {
		if (!p) return '';
		const czesci = [
			nazwaKursu(p.odds),
			en ? `up to ${p.legs} matches` : `najwyżej ${p.legs} ${odmien(p.legs, MECZE)}`,
			okna[p.window] || p.window,
			p.leagues?.length ? p.leagues.map((g) => ligi[g] || g).join(', ') : en ? 'all leagues' : 'wszystkie ligi',
		];
		if (p.skipPublished) czesci.push(en ? 'without the site’s coupons' : 'bez meczów z kuponów serwisu');
		return czesci.join(' · ');
	};
	const chwila = (iso) =>
		new Date(iso).toLocaleString(en ? 'en-GB' : 'pl-PL', {
			timeZone: 'Europe/Warsaw',
			day: 'numeric',
			month: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});

	if (en) {
		return {
			odds: kurs,
			title: 'Coupon builder',
			badge: 'Pro · VIP',
			lead: 'Pick the total odds — the model builds a coupon from its own picks, and AI checks the news.',
			oddsLabel: 'Total odds',
			oddsOptions: CUSTOM_ODDS.map((o) => ({ id: o.id, label: nazwaKursu(o.id), range: zakres(o.id) })),
			legsLabel: 'At most matches',
			legsMinNote: (needed, oddsId) =>
				`Coupon picks are priced below ${progTypu}, so ${nazwaKursu(oddsId)} needs at least ${needed} matches.`,
			windowLabel: 'Kick-off',
			window: okna,
			hoursNote: 'Matches 12:00–23:00 Polish time, at least an hour from now.',
			windowClosed: 'No match today kicks off at least an hour from now and by 23:00 — pick the next 24 h or 3 days.',
			leaguesLabel: 'Leagues',
			leaguesAll: 'All',
			leagueGroups: ligi,
			skipPublished: 'Skip matches from the site’s coupons',
			skipPublishedHint: 'Different matches from today’s coupon of the day, 3-day and 5-day coupons.',
			submit: 'Build the coupon',
			// Zaawansowane ustawienia pod rozwinięciem — na wierzchu tylko kurs łączny i przycisk.
			moreSettings: 'More settings: hours, leagues, matches',
			generating: 'Building the coupon and checking the news… (up to a minute)',
			remaining: (r, l) => `Left today: ${r} of ${l}`,
			unlimited: 'No limit',
			trialBadge: 'trial',
			resultLabel: (iso) => `Your coupon · ${chwila(iso)}`,
			paramsLine: opisUstawien,
			repeated: 'Same coupon as a moment ago — with these settings nothing has changed, so your limit is untouched.',
			newsChecked: 'AI checked injuries and line-ups before showing it.',
			newsSkipped: 'This time the news was not checked (daily AI cost cap) — the picks come from the model alone.',
			impossibleTitle: 'No coupon from these matches',
			reasons: {
				too_few_legs: ({ needed, params }) =>
					`For ${nazwaKursu(params.odds)} you need at least ${needed} matches: coupon picks are priced below ${progTypu}, so ${needed - 1} of them give at most ${kurs(LEG_MAX_ODDS ** (needed - 1))}.`,
				window_closed: () => 'No match today kicks off at least an hour from now and by 23:00.',
				unavailable: () => 'We couldn’t fetch the matches and odds right now.',
				no_matches: () => 'The model has no pick on any match in these hours and leagues.',
				leagues_empty: ({ counts }) =>
					`The chosen leagues have no match with a model pick in these hours — the other leagues have ${counts.otherLeagues}.`,
				few_picks: ({ counts }) =>
					`Of ${counts.matches} ${counts.matches === 1 ? 'match' : 'matches'} with a model pick, ` +
					(counts.picks
						? `${counts.picks} ${counts.picks === 1 ? 'meets' : 'meet'} the coupon rules (${zasadyTypu})`
						: `none meets the coupon rules (${zasadyTypu})`) +
					` — at least ${counts.needed} are needed.` +
					(counts.withOdds < counts.matches ? ` Odds are available for ${counts.withOdds} of them so far.` : ''),
				no_combo: ({ counts, params }) =>
					`${counts.picks} ${counts.picks === 1 ? 'pick meets' : 'picks meet'} the rules, but no set of at most ${params.legs} matches gives total odds of ${zakres(params.odds)}.`,
				news_dropped: ({ dropped, params }) =>
					`After the news check AI dropped ${dropped.length} ${dropped.length === 1 ? 'pick' : 'picks'}, and without ${dropped.length === 1 ? 'it' : 'them'} total odds of ${zakres(params.odds)} can’t be reached.`,
			},
			droppedLabel: 'Dropped after the news check:',
			partial: 'Some odds couldn’t be fetched right now — in a few minutes the answer may differ.',
			noCharge: 'Your limit was not used.',
			suggestTitle: 'Try:',
			suggest: {
				window: 'widening the hours (e.g. the next 24 h or 3 days)',
				leagues: 'adding leagues or choosing all',
				published: 'allowing matches from the site’s coupons',
				legs: 'allowing more matches',
				odds: 'a different total odds target',
				retry: 'again in a few minutes',
			},
			honest: `Higher odds mean a lower chance: a coupon at ${najwyzszy} lands less often than one at ${najnizszy}. Odds are the median of several bookmakers — Polish bookmakers may pay less, and the 12% tax lowers the payout. Your own coupons don’t count towards public accuracy. An estimate, not a sure thing. 18+.`,
			myCoupons: 'My coupons',
			error: 'The coupon couldn’t be built — please try again shortly.',
			busy: 'Your coupon is already being built — give it a moment.',
			limitReached: (limit) => `You’ve used today’s ${limit} ${limit === 1 ? 'coupon' : 'coupons'} — the limit renews at midnight.`,
			locked: {
				title: 'Coupon builder — Pro and VIP',
				body: `You choose the odds, hours and leagues. Pro: ${pro} coupons a day, VIP: ${vip}, new account: ${proba} a day for ${TRIAL.days} days.`,
				unlock: 'Unlock the builder',
				unlockGuest: 'Try it for free',
			},
			mine: {
				title: 'My coupons',
				lead: 'Your builder coupons and your record. They don’t count towards public accuracy.',
				entered: (won, settled) => `${won} of ${settled} settled landed`,
				promised: (chance, odds) => `Promised chance ${chance}% on average · average total odds ${kurs(odds)}`,
				pending: (n) => `In play: ${n}`,
				small: 'small sample — the numbers still swing',
				empty: 'No coupons of your own yet — build the first one in the builder.',
				toBuilder: 'Build a new coupon',
				loginRequired: 'Log in to see your coupons.',
				recent: (n) => `Latest ${n}`,
				error: 'Your coupons couldn’t be loaded — please try again shortly.',
			},
		};
	}

	return {
		odds: kurs,
		title: 'Kreator kuponu',
		badge: 'Pro · VIP',
		lead: 'Wybierz kurs łączny — model złoży kupon z własnych typów, a AI sprawdzi wiadomości.',
		oddsLabel: 'Kurs łączny',
		oddsOptions: CUSTOM_ODDS.map((o) => ({ id: o.id, label: nazwaKursu(o.id), range: zakres(o.id) })),
		legsLabel: 'Najwyżej meczów',
		// „Potrzeba co najmniej N meczów" — dopełniacz przy każdej liczbie od 2 w górę.
		legsMinNote: (needed, oddsId) =>
			`Typy na kupon mają kurs poniżej ${progTypu}, więc przy kursie ${nazwaKursu(oddsId)} potrzeba co najmniej ${needed} meczów.`,
		windowLabel: 'Pierwszy gwizdek',
		window: okna,
		hoursNote: 'Mecze 12:00–23:00, najwcześniej za godzinę.',
		windowClosed: 'Dziś nie ma już meczów z początkiem najwcześniej za godzinę i najpóźniej o 23:00 — wybierz najbliższe 24 h albo 3 dni.',
		leaguesLabel: 'Ligi',
		leaguesAll: 'Wszystkie',
		leagueGroups: ligi,
		skipPublished: 'Bez meczów z kuponów serwisu',
		skipPublishedHint: 'Inne mecze niż w dzisiejszym kuponie dnia, 3- i 5-dniowym.',
		submit: 'Złóż kupon',
		// Zaawansowane ustawienia pod rozwinięciem — na wierzchu tylko kurs łączny i przycisk.
		moreSettings: 'Więcej ustawień: godziny, ligi, mecze',
		generating: 'Składam kupon i sprawdzam wiadomości… (do minuty)',
		remaining: (r, l) => `Zostało dziś: ${r} z ${l}`,
		unlimited: 'Bez limitu',
		trialBadge: 'okres próbny',
		resultLabel: (iso) => `Twój kupon · ${chwila(iso)}`,
		paramsLine: opisUstawien,
		repeated: 'Ten sam kupon co przed chwilą — przy tych ustawieniach nic się nie zmieniło, więc limit nietknięty.',
		newsChecked: 'AI sprawdziło kontuzje i składy przed pokazaniem.',
		newsSkipped: 'Tym razem wiadomości nie zostały sprawdzone (dzienny limit kosztów AI) — typy są z samego modelu.',
		impossibleTitle: 'Z tych meczów nie da się złożyć kuponu',
		reasons: {
			too_few_legs: ({ needed, params }) =>
				`Przy kursie ${nazwaKursu(params.odds)} potrzeba co najmniej ${needed} meczów: typy na kupon mają kurs poniżej ${progTypu}, więc ${needed - 1} dają najwyżej ${kurs(LEG_MAX_ODDS ** (needed - 1))}.`,
			window_closed: () => 'Dziś nie ma już meczów z początkiem najwcześniej za godzinę i najpóźniej o 23:00.',
			unavailable: () => 'Nie udało się teraz pobrać meczów i kursów.',
			no_matches: () => 'Model nie ma typu przy żadnym meczu z wybranych godzin i lig.',
			leagues_empty: ({ counts }) =>
				`W wybranych ligach nie ma w tych godzinach meczu z typem modelu — w pozostałych ${odmien(counts.otherLeagues, ['jest', 'są', 'jest'])} ${counts.otherLeagues} ${odmien(counts.otherLeagues, ['taki mecz', 'takie mecze', 'takich meczów'])}.`,
			few_picks: ({ counts }) =>
				`Z ${counts.matches} ${counts.matches === 1 ? 'meczu' : 'meczów'} z typem modelu ` +
				(counts.picks
					? `zasady kuponu (${zasadyTypu}) ${odmien(counts.picks, ['spełnia', 'spełniają', 'spełnia'])} ${counts.picks}`
					: `żaden nie spełnia zasad kuponu (${zasadyTypu})`) +
				` — a potrzeba co najmniej ${counts.needed}.` +
				(counts.withOdds < counts.matches ? ` Kursy są na razie przy ${counts.withOdds} z nich.` : ''),
			no_combo: ({ counts, params }) =>
				`Zasady ${odmien(counts.picks, ['spełnia', 'spełniają', 'spełnia'])} ${counts.picks} ${odmien(counts.picks, TYPY)}, ale żaden zestaw z najwyżej ${params.legs} meczów nie daje kursu łącznego ${zakres(params.odds)}.`,
			news_dropped: ({ dropped, params }) =>
				`Po sprawdzeniu wiadomości AI odrzuciło ${dropped.length} ${odmien(dropped.length, TYPY)}, a bez ${dropped.length === 1 ? 'niego' : 'nich'} nie da się dojść do kursu łącznego ${zakres(params.odds)}.`,
		},
		droppedLabel: 'Odrzucone po sprawdzeniu wiadomości:',
		partial: 'Części kursów nie udało się teraz pobrać — za kilka minut odpowiedź może być inna.',
		noCharge: 'Limit nie został zużyty.',
		suggestTitle: 'Spróbuj:',
		suggest: {
			window: 'poszerzyć godziny (np. najbliższe 24 h albo 3 dni)',
			leagues: 'dodać ligi albo wybrać wszystkie',
			published: 'dopuścić mecze z kuponów serwisu',
			legs: 'pozwolić na więcej meczów',
			odds: 'wybrać inny kurs łączny',
			retry: 'jeszcze raz za kilka minut',
		},
		honest: `Wyższy kurs to mniejsza szansa: kupon ${najwyzszy} wchodzi rzadziej niż ${najnizszy}. Kursy to mediana kilku bukmacherów — u polskich bywają niższe, a podatek 12% zmniejsza wypłatę. Własne kupony nie wchodzą do publicznej skuteczności. Szacunki, nie pewniaki. 18+.`,
		myCoupons: 'Moje kupony',
		error: 'Nie udało się złożyć kuponu — spróbuj za chwilę.',
		busy: 'Kupon już się składa — poczekaj chwilę.',
		limitReached: (limit) => `Dzisiejszy limit (${limit} ${odmien(limit, KUPONY)}) jest wykorzystany — odnawia się o północy.`,
		locked: {
			title: 'Kreator kuponu — w Pro i VIP',
			body: `Sam wybierasz kurs, godziny i ligi. Pro: ${pro} ${odmien(pro, KUPONY)} dziennie, VIP: ${vip}, nowe konto: ${proba} dziennie przez ${TRIAL.days} dni.`,
			unlock: 'Odblokuj kreator',
			unlockGuest: 'Wypróbuj za darmo',
		},
		mine: {
			title: 'Moje kupony',
			lead: 'Kupony z kreatora i Twój bilans. Nie wchodzą do publicznej skuteczności.',
			entered: (won, settled) => `Weszło ${won} z ${settled} rozliczonych`,
			promised: (chance, odds) => `Zapowiadana szansa średnio ${chance}% · średni kurs łączny ${kurs(odds)}`,
			pending: (n) => `W grze: ${n}`,
			small: 'mała próba — liczby jeszcze się wahają',
			empty: 'Nie masz jeszcze własnych kuponów — złóż pierwszy w kreatorze.',
			toBuilder: 'Złóż nowy kupon',
			loginRequired: 'Zaloguj się, żeby zobaczyć swoje kupony.',
			recent: (n) => `Ostatnie ${n}`,
			error: 'Nie udało się wczytać kuponów — spróbuj za chwilę.',
		},
	};
}

/**
 * „Nie da się" z kreatora (`generateCustomCoupon` → `status: 'impossible'`) po ludzku: powód z liczbami
 * i podpowiedzi — jedno źródło dla karty w kreatorze i dla asystenta (`zloz_kupon`).
 *
 * @returns {{ reason: string, suggestions: string[], partial: string|null }}
 */
export function customImpossibleText(locale, wynik) {
	const c = couponBuilderContent(locale);
	const fn = c.reasons[wynik?.reason];
	return {
		reason: fn ? fn(wynik) : c.error,
		suggestions: (wynik?.suggest || []).map((s) => c.suggest[s]).filter(Boolean),
		partial: wynik?.partial ? c.partial : null,
	};
}
