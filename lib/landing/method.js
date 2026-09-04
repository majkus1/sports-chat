/**
 * Treść strony „Jak to liczymy" — jedno źródło dla strony i dla zajawki na landingu.
 *
 * ZASADA: KAŻDE ZDANIE MUSI BYĆ PRAWDZIWE. To strona o metodzie, więc jest jedynym miejscem
 * w serwisie, w którym marketing i pomiar mówią tym samym głosem. Wszystkie liczby pochodzą
 * z backtestu opisanego w `lib/model/README.md`, a ograniczenia z `lib/picks/policy.js`.
 * Jeżeli któreś z nich się zmieni, ten plik zmienia się razem z nimi.
 *
 * Bez żargonu. Czytelnik ma wyjść z tej strony wiedząc, skąd biorą się liczby i czego
 * serwis o sobie NIE twierdzi — a nie znając nazwy rozkładu prawdopodobieństwa.
 */

/** Liczba meczów, na których model sprawdzono poza danymi uczącymi (backtest, wrzesień 2026). */
const TEST_MATCHES = 8069;

export function methodContent(locale) {
	if (locale === 'en') {
		return {
			eyebrow: 'How it works',
			title: 'Where our numbers come from',
			lead: 'We calculate, we don’t guess. A statistical model works out how strong each team is, and the AI explains what that means in plain words.',
			summary: {
				title: 'In short',
				items: [
					{
						highlight: 'The model does the maths, the AI does the words.',
						body: 'Probabilities come from a calculation over match results — not from an AI’s impression of a team.',
					},
					{
						highlight: 'A pick has to say more than the obvious.',
						body: 'If something happens in most matches anyway, saying it will happen is not a pick. We only call it one when it clearly beats the usual rate.',
					},
					{
						highlight: 'Every pick gets settled — misses included.',
						body: 'We record each one and check it against the official result, then publish the lot.',
					},
				],
			},
			steps: {
				title: 'Three steps behind every analysis',
				items: [
					{
						title: 'We work out how strong each team is',
						body: 'From the results of this season and the last one, with recent matches counting for more. Who they played against matters too: three goals against the bottom side count for less than one against the leader.',
					},
					{
						title: 'We look for what stands out',
						body: 'The model compares this match against what happens in football on average. What matters is the difference — a match that looks like every other one tells you nothing.',
					},
					{
						title: 'The AI writes it up',
						body: 'It receives the finished numbers and explains them: which factors matter, what could go wrong. It does not invent the figures.',
					},
				],
			},
			threshold: {
				title: 'When we call something a pick',
				body: 'A true statement is not automatically a useful one. That is the whole difference between a pick and a truism.',
				example: {
					label: 'An example',
					lines: [
						'“Home win or draw” happens in 69 out of 100 matches. By itself, in any league.',
						'So a 74% call on it is correct — and tells you nothing you didn’t already know.',
						'We only call it a pick when it clearly beats that usual rate.',
					],
				},
				fallback:
					'When nothing beats it by enough, we still show the strongest read we have — labelled a fallback pick, with exactly how far short it fell. It counts towards our accuracy like any other.',
			},
			limits: {
				title: 'What we deliberately don’t do',
				items: [
					{
						title: 'We don’t predict how many goals will be scored',
						body: 'We measured it on thousands of matches: our forecasts for over/under and “both teams to score” came out worse than simply guessing the league average. So we don’t publish picks there. The expected-goals figures stay as a description of the match, nothing more.',
					},
					{
						title: 'We don’t calculate in cup competitions',
						body: 'A cup puts hundreds of teams from different divisions into one draw, most of them playing a match or two. There is nothing to measure strength from, and we checked that forcing it makes the forecasts worse.',
					},
					{
						title: 'We don’t show odds',
						body: 'This is a service about matches, not about betting. You will not find a bookmaker’s price anywhere here.',
					},
				],
			},
			proof: {
				title: 'We check ourselves',
				body: `We tested the model on ${TEST_MATCHES.toLocaleString('en-GB')} matches it had never seen — trained on the past, judged on what came after, the way it works in production.`,
				points: [
					'Every pick is saved the moment it is made, with the figures behind it.',
					'Once a day we settle the finished matches against the official result.',
					'Hits, misses and picks we couldn’t settle — all of it is public.',
				],
				cta: 'See the accuracy page',
			},
			teaser: {
				title: 'Where our numbers come from',
				body: 'A statistical model works out team strength, the AI explains it, and a pick only counts when it beats what happens anyway. In plain words, in two minutes.',
				cta: 'How it works',
			},
		};
	}

	return {
		eyebrow: 'Jak to działa',
		title: 'Skąd biorą się nasze liczby',
		lead: 'Liczymy, nie zgadujemy. Model statystyczny wylicza, jak mocna jest każda drużyna, a sztuczna inteligencja tłumaczy, co z tego wynika.',
		summary: {
			title: 'W skrócie',
			items: [
				{
					highlight: 'Liczby liczy model, słowa pisze AI.',
					body: 'Prawdopodobieństwa wychodzą z rachunku na wynikach meczów, a nie z wrażenia sztucznej inteligencji na temat drużyny.',
				},
				{
					highlight: 'Typ musi mówić coś ponad oczywistość.',
					body: 'Jeśli coś zdarza się w większości meczów, zapowiedź tego nie jest typem. Nazywamy tak dopiero to, co wyraźnie przewyższa przeciętną.',
				},
				{
					highlight: 'Każdy typ rozliczamy — też chybiony.',
					body: 'Zapisujemy go, sprawdzamy z oficjalnym wynikiem i pokazujemy wszystko, co z tego wyszło.',
				},
			],
		},
		steps: {
			title: 'Trzy kroki za każdą analizą',
			items: [
				{
					title: 'Liczymy, jak mocna jest każda drużyna',
					body: 'Z wyników tego sezonu i poprzedniego, przy czym świeższe mecze ważą więcej. Liczy się też, z kim drużyna grała: trzy gole z ostatnią drużyną w tabeli znaczą mniej niż jeden z liderem.',
				},
				{
					title: 'Szukamy tego, co odstaje',
					body: 'Model zestawia ten mecz z tym, co w piłce dzieje się przeciętnie. Liczy się różnica — spotkanie wyglądające jak każde inne nie mówi nic.',
				},
				{
					title: 'AI pisze to po ludzku',
					body: 'Dostaje gotowe liczby i tłumaczy, co za nimi stoi: które czynniki mają znaczenie i co może pójść inaczej. Nie wymyśla samych liczb.',
				},
			],
		},
		threshold: {
			title: 'Kiedy nazywamy coś typem',
			body: 'Zdanie prawdziwe to jeszcze nie zdanie przydatne. Na tym polega cała różnica między typem a truizmem.',
			example: {
				label: 'Przykład',
				lines: [
					'„Wygrana gospodarza lub remis" zdarza się w 69 na 100 meczów. Sama z siebie, w każdej lidze.',
					'Więc typ na 74% w tym rynku jest prawdziwy — i nie mówi nic, czego byś nie wiedział.',
					'Typem nazywamy to dopiero wtedy, gdy wyraźnie przewyższa tę przeciętną.',
				],
			},
			fallback:
				'Gdy nic jej wyraźnie nie przewyższa, i tak pokazujemy najmocniejsze wskazanie, jakie mamy — z podpisem „typ zapasowy" i informacją, ile dokładnie mu zabrakło. Liczy się do skuteczności jak każdy inny.',
		},
		limits: {
			title: 'Czego świadomie nie robimy',
			items: [
				{
					title: 'Nie typujemy, ile padnie goli',
					body: 'Zmierzyliśmy to na tysiącach meczów: nasze prognozy progów bramkowych i „obie drużyny strzelą" wypadały gorzej niż zwykłe zgadywanie średniej ligowej. Więc nie wystawiamy tam typów. Oczekiwane gole zostają wyłącznie jako opis charakteru meczu.',
				},
				{
					title: 'Nie liczymy w pucharach',
					body: 'Puchar wrzuca do jednej drabinki setki drużyn z różnych poziomów, z których większość rozgrywa w nim jeden lub dwa mecze. Nie ma z czego liczyć ich siły, a sprawdziliśmy, że na siłę wychodzi gorzej niż nic.',
				},
				{
					title: 'Nie pokazujemy kursów',
					body: 'To serwis o meczach, nie o zakładach. Nie znajdziesz tu wyceny bukmachera ani zachęty do gry.',
				},
			],
		},
		proof: {
			title: 'Sprawdzamy sami siebie',
			body: `Model sprawdziliśmy na ${TEST_MATCHES.toLocaleString('pl-PL')} meczach, których wcześniej nie widział — uczony na przeszłości, oceniany na tym, co przyszło potem, dokładnie tak, jak działa na produkcji.`,
			points: [
				'Każdy typ zapisujemy w chwili powstania, razem z liczbami, które za nim stały.',
				'Raz na dobę rozliczamy zakończone mecze według oficjalnego wyniku.',
				'Trafienia, chybienia i typy, których nie dało się rozstrzygnąć — wszystko jest jawne.',
			],
			cta: 'Zobacz statystykę skuteczności',
		},
		teaser: {
			title: 'Skąd biorą się nasze liczby',
			body: 'Model statystyczny wylicza siłę drużyn, AI to tłumaczy, a typem nazywamy dopiero to, co przewyższa przeciętną. Po ludzku, w dwie minuty.',
			cta: 'Zobacz, jak to liczymy',
		},
	};
}
