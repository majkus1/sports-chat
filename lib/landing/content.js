import { PLANS, TRIAL } from '@/lib/billing/plans';
import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Treść strony głównej.
 *
 * Osobno od `messages/*.json`, bo to nie są etykiety interfejsu, tylko tekst sprzedażowy —
 * pisze się go inaczej, zmienia z innych powodów i czyta w całości, a nie klucz po kluczu.
 * W pliku tłumaczeń rozpłynąłby się między trzystoma krótkimi napisami.
 *
 * DLA KOGO. Dla kogoś, kto wieczorem ma przed sobą czterysta meczów i pyta „na których warto
 * się zatrzymać". Landing odpowiada na to pytanie w pierwszym zdaniu i dalej pokazuje, jak:
 * model przegląda ofertę → oznacza mecze z przewagą → AI tłumaczy dlaczego → typ z dwiema
 * liczbami → publiczne rozliczenie. Zwrot „66 % (zwykle 44 %)" stoi tu celowo: to jedna rzecz,
 * którą czytelnik ma zapamiętać, bo widzi ją potem przy każdym typie.
 *
 * SŁOWA. „Typy na dziś", „analizy meczów", „skuteczność" — to, czego ludzie szukają. Bez
 * „kalibracji", „modelu Dixona-Colesa" i bez języka zakładów: nie mówimy o kursach, stawkach
 * ani „obstawianiu" (treść informacyjna i statystyczna, nie porada bukmacherska).
 *
 * Liczby limitów i próg typu pochodzą z kodu. Landing obiecujący co innego niż cennik albo
 * polityka typów to najprostszy sposób na utratę zaufania w pierwszej minucie korzystania.
 */

const free = PLANS.free.limits;

