import { CREDIT_COSTS, PLAN_PASS_DAYS, PLANS, TRIAL } from '@/lib/billing/plans';
import { ANALIZY, KREDYTY, KUPONY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

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
		pl: { title: 'Przed meczem', lead: 'Które mecze i dlaczego.' },
		en: { title: 'Before kick-off', lead: 'Which matches, and why.' },
	},
	{
		id: 'na-zywo',
		pl: { title: 'Na żywo', lead: 'Wynik, statystyki i kupon live.' },
		en: { title: 'Live', lead: 'Score, stats and the live coupon.' },
	},
	{
		id: 'kupony-i-typy',
		pl: { title: 'Kupony i typy na dziś', lead: 'Gotowe, rozliczane publicznie.' },
		en: { title: 'Coupons and today’s picks', lead: 'Ready-made, settled in public.' },
	},
	{
		id: 'asystent-i-raporty',
		pl: {
			title: 'Asystent AI i raporty',
			lead: 'Pytaj albo dostań gotowe zestawienie.',
		},
		en: {
			title: 'AI assistant and reports',
			lead: 'Ask, or get a ready-made digest.',
		},
	},
	{
		id: 'skutecznosc-i-spolecznosc',
		pl: {
			title: 'Skuteczność i społeczność',
			lead: 'Nasze wyniki, Twoje i kibiców.',
		},
		en: { title: 'Accuracy and community', lead: 'Our record, yours, and the fans.' },
	},
	{
		id: 'poznaj-serwis',
		pl: { title: 'Poznaj serwis', lead: 'Skąd liczby i jak je czytać.' },
		en: { title: 'Get to know the service', lead: 'Where the numbers come from.' },
	},
];

