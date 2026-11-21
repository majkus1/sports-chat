import { PLAN_PASS_DAYS, PLANS, TRIAL } from '@/lib/billing/plans';
import { MIN_LIFT, MIN_PROBABILITY } from '@/lib/picks/policy';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';
import { CUSTOM_LEGS } from '@/lib/coupons/custom';

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
 *
 * UCZCIWY PRZEKAZ (listopad 2026). Trzy rzeczy w tej kolejności: analiza meczu w 30 sekund,
 * sprawdzalny wynik (rejestr typów z godziną zapisu i zachowaniem rynku), narzędzia. Bez obietnic
 * zysku i bez słów zachęcających do gry — to wymóg polskich przepisów o reklamie hazardu, a do tego
 * prawda: model jeszcze nie bije rynku (log loss 0,971 wobec 0,946, CLV ok. +0,3%). Dlatego zamiast
 * „przewagi" pokazujemy dowody, które każdy może sprawdzić — i przegrane tak samo jak wygrane.
 */

const free = PLANS.free.limits;
const pro = PLANS.pro.limits;
const vip = PLANS.vip.limits;

export function landingContent(locale) {
	if (locale === 'en') {
		return {
			hero: {
				eyebrow: 'Football · a numbers model + AI',
				title: 'AI match analysis in 30 seconds. A record you can check.',
				subtitle:
					'A numbers model works out the chances — match result, double chance, a team to score, over 2.5 ' +
					'goals — and the AI explains them in plain words: form, strength, risks. Every pick goes into a ' +
					'public register before kick-off, with its time, and is settled after the match. Misses included.',
				primaryCta: 'See today’s matches',
				ask: {
					label: 'Ask the AI assistant',
					placeholder: 'Ask about any match, pick or team…',
					button: 'Ask',
					hint: 'Like ChatGPT, but for football: it knows today’s fixtures, the model’s numbers, the coupons and the latest team news.',
					chips: ['What’s the strongest pick today?', 'Give me today’s coupon', 'Injury news before Barcelona’s match', 'How are your picks doing?'],
				},
				secondaryCta: 'How it works',
				registerCta: 'See the pick register',
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
						icon: 'FileText',
						title: 'Match analysis in 30 seconds',
						body: 'The model’s numbers and the AI’s reasons on one screen: chances, form, strength, head-to-head and the risks the numbers can’t see. A badge on the fixture list shows where the model has a pick — four hundred fixtures scanned in a minute.',
					},
					{
						icon: 'BarChart3',
						title: 'A record you can check',
						body: 'Every pick is recorded before the match, with its time. After it: the result and how the market moved in between. Hits and misses in one public table — nothing deleted, nothing corrected.',
					},
					{
						icon: 'Target',
						title: 'Coupon builder',
						body: `Choose ${CUSTOM_LEGS.min}–${CUSTOM_LEGS.max} matches, the hours and the leagues — the model builds a coupon from picks it would make itself, with the chance that all of them come in. On Pro (${pro.couponGen} a day) and VIP (${vip.couponGen}), and ${TRIAL.limits.couponGen} a day during the trial.`,
					},
					{
						icon: 'Radio',
						title: 'Live',
						body: 'Analysis during the match with the current score, stats and events — not only what was known before kick-off — plus a live coupon from matches in progress. Live analysis on Pro and VIP; the live coupon also during the trial.',
					},
					{
						icon: 'Mail',
						title: 'AI report and the morning email',
						body: `The strongest picks from the whole schedule for the next 24 h or 3 days. Every day at 8:00 in your inbox: today’s picks and yesterday’s results. On Pro and VIP, and for your first ${TRIAL.days} days after you create an account.`,
					},
					{
						icon: 'Bot',
						title: 'An assistant that knows every match',
						body: 'Ask “where does the model see picks today?”, “what about this match?”, “how accurate are you?”. On Pro and VIP it also checks the web for injuries and line-ups.',
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
			register: {
				eyebrow: 'A record you can check',
				title: 'The pick register: check us before you believe us',
				body:
					'Every pick is recorded before the match, with its time. After the match we add the result ' +
					'and how the market moved between publication and kick-off. Losses are shown exactly like wins ' +
					'— nothing is deleted.',
				whyTitle: 'Why the market, not just the hit rate?',
				why:
					'A hit rate is easy to inflate by picking only favourites. The market is hard to fool: if the ' +
					'price of an event keeps moving towards our pick just before kick-off, we knew something ' +
					'earlier than others. If it does not — you will see it here, in black and white.',
				fallback:
					'The register loads live from the database: every pick with its record time, the result and ' +
					'the market move, on the Accuracy page.',
				cta: 'Open the pick register',
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
					`for your first ${TRIAL.days} days. Need more — buy credits once or take a ${PLAN_PASS_DAYS}-day plan.`,
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
			title: 'Analiza meczu od AI w 30 sekund. Wynik, który sprawdzisz.',
			subtitle:
				'Model liczbowy przelicza szanse — wynik meczu, podwójna szansa, gol drużyny, powyżej 2,5 gola — ' +
				'a AI tłumaczy je po ludzku: forma, siła, ryzyka. Każdy typ trafia przed meczem do publicznego ' +
				'rejestru, z godziną zapisu, i jest rozliczany po meczu. Chybione też.',
			primaryCta: 'Zobacz dzisiejsze mecze',
			ask: {
				label: 'Zapytaj asystenta AI',
				placeholder: 'Zapytaj o dowolny mecz, typ albo drużynę…',
				button: 'Zapytaj',
				hint: 'Jak ChatGPT, tylko o piłce: zna dzisiejsze mecze, liczby modelu, kupony i najnowsze wiadomości z klubów.',
				chips: ['Najmocniejszy typ na dziś?', 'Daj kupon na dziś', 'Kontuzje przed meczem Barcelony', 'Jak idzie waszym typom?'],
			},
			secondaryCta: 'Jak to działa',
			registerCta: 'Zobacz rejestr typów',
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
					icon: 'FileText',
					title: 'Analiza meczu w 30 sekund',
					body: 'Liczby modelu i powody od AI na jednym ekranie: szanse, forma, siła, bezpośrednie mecze i ryzyka, których liczby nie widzą. Plakietka na liście meczów pokazuje, gdzie model ma typ — czterysta spotkań przeglądasz w minutę.',
				},
				{
					icon: 'BarChart3',
					title: 'Wynik, który sprawdzisz',
					body: 'Każdy typ zapisany przed meczem, z godziną. Po meczu: wynik i to, jak w międzyczasie zachował się rynek. Trafione i chybione w jednej publicznej tabeli — niczego nie usuwamy ani nie poprawiamy.',
				},
				{
					icon: 'Target',
					title: 'Kreator kuponu',
					body: `Wybierz ${CUSTOM_LEGS.min}–${CUSTOM_LEGS.max} meczów, godziny i ligi — model złoży kupon z typów, które sam by wystawił, z szansą, że wejdą wszystkie. W Pro (${pro.couponGen} dziennie) i VIP (${vip.couponGen}), w okresie próbnym ${TRIAL.limits.couponGen} dziennie.`,
				},
				{
					icon: 'Radio',
					title: 'Live',
					body: 'Analiza w trakcie meczu z aktualnym wynikiem, statystykami i zdarzeniami — nie tylko z tego, co było przed gwizdkiem — oraz kupon live z meczów, które właśnie trwają. Analiza na żywo w Pro i VIP, kupon live także w okresie próbnym.',
				},
				{
					icon: 'Mail',
					title: 'Raport AI i poranny mail',
					body: `Najmocniejsze typy z całej oferty na 24 h albo 3 dni. Codziennie o 8:00 w skrzynce: typy na dziś i rozliczenie wczorajszych. W Pro i VIP oraz przez pierwsze ${TRIAL.days} dni po założeniu konta.`,
				},
				{
					icon: 'Bot',
					title: 'Asystent, który zna każdy mecz',
					body: 'Zapytaj: „gdzie model widzi dziś typy?", „co z tym meczem?", „jaką macie skuteczność?". W Pro i VIP sprawdzi też w internecie kontuzje i składy.',
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
		register: {
			eyebrow: 'Sprawdzalny wynik',
			title: 'Rejestr typów: sprawdź nas, zanim nam uwierzysz',
			body:
				'Każdy typ zapisujemy przed meczem, z godziną. Po meczu dopisujemy wynik i to, jak zachował się ' +
				'rynek między publikacją a pierwszym gwizdkiem. Przegrane widać tak samo jak wygrane — niczego ' +
				'nie usuwamy.',
			whyTitle: 'Dlaczego rynek, a nie sam procent trafień?',
			why:
				'Procent trafień łatwo podkręcić, typując same faworyty. Rynku nie da się tak łatwo oszukać: jeśli ' +
				'tuż przed meczem wycena zdarzenia regularnie przesuwa się w stronę naszego typu, wiedzieliśmy coś ' +
				'wcześniej niż inni. Jeśli nie — zobaczysz to tutaj, czarno na białym.',
			fallback:
				'Rejestr wczytuje się na żywo z bazy: każdy typ z godziną zapisu, wynikiem i ruchem rynku, ' +
				'w zakładce Skuteczność.',
			cta: 'Otwórz rejestr typów',
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
				`dokup kredyty albo weź plan na ${PLAN_PASS_DAYS} dni.`,
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
