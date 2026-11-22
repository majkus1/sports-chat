import { TRIAL } from '@/lib/billing/plans';

/**
 * Treść strony „Jak to działa".
 *
 * UKŁAD (22.11.2026): na wierzchu trzy zdania „W skrócie" i jeden przycisk; reszta — kroki,
 * próg, czego nie robimy, sprawdzian — w `details` pod „Szczegóły dla dociekliwych", a pod nimi
 * pytania zdjęte ze strony głównej (`methodFaqItems` w `lib/landing/faq.js`). Treść w `details`
 * jest w HTML-u, więc wyszukiwarka czyta całą stronę, a kibic tylko to, czego potrzebuje.
 * Zajawka metody na stronie głównej zniknęła — zastąpił ją jeden odnośnik pod FAQ.
 *
 * ZASADA: KAŻDE ZDANIE MUSI BYĆ PRAWDZIWE. To strona o metodzie, więc jest jedynym miejscem
 * w serwisie, w którym marketing i pomiar mówią tym samym głosem. Wszystkie liczby pochodzą
 * z backtestu opisanego w `lib/model/README.md`, a ograniczenia z `lib/picks/policy.js`.
 * Jeżeli któreś z nich się zmieni, ten plik zmienia się razem z nimi.
 *
 * PISANE DLA KOGOŚ, KTO NIE ZNA SIĘ NA STATYSTYCE. Pierwsza wersja była prawdziwa i wciąż
 * niezrozumiała, bo mówiła abstrakcjami: „przewyższa przeciętną", „norma rynku", „przewaga".
 * Czytelnik nie wiedział, przeciętną CZEGO ani o ile ma być więcej. Teraz cała reguła stoi
 * na jednym przykładzie z konkretnymi liczbami, a próg jest podany wprost — bo i tak widać
 * go przy każdym typie, więc ukrywanie go tutaj niczego nie chroni.
 *
 * Słowa, których tu nie ma i mieć nie będzie: „rynek" w znaczeniu zakładowym, „kalibracja",
 * „rozkład", „log loss", „norma bazowa". Jeżeli pojęcie jest potrzebne, tłumaczymy je
 * zdaniem, a nie nazywamy terminem.
 */

/** Liczba meczów, na których model sprawdzono poza danymi uczącymi (backtest, wrzesień 2026). */
const TEST_MATCHES = 8069;

/**
 * Ile punktów procentowych mecz musi odstawać od zwykłej sytuacji, żeby dać typ.
 *
 * To `MIN_LIFT` z `lib/picks/policy.js`. Trzymamy tu osobną stałą tylko po to, żeby zmiana
 * progu wymusiła poprawienie także tego tekstu — treść strony i kod muszą mówić to samo.
 */
const MIN_LIFT = 12;

