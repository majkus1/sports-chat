import { h3, note, p, ul } from '@/lib/blog/blocks';

/**
 * Zapowiedź sezonu Serie A 2026/27.
 *
 * Liczby pochodzą z projekcji superkomputera Opty i z bilansu zakończonego sezonu; przy
 * każdej podajemy źródło w treści, bo prognoza bez wskazania autora to tylko opinia.
 *
 * ŻADNYCH kursów ani nazw bukmacherów — ta sama zasada, która obowiązuje w raportach AI.
 * Powód jest prawny, nie estetyczny: art. 29 ustawy o grach hazardowych zakazuje reklamy
 * i promocji zakładów wzajemnych.
 */
const serieA202627 = {
	slug: 'serie-a-2026-27-zapowiedz-sezonu',
	publishedAt: '2026-08-21',
	readingMinutes: 7,
	tags: ['Serie A', 'zapowiedź sezonu', 'analiza'],

	pl: {
		title: 'Serie A 2026/27 — zapowiedź sezonu i faworyci',
		metaTitle: 'Serie A 2026/27 — zapowiedź sezonu',
		description:
			'Inter broni tytułu po 11 punktach przewagi, Como zaskakuje prognozy, a na ławkach ' +
			'Allegri, Amorim i Gattuso. Co czeka Serie A w tym sezonie.',
		lead:
			'Sezon rusza 22 sierpnia. Inter przystępuje do niego jako mistrz z ubiegłorocznym ' +
			'dorobkiem, którego nikt nie zbliżył się nawet na dystans, ale najciekawsza teza tej ' +
			'zapowiedzi nie dotyczy wcale Mediolanu.',
		sections: [
			{
				heading: 'Inter obronił mistrzostwo w sposób, który nie zostawił wątpliwości',
				blocks: [
					p(
						'Poprzedni sezon zakończył się jedenastopunktową przewagą Interu nad drugim Napoli. ' +
							'Sam wynik punktowy bywa mylący, ale bilans bramkowy już nie: 89 goli strzelonych ' +
							'i 35 straconych to najlepsza ofensywa i najlepsza różnica bramek w lidze. Zespół ' +
							'nie wygrał serią jednobramkowych zwycięstw ani na rzutach karnych — wygrał, bo grał ' +
							'lepiej od reszty przez większość spotkań.'
					),
					p(
						'Warto zapamiętać, że był to pierwszy sezon Cristiana Chivu w roli pierwszego trenera. ' +
							'Drugi rok pracy szkoleniowca w klubie zwykle mówi więcej niż pierwszy: znika efekt ' +
							'świeżości, a rywale mają za sobą pełen sezon obserwacji.'
					),
					p(
						'Latem Inter wzmocnił defensywę Johnem Stonesem, który przyszedł bez kwoty odstępnego ' +
							'po odejściu z Manchesteru City. To transfer typu „doświadczenie za darmo" — obarczony ' +
							'ryzykiem zdrowotnym, ale bez kosztu, który zmuszałby do stawiania go w składzie na siłę.'
					),
				],
			},
			{
				heading: 'Como jest najciekawszą historią tego sezonu',
				blocks: [
					p(
						'Superkomputer Opty daje Interowi 35,1% szans na obronę tytułu. Nic zaskakującego. ' +
							'Zaskakuje to, kto stoi na drugim miejscu tej listy: Como z 13,6% — przed Romą (12,7%), ' +
							'Juventusem (11,4%), Napoli (7,5%) i Atalantą (6,8%).'
					),
					p(
						'Model, który stawia beniaminka sprzed dwóch lat wyżej niż Juventus i Napoli razem wzięte, ' +
							'zwykle widzi coś, czego nie widać w tabeli końcowej. W przypadku Como najprostszym ' +
							'wyjaśnieniem jest jakość gry niewspółmierna do zajętego miejsca oraz to, że klub ' +
							'utrzymał Nico Paza — zawodnika z osiemnastoma udziałami przy bramkach w minionym sezonie.'
					),
					note(
						'Prognoza nie jest przepowiednią. Trzynaście procent oznacza, że w siedmiu na osiem ' +
							'symulacji Como tytułu NIE zdobywa. To wciąż mocna teza jak na klub bez tradycji ' +
							'walki o mistrzostwo, ale nie powód, żeby ogłaszać rewolucję.'
					),
				],
			},
			{
				heading: 'Karuzela trenerska przetasowała czołówkę mocniej niż transfery',
				blocks: [
					p(
						'To sezon, w którym cztery z sześciu najmocniejszych klubów zaczynają z nowym głosem ' +
							'w szatni. Zmiany układają się w łańcuch:'
					),
					ul([
						'Napoli — Massimiliano Allegri w miejsce Antonia Conte,',
						'Milan — Ruben Amorim po Allegrim,',
						'Lazio — Gennaro Gattuso po rozstaniu z reprezentacją Włoch,',
						'Atalanta — Maurizio Sarri.',
					]),
					p(
						'Każda z tych par oznacza inną filozofię gry, a nie kosmetykę. Amorim i Sarri przychodzą ' +
							'z wyrazistymi, wymagającymi pomysłami taktycznymi, których wdrożenie zajmuje miesiące. ' +
							'Pierwsze kolejki takich zespołów bywają nieczytelne — i właśnie dlatego są najtrudniejsze ' +
							'do prognozowania.'
					),
				],
			},
			{
				heading: 'Transfery, które realnie zmieniają układ sił',
				blocks: [
					ul([
						'John Stones do Interu — środkowy obrońca z kompletem tytułów w Anglii, pozyskany za darmo.',
						'Gonçalo Ramos z PSG do Milanu — napastnik pod nowy pomysł Amorima na grę w ataku.',
						'Donyell Malen wykupiony przez Romę po wypożyczeniu — 14 goli w 18 występach to dorobek, którego nie zostawia się w Birmingham.',
						'Nico Paz zatrzymany w Como — brak sprzedaży bywa najlepszym transferem lata.',
					]),
					p(
						'Zwróć uwagę na wspólny mianownik: żaden z tych ruchów nie jest rekordem transferowym. ' +
							'Serie A od kilku sezonów wygrywa sprytem rynkowym, a nie wydatkami, i to zmienia sposób, ' +
							'w jaki należy czytać składy — o sile zespołu decyduje dopasowanie do pomysłu trenera, ' +
							'a nie suma cen z serwisów transferowych.'
					),
				],
			},
			{
				heading: 'Beniaminkowie i dolna część tabeli',
				blocks: [
					p(
						'Do ligi wracają Venezia i Frosinone z awansu bezpośredniego oraz Monza, która przeszła ' +
							'przez baraże. Wszystkie trzy znają najwyższy poziom z ostatnich lat, co zwykle oznacza ' +
							'realistyczne planowanie i mniejszą liczbę pogromów w pierwszych tygodniach.'
					),
					p(
						'Dla kogoś, kto ogląda ligę pod kątem analizy, dolna część tabeli jest ciekawsza niż czubek: ' +
							'to tam pojedynczy transfer albo kontuzja bramkarza przekłada się na wynik najmocniej, ' +
							'a próba meczowa jest na tyle mała, że statystyki jeszcze niczego nie wygładziły.'
					),
				],
			},
			{
				heading: 'Na co patrzeć w pierwszych kolejkach',
				blocks: [
					ul([
						'Zespoły z nowym trenerem — pierwsze cztery kolejki powiedzą więcej o kierunku niż całe przygotowania.',
						'Como w meczach z czołówką — jeśli teza Opty ma się obronić, tam się to zacznie.',
						'Bilans bramkowy Interu, nie sama liczba punktów — przewaga jakościowa widać w nim wcześniej.',
						'Obciążenie kalendarzem klubów grających w europejskich pucharach, zwłaszcza w drugiej połowie września.',
					]),
					note(
						'Zapowiedzi sezonu starzeją się szybciej niż jakikolwiek inny tekst o piłce. Po pięciu ' +
							'kolejkach połowa tez z sierpnia wygląda naiwnie — i tak ma być. Traktuj to jako punkt ' +
							'wyjścia do obserwacji, nie jako prognozę do zweryfikowania w maju.'
					),
				],
			},
		],
	},

	en: {
		title: 'Serie A 2026/27 — season preview and title contenders',
		metaTitle: 'Serie A 2026/27 — season preview',
		description:
			'Inter defend an 11-point title win, Como upset the projections, and Allegri, Amorim ' +
			'and Gattuso start on new benches. What to expect this season.',
		lead:
			'The season starts on 22 August. Inter arrive as champions with a margin nobody came ' +
			'close to matching — but the most interesting claim in this preview is not about Milan.',
		sections: [
			{
				heading: 'Inter defended the title without leaving room for argument',
				blocks: [
					p(
						'Last season ended with Inter eleven points clear of second-placed Napoli. Points alone ' +
							'can mislead; goal difference rarely does. 89 scored and 35 conceded was the best attack ' +
							'and the best goal difference in the division. This was not a run of one-goal wins — it ' +
							'was a team playing better than everyone else for most of the campaign.'
					),
					p(
						'It is worth remembering this was Cristian Chivu’s first season as head coach. A manager’s ' +
							'second year usually says more than the first: the novelty is gone and opponents have a ' +
							'full season of tape.'
					),
					p(
						'Inter added John Stones on a free transfer after his Manchester City departure — ' +
							'experience at no fee, with the injury risk that comes with it but no price tag forcing ' +
							'him into the eleven.'
					),
				],
			},
			{
				heading: 'Como are the most interesting story of the season',
				blocks: [
					p(
						'Opta’s supercomputer gives Inter a 35.1% chance of retaining the title. No surprise there. ' +
							'The surprise is second place on that list: Como at 13.6% — ahead of Roma (12.7%), ' +
							'Juventus (11.4%), Napoli (7.5%) and Atalanta (6.8%).'
					),
					p(
						'A model that rates a recent promoted side above Juventus and Napoli combined usually sees ' +
							'something the final table hides. For Como the simplest explanation is performance quality ' +
							'out of line with their finishing position, plus keeping Nico Paz — eighteen goal ' +
							'contributions last season.'
					),
					note(
						'A projection is not a prophecy. Thirteen percent means Como do NOT win the title in seven ' +
							'of eight simulations. Still a bold claim for a club with no title-race pedigree, but not ' +
							'a reason to declare a revolution.'
					),
				],
			},
			{
				heading: 'The managerial carousel reshaped the top more than transfers did',
				blocks: [
					p('Four of the six strongest clubs start with a new voice in the dressing room:'),
					ul([
						'Napoli — Massimiliano Allegri replacing Antonio Conte,',
						'Milan — Ruben Amorim following Allegri,',
						'Lazio — Gennaro Gattuso after leaving the Italy job,',
						'Atalanta — Maurizio Sarri.',
					]),
					p(
						'Each pairing means a different philosophy, not cosmetics. Amorim and Sarri arrive with ' +
							'demanding, distinctive ideas that take months to embed. Early fixtures for such sides are ' +
							'often unreadable — which is exactly why they are the hardest to forecast.'
					),
				],
			},
			{
				heading: 'Transfers that genuinely move the balance',
				blocks: [
					ul([
						'John Stones to Inter — a centre-back with a full trophy cabinet, on a free.',
						'Gonçalo Ramos from PSG to Milan — a striker for Amorim’s attacking plan.',
						'Donyell Malen made permanent at Roma — 14 goals in 18 appearances is not a record you leave behind.',
						'Nico Paz kept at Como — not selling can be the best signing of the summer.',
					]),
					p(
						'Note the common thread: none of these is a record fee. Serie A has been winning on market ' +
							'intelligence rather than spending, which changes how squads should be read — fit to the ' +
							'manager’s idea matters more than the sum of transfer values.'
					),
				],
			},
			{
				heading: 'The promoted clubs and the bottom half',
				blocks: [
					p(
						'Venezia and Frosinone come up automatically, Monza through the play-offs. All three know ' +
							'this level from recent years, which usually means realistic planning and fewer early hidings.'
					),
					p(
						'For anyone watching the league analytically, the bottom half is more interesting than the ' +
							'top: that is where a single signing or a goalkeeper injury moves results most, and where ' +
							'the sample is small enough that statistics have not yet smoothed anything over.'
					),
				],
			},
			{
				heading: 'What to watch in the opening weeks',
				blocks: [
					ul([
						'Teams with new managers — the first four rounds say more about direction than pre-season did.',
						'Como against the top sides — if Opta’s claim holds, that is where it starts.',
						'Inter’s goal difference rather than their points — quality shows there first.',
						'Fixture load on clubs in European competition, especially from late September.',
					]),
					note(
						'Season previews age faster than any other football writing. After five rounds half of the ' +
							'August takes look naive — as they should. Treat this as a starting point for watching, ' +
							'not a forecast to be graded in May.'
					),
				],
			},
		],
	},
};

export default serieA202627;
