import { PLANS, TRIAL } from '@/lib/billing/plans';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Treść strony głównej.
 *
 * Osobno od `messages/*.json`, bo to nie są etykiety interfejsu, tylko tekst sprzedażowy —
 * pisze się go inaczej, zmienia z innych powodów i czyta w całości, a nie klucz po kluczu.
 * W pliku tłumaczeń rozpłynąłby się między trzystoma krótkimi napisami.
 *
 * Liczby limitów pochodzą z definicji planów. Landing obiecujący co innego niż cennik to
 * najprostszy sposób na utratę zaufania w pierwszej minucie korzystania.
 */

const free = PLANS.free.limits;

export function landingContent(locale) {
	if (locale === 'en') {
		return {
			hero: {
				eyebrow: 'Football · more sports coming',
				title: 'AI match analysis and an assistant that knows the game',
				subtitle:
					'The model reads form, the table, line-ups and statistics, then explains what follows ' +
					'from them. Ask the assistant anything about the fixture, talk to other fans in the ' +
					'match room, and place a pick — we settle it after the whistle.',
				primaryCta: 'Start free',
				secondaryCta: 'See plans',
				trust: `No card required · ${free.analysis} analyses a month on the free plan · Polish and English`,
			},
			problem: {
				title: 'Five tabs open and still no answer',
				body:
					'Results on one site, statistics on another, the table somewhere else, and the ' +
					'conversation in a group chat that scrolls past kick-off. By the time you have gathered ' +
					'it, the match has started — and nobody ever checks whether yesterday’s prediction was right.',
				solution:
					'We put the data, the analysis and the conversation in one room, and we settle every ' +
					'pick afterwards. Including the ones we got wrong.',
			},
			features: {
				title: 'What you get',
				items: [
					{
						icon: 'FileText',
						title: 'Pre-match analysis',
						body: 'AI turns form, the table, head-to-head, line-ups and injuries into a readable assessment, with the factors and risks written out.',
					},
					{
						icon: 'Radio',
						title: 'In-play analysis',
						body: 'AI reads the match in progress from the live score, events and statistics, and updates the assessment as the game develops.',
					},
					{
						icon: 'Sparkles',
						title: 'AI report',
						body: 'A short list of fixtures worth attention over the coming hours or days, each with a data-based reason.',
					},
					{
						icon: 'MessagesSquare',
						title: 'Assistant in the chat',
						body: 'Mention @AI in any match room and ask about that fixture. The assistant knows the full data and the analysis already generated, and answers in front of everyone.',
					},
					{
						icon: 'Target',
						title: 'Picks with settlement',
						body: 'Place a pick before kick-off. We settle it automatically against the official result and keep your accuracy record.',
					},
					{
						icon: 'Trophy',
						title: 'Weekly round',
						body: 'The same twelve matches for everyone, one closing time, a leaderboard that resets each week.',
					},
				],
			},
			how: {
				title: 'How it works',
				steps: [
					{ title: 'Pick a match', body: 'Browse fixtures for the next five days or jump into a game already in play.' },
					{ title: 'Read the AI analysis', body: 'Generate it in seconds, or read the one someone else already produced for that match.' },
					{ title: 'Ask the assistant', body: 'Anything the analysis left out — the assistant knows the match data. Then place your pick and see it settle after the whistle.' },
				],
			},
			accuracy: {
				title: 'We publish the misses too',
				body:
					'Every pick from an analysis or report is settled automatically after the match against ' +
					'the official result. Hits, misses and picks that cannot be resolved by the score alone — ' +
					'all of it is public.',
				method:
					'Public statistics start once enough picks have been settled — a percentage drawn from a ' +
					'handful of matches looks convincing and means nothing.',
				cta: 'See the accuracy page',
			},
			sports: {
				title: 'Sports',
				body: 'Football is live today. The service is built so the next sport is an addition, not a rebuild.',
				soon: 'More sports coming',
			},
			pricing: {
				title: 'Start free',
				body:
					`The free plan covers ${free.analysis} analyses and ${free.aiChat} assistant questions a month, ` +
					`plus a welcome allowance of ${TRIAL.limits.analysis} analyses and ${TRIAL.limits.report} reports ` +
					`for your first ${TRIAL.days} days. Need more — buy credits once or take a monthly plan.`,
				cta: 'Plans and limits',
			},
			faq: { title: 'Frequently asked questions' },
			finalCta: {
				title: 'Try it on tonight’s match',
				body: 'A free account takes a minute and no card. Read one analysis and judge for yourself.',
				cta: 'Create a free account',
			},
		};
	}

	return {
		hero: {
			eyebrow: 'Piłka nożna · kolejne sporty w drodze',
			title: 'Analizy meczów od AI i asystent, który zna każdy mecz',
			subtitle:
				'Model czyta formę, tabelę, składy i statystyki meczu piłkarskiego, a potem tłumaczy, ' +
				'co z nich wynika. Dopytaj asystenta o dowolny szczegół, porozmawiaj z kibicami przy ' +
				'meczu i wystaw typ — rozliczymy go po ostatnim gwizdku.',
			primaryCta: 'Zacznij za darmo',
			secondaryCta: 'Zobacz plany',
			trust: `Bez karty · ${free.analysis} ${odmien(free.analysis, ANALIZY)} miesięcznie w planie darmowym · po polsku i po angielsku`,
		},
		problem: {
			title: 'Pięć otwartych zakładek i dalej nie wiadomo',
			body:
				'Wyniki w jednym serwisie, statystyki w drugim, tabela w trzecim, a rozmowa na grupie, ' +
				'która ucieka w górę szybciej, niż zdążysz przeczytać. Zanim to poskładasz, mecz się ' +
				'zaczyna — a wczorajszej prognozy i tak nikt nigdy nie sprawdza.',
			solution:
				'Zebraliśmy dane, analizę i rozmowę w jednym pokoju, a każdy typ rozliczamy po meczu. ' +
				'Również ten chybiony.',
		},
		features: {
			title: 'Co dostajesz',
			items: [
				{
					icon: 'FileText',
					title: 'Analiza przedmeczowa',
					body: 'AI składa formę, tabelę, bilans bezpośrednich spotkań, składy i kontuzje w czytelną ocenę, z wypisanymi czynnikami i ryzykami.',
				},
				{
					icon: 'Radio',
					title: 'Analiza na żywo',
					body: 'AI czyta trwający mecz z wyniku, wydarzeń i statystyk, i aktualizuje ocenę wraz z przebiegiem gry.',
				},
				{
					icon: 'Sparkles',
					title: 'Raport AI',
					body: 'Krótka lista spotkań wartych uwagi w najbliższych godzinach lub dniach, każde z uzasadnieniem opartym na danych.',
				},
				{
					icon: 'MessagesSquare',
					title: 'Asystent w czacie',
					body: 'Napisz @AI w dowolnym pokoju meczowym i zapytaj o ten mecz. Asystent zna komplet danych i wygenerowaną wcześniej analizę, a odpowiedź widzi cały pokój.',
				},
				{
					icon: 'Target',
					title: 'Typy z rozliczaniem',
					body: 'Wystaw typ przed pierwszym gwizdkiem. Rozliczamy go automatycznie z oficjalnym wynikiem i prowadzimy Twoją statystykę.',
				},
				{
					icon: 'Trophy',
					title: 'Kolejka tygodniowa',
					body: 'Ten sam zestaw dwunastu meczów dla wszystkich, jeden termin zamknięcia i ranking liczony od nowa co tydzień.',
				},
			],
		},
		how: {
			title: 'Jak to działa',
			steps: [
				{ title: 'Wybierz mecz', body: 'Przejrzyj spotkania z najbliższych pięciu dni albo wejdź w mecz, który właśnie trwa.' },
				{ title: 'Przeczytaj analizę AI', body: 'Wygeneruj ją w kilkanaście sekund albo przeczytaj tę, którą ktoś wygenerował wcześniej dla tego meczu.' },
				{ title: 'Dopytaj asystenta', body: 'O wszystko, czego w analizie zabrakło — asystent zna dane meczu. Potem wystaw typ i sprawdź, jak rozliczy się po gwizdku.' },
			],
		},
		accuracy: {
			title: 'Pokazujemy też chybione',
			body:
				'Każdy typ z analizy i z raportu rozliczamy automatycznie po meczu na podstawie oficjalnego ' +
				'wyniku. Trafienia, chybienia i typy, których nie da się rozstrzygnąć samym wynikiem — ' +
				'wszystko jest jawne.',
			method:
				'Statystykę publikujemy od momentu, w którym rozliczonych typów jest dość, by coś znaczyła. ' +
				'Procent policzony z kilkunastu meczów wygląda przekonująco i nie znaczy nic.',
			cta: 'Zobacz statystykę skuteczności',
		},
		sports: {
			title: 'Dyscypliny',
			body: 'Dziś działa piłka nożna. Serwis jest zbudowany tak, żeby kolejny sport był dodaniem, a nie przebudową.',
			soon: 'Kolejne sporty w drodze',
		},
		pricing: {
			title: 'Zacznij za darmo',
			body:
				`Plan darmowy to ${free.analysis} ${odmien(free.analysis, ANALIZY)} i ${free.aiChat} ` +
				`${odmien(free.aiChat, PYTANIA)} do asystenta miesięcznie, a na start dodatkowo ` +
				`${TRIAL.limits.analysis} ${odmien(TRIAL.limits.analysis, ANALIZY)} i ${TRIAL.limits.report} ` +
				`${odmien(TRIAL.limits.report, RAPORTY)} przez pierwsze ${TRIAL.days} dni. Potrzebujesz więcej — ` +
				`dokup kredyty albo wybierz plan miesięczny.`,
			cta: 'Plany i limity',
		},
		faq: { title: 'Najczęstsze pytania' },
		finalCta: {
			title: 'Sprawdź na dzisiejszym meczu',
			body: 'Darmowe konto zajmuje minutę i nie wymaga karty. Przeczytaj jedną analizę i oceń sam.',
			cta: 'Załóż darmowe konto',
		},
	};
}
