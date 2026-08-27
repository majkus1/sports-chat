import { note, p, ul } from '@/lib/blog/blocks';

/**
 * Jak powstaje analiza meczu i gdzie model się myli.
 *
 * Tekst celowo mówi też o ograniczeniach. Polska przestrzeń wyszukiwania na tę frazę jest
 * zajęta przez treści afiliacyjne obiecujące „pewne typy z AI"; uczciwy opis metody to
 * jedyna przewaga, jaką da się tu zbudować — i to właśnie takie treści cytują asystenci AI.
 */
const jakAiAnalizujeMecz = {
	slug: 'jak-ai-analizuje-mecz',
	publishedAt: '2026-08-20',
	readingMinutes: 8,
	tags: ['sztuczna inteligencja', 'analiza meczu', 'metodyka'],

	pl: {
		title: 'Jak sztuczna inteligencja analizuje mecz piłkarski',
		metaTitle: 'Jak AI analizuje mecz piłkarski',
		description:
			'Skąd model bierze dane, co potrafi wyliczyć, a gdzie się myli. Krok po kroku, jak ' +
			'powstaje analiza meczu i jak czytać ją ze zrozumieniem.',
		lead:
			'„Analiza AI" brzmi jak wyrocznia i bywa tak sprzedawana. W rzeczywistości to ' +
			'uporządkowanie danych, które i tak są publiczne, plus język, którym da się je opisać. ' +
			'Poniżej opisujemy dokładnie, jak to działa u nas — łącznie z tym, czego ten sposób nie potrafi.',
		sections: [
			{
				heading: 'Krok pierwszy: co model dostaje na wejściu',
				blocks: [
					p(
						'Model językowy nie ogląda meczów. Dostaje zestaw faktów zebranych z serwisu danych ' +
							'sportowych i ułożonych w jeden dokument. W naszym przypadku są to:'
					),
					ul([
						'ostatnie mecze obu drużyn wraz z wynikami i miejscem rozegrania,',
						'pozycja i dorobek w tabeli bieżących rozgrywek,',
						'bilans bezpośrednich spotkań z ostatnich lat,',
						'przewidywane i potwierdzone składy oraz lista kontuzji i zawieszeń,',
						'statystyki zespołowe: strzały, posiadanie, skuteczność u siebie i na wyjeździe,',
						'najlepsi strzelcy rozgrywek i oceny zawodników z ostatnich spotkań,',
						'przy meczach na żywo dodatkowo wynik, wydarzenia i statystyki z toczącej się gry.',
					]),
					p(
						'To jest cała wiedza modelu o spotkaniu. Nie ma dostępu do internetu w trakcie pisania ' +
							'analizy, nie zna plotek transferowych z dnia meczu ani nastrojów w szatni. Jeżeli ' +
							'czegoś nie ma w tym zestawie, to dla analizy nie istnieje.'
					),
				],
			},
			{
				heading: 'Krok drugi: co model z tym robi',
				blocks: [
					p(
						'Zadaniem modelu nie jest wymyślenie wyniku, tylko znalezienie zależności między faktami ' +
							'i opisanie ich zrozumiałym językiem. Dobra analiza odpowiada na pytania w rodzaju: czy ' +
							'seria zwycięstw wynika z formy, czy z łatwego terminarza? Czy brakujący obrońca grał ' +
							'we wszystkich meczach z czystym kontem? Czy wysoka pozycja w tabeli ma pokrycie w liczbie ' +
							'strzałów, czy jest skutkiem serii jednobramkowych wygranych?'
					),
					p(
						'Prawdopodobieństwa, które widzisz przy typach, to szacunki modelu, a nie wynik obliczeń ' +
							'statystycznych z zamkniętym wzorem. Traktuj je jak stopień pewności autora tekstu: ' +
							'różnica między 55% a 60% jest w praktyce żadna, między 55% a 80% — istotna.'
					),
				],
			},
			{
				heading: 'Czego model nie widzi',
				blocks: [
					ul([
						'Motywacji. Mecz o utrzymanie i mecz o nic wyglądają w danych identycznie.',
						'Kalendarza w szerszym sensie. To, że za trzy dni jest półfinał pucharu, nie zmienia statystyk, ale zmienia skład.',
						'Konfliktów wewnętrznych, zmian w sztabie w trakcie tygodnia, atmosfery po przegranych derbach.',
						'Pogody w dniu meczu i stanu murawy.',
						'Rzeczy, które wydarzyły się po ostatniej aktualizacji danych — a te przy składach potrafią zmienić się na godzinę przed gwizdkiem.',
					]),
					note(
						'To nie jest lista wad do naprawienia w kolejnej wersji. Część tych rzeczy nie występuje ' +
							'w żadnym zbiorze danych i nie wystąpi. Analiza automatyczna jest z definicji analizą ' +
							'niepełną — pytanie brzmi tylko, czy braki są jawne.'
					),
				],
			},
			{
				heading: 'Gdzie modele mylą się najczęściej',
				blocks: [
					p(
						'Trzy sytuacje są przewidywalnie trudne. Po pierwsze początek sezonu: po dwóch kolejkach ' +
							'każda statystyka opiera się na próbie, z której nie da się nic wnioskować, a model i tak ' +
							'będzie ją opisywał. Po drugie zespoły po zmianie trenera — dane opisują poprzedni pomysł ' +
							'na grę, nie obecny. Po trzecie mecze drużyn skrajnie nierównych, gdzie faworyt wygrywa ' +
							'tak często, że każda przegrana wygląda na anomalię, a nie na przewidywalne ryzyko.'
					),
					p(
						'Dlatego przy każdej analizie pokazujemy ocenę jakości danych. Jeżeli liga dopiero ruszyła ' +
							'albo brakuje składów, tekst mówi to wprost, zamiast udawać pewność, której nie ma.'
					),
				],
			},
			{
				heading: 'Jak czytać analizę ze zrozumieniem',
				blocks: [
					ul([
						'Zacznij od sekcji z czynnikami, nie od typu. Typ jest wnioskiem; wartość jest w przesłankach.',
						'Sprawdź, czy podane fakty zgadzają się z tym, co wiesz. Model bywa nieaktualny, Ty możesz nie być.',
						'Potraktuj wysokie prawdopodobieństwo jako „mniej niespodzianek w danych", a nie jako gwarancję.',
						'Dopytaj. Asystent zna komplet danych o meczu i odpowie na pytanie, którego w analizie nie było.',
					]),
				],
			},
			{
				heading: 'Jak sprawdzamy, czy to w ogóle działa',
				blocks: [
					p(
						'Każdy typ z analizy i z raportu zapisujemy, a po meczu rozliczamy automatycznie na podstawie ' +
							'oficjalnego wyniku. Na stronie skuteczności widać wszystko: trafienia, chybienia i typy ' +
							'pominięte, czyli takie, których nie da się rozstrzygnąć samym wynikiem końcowym.'
					),
					p(
						'Publikowanie chybionych typów jest niewygodne i dokładnie dlatego ma sens. Serwis, który ' +
							'pokazuje wyłącznie trafienia, nie podaje żadnej informacji — bo taki zestaw da się ' +
							'zbudować z dowolnych, także losowych, prognoz.'
					),
					note(
						'Przy małej liczbie rozliczonych typów procent skuteczności nie znaczy nic. Zanim wyciągniesz ' +
							'wnioski z jakiegokolwiek serwisu — także naszego — sprawdź, na ilu meczach liczona jest ta liczba.'
					),
				],
			},
		],
	},

	en: {
		title: 'How artificial intelligence analyses a football match',
		metaTitle: 'How AI analyses a football match',
		description:
			'Where the model gets its data, what it can compute, and where it goes wrong. A ' +
			'step-by-step look at how a match analysis is produced and how to read it.',
		lead:
			'“AI analysis” sounds like an oracle and is often sold as one. In practice it is a way ' +
			'of organising data that is already public, plus language to describe it. Here is exactly ' +
			'how ours works — including what this approach cannot do.',
		sections: [
			{
				heading: 'Step one: what the model receives',
				blocks: [
					p(
						'A language model does not watch matches. It receives a set of facts pulled from a sports ' +
							'data provider and arranged into one document. In our case:'
					),
					ul([
						'recent matches for both sides, with results and venue,',
						'league position and record in the current competition,',
						'head-to-head record from recent years,',
						'predicted and confirmed line-ups, injuries and suspensions,',
						'team statistics: shots, possession, home and away form,',
						'competition top scorers and player ratings from recent games,',
						'for in-play analyses, the live score, events and match statistics.',
					]),
					p(
						'That is the model’s entire knowledge of the fixture. It has no internet access while writing, ' +
							'no matchday rumours, no sense of the dressing room. If something is not in that set, it ' +
							'does not exist for the analysis.'
					),
				],
			},
			{
				heading: 'Step two: what it does with that',
				blocks: [
					p(
						'The job is not to invent a scoreline but to find relationships between facts and explain them ' +
							'clearly. A good analysis answers questions like: is this winning run about form or an easy ' +
							'fixture list? Did the missing defender play in every clean sheet? Is a high league position ' +
							'backed by shot volume, or the product of narrow wins?'
					),
					p(
						'The probabilities attached to picks are model estimates, not the output of a closed statistical ' +
							'formula. Read them as the author’s confidence: the gap between 55% and 60% means nothing in ' +
							'practice, the gap between 55% and 80% means a lot.'
					),
				],
			},
			{
				heading: 'What the model cannot see',
				blocks: [
					ul([
						'Motivation. A relegation six-pointer and a dead rubber look identical in the data.',
						'The wider calendar. A cup semi-final in three days does not change statistics, but it changes the team sheet.',
						'Internal conflicts, mid-week staff changes, the mood after a lost derby.',
						'Matchday weather and pitch condition.',
						'Anything that happened after the last data refresh — and line-ups can change an hour before kick-off.',
					]),
					note(
						'This is not a defect list for the next version. Some of it exists in no dataset and never will. ' +
							'Automated analysis is by definition incomplete — the only question is whether the gaps are stated.'
					),
				],
			},
			{
				heading: 'Where models get it wrong most often',
				blocks: [
					p(
						'Three situations are predictably hard. First, the start of a season: after two rounds every ' +
							'statistic rests on a sample nothing can be concluded from, and the model will describe it ' +
							'anyway. Second, teams with a new manager — the data describes the previous plan, not the ' +
							'current one. Third, badly mismatched fixtures, where the favourite wins so often that every ' +
							'defeat looks like an anomaly rather than predictable risk.'
					),
					p(
						'That is why every analysis carries a data-quality assessment. If the league has just started or ' +
							'line-ups are missing, the text says so instead of feigning confidence it does not have.'
					),
				],
			},
			{
				heading: 'How to read an analysis properly',
				blocks: [
					ul([
						'Start with the factors, not the pick. The pick is a conclusion; the value is in the premises.',
						'Check the stated facts against what you know. The model can be out of date; you might not be.',
						'Read a high probability as “fewer surprises in the data”, not as a guarantee.',
						'Ask follow-ups. The assistant holds the full match data and will answer what the analysis omitted.',
					]),
				],
			},
			{
				heading: 'How we check whether any of this works',
				blocks: [
					p(
						'Every pick from an analysis or report is stored and settled automatically after the match against ' +
							'the official result. The accuracy page shows all of it: hits, misses, and skipped picks — those ' +
							'that cannot be resolved by the final score alone.'
					),
					p(
						'Publishing the misses is uncomfortable and that is precisely the point. A service showing only its ' +
							'hits conveys no information at all, because such a list can be assembled from any set of ' +
							'predictions, including random ones.'
					),
					note(
						'With few settled picks, a hit rate means nothing. Before drawing conclusions from any service — ' +
							'including ours — check how many matches that number is based on.'
					),
				],
			},
		],
	},
};

export default jakAiAnalizujeMecz;