export function landingContent(locale) {
	if (locale === 'en') {
		return {
			hero: {
				eyebrow: 'Football · a numbers model + AI',
				title: 'Today’s picks backed by numbers. Match analysis by AI.',
				subtitle:
					'A model works through the results of thousands of matches and marks the fixtures where it ' +
					'sees an edge — match result, double chance, a team to score, over 2.5 goals. The AI explains ' +
					'why in plain words. Every pick is settled in public — hits and misses alike.',
				primaryCta: 'See today’s matches',
				secondaryCta: 'How it works',
				trust: `No card required · ${free.analysis} analyses a month for free · Polish and English`,
			},
			problem: {
				title: 'Four hundred matches tonight. Which ones are worth a look?',
				body:
					'Stats on one site, form on another, the table somewhere else — and in the end a hunch. ' +
					'Nobody has time to check four hundred fixtures, and nobody ever checks whether ' +
					'yesterday’s hunch was right.',
				solution:
					'The model goes through the whole schedule for you and marks the matches where it sees an ' +
					'edge. You check why — and decide. Afterwards we settle every pick against the official result.',
			},
			features: {
				title: 'What you get',
				items: [
					{
						icon: 'Sparkles',
						title: '“Model sees” — the day in a minute',
						body: 'A badge next to a match means the model has run it and sees an edge. Next to the list: the five strongest picks of the day. You scan four hundred fixtures in a minute.',
					},
					{
						icon: 'FileText',
						title: 'Analysis with numbers, not opinions',
						body: 'The model works out the chances and the picks; the AI explains the factors and the risks in plain words. Before the match and during it, with the live score.',
					},
					{
						icon: 'Target',
						title: 'Four markets that actually work',
						body: 'Match result, double chance, a team to score, over 2.5 goals — tested on thousands of matches. We don’t pick what nobody predicts better than the average.',
					},
					{
						icon: 'Mail',
						title: 'AI report and the morning email',
						body: 'The strongest picks from the whole schedule for the next 24 h or 3 days. Every day at 8:00 in your inbox: today’s picks and yesterday’s results.',
					},
					{
						icon: 'Bot',
						title: 'An assistant that knows every match',
						body: 'Ask “where does the model see picks today?”, “what about this match?”, “how accurate are you?”. It also checks the web for injuries and line-ups.',
					},
					{
						icon: 'BarChart3',
						title: 'Accuracy in the open',
						body: 'Every pick is settled after the match against the official result. Hits, misses, and how often it would have happened anyway — all public.',
					},
					{
						icon: 'Users',
						title: 'Chat and the weekly round',
						body: 'A room at every match. Make your own picks from a closed list, and compete each week on the same twelve fixtures — against other fans and against the model.',
					},
				],
			},
			how: {
				title: 'Three steps',
				steps: [
					{ title: 'Open the fixture list', body: 'The model has already marked the matches where it sees an edge. “Model sees” shows the strongest five of the day.' },
					{ title: 'Click a match', body: 'You get the numbers and the reasons: form, strength, head-to-head, expected goals — and the risks the numbers can’t see. Ask the assistant anything.' },
					{
						title: 'Take a pick with two numbers',
						body: `“66% (usually 44%)” — 66 is the model’s chance, 44 is how often it happens anyway. A pick only appears at ${MIN_PROBABILITY}% and at least ${MIN_LIFT} points above “usually”. After the match, check it in Accuracy.`,
					},
				],
			},
			accuracy: {
				title: 'We publish the misses too',
				body:
					'Every pick is settled automatically against the official result — once a day, after the ' +
					'matches finish. Hits, misses, and next to them how often the same picks would have hit ' +
					'anyway. If we weren’t beating that, you would see it here first.',
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
					`for your first ${TRIAL.days} days. Need more — buy credits once or take a 30-day plan.`,
				cta: 'Plans and limits',
			},
			faq: { title: 'Frequently asked questions' },
			finalCta: {
				title: 'Try it on tonight’s match',
				body: 'A free account takes a minute and no card. Open the list, find the badge, read why.',
				cta: 'Create a free account',
			},
		};
	}

	return {
		hero: {
			eyebrow: 'Piłka nożna · model liczbowy + AI',
			title: 'Typy na dziś z pokryciem w liczbach. Analizy meczów od AI.',
			subtitle:
				'Model przelicza wyniki tysięcy meczów i oznacza spotkania, w których widzi przewagę: ' +
				'wynik meczu, podwójna szansa, gol drużyny, powyżej 2,5 gola. AI tłumaczy dlaczego — po ludzku. ' +
				'Każdy typ rozliczamy publicznie, trafione i chybione.',
			primaryCta: 'Zobacz dzisiejsze mecze',
			secondaryCta: 'Jak to działa',
			trust: `Bez karty · ${free.analysis} ${odmien(free.analysis, ANALIZY)} miesięcznie za darmo · po polsku i po angielsku`,
		},
		problem: {
			title: 'Czterysta meczów wieczorem. Na których warto się zatrzymać?',
			body:
				'Statystyki w jednym serwisie, forma w drugim, tabela w trzecim — a na końcu i tak przeczucie. ' +
				'Nikt nie ma czasu sprawdzić czterystu spotkań i nikt nigdy nie sprawdza, czy wczorajsze ' +
				'przeczucie było trafne.',
			solution:
				'Model przegląda całą ofertę za Ciebie i oznacza mecze, w których widzi przewagę. ' +
				'Ty sprawdzasz dlaczego — i decydujesz. Po meczu rozliczamy każdy typ według oficjalnego wyniku.',
		},
		features: {
			title: 'Co dostajesz',
			items: [
				{
					icon: 'Sparkles',
					title: '„Model widzi" — cały dzień w minutę',
					body: 'Plakietka przy meczu znaczy: model go policzył i widzi przewagę. Obok listy — pięć najmocniejszych typów dnia. Czterysta meczów przeglądasz w minutę.',
				},
				{
					icon: 'FileText',
					title: 'Analiza z liczbami, nie z opinii',
					body: 'Model liczy szanse i typy, AI tłumaczy czynniki i ryzyka po ludzku. Przed meczem i w trakcie — z aktualnym wynikiem.',
				},
				{
					icon: 'Target',
					title: 'Cztery rynki, które naprawdę działają',
					body: 'Wynik meczu, podwójna szansa, gol drużyny, powyżej 2,5 gola — sprawdzone na tysiącach meczów. Nie typujemy tego, czego nikt nie przewiduje lepiej niż średnia.',
				},
				{
					icon: 'Mail',
					title: 'Raport AI i poranny mail',
					body: 'Najmocniejsze typy z całej oferty na 24 h albo 3 dni. Codziennie o 8:00 w skrzynce: typy na dziś i rozliczenie wczorajszych.',
				},
				{
					icon: 'Bot',
					title: 'Asystent, który zna każdy mecz',
					body: 'Zapytaj: „gdzie model widzi dziś typy?", „co z tym meczem?", „jaką macie skuteczność?". Sprawdzi też w internecie kontuzje i składy.',
				},
				{
					icon: 'BarChart3',
					title: 'Skuteczność na widoku',
					body: 'Każdy typ rozliczany po meczu z oficjalnym wynikiem. Trafione, chybione i to, ile trafiłoby samo z siebie — wszystko publiczne.',
				},
				{
					icon: 'Users',
					title: 'Czat i Kolejka',
					body: 'Pokój przy każdym meczu. Typuj sam z zamkniętej listy i rywalizuj co tydzień na tych samych dwunastu meczach — z innymi kibicami i z modelem.',
				},
			],
		},
		how: {
			title: 'Trzy kroki',
			steps: [
				{ title: 'Otwórz listę meczów', body: 'Model już oznaczył spotkania, w których widzi przewagę. „Model widzi" pokazuje pięć najmocniejszych dnia.' },
				{ title: 'Kliknij mecz', body: 'Dostajesz liczby i powody: forma, siła, bezpośrednie mecze, spodziewane gole — oraz ryzyka, których liczby nie widzą. Dopytaj asystenta o cokolwiek.' },
				{
					title: 'Weź typ z dwiema liczbami',
					body: `„66% (zwykle 44%)" — 66 to szansa według modelu, 44 to ile dzieje się samo z siebie. Typ pojawia się tylko od ${MIN_PROBABILITY}% i co najmniej ${MIN_LIFT} pkt nad „zwykle". Po meczu sprawdź go w Skuteczności.`,
				},
			],
		},
		accuracy: {
			title: 'Pokazujemy też chybione',
			body:
				'Każdy typ rozliczamy automatycznie według oficjalnego wyniku — raz na dobę, po zakończonych ' +
				'meczach. Trafione, chybione, a obok: ile te same typy trafiłyby same z siebie. ' +
				'Gdybyśmy tego nie bili, tu zobaczysz to pierwszy.',
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
				`dokup kredyty albo weź plan na 30 dni.`,
			cta: 'Plany i limity',
		},
		faq: { title: 'Najczęstsze pytania' },
		finalCta: {
			title: 'Sprawdź na dzisiejszym meczu',
			body: 'Darmowe konto zajmuje minutę i nie wymaga karty. Otwórz listę, znajdź plakietkę, przeczytaj dlaczego.',
			cta: 'Załóż darmowe konto',
		},
	};
}
