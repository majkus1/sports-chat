/**
 * Treść strony „Jak to liczymy" — jedno źródło dla strony i dla zajawki na landingu.
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
			lead: 'We don’t guess. We calculate, from the results of thousands of matches. Here is how — in two minutes, without a single formula.',
			summary: {
				title: 'In short',
				items: [
					{
						highlight: 'The numbers come from a calculation, not from an AI’s opinion.',
						body: 'A computer works through past results and works out the chances. The AI is handed those finished numbers and only puts them into words — it is not allowed to change them.',
					},
					{
						highlight: 'A pick has to tell you more than you already knew.',
						body: 'Plenty of things in football happen very often all by themselves. Repeating those is not a tip, so we subtract whatever was obvious anyway.',
					},
					{
						highlight: 'We show the ones that missed, too.',
						body: 'Every pick is saved, checked against the official result after the match, and published — hits and misses alike.',
					},
				],
			},
			steps: {
				title: 'Three steps behind every analysis',
				items: [
					{
						title: 'We work out how strong each team is',
						body: 'From this season’s results and last season’s. A match from last week counts for more than one from last year. Who they played matters too: three goals against the bottom club count for less than one against the leader.',
					},
					{
						title: 'We work out how this match could end',
						body: 'From both teams’ strength we get how many goals each is likely to score. From that the computer works out the chance of every possible scoreline, then adds them up into answers like “the home side won’t lose”.',
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
					'Sometimes nothing stands out that much. We still show the strongest read we have, labelled a fallback pick, together with exactly how many points it fell short. It counts towards our accuracy just like any other — we don’t hide the weaker ones from the statistics.',
			},
			limits: {
				title: 'What we deliberately don’t do',
				items: [
					{
						title: 'We don’t guess how many goals will be scored',
						body: 'We checked it on thousands of matches: our calls on “over 2.5 goals” or “both teams to score” came out worse than simply going with the average. If that is the case, saying nothing is better — so we say nothing.',
					},
					{
						title: 'We don’t calculate in cup competitions',
						body: 'A cup throws several hundred teams from different divisions into one draw, and most of them play a single match. There is nothing to work their strength out from. We tried anyway — it came out worse than not trying.',
					},
					{
						title: 'We don’t show odds',
						body: 'This is a service about matches, not about betting. You won’t find a bookmaker’s price here, or any encouragement to gamble.',
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
			teaser: {
				title: 'Where our numbers come from',
				body: 'A calculation works out team strength, the AI only puts it into words, and a pick appears when a match stands out from an ordinary one. In plain words, in two minutes.',
				cta: 'How it works',
			},
		};
	}

	return {
		eyebrow: 'Jak to działa',
		title: 'Skąd biorą się nasze liczby',
		lead: 'Nie zgadujemy. Liczymy, z wyników tysięcy meczów. Poniżej tłumaczymy jak — w dwie minuty i bez ani jednego wzoru.',
		summary: {
			title: 'W skrócie',
			items: [
				{
					highlight: 'Liczby wychodzą z rachunku, nie z opinii sztucznej inteligencji.',
					body: 'Komputer przelicza wyniki dawnych meczów i wylicza szanse. AI dostaje gotowe liczby i ma je tylko opisać po polsku — nie wolno jej ich zmieniać.',
				},
				{
					highlight: 'Typ musi mówić więcej, niż i tak było wiadomo.',
					body: 'Wiele rzeczy w piłce zdarza się bardzo często samo z siebie. Powtarzanie ich nie jest żadną wskazówką, więc odejmujemy to, co oczywiste.',
				},
				{
					highlight: 'Pokazujemy też te typy, które nie wyszły.',
					body: 'Każdy zapisujemy, po meczu sprawdzamy z oficjalnym wynikiem i publikujemy wszystko — trafienia i chybienia tak samo.',
				},
			],
		},
		steps: {
			title: 'Trzy kroki za każdą analizą',
			items: [
				{
					title: 'Sprawdzamy, jak mocna jest każda drużyna',
					body: 'Z wyników tego sezonu i poprzedniego. Mecz sprzed tygodnia waży więcej niż sprzed roku. Liczy się też, z kim drużyna grała: trzy gole z ostatnim zespołem w tabeli znaczą mniej niż jeden z liderem.',
				},
				{
					title: 'Liczymy, jak może skończyć się ten mecz',
					body: 'Z siły obu drużyn wychodzi, ile goli każda z nich prawdopodobnie strzeli. Z tego komputer wylicza szansę na każdy możliwy wynik, a potem sumuje je w odpowiedzi w rodzaju „gospodarz nie przegra".',
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
				'Czasem nic nie odstaje aż tak. Wtedy i tak pokazujemy najmocniejsze wskazanie, jakie mamy, podpisane „typ zapasowy" razem z tym, ile dokładnie punktów mu zabrakło. Liczy się do naszej skuteczności tak samo jak każdy inny — nie chowamy słabszych typów przed statystyką.',
		},
		limits: {
			title: 'Czego świadomie nie robimy',
			items: [
				{
					title: 'Nie zgadujemy, ile padnie goli',
					body: 'Sprawdziliśmy to na tysiącach meczów: nasze wskazania na „powyżej 2,5 gola" i „obie drużyny strzelą" wypadały gorzej niż zwykłe trzymanie się średniej. Skoro tak, lepiej nie mówić nic — i nie mówimy.',
				},
				{
					title: 'Nie liczymy w pucharach',
					body: 'W pucharze gra naraz kilkaset drużyn z różnych poziomów, a większość rozgrywa w nim jeden mecz. Nie ma z czego wyliczyć ich siły. Próbowaliśmy mimo to — wychodziło gorzej, niż gdybyśmy nie liczyli wcale.',
				},
				{
					title: 'Nie pokazujemy kursów',
					body: 'To serwis o meczach, nie o zakładach. Nie znajdziesz tu wyceny bukmachera ani zachęty do gry.',
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
		teaser: {
			title: 'Skąd biorą się nasze liczby',
			body: 'Rachunek wylicza siłę drużyn, AI tylko ubiera to w słowa, a typ pojawia się wtedy, gdy mecz odstaje od zwyczajnego. Po ludzku, w dwie minuty.',
			cta: 'Zobacz, jak to liczymy',
		},
	};
}
