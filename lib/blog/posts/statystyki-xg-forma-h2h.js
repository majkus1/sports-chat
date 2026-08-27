import { note, p, ul } from '@/lib/blog/blocks';

/**
 * Które statystyki mają wartość prognostyczną, a które są ozdobą.
 *
 * Wpis wiecznie zielony — nie odwołuje się do bieżącego sezonu ani do konkretnych drużyn,
 * więc nie wymaga aktualizacji i pracuje na długi ogon zapytań przez lata.
 */
const statystykiXgFormaH2h = {
	slug: 'statystyki-ktore-cos-mowia-xg-forma-h2h',
	publishedAt: '2026-08-19',
	readingMinutes: 9,
	tags: ['statystyki', 'xG', 'poradnik'],

	pl: {
		title: 'xG, forma i H2H — statystyki, które naprawdę coś mówią',
		metaTitle: 'xG, forma i H2H — co naprawdę coś mówi',
		description:
			'Nie każda liczba coś znaczy. Które wskaźniki mają wartość prognostyczną, a które są ' +
			'tylko ciekawostką bez wpływu na wynik meczu.',
		lead:
			'Przy każdym meczu dostajesz kilkanaście liczb. Część z nich zmienia ocenę spotkania, ' +
			'część jest wypełniaczem, a kilka potrafi wprowadzić w błąd bardziej, niż gdyby ich ' +
			'w ogóle nie było. Oto jak je rozdzielić.',
		sections: [
			{
				heading: 'xG — najlepszy pojedynczy wskaźnik, jeśli wiesz, co mierzy',
				blocks: [
					p(
						'Oczekiwane bramki (xG) przypisują każdej sytuacji prawdopodobieństwo zdobycia gola na ' +
							'podstawie tego, skąd i w jakich okolicznościach oddano strzał. Suma z meczu mówi, ile ' +
							'bramek „powinien" paść przy takich sytuacjach.'
					),
					p(
						'Wartość xG bierze się z tego, że jest znacznie mniej losowe niż sam wynik. Zespół, który ' +
							'przegrał 0:1, mając 2,4 xG do 0,3, grał lepiej — i przy powtórzeniu tego meczu sto razy ' +
							'wygrałby w większości przypadków. Wynik zapamięta tabela, ale to xG lepiej przewiduje ' +
							'kolejne spotkania.'
					),
					p(
						'Trzy zastrzeżenia. Po pierwsze, xG nie uwzględnia, kto strzelał — model traktuje wszystkich ' +
							'zawodników identycznie. Po drugie, wysokie xG z jednej sytuacji (rzut karny to około 0,76) ' +
							'to co innego niż to samo xG z dziesięciu strzałów. Po trzecie, przy próbie mniejszej niż ' +
							'kilkanaście meczów różnice w xG mieszczą się w szumie.'
					),
				],
			},
			{
				heading: 'Forma — pięć ostatnich meczów to za mało',
				blocks: [
					p(
						'Pasek „WWPWR" jest wszędzie i prawie nic nie znaczy w oderwaniu od kontekstu. Pięć spotkań ' +
							'to próba, w której seria remisów i seria zwycięstw różnią się często jednym odbitym od ' +
							'poprzeczki strzałem.'
					),
					p('Formę warto czytać z trzema pytaniami:'),
					ul([
						'Z kim? Trzy zwycięstwa nad dolną częścią tabeli i trzy porażki z czołówką to ta sama „forma" na pasku, a zupełnie inna informacja.',
						'Gdzie? Bilans u siebie i na wyjeździe potrafi się różnić bardziej niż bilanse dwóch różnych drużyn.',
						'Jak? Wygrane po dominacji i wygrane po jednym kontrataku wyglądają identycznie w tabeli, ale zupełnie inaczej w statystykach strzałów.',
					]),
				],
			},
			{
				heading: 'H2H — najbardziej przereklamowana liczba w piłce',
				blocks: [
					p(
						'Bilans bezpośrednich spotkań uwodzi, bo ma formę opowieści: „ta drużyna zawsze im nie leży". ' +
							'Problem w tym, że mecze sprzed czterech lat rozgrywały inne składy, inni trenerzy i inne ' +
							'zespoły w innej formie. Piłkarska rzeczywistość odnawia się co kilka sezonów niemal całkowicie.'
					),
					p(
						'H2H bywa użyteczne w dwóch przypadkach: przy derbach, gdzie kontekst emocjonalny naprawdę ' +
							'utrzymuje się latami, oraz gdy obie drużyny mają od dawna ten sam styl gry, a starcia ' +
							'stale kończą się podobnym scenariuszem — na przykład niską liczbą bramek. Poza tym warto ' +
							'ograniczyć się do ostatnich trzech lat i traktować to jako ciekawostkę.'
					),
					note(
						'Zasada praktyczna: jeśli argument z H2H jest najmocniejszym argumentem w analizie, to znaczy, ' +
							'że mocniejszych nie znaleziono.'
					),
				],
			},
			{
				heading: 'Co niedoceniane, a warte uwagi',
				blocks: [
					ul([
						'Nieobecności konkretnych zawodników, nie sama ich liczba. Brak pierwszego bramkarza albo rozgrywającego waży wielokrotnie więcej niż brak trzech rezerwowych.',
						'Zagęszczenie terminarza. Trzeci mecz w tygodniu to inny zespół niż ten sam skład po tygodniu przerwy.',
						'Zmiana trenera. Wszystkie statystyki sprzed zmiany opisują nieistniejący już pomysł na grę.',
						'Rozbieżność między pozycją w tabeli a bilansem strzałów. Utrzymująca się przez kilkanaście meczów zwykle domyka się w jedną albo w drugą stronę.',
					]),
				],
			},
			{
				heading: 'Co pomijać',
				blocks: [
					ul([
						'Posiadanie piłki. Samo w sobie nie koreluje z wynikiem — zespoły grające z kontry oddają je świadomie.',
						'Liczbę rzutów rożnych. Bywa objawem przewagi, ale sama w sobie nie przekłada się na bramki.',
						'Faule i kartki, o ile nie analizujesz konkretnie rynku kartek albo sędziego.',
						'„Serie" w rodzaju liczby meczów z rzędu z bramką. To zwykle zbieg okoliczności opisany z mocą prawa.',
					]),
				],
			},
			{
				heading: 'Jak złożyć to w jedną ocenę',
				blocks: [
					p(
						'Zacznij od xG z kilkunastu meczów, żeby ustalić realny poziom obu zespołów. Skoryguj o ' +
							'nieobecności i o zmianę trenera, jeśli była. Sprawdź terminarz obu drużyn w ostatnim ' +
							'tygodniu. Dopiero na końcu spójrz na formę i H2H — jako na test, czy coś przeczy wnioskowi, ' +
							'a nie jako na jego podstawę.'
					),
					p(
						'W analizach w naszym serwisie kolejność jest ta sama, a przy każdej podajemy ocenę jakości ' +
							'danych. Jeżeli sezon dopiero się zaczął i próba jest za mała, tekst mówi to wprost — bo ' +
							'liczba policzona z trzech meczów wygląda tak samo poważnie jak ta z trzydziestu, a znaczy ' +
							'zupełnie co innego.'
					),
				],
			},
		],
	},

	en: {
		title: 'xG, form and H2H — the statistics that actually matter',
		metaTitle: 'xG, form and H2H — what matters',
		description:
			'Not every number means something. Which metrics carry predictive value, and which are ' +
			'trivia with no bearing on the result.',
		lead:
			'Every match comes with a dozen numbers. Some change how you read the fixture, some are ' +
			'filler, and a few mislead more than their absence would. Here is how to tell them apart.',
		sections: [
			{
				heading: 'xG — the best single metric, if you know what it measures',
				blocks: [
					p(
						'Expected goals assign each chance a scoring probability based on where and how the shot was ' +
							'taken. The match total says how many goals “should” have come from those chances.'
					),
					p(
						'Its value lies in being far less random than the scoreline. A team losing 0-1 with 2.4 xG to ' +
							'0.3 played better, and would win most reruns of that match. The table remembers the result, ' +
							'but xG predicts the next fixtures better.'
					),
					p(
						'Three caveats. It ignores who was shooting — every player is treated identically. High xG from ' +
							'one chance (a penalty is roughly 0.76) is not the same as identical xG from ten shots. And ' +
							'below a dozen or so matches, xG differences sit inside the noise.'
					),
				],
			},
			{
				heading: 'Form — five matches is not enough',
				blocks: [
					p(
						'The W-W-D-W-L strip is everywhere and means almost nothing without context. Across five games, ' +
							'a run of draws and a run of wins are often separated by one shot off the bar.'
					),
					p('Read form with three questions:'),
					ul([
						'Against whom? Three wins over the bottom half and three defeats to the top look the same on the strip and mean the opposite.',
						'Where? Home and away records can differ more than the records of two different clubs.',
						'How? Wins after dominance and wins from one counter-attack look identical in the table and nothing alike in the shot data.',
					]),
				],
			},
			{
				heading: 'H2H — the most overrated number in football',
				blocks: [
					p(
						'Head-to-head records seduce because they read as a story: “this side never suits them”. But ' +
							'matches from four years ago involved different squads, different managers and different form. ' +
							'Football turns over almost completely every few seasons.'
					),
					p(
						'H2H is useful in two cases: derbies, where the emotional context genuinely persists, and pairs of ' +
							'clubs with long-standing contrasting styles whose meetings keep producing the same script — ' +
							'low-scoring games, for instance. Otherwise limit it to the last three years and treat it as trivia.'
					),
					note(
						'A practical rule: if the H2H argument is the strongest one in an analysis, it means no stronger ' +
							'argument was found.'
					),
				],
			},
			{
				heading: 'Underrated and worth attention',
				blocks: [
					ul([
						'Which players are missing, not how many. Losing the first-choice keeper or playmaker outweighs three absent substitutes many times over.',
						'Fixture congestion. A third match in a week is a different team from the same eleven after a week off.',
						'A managerial change. Every statistic from before it describes a plan that no longer exists.',
						'A gap between league position and shot data. Sustained over a dozen matches, it usually closes one way or the other.',
					]),
				],
			},
			{
				heading: 'What to skip',
				blocks: [
					ul([
						'Possession. On its own it does not correlate with results — counter-attacking sides concede it deliberately.',
						'Corner counts. Sometimes a symptom of pressure, but not a route to goals by themselves.',
						'Fouls and cards, unless you are specifically looking at cards or the referee.',
						'“Streaks” such as consecutive matches with a goal. Usually coincidence described with the force of law.',
					]),
				],
			},
			{
				heading: 'Putting it together',
				blocks: [
					p(
						'Start with xG over a dozen or more matches to establish the real level of both sides. Adjust for ' +
							'absences and for a managerial change if there was one. Check both fixture lists for the past ' +
							'week. Only then look at form and H2H — as a test of whether anything contradicts the conclusion, ' +
							'not as its basis.'
					),
					p(
						'Our analyses follow the same order and state a data-quality assessment each time. If the season has ' +
							'just started and the sample is too small, the text says so — because a number computed from three ' +
							'matches looks exactly as authoritative as one from thirty, and means something entirely different.'
					),
				],
			},
		],
	},
};

export default statystykiXgFormaH2h;
