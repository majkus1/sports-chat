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
import { BASE_RATES, MIN_PROBABILITY, MIN_LIFT, entryThresholdFor } from '@/lib/picks/policy';
import { formatModelSection } from '@/lib/analysis/model';

export const PROMPT_VERSION = 'match-analysis/13';

/**
 * Progi typów w postaci, którą model językowy ma stosować — liczone z tych samych stałych,
 * które decydują o wliczeniu typu do statystyki. Dwie kopie tej tabeli rozjechałyby się
 * przy pierwszej zmianie i model wystawiałby typy, których pomiar i tak by nie uznał.
 * Wynik jest stały w obrębie procesu, więc nie psuje cache promptu systemowego.
 */
const GOL_DRUZYNY = (side) => ({ type: 'teamGoals', side, dir: 'over', line: 0.5 });
const PROGI_TYPOW = [
	['zwycięstwo gospodarzy', BASE_RATES.matchWinner.home, { type: 'matchWinner', value: 'home' }],
	['zwycięstwo gości', BASE_RATES.matchWinner.away, { type: 'matchWinner', value: 'away' }],
	['podwójna szansa 1X (gospodarz lub remis)', BASE_RATES.doubleChance['1X'], { type: 'doubleChance', value: '1X' }],
	['podwójna szansa X2 (gość lub remis)', BASE_RATES.doubleChance.X2, { type: 'doubleChance', value: 'X2' }],
	['gospodarz strzeli gola', BASE_RATES.teamGoals.home, GOL_DRUZYNY('home')],
	['gość strzeli gola', BASE_RATES.teamGoals.away, GOL_DRUZYNY('away')],
]
	.map(([nazwa, norma, normalized]) => `   - ${nazwa}: norma ${Math.round(norma)}%, typ od ${entryThresholdFor(normalized)}%`)
	.join('\n');

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
5. Każdy typ ma DWIE różne liczby i nie wolno ich mylić. "probability" (0–100) to szansa, że zdarzenie zajdzie — na niej opierają się progi z punktów 12 i 13. "confidence" (0–100) mówi, jak mocno DANE wspierają tę ocenę: przy kompletnych statystykach i dużej próbie będzie wysoka, przy szczątkowych niska, niezależnie od samego prawdopodobieństwa.

TYPY — CO WOLNO TYPOWAĆ:
6. Typ musi dotyczyć zdarzenia, które JESZCZE SIĘ NIE ROZSTRZYGNĘŁO. Rynek już rozstrzygnięty przez aktualny wynik nie jest prognozą, tylko opisem faktu — nie umieszczaj go w "picks" niezależnie od tego, jak wysokie byłoby prawdopodobieństwo. Jeśli w danych jest sekcja RYNKI JUŻ ROZSTRZYGNIĘTE, żaden z wymienionych tam rynków nie może pojawić się w "picks".
7. W meczu w trakcie typuj wyłącznie to, co może się jeszcze wydarzyć w pozostałym czasie: końcowy zwycięzca, podwójna szansa albo gol drużyny, która jeszcze nie strzeliła.
8. NIE WOLNO TYPOWAĆ SUMY GOLI ANI "OBIE STRZELĄ". Żadnego "powyżej/poniżej 1.5, 2.5, 3.5 gola", żadnego "obie drużyny strzelą". Powód jest zmierzony, nie umowny: sprawdziliśmy te rynki na 3541 rozegranych meczach i nasza prognoza wypada w nich GORZEJ niż stałe zgadywanie średniej ligowej. W statystyce serwisu typy na sumę goli mają 3 trafienia na 10. Możesz omówić potencjał bramkowy w "summary" i "keyFactors" — ale nie zamieniaj tego na typ. Pole "goals" (oczekiwana suma, over25, btts) wypełniaj dalej: to orientacyjny opis charakteru meczu, pokazywany czytelnikowi z takim właśnie zastrzeżeniem. Nie opieraj na nim żadnego typu i nie przedstawiaj tych liczb w tekście jako pewnych.
9. Dozwolone rynki to wyłącznie: zwycięzca meczu, podwójna szansa oraz "czy dana drużyna strzeli" (powyżej 0.5 gola). Tylko w nich mamy potwierdzoną przewagę nad zgadywaniem.
10. Historię bezpośrednich spotkań uwzględniaj tylko z ostatnich 3 lat i tylko przy co najmniej 2 meczach. Pomijaj pojedyncze wyniki skrajnie odstające.
11. Maksymalnie 3 pozycje w "picks". Jeśli dane nie dają przewagi albo wszystko sensowne jest już rozstrzygnięte, zwróć pustą tablicę — brak typu jest poprawną odpowiedzią.
12. TYP MA WNOSIĆ INFORMACJĘ, A NIE POTWIERDZAĆ OCZYWISTOŚĆ. Każda selekcja ma zmierzoną NORMĘ — jak często zachodzi sama z siebie, bez patrzenia na drużyny. Typ wystawiasz wyłącznie wtedy, gdy jego "probability" wynosi co najmniej ${MIN_PROBABILITY}% ORAZ przewyższa normę o co najmniej ${MIN_LIFT} punktów procentowych. Wynikające progi:
${PROGI_TYPOW}
   Typ poniżej progu nie wchodzi do statystyki serwisu — nie wystawiaj go; przewagę, która nie sięga progu, opisz w "keyFactors". "Gość strzeli gola" przy 80% to nie typ, tylko opis tego, co dzieje się w większości meczów, a "1X" przy wyraźnym faworycie gospodarzy nie mówi czytelnikowi nic, czego sam by nie wiedział.
13. PODWÓJNA SZANSA JEST OSTATECZNOŚCIĄ: najwyżej JEDNA na całą analizę i tylko wtedy, gdy żaden inny rynek nie ma pokrycia w danych — obejmuje dwa z trzech wyników, więc trafia niemal zawsze, i dlatego jej próg stoi tak wysoko. Typ "drużyna strzeli gola" (powyżej 0.5) oceniaj na średnich Z TEJ ROLI — gospodarza u siebie, gościa na wyjeździe — oraz na wierszu "mecze bez gola". Średnia łączna miesza dwa różne światy: zespół potrafi strzelać w każdym meczu u siebie i milczeć na wyjazdach.
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

MODEL LICZBOWY — GDY JEST W DANYCH:
21. Jeśli w danych jest sekcja PROGNOZA MODELU LICZBOWEGO, jej zasady mają PIERWSZEŃSTWO przed punktami 4, 11, 12 i 13. Szanse w "probabilities" i typy w "picks" przepisujesz z niej — liczby liczy model sił drużyn, a Twoją rolą jest je UZASADNIĆ albo ODRZUCIĆ. Odrzucasz wtedy, gdy widzisz w danych czynnik, którego rachunek nie uwzględnia: absencje kluczowych zawodników, skład, stawkę meczu, kontekst rozgrywek. Nie „poprawiaj" liczb w oparciu o wrażenie z formy — forma jest już w modelu.

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

	/*
	 * Prognoza własnego modelu — gdy liga jest dopasowana i obie drużyny są w danych.
	 * Sekcja idzie po faktach, żeby model językowy najpierw zobaczył, z czego liczby
	 * wynikają, a dopiero potem same liczby.
	 */
	if (bundle.model) {
		sections.push('', ...formatModelSection(bundle.model));
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
