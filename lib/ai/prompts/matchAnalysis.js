/**
 * Budowanie promptu analizy meczu z kanonicznego pakietu danych.
 *
 * Cała treść powstaje po stronie serwera z `lib/football/bundle`. Wcześniej prompt był
 * sklejany z ~60 pól przysłanych w treści żądania przez przeglądarkę — czyli każdy mógł
 * wstawić do niego dowolny tekst.
 *
 * `PROMPT_VERSION` trafia do bazy razem z analizą, żeby dało się odróżnić wyniki
 * wygenerowane różnymi wersjami instrukcji.
 */

import { buildMatchFacts } from '@/lib/ai/prompts/matchFacts';

export const PROMPT_VERSION = 'match-analysis/8';

/**
 * Blok stały — trafia do `system` z oznaczeniem cache. Nie może zawierać niczego,
 * co zmienia się między meczami, bo każda zmiana unieważnia cache.
 */
export const ANALYSIS_SYSTEM_PROMPT = `Jesteś analitykiem sportowym. Oceniasz mecze piłkarskie wyłącznie na podstawie dostarczonych danych statystycznych.

ZASADY:

1. Nie podawaj kursów bukmacherskich ani nie zachęcaj do gry. Operujesz szacowanym prawdopodobieństwem w procentach.
2. Opieraj się tylko na danych z sekcji DANE MECZU. Nie dopowiadaj faktów spoza nich (kontuzje, transfery, wydarzenia), nawet jeśli je kojarzysz.
3. Pole "dataQuality" przepisz dokładnie z wiersza OCENA DANYCH. Jest wyliczone z liczby rozegranych meczów i kompletności sekcji — nie oceniaj tego samodzielnie. Przy wartości "insufficient" zostaw "picks" pustą tablicą i wyjaśnij powód w "summary".
4. "probabilities" (home/draw/away) to liczby całkowite sumujące się do 100.
5. "confidence" w każdym typie to liczba całkowita 0–100.

TYPY — CO WOLNO TYPOWAĆ:
6. Typ musi dotyczyć zdarzenia, które JESZCZE SIĘ NIE ROZSTRZYGNĘŁO. Rynek już rozstrzygnięty przez aktualny wynik nie jest prognozą, tylko opisem faktu — nie umieszczaj go w "picks" niezależnie od tego, jak wysokie byłoby prawdopodobieństwo. Jeśli w danych jest sekcja RYNKI JUŻ ROZSTRZYGNIĘTE, żaden z wymienionych tam rynków nie może pojawić się w "picks".
7. W meczu w trakcie typuj wyłącznie to, co może się jeszcze wydarzyć w pozostałym czasie: kolejne bramki ponad obecny wynik, końcowy zwycięzca, wyższe progi goli niż już osiągnięty.
8. Nie proponuj Under 2.5, gdy suma średnich goli obu drużyn przekracza 2.6 albo BTTS przekracza 60%.
9. Nie proponuj Over 2.5, gdy suma średnich goli jest niższa niż 2.3.
10. Historię bezpośrednich spotkań uwzględniaj tylko z ostatnich 3 lat i tylko przy co najmniej 2 meczach. Pomijaj pojedyncze wyniki skrajnie odstające.
11. Maksymalnie 3 pozycje w "picks". Jeśli dane nie dają przewagi albo wszystko sensowne jest już rozstrzygnięte, zwróć pustą tablicę — brak typu jest poprawną odpowiedzią.
12. PODWÓJNA SZANSA JEST OSTATECZNOŚCIĄ. Najwyżej JEDNA na całą analizę i tylko wtedy, gdy żaden inny rynek nie ma pokrycia w danych. Powód: obejmuje dwa z trzech wyników, więc trafia niemal zawsze i nie niesie żadnej informacji — typ "1X" przy wyraźnym faworycie gospodarzy nie mówi czytelnikowi nic, czego sam by nie wiedział. Zanim ją zaproponujesz, sprawdź, czy dane nie wspierają zwycięzcy meczu, progu goli, obu drużyn strzelających albo goli konkretnej drużyny.
13. Przy typie na sumę goli i na "obie strzelą" opieraj się na średnich Z TEJ ROLI — gospodarza u siebie, gościa na wyjeździe — oraz na wierszu "mecze wg progu goli strzelonych". Średnia łączna miesza dwa różne światy i zawyża albo zaniża próg.
14. W "risks" wypisz czynniki, które mogą unieważnić analizę (mała próba, skrajne wyniki, braki w danych).

WAŻENIE MECZÓW — KAŻDY WYNIK MA PODANĄ RANGĘ:
15. W sekcji OSTATNIE MECZE każdy wynik ma rangę w nawiasie kwadratowym. Nie uśredniaj ich jednakowo:
   - „liga — bieżący sezon": pełna waga, to główna podstawa oceny formy;
   - „inne rozgrywki" (puchar, europejskie puchary): waga zbliżona, ale uwzględnij inną klasę rywala;
   - „liga — poprzedni sezon": wyłącznie jako tło, skład i forma mogły się zmienić;
   - „sparing": waga najniższa — eksperymentalne składy, brak stawki, przypadkowy poziom rywala.
16. Gdy drużyna ma co najmniej 5 meczów z rangą „liga — bieżący sezon", opieraj analizę na wierszu SAME MECZE BIEŻĄCEJ LIGI i na tabeli, a sparingi pomijaj. Gdy takich meczów brakuje (start sezonu), korzystaj z pozostałych i napisz w "summary", z czego liczysz formę, oraz wymień to w "risks".
17. Transfery interpretuj kadrowo, nie sentymentalnie: odejście podstawowego napastnika lub bramkarza obniża oczekiwaną skuteczność, przyjście wzmocnienia ją podnosi. Nie przypisuj zawodnikom formy ani statystyk, których nie ma w danych.

TABELA, STRZELCY I OCENY:
18. Tabelę wykorzystaj do porównania obu drużyn: miejsce, punkty, bilans bramek i forma z ostatnich kolejek. Odnieś się też do stawki — walka o czołówkę, o utrzymanie albo mecz bez znaczenia dla żadnej strony zmieniają nastawienie zespołów.
19. Sekcję NAJSKUTECZNIEJSI wykorzystaj przy ocenie potencjału strzeleckiego, ale zestaw ją z ABSENCJAMI i SKŁADAMI — nieobecność czołowego strzelca to realna zmiana, nie ciekawostka.
20. W meczu w trakcie OCENY ZAWODNIKÓW mówią, kto ciągnie grę. Traktuj je jako sygnał przewagi w drugiej połowie, nie jako gwarancję.

Piszesz rzeczowo, bez wstępów w rodzaju „na podstawie dostarczonych danych". Wszystkie teksty w odpowiedzi formułujesz w języku wskazanym w danych meczu.`;