export function methodContent(locale) {
	if (locale === 'en') {
		return {
			eyebrow: 'How it works',
			title: 'Where our numbers come from',
			lead: 'We don’t guess — we calculate from thousands of matches. The essentials in three points, details below.',
			summary: {
				title: 'In short',
				items: [
					{
						highlight: 'The numbers come from a calculation, not from an AI’s opinion.',
						body: 'The model works out the chances from past results. The AI puts them into words and may not change them.',
					},
					{
						highlight: 'A pick has to say more than the obvious.',
						body: `We show it only when the match stands out from an ordinary one by at least ${MIN_LIFT} points.`,
					},
					{
						highlight: 'We show the ones that missed, too.',
						body: 'Every pick is recorded before the match and settled after it — hits and misses alike.',
					},
				],
			},
			cta: {
				register: 'Create a free account',
				note: `No card · ${TRIAL.days} days of all picks and coupons for free`,
			},
			details: { title: 'Details for the curious' },
			faq: { title: 'More questions' },
			steps: {
				title: 'Three steps behind every analysis',
				items: [
					{
						title: 'We work out how strong each team is',
						body: 'From this season’s results and last season’s. A match from last week counts for more than one from last year. Who they played matters too: three goals against the bottom club count for less than one against the leader.',
					},
					{
						title: 'We work out how this match could end',
						body: 'From both teams’ strength we get how many goals each is likely to score — and from that, the chance of every result. When odds are available, a pick stays only if the odds back it too.',
					},
					{
						title: 'The AI puts it into words',
						body: 'It gets the finished numbers and explains what stands behind them and what could go the other way. It does not invent the figures and does not correct them.',
					},
				],
			},
			threshold: {
				title: 'When we call something a pick',
				body: 'A sentence can be perfectly true and completely useless. That is the whole difference between a pick and stating the obvious.',
				example: {
					label: 'The example that explains everything',
					lines: [
						'“The home side won’t lose” comes true in 69 matches out of 100. In any league, without calculating anything.',
						'So if we put 74% next to some match, that would be true — and you would get nothing out of it.',
						'That is why we always subtract what happens anyway. What’s left is one number: how far THIS match stands out from an ordinary one.',
						`We only publish a pick when it stands out by at least ${MIN_LIFT} points. That number is printed under every pick.`,
					],
				},
				fallback:
					'When nothing stands out that much, we show the strongest read as a weaker pick — and it counts towards our accuracy too.',
			},
			limits: {
				title: 'What we deliberately don’t do',
				items: [
					{
						title: 'We don’t pick “both teams to score” or exact goal counts',
						body: 'We checked it on thousands of matches: the plain calculation for “both teams to score”, “under 2.5 goals” or the exact score came out worse than simply going with the average. If that is the case, saying nothing is better — so we say nothing. The one exception is “over 2.5 goals”: we work it out with a separate, tested calculation and only show it when it clears the pick threshold.',
					},
					{
						title: 'We don’t calculate in cup competitions',
						body: 'A cup throws several hundred teams from different divisions into one draw, and most of them play a single match. There is nothing to work their strength out from. We tried anyway — it came out worse than not trying.',
					},
					{
						title: 'Odds only where they are the point',
						body: 'The model’s picks are shown without odds. Odds (the median of several bookmakers, no links) appear only on the coupons, in the “Higher odds” report and in the assistant.',
					},
				],
			},
			proof: {
				title: 'We check ourselves',
				body: `Before we showed any of this, we tested the model on ${TEST_MATCHES.toLocaleString('en-GB')} matches it had never seen: we taught it on older results and made it call what came afterwards. Exactly the way it runs today.`,
				points: [
					'Every pick is saved the moment it is made, with the numbers behind it — so it cannot be quietly edited later.',
					'Once a day we check finished matches against the official result.',
					'Hits, misses and picks we couldn’t settle — all of it is public.',
				],
				cta: 'See the accuracy page',
			},
		};
	}

	return {
		eyebrow: 'Jak to działa',
		title: 'Skąd biorą się nasze liczby',
		lead: 'Nie zgadujemy — liczymy z wyników tysięcy meczów. Najważniejsze w trzech punktach, szczegóły niżej.',
		summary: {
			title: 'W skrócie',
			items: [
				{
					highlight: 'Liczby wychodzą z rachunku, nie z opinii AI.',
					body: 'Model liczy szanse z dawnych wyników. AI je opisuje i nie może ich zmieniać.',
				},
				{
					highlight: 'Typ musi mówić więcej niż oczywistość.',
					body: `Pokazujemy go dopiero, gdy mecz odstaje od zwyczajnego o co najmniej ${MIN_LIFT} punktów.`,
				},
				{
					highlight: 'Pokazujemy też typy, które nie wyszły.',
					body: 'Każdy typ zapisujemy przed meczem i rozliczamy po nim — trafione i chybione.',
				},
			],
		},
		cta: {
			register: 'Załóż darmowe konto',
			note: `Bez karty · ${TRIAL.days} dni wszystkich typów i kuponów za darmo`,
		},
		details: { title: 'Szczegóły dla dociekliwych' },
		faq: { title: 'Więcej pytań' },
		steps: {
			title: 'Trzy kroki za każdą analizą',
			items: [
				{
					title: 'Sprawdzamy, jak mocna jest każda drużyna',
					body: 'Z wyników tego sezonu i poprzedniego. Mecz sprzed tygodnia waży więcej niż sprzed roku. Liczy się też, z kim drużyna grała: trzy gole z ostatnim zespołem w tabeli znaczą mniej niż jeden z liderem.',
				},
				{
					title: 'Liczymy, jak może skończyć się ten mecz',
					body: 'Z siły drużyn wychodzi, ile goli każda prawdopodobnie strzeli, a z tego — szansa każdego wyniku. Gdy są kursy, typ zostaje tylko wtedy, gdy kursy też go potwierdzają.',
				},
				{
					title: 'AI opisuje to po ludzku',
					body: 'Dostaje gotowe liczby i tłumaczy, co za nimi stoi i co może pójść inaczej. Liczb nie wymyśla i nie poprawia.',
				},
			],
		},
		threshold: {
			title: 'Kiedy nazywamy coś typem',
			body: 'Zdanie może być prawdziwe i zupełnie bezużyteczne naraz. Na tym polega cała różnica między typem a oczywistością.',
			example: {
				label: 'Przykład, który tłumaczy wszystko',
				lines: [
					'„Gospodarz nie przegra" sprawdza się w 69 meczach na 100. W każdej lidze, bez liczenia czegokolwiek.',
					'Gdybyśmy więc napisali przy jakimś meczu 74%, byłaby to prawda — i nic byś z niej nie miał.',
					'Dlatego zawsze odejmujemy to, co dzieje się samo. Zostaje jedna liczba: o ile TEN mecz odstaje od zwyczajnego.',
					`Typ wystawiamy dopiero, gdy odstaje o co najmniej ${MIN_LIFT} punktów. Tę liczbę widzisz podpisaną pod każdym typem.`,
				],
			},
			fallback:
				'Gdy nic nie odstaje, pokazujemy najmocniejsze wskazanie jako słabszy typ — i liczymy je do skuteczności.',
		},
		limits: {
			title: 'Czego świadomie nie robimy',
			items: [
				{
					title: 'Nie typujemy „obie strzelą" ani dokładnej liczby goli',
					body: 'Sprawdziliśmy to na tysiącach meczów: zwykłe wyliczenie „obie drużyny strzelą", „poniżej 2,5 gola" czy dokładnego wyniku wypadało gorzej niż trzymanie się średniej. Skoro tak, lepiej nie mówić nic — i nie mówimy. Jedyny wyjątek to „powyżej 2,5 gola": liczymy je osobnym, sprawdzonym rachunkiem i pokazujemy tylko wtedy, gdy przejdzie próg typu.',
				},
				{
					title: 'Nie liczymy w pucharach',
					body: 'W pucharze gra naraz kilkaset drużyn z różnych poziomów, a większość rozgrywa w nim jeden mecz. Nie ma z czego wyliczyć ich siły. Próbowaliśmy mimo to — wychodziło gorzej, niż gdybyśmy nie liczyli wcale.',
				},
				{
					title: 'Kursy tylko tam, gdzie są tematem',
					body: 'Typy modelu pokazujemy bez kursów. Kursy (mediana kilku bukmacherów, bez linków) są tylko przy kuponach, w raporcie „Wyższe kursy" i w asystencie.',
				},
			],
		},
		proof: {
			title: 'Sprawdzamy sami siebie',
			body: `Zanim cokolwiek pokazaliśmy, sprawdziliśmy model na ${TEST_MATCHES.toLocaleString('pl-PL')} meczach, których wcześniej nie widział: uczyliśmy go na starszych wynikach i kazaliśmy typować to, co przyszło potem. Dokładnie tak, jak działa dzisiaj.`,
			points: [
				'Każdy typ zapisujemy w chwili powstania, razem z liczbami, które za nim stały — nie da się go potem po cichu poprawić.',
				'Raz na dobę sprawdzamy zakończone mecze z oficjalnym wynikiem.',
				'Trafienia, chybienia i typy, których nie dało się rozstrzygnąć — wszystko jest jawne.',
			],
			cta: 'Zobacz statystykę skuteczności',
		},
	};
}
