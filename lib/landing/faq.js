import { PLANS, TRIAL, CREDIT_COSTS, CREDIT_PACKS } from '@/lib/billing/plans';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Pytania i odpowiedzi ze strony głównej.
 *
 * Jedno źródło dla widocznej sekcji i dla danych strukturalnych `FAQPage` — gdyby treści
 * się rozeszły, wyszukiwarka pokazywałaby w wynikach coś innego niż użytkownik na stronie,
 * co jest naruszeniem wytycznych i realnym ryzykiem utraty wyniku rozszerzonego.
 *
 * Pytania sformułowane tak, jak ludzie pytają asystenta, a nie jak brzmią nagłówki sekcji.
 * Odpowiedzi krótkie, faktograficzne i samodzielne: model cytujący jedno zdanie ma podać
 * prawdę bez reszty kontekstu.
 *
 * Liczby pochodzą z definicji planów, więc nie rozjadą się z cennikiem po żadnej zmianie.
 */

const free = PLANS.free.limits;
const pro = PLANS.pro;
const najtanszyPakiet = CREDIT_PACKS[0];

export function faqItems(locale) {
	if (locale === 'en') {
		return [
			{
				question: 'What is Sports Chat?',
				answer:
					'A football service combining three things: AI-written match analyses, live chat in a room ' +
					'for every fixture, and picks that are settled automatically after the match with public ' +
					'accuracy statistics.',
			},
			{
				question: 'Is it free?',
				answer:
					`Yes. The free plan gives ${free.analysis} match analyses and ${free.aiChat} assistant ` +
					`questions per month, plus a one-off welcome allowance of ${TRIAL.limits.analysis} analyses ` +
					`and ${TRIAL.limits.report} reports valid for ${TRIAL.days} days. Chat and reading other ` +
					'users’ picks cost nothing at all.',
			},
			{
				question: 'Do I need an account?',
				answer:
					'Reading match lists and the accuracy statistics needs no account. Generating an analysis, ' +
					'chatting and placing picks require a free account with a confirmed e-mail address.',
			},
			{
				question: 'Is this a bookmaker? Do you take bets?',
				answer:
					'No. We do not organise betting, do not accept stakes and do not pay out winnings. Picks ' +
					'exist for entertainment and for comparing accuracy between users, with no monetary prizes.',
			},
			{
				question: 'Where does the match data come from?',
				answer:
					'From a commercial sports data provider: fixtures, live results, line-ups, injuries, tables ' +
					'and team statistics. We do not scrape other services.',
			},
			{
				question: 'How is an AI analysis produced?',
				answer:
					'The model receives a prepared set of facts about the fixture — recent form, table position, ' +
					'head-to-head record, line-ups, injuries and statistics — and describes the relationships ' +
					'between them. It has no internet access while writing and knows nothing beyond that data.',
			},
			{
				question: 'How accurate are the analyses?',
				answer:
					'Every pick is stored and settled automatically after the match against the official result. ' +
					'The accuracy page shows hits, misses and skipped picks. We publish the misses too, because ' +
					'a hit-only list carries no information.',
			},
			{
				question: 'Can I place my own picks?',
				answer:
					'Yes, on any fixture before kick-off, from a closed list of markets so every pick can be ' +
					'settled. Your picks and the AI picks are counted separately and never merged into one number.',
			},
			{
				question: 'What is the weekly round?',
				answer:
					'A shared set of twelve matches for everyone, with a single closing time and a leaderboard ' +
					'that resets each week. Because everyone gets the same fixtures, the results are directly ' +
					'comparable.',
			},
			{
				question: 'What is the difference between credits and a paid plan?',
				answer:
					`Credits are a one-off purchase with no commitment — an analysis costs ${CREDIT_COSTS.analysis} ` +
					`credit, a report ${CREDIT_COSTS.report}, and the smallest pack is ${najtanszyPakiet.credits} ` +
					`credits for ${najtanszyPakiet.priceGrosze / 100} zł. The ${pro.id.toUpperCase()} plan is ` +
					`${pro.priceMonthlyPln} zł for 30 days of access and works out far cheaper per analysis if you ` +
					'use the service regularly. Both are one-off payments; nothing renews automatically.',
			},
			{
				question: 'How do I pay?',
				answer:
					'Payments are handled by Stripe: card, BLIK or Przelewy24. We never see or store card details.',
			},
			{
				question: 'Does the payment renew? Do I need to cancel anything?',
				answer:
					'No. A paid plan works like a ticket: you pay for 30 days and the account returns to free ' +
					'afterwards. Nothing is charged automatically and there is nothing to cancel. You buy the next ' +
					'period whenever you want — buying before the current one ends adds days to those remaining.'
			},
			{
				question: 'Which sports are covered?',
				answer:
					'Football for now, across the major European and international competitions. Further sports ' +
					'are planned; the service is built so adding one does not require rebuilding it.',
			},
			{
				question: 'Is there an English version?',
				answer: 'Yes. The interface, analyses and reports are available in Polish and English.',
			},
			{
				question: 'Who is the service for?',
				answer:
					'Adults aged 18 or over who follow football and want data in one place instead of five tabs. ' +
					'Content is informational and statistical, and is not betting advice.',
			},
			{
				question: 'What does the assistant in the chat do?',
				answer:
					'Mentioning @AI in a match room brings in an assistant that knows the full data for that ' +
					'fixture, including any analysis already generated, and answers in front of the whole room.',
			},
			{
				question: 'Can I talk to other fans?',
				answer:
					'Yes — that is the heart of the service. Every match has its own room where fans follow the ' +
					'game together: messages appear instantly without reloading, and the history stays after the ' +
					'final whistle. You can move from any person to a private conversation. Writing needs an ' +
					'account; reading does not.',
			},
		];
	}

	return [
		{
			question: 'Czym jest Czat Sportowy?',
			answer:
				'Serwisem piłkarskim łączącym trzy rzeczy: analizy meczów pisane przez AI, czat na żywo ' +
				'w pokoju przy każdym spotkaniu oraz typy rozliczane automatycznie po meczu, z jawną ' +
				'statystyką skuteczności.',
		},
		{
			question: 'Czy korzystanie jest darmowe?',
			answer:
				`Tak. Plan darmowy daje ${free.analysis} ${odmien(free.analysis, ANALIZY)} meczów i ` +
				`${free.aiChat} ${odmien(free.aiChat, PYTANIA)} do asystenta miesięcznie, a nowe konto ` +
				`dostaje dodatkowo jednorazową pulę powitalną: ${TRIAL.limits.analysis} ` +
				`${odmien(TRIAL.limits.analysis, ANALIZY)} i ${TRIAL.limits.report} ` +
				`${odmien(TRIAL.limits.report, RAPORTY)} ważne przez ${TRIAL.days} dni. Czat i czytanie ` +
				'cudzych typów nie kosztują nic.',
		},
		{
			question: 'Czy potrzebuję konta?',
			answer:
				'Do przeglądania listy meczów i statystyki skuteczności konto nie jest potrzebne. Wygenerowanie ' +
				'analizy, pisanie na czacie i wystawianie typów wymagają darmowego konta z potwierdzonym adresem e-mail.',
		},
		{
			question: 'Czy to bukmacher? Czy przyjmujecie zakłady?',
			answer:
				'Nie. Nie urządzamy zakładów wzajemnych, nie przyjmujemy stawek i nie wypłacamy wygranych. ' +
				'Typowanie służy rozrywce i porównaniu skuteczności między użytkownikami, bez nagród pieniężnych.',
		},
		{
			question: 'Skąd biorą się dane o meczach?',
			answer:
				'Z komercyjnego dostawcy danych sportowych: terminarze, wyniki na żywo, składy, kontuzje, ' +
				'tabele i statystyki drużynowe. Nie pobieramy treści z innych serwisów.',
		},
		{
			question: 'Jak powstaje analiza AI?',
			answer:
				'Model dostaje przygotowany zestaw faktów o meczu — formę, pozycję w tabeli, bilans bezpośrednich ' +
				'spotkań, składy, kontuzje i statystyki — i opisuje zależności między nimi. W trakcie pisania nie ' +
				'ma dostępu do internetu i nie wie nic ponad te dane.',
		},
		{
			question: 'Jaka jest skuteczność analiz?',
			answer:
				'Każdy typ zapisujemy i rozliczamy automatycznie po meczu na podstawie oficjalnego wyniku. ' +
				'Na stronie skuteczności widać trafienia, chybienia i typy pominięte. Chybione publikujemy również, ' +
				'bo lista samych trafień nie niesie żadnej informacji.',
		},
		{
			question: 'Czy mogę wystawiać własne typy?',
			answer:
				'Tak, przy każdym meczu przed pierwszym gwizdkiem, z zamkniętej listy rynków, żeby każdy typ dało ' +
				'się rozliczyć. Twoje typy i typy AI liczone są osobno i nigdy nie są sumowane w jedną liczbę.',
		},
		{
			question: 'Czym jest kolejka tygodniowa?',
			answer:
				'Wspólnym zestawem dwunastu meczów dla wszystkich, z jednym terminem zamknięcia i rankingiem ' +
				'liczonym od nowa co tydzień. Ponieważ każdy dostaje te same spotkania, wyniki są wprost porównywalne.',
		},
		{
			question: 'Czym różnią się kredyty od planu płatnego?',
			answer:
				`Kredyty kupuje się jednorazowo, bez zobowiązania — analiza kosztuje ${CREDIT_COSTS.analysis} kredyt, ` +
				`raport ${CREDIT_COSTS.report}, a najmniejszy pakiet to ${najtanszyPakiet.credits} kredytów za ` +
				`${najtanszyPakiet.priceGrosze / 100} zł. Plan ${pro.id.toUpperCase()} to ${pro.priceMonthlyPln} zł ` +
				'za 30 dni dostępu — przy regularnym korzystaniu wychodzi znacznie taniej w przeliczeniu na analizę. ' +
				'Obie formy są płatnością jednorazową, nic nie odnawia się automatycznie.',
		},
		{
			question: 'Jak mogę zapłacić?',
			answer:
				'Płatności obsługuje Stripe: karta, BLIK albo Przelewy24. Danych karty nie widzimy ani nie przechowujemy.',
		},
		{
			question: 'Czy płatność się odnawia? Czy muszę coś wypowiadać?',
			answer:
				'Nie. Plan płatny kupuje się jak bilet: opłacasz 30 dni i po tym czasie konto samo wraca do ' +
				'darmowego. Nic nie pobiera się automatycznie i nie ma czego wypowiadać. Kolejny okres kupujesz ' +
				'wtedy, kiedy chcesz — zakup przed końcem trwającego dokłada dni do pozostałych.'
		},
		{
			question: 'Jakie sporty obsługujecie?',
			answer:
				'Na razie piłkę nożną, w najważniejszych rozgrywkach europejskich i międzynarodowych. Kolejne ' +
				'dyscypliny są w planach; serwis jest zbudowany tak, żeby dodanie sportu nie wymagało przebudowy.',
		},
		{
			question: 'Czy jest wersja angielska?',
			answer: 'Tak. Interfejs, analizy i raporty są dostępne po polsku i po angielsku.',
		},
		{
			question: 'Dla kogo jest ten serwis?',
			answer:
				'Dla pełnoletnich kibiców piłki nożnej, którzy chcą mieć dane w jednym miejscu zamiast w pięciu ' +
				'zakładkach. Treści mają charakter informacyjny i statystyczny, nie są poradą bukmacherską.',
		},
		{
			question: 'Co robi asystent w czacie?',
			answer:
				'Wywołany wzmianką @AI w pokoju meczowym odpowiada na pytania o dany mecz. Zna komplet danych ' +
				'o spotkaniu, łącznie z wygenerowaną wcześniej analizą, a odpowiedź widzi cały pokój.',
		},
		{
			question: 'Czy mogę rozmawiać z innymi kibicami?',
			answer:
				'Tak, i to jest sedno serwisu. Każdy mecz ma własny pokój, w którym kibice komentują grę na ' +
				'żywo — wiadomości pojawiają się natychmiast, bez odświeżania strony, a historia rozmowy ' +
				'zostaje po ostatnim gwizdku. Z każdej osoby możesz przejść na rozmowę prywatną. ' +
				'Do pisania potrzebne jest konto; czytać można bez logowania.',
		},
	];
}
