import { CREDIT_COSTS, PLAN_PASS_DAYS, PLANS, TRIAL } from '@/lib/billing/plans';
import { ANALIZY, KREDYTY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Strona „Narzędzia" — wszystkie funkcje serwisu na kafelkach, w jednym miejscu.
 *
 * PO CO. Funkcji przybyło (typ dnia, kupony, kupon live, asystent, raporty, poranny mail,
 * kolejka…), a każda mieszka gdzie indziej: w menu piłki, pod „⋯", w panelu konta. Nowy
 * użytkownik nie miał jak się dowiedzieć, że coś istnieje, a płacący — gdzie to znaleźć.
 *
 * JEDNA TABLICA. Nowe narzędzie to jeden wpis w `TOOLS`: grupa, ikona, adres, dostęp i teksty
 * w obu językach obok siebie — nie dwa pliki do pilnowania. Test (`test/tools`) sprawdza, że
 * adres prowadzi do istniejącej trasy, a oznaczenie dostępu zgadza się z `lib/billing/plans`.
 *
 * DOSTĘP MÓWI PRAWDĘ Z KODU. `requires` wskazuje płatną część narzędzia (cechę planu albo
 * rodzaj limitu), `trial` — czy okres próbny ją obejmuje. Liczby w dopiskach pochodzą z planów,
 * więc zmiana limitu nie zostawi tu nieprawdy. Analiza na żywo celowo ma `trial: false` —
 * okres próbny obejmuje plakietki i poranny mail, a nie analizę live.
 *
 * SŁOWA. Tam, gdzie tematem są kursy (kupony, kupon live, wyższy kurs), dopisek mówi wprost:
 * szacunki, nie pewniaki, 18+. Bez zachęt do gry i bez obietnic wygranej.
 */

const free = PLANS.free.limits;
const pro = PLANS.pro.limits;
const vip = PLANS.vip.limits;
const proba = TRIAL.limits;

/** Oznaczenia dostępu w kolejności od najbardziej otwartego. */
export const ACCESS_LEVELS = ['free', 'partial', 'paid'];

/** Czynności zamiast przejścia: panel konta (nagłówek) albo przewodnik (modal). */
export const TOOL_ACTIONS = ['account', 'guide'];

/**
 * Grupy w kolejności „jak mija dzień kibica": przed meczem, w trakcie, gotowe typy, rozmowa
 * z AI, rozliczenie. `id` jest kotwicą w adresie — po polsku w obu językach, jak ścieżki.
 */
export const TOOL_GROUPS = [
	{
		id: 'przed-meczem',
		pl: { title: 'Przed meczem', lead: 'Zanim padnie pierwszy gwizdek: które mecze warto obejrzeć i dlaczego.' },
		en: { title: 'Before kick-off', lead: 'Before the first whistle: which matches deserve a look, and why.' },
	},
	{
		id: 'na-zywo',
		pl: { title: 'Na żywo', lead: 'Mecze w trakcie — wynik, statystyki i to, co z nich wynika teraz.' },
		en: { title: 'Live', lead: 'Matches in play — the score, the statistics and what they mean right now.' },
	},
	{
		id: 'kupony-i-typy',
		pl: { title: 'Kupony i typy na dziś', lead: 'Gotowe typy i kupony na dziś i najbliższe dni, każdy rozliczany publicznie.' },
		en: { title: 'Coupons and today’s picks', lead: 'Ready-made picks and coupons for today and the next few days, each settled in public.' },
	},
	{
		id: 'asystent-i-raporty',
		pl: {
			title: 'Asystent AI i raporty',
			lead: 'Zapytaj o dowolny mecz albo dostań zestawienie z całej oferty — w serwisie lub rano w skrzynce.',
		},
		en: {
			title: 'AI assistant and reports',
			lead: 'Ask about any match or get a digest of the whole schedule — on the site or in your inbox in the morning.',
		},
	},
	{
		id: 'skutecznosc-i-spolecznosc',
		pl: {
			title: 'Skuteczność i społeczność',
			lead: 'Jak trafiają nasze typy, jak trafiasz Ty i gdzie porozmawiać z innymi kibicami.',
		},
		en: { title: 'Accuracy and community', lead: 'How our picks are doing, how yours are doing, and where to talk with other fans.' },
	},
	{
		id: 'poznaj-serwis',
		pl: { title: 'Poznaj serwis', lead: 'Skąd biorą się liczby i jak z nich korzystać.' },
		en: { title: 'Get to know the service', lead: 'Where the numbers come from and how to use them.' },
	},
];

/**
 * Kafelki. Pola:
 * - `href` — trasa w `app/[locale]` (bez prefiksu języka), może mieć kotwicę `#…`; przy `action`
 *   to adres zapasowy dla przeglądarki bez JavaScriptu,
 * - `access` — `free` | `partial` | `paid` (patrz `ACCESS_LEVELS`),
 * - `requires` — płatna część: `{ feature }` z `plan.features` albo `{ quota }` z `plan.limits`,
 * - `trial` — czy okres próbny obejmuje płatną część (sprawdzane z `TRIAL`),
 * - `odds` — tematem są kursy, więc dopisek musi mieć 18+,
 * - `featured` — wyróżniony na górze strony („Od czego zacząć"),
 * - `pl` / `en` — `name`, `body`, opcjonalny `note` (szczegół dostępu), `cta`, opcjonalny `ask`
 *   (pytanie doklejane do adresu asystenta jako `?q=`).
 */
export const TOOLS = [
	/* ---------------- przed meczem ---------------- */
	{
		id: 'mecze',
		group: 'przed-meczem',
		icon: 'CalendarDays',
		href: '/pilka-nozna/przedmeczowe',
		access: 'partial',
		requires: { feature: 'model_hints' },
		trial: true,
		pl: {
			name: 'Mecze i plakietka „Model widzi"',
			body: 'Mecze z pięciu najbliższych dni z formą, tabelą i składami. Plakietka ✦ przy meczu znaczy, że model widzi tam przewagę, a obok listy stoi pięć najmocniejszych typów dnia.',
			note: `Plakietka za darmo dla każdego. Jaki typ i z jaką przewagą — w Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta.`,
			cta: 'Otwórz listę meczów',
		},
		en: {
			name: 'Fixtures and the “Model sees” badge',
			body: 'Matches from the next five days with form, table and line-ups. A ✦ badge means the model sees an edge there, and next to the list sit the five strongest picks of the day.',
			note: `The badge is free for everyone. Which pick and how big the edge — on Pro and VIP, and for your first ${TRIAL.days} days after you create an account.`,
			cta: 'Open the fixture list',
		},
	},
	{
		id: 'analiza',
		group: 'przed-meczem',
		icon: 'FileText',
		href: '/pilka-nozna/przedmeczowe',
		access: 'partial',
		featured: true,
		requires: { quota: 'analysis' },
		trial: true,
		pl: {
			name: 'Analiza AI meczu',
			body: 'Kliknij mecz: model liczy szanse i typy, a AI tłumaczy po ludzku formę, siłę drużyn, bezpośrednie mecze i ryzyka. Pod analizą dopytasz AI o szczegóły.',
			note:
				`Gotowe analizy czytasz bez konta (${free.analysisView} dziennie). Nowe z darmowym kontem: ` +
				`${free.analysis} ${odmien(free.analysis, ANALIZY)} miesięcznie, przez pierwsze ${TRIAL.days} dni ` +
				`+${proba.analysis}; w Pro ${pro.analysis}, w VIP ${vip.analysis}.`,
			cta: 'Wybierz mecz do analizy',
		},
		en: {
			name: 'AI match analysis',
			body: 'Click a match: the model works out the chances and picks, and the AI explains form, team strength, head-to-head and risks in plain words. Ask follow-up questions under the analysis.',
			note:
				`Read existing analyses without an account (${free.analysisView} a day). New ones with a free account: ` +
				`${free.analysis} a month, +${proba.analysis} for your first ${TRIAL.days} days; ` +
				`${pro.analysis} on Pro, ${vip.analysis} on VIP.`,
			cta: 'Pick a match to analyse',
		},
	},
	{
		id: 'pokoj-meczowy',
		group: 'przed-meczem',
		icon: 'ClipboardList',
		href: '/pilka-nozna/przedmeczowe',
		access: 'free',
		pl: {
			name: 'Pokój meczowy: statystyki i składy',
			body: 'Przy każdym meczu forma, bezpośrednie mecze, składy, tabela i statystyki w zakładkach — bez skakania po pięciu serwisach.',
			note: 'Za darmo, bez konta.',
			cta: 'Wybierz mecz',
		},
		en: {
			name: 'Match room: stats and line-ups',
			body: 'Form, head-to-head, line-ups, the table and statistics in tabs for every match — no jumping between five sites.',
			note: 'Free, no account needed.',
			cta: 'Pick a match',
		},
	},

	/* ---------------- na żywo ---------------- */
	{
		id: 'na-zywo',
		group: 'na-zywo',
		icon: 'Radio',
		href: '/pilka-nozna/live',
		access: 'free',
		pl: {
			name: 'Mecze na żywo',
			body: 'Trwające mecze z wynikiem, minutą, statystykami i zdarzeniami. Przy każdym pokój z czatem kibiców.',
			note: 'Za darmo, bez konta.',
			cta: 'Zobacz mecze na żywo',
		},
		en: {
			name: 'Live matches',
			body: 'Matches in play with the score, minute, statistics and events. Every one has a room with fan chat.',
			note: 'Free, no account needed.',
			cta: 'See live matches',
		},
	},
	{
		id: 'kupon-live',
		group: 'na-zywo',
		icon: 'Zap',
		href: '/pilka-nozna/live',
		access: 'paid',
		requires: { feature: 'model_hints' },
		trial: true,
		odds: true,
		pl: {
			name: 'Generator kuponu live',
			body: 'Przelicza trwające mecze: wynik, minutę, kursy na żywo i statystyki. AI sprawdza każdy typ z przebiegiem gry, a panel sam odświeża się co 3 minuty.',
			note: `W Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta. Kursy live zmieniają się co chwilę — szacunki, nie pewniaki. 18+.`,
			cta: 'Otwórz generator kuponu live',
		},
		en: {
			name: 'Live coupon generator',
			body: 'Works through matches in play: score, minute, live odds and statistics. AI checks each pick against how the game is going, and the panel refreshes itself every 3 minutes.',
			note: `On Pro and VIP, and for your first ${TRIAL.days} days after you create an account. Live odds change constantly — estimates, not sure things. 18+.`,
			cta: 'Open the live coupon generator',
		},
	},
	{
		id: 'analiza-live',
		group: 'na-zywo',
		icon: 'Activity',
		href: '/pilka-nozna/live',
		access: 'paid',
		requires: { feature: 'live_analysis' },
		trial: false,
		pl: {
			name: 'Analiza AI w trakcie meczu',
			body: 'Analiza z aktualnym wynikiem, statystykami i zdarzeniami — a nie tylko z tego, co było wiadomo przed pierwszym gwizdkiem.',
			note: 'Tylko w Pro i VIP — okres próbny jej nie obejmuje.',
			cta: 'Wybierz trwający mecz',
		},
		en: {
			name: 'In-play AI analysis',
			body: 'Analysis built on the current score, statistics and events — not just on what was known before kick-off.',
			note: 'Pro and VIP only — the trial period does not include it.',
			cta: 'Pick a match in play',
		},
	},

	/* ---------------- kupony i typy ---------------- */
	{
		id: 'typ-dnia',
		group: 'kupony-i-typy',
		icon: 'Target',
		href: '/typy-na-dzis',
		access: 'free',
		pl: {
			name: 'Typ dnia',
			body: 'Najmocniejszy typ modelu na dziś z dwiema liczbami: szansą według modelu i tym, ile dzieje się samo z siebie. Wieczorem — typ na jutro.',
			note: 'Za darmo, bez konta. Obok wczorajszy wynik i bilans typów dnia.',
			cta: 'Zobacz typ dnia',
		},
		en: {
			name: 'Pick of the day',
			body: 'The model’s strongest pick for today with two numbers: its chance and how often it happens anyway. In the evening — tomorrow’s pick.',
			note: 'Free, no account needed. Yesterday’s result and the running record alongside.',
			cta: 'See the pick of the day',
		},
	},
	{
		id: 'kupony',
		group: 'kupony-i-typy',
		icon: 'Ticket',
		href: '/typy-na-dzis#kupony',
		access: 'partial',
		featured: true,
		requires: { feature: 'model_hints' },
		trial: true,
		odds: true,
		pl: {
			name: 'Kupony: dnia, 3- i 5-dniowy',
			body: 'Kilka typów modelu na jednym kuponie — z kursem łącznym i szansą według modelu. Nowe codziennie rano, każdy rozliczany publicznie.',
			note: `Kupon dnia za darmo dla każdego; 3- i 5-dniowy w Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta. Szacunki, nie pewniaki. 18+.`,
			cta: 'Zobacz dzisiejsze kupony',
		},
		en: {
			name: 'Coupons: daily, 3-day and 5-day',
			body: 'A few of the model’s picks on one coupon — with the total odds and the model’s chance. New ones every morning, each settled in public.',
			note: `The coupon of the day is free for everyone; 3-day and 5-day on Pro and VIP, and for your first ${TRIAL.days} days after you create an account. Estimates, not sure things. 18+.`,
			cta: 'See today’s coupons',
		},
	},
	{
		id: 'typy-na-dzis',
		group: 'kupony-i-typy',
		icon: 'ListChecks',
		href: '/typy-na-dzis#lista-typow',
		access: 'partial',
		requires: { feature: 'model_hints' },
		trial: true,
		pl: {
			name: 'Wszystkie typy na dziś',
			body: 'Dzisiejsze typy modelu na jednej liście, z ligą i godziną meczu — a wieczorem także jutrzejsze.',
			note: `Typ dnia odkryty dla każdego; pozostałe typy w Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta.`,
			cta: 'Przejrzyj typy na dziś',
		},
		en: {
			name: 'All of today’s picks',
			body: 'Today’s model picks in one list, with the league and kick-off time — and in the evening tomorrow’s as well.',
			note: `The pick of the day is open to everyone; the rest on Pro and VIP, and for your first ${TRIAL.days} days after you create an account.`,
			cta: 'Browse today’s picks',
		},
	},
	{
		id: 'wyzszy-kurs',
		group: 'kupony-i-typy',
		icon: 'TrendingUp',
		href: '/pilka-nozna/asystent',
		access: 'partial',
		// Płatna część to raport „Wyższe kursy"; w asystencie te same typy idą z puli pytań.
		requires: { quota: 'report' },
		odds: true,
		pl: {
			name: 'Typy z wyższym kursem',
			body: 'Typy z kursem od 2,0, a przy każdym szansa według rynku i według modelu. Mniejsza szansa za wyższy kurs — rozliczane osobno, w zakładce „Wyższy kurs" w Skuteczności.',
			note: 'W asystencie — z darmowej puli pytań. Jako raport „Wyższe kursy" — w Pro i VIP. Szacunki, nie pewniaki. 18+.',
			cta: 'Zapytaj asystenta o typy od kursu 2,0',
			ask: 'Pokaż typy z wyższym kursem, od 2,0, na najbliższe 24 godziny',
		},
		en: {
			name: 'Higher-odds picks',
			body: 'Picks at odds from 2.0, each with the market’s and the model’s chance. A lower chance for higher odds — settled separately, in the “Higher odds” tab of Accuracy.',
			note: 'In the assistant — from the free question allowance. As the “Higher odds” report — on Pro and VIP. Estimates, not sure things. 18+.',
			cta: 'Ask the assistant for picks from 2.0',
			ask: 'Show me higher-odds picks, from 2.0, for the next 24 hours',
		},
	},

	/* ---------------- asystent i raporty ---------------- */
	{
		id: 'asystent',
		group: 'asystent-i-raporty',
		icon: 'Bot',
		href: '/pilka-nozna/asystent',
		access: 'partial',
		featured: true,
		requires: { quota: 'aiChat' },
		trial: true,
		pl: {
			name: 'Asystent AI',
			body: 'Jak ChatGPT, tylko o piłce: zna dzisiejsze mecze, liczby modelu, kupony i skuteczność. Na Twoją prośbę sprawdzi w internecie kontuzje i składy.',
			note:
				`Z darmowym kontem ${free.aiChat} ${odmien(free.aiChat, PYTANIA)} miesięcznie, przez pierwsze ${TRIAL.days} dni ` +
				`+${proba.aiChat}; w Pro ${pro.aiChat}, w VIP ${vip.aiChat}. Wyszukiwanie wiadomości w internecie — tylko w Pro i VIP.`,
			cta: 'Zapytaj asystenta',
		},
		en: {
			name: 'AI assistant',
			body: 'Like ChatGPT, but for football: it knows today’s fixtures, the model’s numbers, the coupons and the accuracy record. Ask, and it checks the web for injuries and line-ups.',
			note:
				`With a free account ${free.aiChat} questions a month, +${proba.aiChat} for your first ${TRIAL.days} days; ` +
				`${pro.aiChat} on Pro, ${vip.aiChat} on VIP. Web news search — Pro and VIP only.`,
			cta: 'Ask the assistant',
		},
	},
	{
		id: 'raport',
		group: 'asystent-i-raporty',
		icon: 'ScrollText',
		href: '/pilka-nozna/ai-agent',
		access: 'paid',
		requires: { quota: 'report' },
		trial: true,
		pl: {
			name: 'Raport AI: 24 godziny albo 3 dni',
			body: 'Najmocniejsze typy modelu z całej oferty na najbliższą dobę albo trzy dni, każdy z krótkim uzasadnieniem. Wariant „Wyższe kursy" zbiera typy z kursem od 2,0.',
			note:
				`W Pro ${pro.report} ${odmien(pro.report, RAPORTY)} miesięcznie, w VIP ${vip.report}. Przez pierwsze ${TRIAL.days} dni ` +
				`${proba.report} ${odmien(proba.report, RAPORTY)} za darmo; poza planem raport kosztuje ` +
				`${CREDIT_COSTS.report} ${odmien(CREDIT_COSTS.report, KREDYTY)}.`,
			cta: 'Wygeneruj raport',
		},
		en: {
			name: 'AI report: 24 hours or 3 days',
			body: 'The model’s strongest picks from the whole schedule for the next day or three, each with a short reason. The “Higher odds” variant collects picks at odds from 2.0.',
			note:
				`${pro.report} reports a month on Pro, ${vip.report} on VIP. ${proba.report} free for your first ${TRIAL.days} days; ` +
				`outside a plan a report costs ${CREDIT_COSTS.report} credits.`,
			cta: 'Generate a report',
		},
	},
	{
		id: 'poranny-mail',
		group: 'asystent-i-raporty',
		icon: 'Mail',
		// Przełącznik nie ma własnego adresu — bez JavaScriptu prowadzimy do cennika, gdzie mail jest opisany.
		href: '/cennik',
		action: 'account',
		access: 'paid',
		requires: { feature: 'morning_email' },
		trial: true,
		pl: {
			name: 'Poranny mail z typami',
			body: 'Codziennie o 8:00: typy modelu na dziś, rozliczenie wczorajszych i Twoje ulubione mecze. Wyłączysz jednym kliknięciem.',
			note: `W Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta. Włączasz w panelu konta.`,
			cta: 'Ustaw w panelu konta',
		},
		en: {
			name: 'Morning email with picks',
			body: 'Every day at 8:00: today’s model picks, yesterday’s results and your favourite matches. One click turns it off.',
			note: `On Pro and VIP, and for your first ${TRIAL.days} days after you create an account. Switch it on in your account panel.`,
			cta: 'Set it up in your account panel',
		},
	},

	/* ---------------- skuteczność i społeczność ---------------- */
	{
		id: 'skutecznosc',
		group: 'skutecznosc-i-spolecznosc',
		icon: 'BarChart3',
		href: '/pilka-nozna/skutecznosc',
		access: 'free',
		pl: {
			name: 'Skuteczność',
			body: 'Każdy typ rozliczony po meczu z oficjalnym wynikiem: trafione, chybione i to, ile trafiłoby samo z siebie. Osobne zakładki dla kuponów i typów z wyższym kursem.',
			note: 'Publiczna, bez konta. Swoją skuteczność zobaczysz w panelu konta.',
			cta: 'Zobacz skuteczność',
		},
		en: {
			name: 'Accuracy',
			body: 'Every pick settled after the match against the official result: hits, misses and how often it would have happened anyway. Separate tabs for coupons and higher-odds picks.',
			note: 'Public, no account needed. Your own record is in your account panel.',
			cta: 'See the accuracy page',
		},
	},
	{
		id: 'kolejka',
		group: 'skutecznosc-i-spolecznosc',
		icon: 'Trophy',
		href: '/pilka-nozna/kolejka',
		access: 'free',
		pl: {
			name: 'Kolejka tygodniowa i ranking',
			body: 'Ten sam zestaw meczów dla wszystkich i jeden termin zamknięcia. Typujesz, a ranking liczy się od nowa co tydzień — na tle kibiców i modelu.',
			note: 'Za darmo; do typowania wystarczy darmowe konto.',
			cta: 'Wejdź do kolejki',
		},
		en: {
			name: 'Weekly round and leaderboard',
			body: 'The same set of matches for everyone and one closing time. Make your picks; the leaderboard starts over every week — against other fans and the model.',
			note: 'Free; a free account is enough to make picks.',
			cta: 'Join the round',
		},
	},
	{
		id: 'czat',
		group: 'skutecznosc-i-spolecznosc',
		icon: 'MessagesSquare',
		href: '/pilka-nozna/live',
		access: 'free',
		pl: {
			name: 'Czat meczowy i typy kibiców',
			body: 'Pokój przy każdym meczu: rozmowa na żywo, typy kibiców z zamkniętej listy rynków i prywatne wiadomości do innych kibiców.',
			note: 'Czytasz bez konta; pisanie i typowanie — z darmowym kontem.',
			cta: 'Wybierz mecz i dołącz do czatu',
		},
		en: {
			name: 'Match chat and fan picks',
			body: 'A room at every match: live conversation, fan picks from a closed list of markets and private messages to other fans.',
			note: 'Read without an account; posting and picking need a free account.',
			cta: 'Pick a match and join the chat',
		},
	},
	{
		id: 'panel-konta',
		group: 'skutecznosc-i-spolecznosc',
		icon: 'Star',
		href: '/pilka-nozna/przedmeczowe',
		action: 'account',
		access: 'free',
		pl: {
			name: 'Ulubione mecze i panel konta',
			body: 'Gwiazdka w pokoju meczowym zapisuje mecz w ulubionych. W panelu konta masz je pod ręką — razem z prywatnymi wiadomościami, swoją skutecznością i limitami planu.',
			note: 'Za darmo — wystarczy darmowe konto.',
			cta: 'Otwórz panel konta',
		},
		en: {
			name: 'Favourite matches and your account',
			body: 'The star in a match room saves the match to your favourites. Your account panel keeps them at hand — together with private messages, your own record and your plan’s limits.',
			note: 'Free — a free account is enough.',
			cta: 'Open your account panel',
		},
	},

	/* ---------------- poznaj serwis ---------------- */
	{
		id: 'przewodnik',
		group: 'poznaj-serwis',
		icon: 'CircleHelp',
		href: '/jak-to-dziala',
		action: 'guide',
		access: 'free',
		pl: {
			name: 'Przewodnik w 10 sekund',
			body: 'Jeden ekran: co znaczy plakietka ✦, jak czytać „66% (zwykle 44%)" i gdzie kliknąć najpierw.',
			cta: 'Otwórz przewodnik',
		},
		en: {
			name: '10-second guide',
			body: 'One screen: what the ✦ badge means, how to read “66% (usually 44%)” and where to click first.',
			cta: 'Open the guide',
		},
	},
	{
		id: 'jak-to-dziala',
		group: 'poznaj-serwis',
		icon: 'Compass',
		href: '/jak-to-dziala',
		access: 'free',
		pl: {
			name: 'Jak to działa',
			body: 'Skąd biorą się liczby, kiedy typ staje się typem i czego świadomie nie robimy.',
			cta: 'Przeczytaj, jak liczymy',
		},
		en: {
			name: 'How it works',
			body: 'Where the numbers come from, when a pick becomes a pick, and what we deliberately don’t do.',
			cta: 'Read how we calculate',
		},
	},
	{
		id: 'blog',
		group: 'poznaj-serwis',
		icon: 'BookOpen',
		href: '/blog',
		access: 'free',
		pl: {
			name: 'Blog',
			body: 'Jak AI analizuje mecz, które statystyki naprawdę coś mówią, zapowiedzi sezonów.',
			cta: 'Czytaj bloga',
		},
		en: {
			name: 'Blog',
			body: 'How AI analyses a match, which statistics actually matter, season previews.',
			cta: 'Read the blog',
		},
	},
];

/** Teksty strony poza kafelkami. Liczby z planów — jak w dopiskach kafelków. */
function pageText(locale) {
	if (locale === 'en') {
		return {
			metaTitle: 'Tools — AI analysis, coupons, the assistant and today’s picks',
			metaDescription:
				'Model picks, AI match analysis, coupons, the assistant, reports, accuracy and chat in one place — with what’s free written next to every tool.',
			breadcrumbHome: 'Home',
			breadcrumb: 'Tools',
			eyebrow: 'Everything in one place',
			title: 'Sports Chat tools',
			lead: 'Model picks, AI analysis, coupons, the assistant, reports, accuracy and chat — every tool on one tile: what it does for you, what it costs, and one click to get there.',
			jumpLabel: 'Jump to a group',
			legendLabel: 'What the access labels mean',
			accessPrefix: 'Access:',
			access: {
				free: { label: 'Free', hint: 'no charge, sometimes with a free account' },
				partial: { label: 'Partly free', hint: 'a free part for everyone, more on Pro and VIP' },
				paid: { label: 'Pro and VIP', hint: `paid plans; some also for your first ${TRIAL.days} days` },
			},
			featured: { title: 'Where to start', lead: 'The tools that show fastest what the service can do.' },
			cta: {
				guestTitle: 'Start free',
				guestBody:
					`A free account takes a minute and no card. For your first ${TRIAL.days} days you get the model’s picks with numbers, ` +
					`all the coupons and the morning email, plus ${proba.analysis} analyses, ${proba.aiChat} questions and ${proba.report} reports. ` +
					`After that the free plan stays — or Pro and VIP, bought like a ${PLAN_PASS_DAYS}-day ticket, with nothing renewing automatically.`,
				register: 'Create a free account',
				userTitle: 'Need more?',
				userBody: `Plan limits and what each plan includes are on the pricing page. Pro and VIP work like a ${PLAN_PASS_DAYS}-day ticket — nothing renews by itself.`,
				pricing: 'Plans and limits',
				account: 'Open your account panel',
			},
			disclaimer:
				'Picks, coupons and odds are data-based estimates, not sure things. Odds are the median of several bookmakers, no links; individual bookmakers often pay less. We do not take bets. 18+.',
		};
	}

	return {
		metaTitle: 'Narzędzia — analizy AI, kupony, asystent i typy na dziś',
		metaDescription:
			'Typy modelu, analizy AI meczów, kupony, asystent, raporty, skuteczność i czat w jednym miejscu — przy każdym narzędziu napisane, co masz za darmo.',
		breadcrumbHome: 'Strona główna',
		breadcrumb: 'Narzędzia',
		eyebrow: 'Wszystko w jednym miejscu',
		title: 'Narzędzia Czatu Sportowego',
		lead: 'Typy modelu, analizy AI, kupony, asystent, raporty, skuteczność i czat — każde narzędzie na jednym kafelku: co Ci daje, ile kosztuje i jak do niego przejść jednym kliknięciem.',
		jumpLabel: 'Przejdź do grupy',
		legendLabel: 'Co znaczą oznaczenia dostępu',
		// Czytane przez czytnik ekranu przed oznaczeniem na kafelku: „Dostęp: Za darmo".
		accessPrefix: 'Dostęp:',
		access: {
			free: { label: 'Za darmo', hint: 'bez opłat, czasem z darmowym kontem' },
			partial: { label: 'Częściowo za darmo', hint: 'darmowa część dla każdego, więcej w Pro i VIP' },
			paid: { label: 'Pro i VIP', hint: `plany płatne; część także przez pierwsze ${TRIAL.days} dni` },
		},
		featured: { title: 'Od czego zacząć', lead: 'Narzędzia, które najszybciej pokazują, co potrafi serwis.' },
		cta: {
			guestTitle: 'Zacznij za darmo',
			guestBody:
				`Darmowe konto zajmuje minutę i nie wymaga karty. Przez pierwsze ${TRIAL.days} dni masz typy modelu z liczbami, ` +
				`wszystkie kupony i poranny mail, a do tego ${proba.analysis} ${odmien(proba.analysis, ANALIZY)}, ` +
				`${proba.aiChat} ${odmien(proba.aiChat, PYTANIA)} i ${proba.report} ${odmien(proba.report, RAPORTY)}. ` +
				`Potem zostaje plan darmowy — albo Pro i VIP kupowane jak bilet na ${PLAN_PASS_DAYS} dni, bez automatycznego odnawiania.`,
			register: 'Załóż darmowe konto',
			userTitle: 'Potrzebujesz więcej?',
			userBody: `Limity planów i to, co obejmują, zobaczysz w cenniku. Pro i VIP kupujesz jak bilet na ${PLAN_PASS_DAYS} dni — nic nie odnawia się samo.`,
			pricing: 'Plany i limity',
			account: 'Otwórz panel konta',
		},
		disclaimer:
			'Typy, kupony i kursy to szacunki oparte na danych, nie pewniaki. Kursy to mediana kilku bukmacherów, bez linków; u poszczególnych bukmacherów bywają niższe. Serwis nie przyjmuje zakładów. 18+.',
	};
}

/** Adres kafelka w danym języku: pytanie do asystenta doklejone jako `?q=`. */
function hrefFor(tool, texts) {
	return texts.ask ? `${tool.href}?q=${encodeURIComponent(texts.ask)}` : tool.href;
}

/**
 * Komplet treści strony w jednym języku: teksty, kafelki wyróżnione i grupy z kafelkami.
 * Kafelek wychodzi spłaszczony — pola wspólne plus teksty wybranego języka.
 */
export function toolsContent(locale) {
	const lang = locale === 'en' ? 'en' : 'pl';
	const tools = TOOLS.map(({ pl, en, ...tool }) => {
		const texts = lang === 'en' ? en : pl;
		return { ...tool, ...texts, href: hrefFor(tool, texts) };
	});

	return {
		...pageText(lang),
		featured: tools.filter((tool) => tool.featured),
		groups: TOOL_GROUPS.map((group) => ({
			id: group.id,
			...group[lang],
			tools: tools.filter((tool) => tool.group === group.id),
		})),
	};
}