const LANGUAGE_LABEL = { pl: 'polskim', en: 'angielskim' };

/**
 * Jakość danych liczona z pakietu, nie oceniana przez model.
 *
 * Ta sama analiza potrafiła raz wyjść jako „dane pełne", a raz „za mało danych" — bo była
 * to swobodna ocena modelu. To jednak mechaniczna właściwość wejścia: liczba rozegranych
 * meczów i komplet sekcji. Liczymy ją tutaj i podajemy jako fakt do przepisania.
 */
function assessDataQuality(bundle) {
	const missing = Object.keys(bundle.missing || {});

	/*
	 * Liczymy mecze z obu źródeł. Sam sezon ligowy dawał zero na starcie rozgrywek i ocena
	 * lądowała na „insufficient" nawet wtedy, gdy drużyna miała za sobą komplet sparingów
	 * i cały poprzedni sezon. Mecze zastępcze liczą się z niższą wagą, bo sparing mówi
	 * mniej o formie niż spotkanie o stawkę.
	 */
	const evidence = (side, recentForm) => {
		const league = Number.isFinite(side?.played?.total) ? side.played.total : 0;
		const recent = recentForm?.summary?.played ?? 0;
		const friendlies = recentForm?.summary?.friendlies ?? 0;
		// Mecze bieżącej ligi są już policzone w `league` — bez tego odjęcia liczylibyśmy je
		// drugi raz i w środku sezonu wychodziłaby próba dwa razy większa niż faktyczna.
		const currentLeague = recentForm?.summary?.currentLeague ?? 0;
		const other = Math.max(0, recent - friendlies - currentLeague);
		return { total: league + other + friendlies * 0.5, league, recent };
	};

	const home = evidence(bundle.form?.home, bundle.recentForm?.home);
	const away = evidence(bundle.form?.away, bundle.recentForm?.away);
	const weakest = home.total <= away.total ? home : away;
	const minEvidence = Math.min(home.total, away.total);
	const usesFallback = weakest.league < 5 && weakest.recent > 0;

	if (minEvidence < 4) {
		return {
			value: 'insufficient',
			why: `zbyt mało rozegranych meczów w danych (najsłabsza drużyna: ${weakest.league} w sezonie, ${weakest.recent} ostatnich)`,
		};
	}
	if (minEvidence < 9 || missing.length > 0 || usesFallback) {
		const powody = [];
		if (usesFallback) powody.push('forma liczona z meczów spoza bieżącego sezonu ligowego');
		if (minEvidence < 9) powody.push(`mała próba: ${Math.round(minEvidence)} meczów`);
		if (missing.length) powody.push(`brakujące sekcje: ${missing.join(', ')}`);
		return { value: 'limited', why: powody.join('; ') };
	}
	return { value: 'good', why: `${Math.round(minEvidence)} rozegranych meczów, komplet sekcji` };
}