/**
 * Kafelki. Pola:
 * - `href` — trasa w `app/[locale]` (bez prefiksu języka), może mieć kotwicę `#…`; przy `action`
 *   to adres zapasowy dla przeglądarki bez JavaScriptu,
 * - `params` — stały widok strony w parametrach adresu (np. `{ variant: 'value' }` raportu),
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
			body: 'Mecze na 5 dni. ✦ przy meczu: model ma tu typ.',
			note: `Plakietka za darmo. Typ i szansa: Pro i VIP, nowe konto ${TRIAL.days} dni.`,
			cta: 'Otwórz listę meczów',
		},
		en: {
			name: 'Fixtures and the “Model sees” badge',
			body: 'Matches for 5 days. ✦ on a match: the model has a pick.',
			note: `The badge is free. Pick and chance: Pro and VIP, new accounts ${TRIAL.days} days.`,
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
			body: 'Typ, szanse, forma i ryzyka meczu. Dopytasz AI o szczegóły.',
			note:
				`Gotowe: ${free.analysisView} dziennie bez konta. Nowe: ${free.analysis} ${odmien(free.analysis, ANALIZY)} miesięcznie ` +
				`(+${proba.analysis} przez ${TRIAL.days} dni), Pro ${pro.analysis}, VIP ${vip.analysis}.`,
			cta: 'Wybierz mecz do analizy',
		},
		en: {
			name: 'AI match analysis',
			body: 'The pick, chances, form and risks. Ask the AI for more.',
			note:
				`Existing: ${free.analysisView} a day, no account. New: ${free.analysis} a month ` +
				`(+${proba.analysis} for ${TRIAL.days} days), Pro ${pro.analysis}, VIP ${vip.analysis}.`,
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
			body: 'Forma, H2H, składy, tabela i statystyki w jednym miejscu.',
			note: 'Za darmo, bez konta.',
			cta: 'Wybierz mecz',
		},
		en: {
			name: 'Match room: stats and line-ups',
			body: 'Form, head-to-head, line-ups, table and stats in one place.',
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
			body: 'Wynik, minuta, statystyki i czat kibiców przy każdym meczu.',
			note: 'Za darmo, bez konta.',
			cta: 'Zobacz mecze na żywo',
		},
		en: {
			name: 'Live matches',
			body: 'Score, minute, stats and fan chat at every match.',
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
			body: 'Kupon z trwających meczów. Odświeża się co 3 minuty.',
			note: `Pro i VIP, nowe konto ${TRIAL.days} dni. Szacunki, nie pewniaki. 18+.`,
			cta: 'Otwórz generator kuponu live',
		},
		en: {
			name: 'Live coupon generator',
			body: 'A coupon from matches in play. Refreshes every 3 minutes.',
			note: `Pro and VIP, new accounts ${TRIAL.days} days. Estimates, not sure things. 18+.`,
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
			body: 'Analiza z aktualnym wynikiem i statystykami meczu.',
			note: 'Tylko Pro i VIP, bez okresu próbnego.',
			cta: 'Wybierz trwający mecz',
		},
		en: {
			name: 'In-play AI analysis',
			body: 'Analysis built on the current score and stats.',
			note: 'Pro and VIP only, not in the trial.',
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
			body: 'Najmocniejszy typ dnia z szansą. Wieczorem — typ na jutro.',
			note: 'Za darmo, bez konta.',
			cta: 'Zobacz typ dnia',
		},
		en: {
			name: 'Pick of the day',
			body: 'The strongest pick of the day with its chance. Tomorrow’s in the evening.',
			note: 'Free, no account needed.',
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
			body: 'Kilka typów na kuponie, z kursem i szansą. Nowe codziennie.',
			note: `Kupon dnia za darmo; 3- i 5-dniowy: Pro i VIP, nowe konto ${TRIAL.days} dni. Szacunki, nie pewniaki. 18+.`,
			cta: 'Zobacz dzisiejsze kupony',
		},
		en: {
			name: 'Coupons: daily, 3-day and 5-day',
			body: 'A few picks on one coupon, with odds and chance. New daily.',
			note: `Coupon of the day free; 3-day and 5-day: Pro and VIP, new accounts ${TRIAL.days} days. Estimates, not sure things. 18+.`,
			cta: 'See today’s coupons',
		},
	},
	{
		id: 'kreator-kuponu',
		group: 'kupony-i-typy',
		icon: 'SlidersHorizontal',
		href: '/typy-na-dzis#kreator-kuponu',
		access: 'paid',
		requires: { quota: 'couponGen' },
		trial: true,
		odds: true,
		pl: {
			name: 'Kreator własnego kuponu',
			body: 'Wybierasz kurs, godziny i ligi — model składa kupon.',
			note:
				`Pro ${pro.couponGen} ${odmien(pro.couponGen, KUPONY)} dziennie, VIP ${vip.couponGen}, nowe konto ${proba.couponGen} dziennie ` +
				`przez ${TRIAL.days} dni. Szacunki, nie pewniaki. 18+.`,
			cta: 'Złóż własny kupon',
		},
		en: {
			name: 'Your own coupon builder',
			body: 'Pick the odds, hours and leagues — the model builds the coupon.',
			note:
				`Pro ${pro.couponGen} coupons a day, VIP ${vip.couponGen}, new accounts ${proba.couponGen} a day ` +
				`for ${TRIAL.days} days. Estimates, not sure things. 18+.`,
			cta: 'Build your own coupon',
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
			body: 'Dzisiejsze typy modelu na jednej liście, wieczorem także jutrzejsze.',
			note: `Typ dnia i kupon dnia za darmo; reszta: Pro i VIP, nowe konto ${TRIAL.days} dni.`,
			cta: 'Przejrzyj typy na dziś',
		},
		en: {
			name: 'All of today’s picks',
			body: 'Today’s model picks in one list, tomorrow’s too in the evening.',
			note: `Pick and coupon of the day free; the rest: Pro and VIP, new accounts ${TRIAL.days} days.`,
			cta: 'Browse today’s picks',
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
			body: 'Jak ChatGPT, tylko o piłce. Zna mecze, typy i kupony.',
			note:
				`Darmowe konto ${free.aiChat} ${odmien(free.aiChat, PYTANIA)} miesięcznie (+${proba.aiChat} przez ${TRIAL.days} dni), ` +
				`Pro ${pro.aiChat}, VIP ${vip.aiChat}.`,
			cta: 'Zapytaj asystenta',
		},
		en: {
			name: 'AI assistant',
			body: 'Like ChatGPT, but for football. Knows the fixtures, picks and coupons.',
			note:
				`Free account ${free.aiChat} questions a month (+${proba.aiChat} for ${TRIAL.days} days), ` +
				`Pro ${pro.aiChat}, VIP ${vip.aiChat}.`,
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
			body: 'Najmocniejsze typy modelu na dobę albo 3 dni, z uzasadnieniem.',
			note:
				`Pro ${pro.report} ${odmien(pro.report, RAPORTY)} miesięcznie, VIP ${vip.report}, nowe konto ${proba.report} przez ${TRIAL.days} dni. ` +
				`Bez planu: ${CREDIT_COSTS.report} ${odmien(CREDIT_COSTS.report, KREDYTY)}.`,
			cta: 'Wygeneruj raport',
		},
		en: {
			name: 'AI report: 24 hours or 3 days',
			body: 'The model’s strongest picks for a day or 3 days, with reasons.',
			note:
				`Pro ${pro.report} reports a month, VIP ${vip.report}, new accounts ${proba.report} for ${TRIAL.days} days. ` +
				`Without a plan: ${CREDIT_COSTS.report} credits.`,
			cta: 'Generate a report',
		},
	},
	{
		id: 'wyzszy-kurs',
		group: 'asystent-i-raporty',
		icon: 'TrendingUp',
		// W aplikacji to wariant raportu AI — kafelek otwiera raport od razu w tym wariancie.
		href: '/pilka-nozna/ai-agent',
		params: { variant: 'value' },
		access: 'partial',
		// Płatna część to raport „Wyższe kursy"; w asystencie te same typy idą z puli pytań.
		requires: { quota: 'report' },
		// Raport „Wyższe kursy" bierze z tej samej puli co zwykły — okres próbny ma w niej raporty.
		trial: true,
		odds: true,
		pl: {
			name: 'Wyższe kursy (od 2,0)',
			body: 'Typy od kursu 2,0. Rozliczane w zakładce „Wyższy kurs".',
			note:
				`Raport: Pro i VIP, nowe konto ${TRIAL.days} dni. Asystent — z darmowych pytań. Szacunki, nie pewniaki. 18+.`,
			cta: 'Otwórz raport „Wyższe kursy"',
		},
		en: {
			name: 'Higher odds (from 2.0)',
			body: 'Picks at odds from 2.0. Settled in the “Higher odds” tab.',
			note:
				`Report: Pro and VIP, new accounts ${TRIAL.days} days. Assistant — free questions. Estimates, not sure things. 18+.`,
			cta: 'Open the “Higher odds” report',
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
			body: 'Codziennie o 8:00 typy na dziś i wynik wczorajszych.',
			note: `Pro i VIP, nowe konto ${TRIAL.days} dni.`,
			cta: 'Ustaw w panelu konta',
		},
		en: {
			name: 'Morning email with picks',
			body: 'Every day at 8:00: today’s picks and yesterday’s results.',
			note: `Pro and VIP, new accounts ${TRIAL.days} days.`,
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
			body: 'Każdy typ rozliczony po meczu — trafione i chybione.',
			note: 'Publiczna, bez konta.',
			cta: 'Zobacz skuteczność',
		},
		en: {
			name: 'Accuracy',
			body: 'Every pick settled after the match — hits and misses.',
			note: 'Public, no account needed.',
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
			body: 'Te same mecze dla wszystkich, nowy ranking co tydzień.',
			note: 'Za darmo, z darmowym kontem.',
			cta: 'Wejdź do kolejki',
		},
		en: {
			name: 'Weekly round and leaderboard',
			body: 'The same matches for everyone, a new leaderboard every week.',
			note: 'Free, with a free account.',
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
			body: 'Rozmowa na żywo i typy kibiców przy każdym meczu.',
			note: 'Czytasz bez konta, piszesz z darmowym.',
			cta: 'Wybierz mecz i dołącz do czatu',
		},
		en: {
			name: 'Match chat and fan picks',
			body: 'Live chat and fan picks at every match.',
			note: 'Read without an account, post with a free one.',
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
			body: 'Ulubione mecze, wiadomości, Twoja skuteczność i limity planu.',
			note: 'Za darmo, z darmowym kontem.',
			cta: 'Otwórz panel konta',
		},
		en: {
			name: 'Favourite matches and your account',
			body: 'Favourite matches, messages, your record and plan limits.',
			note: 'Free, with a free account.',
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
			body: 'Co znaczy ✦ i jak czytać „66% (zwykle 44%)".',
			cta: 'Otwórz przewodnik',
		},
		en: {
			name: '10-second guide',
			body: 'What ✦ means and how to read “66% (usually 44%)”.',
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
			body: 'Skąd liczby i kiedy typ staje się typem.',
			cta: 'Przeczytaj, jak liczymy',
		},
		en: {
			name: 'How it works',
			body: 'Where the numbers come from and when a pick becomes a pick.',
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
			body: 'Jak czytać statystyki, zapowiedzi sezonów.',
			cta: 'Czytaj bloga',
		},
		en: {
			name: 'Blog',
			body: 'Reading the stats, season previews.',
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
			lead: 'Everything the service does: what it is, what it costs, where to click.',
			jumpLabel: 'Jump to a group',
			legendLabel: 'What the access labels mean',
			accessPrefix: 'Access:',
			access: {
				free: { label: 'Free', hint: 'no charge, sometimes with a free account' },
				partial: { label: 'Partly free', hint: 'a free part for everyone, more on Pro and VIP' },
				paid: { label: 'Pro and VIP', hint: `paid plans; some also for your first ${TRIAL.days} days` },
			},
			featured: { title: 'Where to start', lead: 'Three tools to try first.' },
			cta: {
				guestTitle: 'Start free',
				guestBody:
					`${TRIAL.days} days of all picks and coupons free, no card: ${proba.analysis} analyses, ${proba.aiChat} questions, ${proba.report} reports. ` +
					'Then the free plan stays — nothing renews.',
				register: 'Create a free account',
				userTitle: 'Need more?',
				userBody: `Pro and VIP for ${PLAN_PASS_DAYS} days, nothing renews. Limits are on the pricing page.`,
				pricing: 'Plans and limits',
				account: 'Open your account panel',
			},
			disclaimer:
				'Estimates, not sure things. Odds: median of several bookmakers, no links. We do not take bets. 18+.',
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
		lead: 'Wszystko, co daje serwis: co robi, ile kosztuje, gdzie kliknąć.',
		jumpLabel: 'Przejdź do grupy',
		legendLabel: 'Co znaczą oznaczenia dostępu',
		// Czytane przez czytnik ekranu przed oznaczeniem na kafelku: „Dostęp: Za darmo".
		accessPrefix: 'Dostęp:',
		access: {
			free: { label: 'Za darmo', hint: 'bez opłat, czasem z darmowym kontem' },
			partial: { label: 'Częściowo za darmo', hint: 'darmowa część dla każdego, więcej w Pro i VIP' },
			paid: { label: 'Pro i VIP', hint: `plany płatne; część także przez pierwsze ${TRIAL.days} dni` },
		},
		featured: { title: 'Od czego zacząć', lead: 'Trzy narzędzia na start.' },
		cta: {
			guestTitle: 'Zacznij za darmo',
			guestBody:
				`${TRIAL.days} dni wszystkich typów i kuponów za darmo, bez karty: ${proba.analysis} ${odmien(proba.analysis, ANALIZY)}, ` +
				`${proba.aiChat} ${odmien(proba.aiChat, PYTANIA)}, ${proba.report} ${odmien(proba.report, RAPORTY)}. ` +
				'Potem zostaje plan darmowy — nic się nie odnawia.',
			register: 'Załóż darmowe konto',
			userTitle: 'Potrzebujesz więcej?',
			userBody: `Pro i VIP na ${PLAN_PASS_DAYS} dni, nic się nie odnawia. Limity w cenniku.`,
			pricing: 'Plany i limity',
			account: 'Otwórz panel konta',
		},
		disclaimer:
			'Szacunki, nie pewniaki. Kursy: mediana kilku bukmacherów, bez linków. Serwis nie przyjmuje zakładów. 18+.',
	};
}

/**
 * Adres kafelka w danym języku: pytanie do asystenta doklejone jako `?q=`, a stały widok strony
 * (np. wariant raportu) z `params` — tych samych parametrów, które strona trzyma w adresie.
 */
function hrefFor(tool, texts) {
	if (texts.ask) return `${tool.href}?q=${encodeURIComponent(texts.ask)}`;
	return tool.params ? `${tool.href}?${new URLSearchParams(tool.params)}` : tool.href;
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