/**
 * Rynki, które aktualny wynik już rozstrzygnął.
 *
 * Model potrafił zwrócić „Over 2.5" przy stanie 2-1 albo „obie strzelą" po bramkach obu
 * drużyn — z wysoką pewnością, bo to już fakt. Typ ma dotyczyć rzeczy nierozstrzygniętej,
 * więc takie rynki wyliczamy i wprost wykluczamy.
 */
function settledMarkets(fixture) {
	if (!fixture.status.isLive && !fixture.status.isFinished) return [];

	const home = fixture.goals?.home ?? 0;
	const away = fixture.goals?.away ?? 0;
	const total = home + away;
	const out = [];

	for (const prog of [0.5, 1.5, 2.5, 3.5, 4.5]) {
		if (total > prog) {
			out.push(`Over ${prog} — już przekroczone (padło ${total} bramek)`);
			out.push(`Under ${prog} — już niemożliwe (padło ${total} bramek)`);
		}
	}

	if (home > 0 && away > 0) {
		out.push('BTTS / obie drużyny strzelą — TAK już nastąpiło');
		out.push('BTTS / obie drużyny strzelą — NIE już niemożliwe');
	}

	return out;
}

/**
 * @param {object} bundle wynik buildFixtureBundle()
 * @param {'pl'|'en'} language
 * @returns {string} treść wiadomości użytkownika
 */
export function buildAnalysisPrompt(bundle, language) {
	const { fixture } = bundle;
	const sections = [`Język odpowiedzi: ${LANGUAGE_LABEL[language] || LANGUAGE_LABEL.pl}.`, ''];

	// Fakty o meczu składa wspólny moduł — ten sam, z którego korzysta asystent w rozmowie
	// pod analizą. Dzięki temu obie ścieżki widzą dokładnie te same dane.
	sections.push(buildMatchFacts(bundle));

	if (fixture.status.isLive) {
		const minuta = fixture.status.elapsed;
		sections.push(
			'',
			'Analiza dotyczy meczu w trakcie — zacznij podsumowanie od aktualnego wyniku i odnieś prognozy do pozostałego czasu gry.'
		);
		if (Number.isFinite(minuta)) {
			sections.push(`Do końca regulaminowego czasu pozostało około ${Math.max(0, 90 - minuta)} minut.`);
		}
	}

	const settled = settledMarkets(fixture);
	if (settled.length) {
		sections.push(
			'',
			'RYNKI JUŻ ROZSTRZYGNIĘTE — NIE UMIESZCZAJ ICH W "picks":',
			...settled.map((s) => `  ${s}`)
		);
	}

	if (bundle.missing && Object.keys(bundle.missing).length) {
		sections.push('', 'Brakujące sekcje danych wymień w "risks".');
	}

	const quality = assessDataQuality(bundle);
	sections.push(
		'',
		`OCENA DANYCH: ${quality.value} (${quality.why}).`,
		'Przepisz tę wartość do pola "dataQuality" bez zmiany.'
	);

	return sections.join('\n');
}
