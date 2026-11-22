# Model prognoz

Własny model liczbowy: siły ataku i obrony drużyn szacowane z wyników, rozkład wyniku
z korektą Dixona-Colesa, wszystkie rynki wyprowadzone z jednej macierzy.

## Pliki

| Plik | Rola |
|---|---|
| `dixonColes.js` | macierz prawdopodobieństw wyniku i wyprowadzone z niej rynki |
| `ratings.js` | szacowanie sił drużyn, przewagi boiska i korekty `rho` z historycznych wyników |
| `backtest.mjs` | sprawdzenie modelu na meczach, których nie widział podczas uczenia |
| `goalsExperiment.mjs` | eksperyment „pod gole": czy kalibracja i strzały ratują rynki 2,5 gola i BTTS (bez klucza API) |
| `goalsCalibration.js` | cechy, regresja i jej zastosowanie dla „powyżej 2,5" — jedno źródło dla eksperymentu i produkcji |
| `goalsCalibrationData.js` | GENEROWANY: współczynniki regresji (`--emit` eksperymentu) |
| `goals.js` | produkcja: skalibrowane „powyżej 2,5" dla pary drużyn z terminarza i `FixtureStats` |
| `fixtureStats.js` | nocny zbieracz strzałów z `fixtures/statistics` do kolekcji `FixtureStats` |
| `pools.js` | pule łączone: puchary europejskie (kluby na ligach + pucharach) i reprezentacje (wszystkie rozgrywki z 4 lat) |
| `poolBacktest.mjs` | backtest pul na meczach pucharowych i reprezentacyjnych (cache odpowiedzi na dysku) |
| `forecastLog.js` | dziennik prognoz: każdy mecz policzony przez model (`ModelForecast`), z wynikiem dopisanym w nocy |
| `forecastCheck.mjs` | pomiar na dzienniku: kalibracja, Brier wobec stałej, warianty 2,5, ligi, plakietki |
| `chanceCalibration.js` | korekta zawyżonej szansy modelu per selekcja, z bezpiecznikami (sekcja z 21.11.2026) |
| `chanceCalibration.mjs` | generator korekty z dziennika prognoz (`--emit`), tylko odczyt bazy |
| `chanceCalibrationData.js` | GENEROWANY: przesunięcia per selekcja, wersja, data, wynik sprawdzianu (zapas, gdy w bazie nie ma aktywnej wersji) |
| `shotStrength.js` | siła drużyn z 0,7·gole + 0,3·strzały celne, reguła per mecz, wyłącznik (`dixon-coles/6`, sekcja z 22.11.2026) |
| `xgFeatures.js`, `xgExperiment.mjs` | eksperyment xG/strzały celne; `--source=api` na serwerze sprawdza produkcję (wiersz `S70R`) |
| `weeklyCalibration.js` | cotygodniowa korekta szansy z bezpiecznikami (część czysta) |
| `chanceCalibrationStore.js` | wersje korekty w bazie (`ChanceCalibration`): odczyt co kwadrans, włączenie, wycofanie |
| `weeklyReport.js`, `weeklyJob.js` | raport tygodnia (log loss, kubełki, źródło szansy, kupony, CLV), mail do administratora, `/admin/model` |

## Stan: PODPIĘTY DO PRODUKCJI — raporty i analizy pojedynczych meczów

Model liczy WYŁĄCZNIE tam, gdzie backtest wykazał jego przewagę — na tym samym
dopasowaniu per rozgrywki, które idzie na produkcję. Na 8069 meczach objętych modelem
(80,5% puli testowej):

| miara | model | częstości |
|---|---|---|
| log loss 1X2 | 1,0301 | 1,0730 |
| trafienia 1X2 | 49,4% | 43,9% |

Przewaga istotna statystycznie, t = 8,27. Pozostałe 19,5% puli to rozgrywki odcięte
progami; tam prognoz nie wystawiamy wcale, zamiast wystawiać gorsze.

Dwa progi i lista, wszystkie z pomiaru, nie z ostrożności:

- `MIN_MATCHES` — czy w rozgrywkach jest w ogóle z czego liczyć.
- `MIN_MATCHES_PER_TEAM` — MEDIANA meczów na drużynę. Puchar Anglii ma 869 spotkań, więc
  pierwszy próg przechodzi z zapasem, a przy dopasowaniu wewnątrz rozgrywek dawał log loss
  1,6648 wobec 1,0437 dla zwykłych częstości. Setki drużyn po dwa mecze to oceny z szumu.
- `EXCLUDED_COMPETITIONS` — puchary europejskie. Faza ligowa daje osiem meczów, więc próg
  mediany przechodzą, ale porównanie sił zespołów z różnych lig krajowych wewnątrz tych
  rozgrywek się nie udaje: Liga Mistrzów 1,0859 wobec 1,0205.

Rynek bukmacherski jest od modelu lepszy (0,9842 wobec 1,0191 na 3692 meczach z kursami
zamknięcia) i to jest stan oczekiwany, nie usterka.

Gdzie liczy:

- **Raport AI** — `lib/reports/service.js`: kandydaci i ich prawdopodobieństwa pochodzą
  z modelu, prognoza dostawcy jest tylko potwierdzeniem.
- **Analiza meczu (przed meczem i w trakcie)** — `lib/analysis/model.js`: szanse 1X2 i selekcje
  liczy model, a model językowy je uzasadnia albo odrzuca. W meczu w trakcie `inPlayMarkets`
  liczy rozkład pozostałych goli przy aktualnym wyniku, a norma to przeciętna para drużyn
  w tej samej sytuacji.

Typ liczy się do skuteczności tylko wtedy, gdy przewyższa normę swojej selekcji o margines
z `lib/picks/policy.js` — sam wysoki procent nie wystarcza. Od 21.11.2026 model WYBIERA mecze,
a gdy jest kurs, próg musi przejść też szansa z kursu; pokazana liczba jest z kursu albo z modelu
według sprawdzianu per selekcja (sekcja z tą datą).

## Rynki goli: wynik eksperymentu (wrzesień 2026)

`goalsExperiment.mjs` — 11 lig z football-data.co.uk, sezony 2021–2026, ocena chronologiczna
na 7862 meczach od lipca 2024 (druga liczba w ostatniej kolumnie: sam ostatni sezon, 4140 meczów).
Brier, mniej = lepiej.

| wariant | powyżej 2,5 | BTTS | t wobec stałej (2,5) |
|---|---|---|---|
| stała ligowa | 0,2479 | 0,2477 | — |
| Dixon-Coles surowy (dziś) | 0,2487 | 0,2498 | −0,6 / −2,4 |
| DC skalibrowany regresją | 0,2445 | 0,2464 | **6,3 / 2,8** |
| + gole i strzały drużyn z 10 meczów | **0,2436** | 0,2461 | **6,5 / 3,7** |
| rynek (Pinnacle, zamknięcie) | 0,2390 | — | sufit |

Trzy wnioski, z pomiaru:

1. **Model nie przegrywał z braku informacji, tylko z nadmiaru pewności.** Ta sama macierz
   Dixona-Colesa po przepuszczeniu przez regresję logistyczną (stała ligowa + logit DC) bije
   stałą istotnie w „powyżej 2,5". Bez żadnych nowych danych.
2. **Strzały dokładają mało do średniej, ale dużo do typów.** Po polityce (≥60 %, ≥12 pkt nad
   stałą) sam skalibrowany DC daje ~30–50 typów „powyżej 2,5" na sezon z trafnością 69–72 %;
   z golami i strzałami ~100 na sezon z trafnością **72–75 %** przy prognozie 66 % — model
   jest tu raczej ostrożny niż zuchwały. Surowy DC wystawiłby 470 typów przy 63–65 %.
3. **BTTS nie.** Skalibrowany bije stałą tylko na dłuższym oknie (t = 3,5; na ostatnim
   sezonie 0,9–1,6) i po polityce zostaje kilka typów na sezon. Rynek zbyt bliski monety.

### Jak to działa na produkcji (od września 2026)

„Powyżej 2,5 gola" jest siódmą selekcją w `SELECTION_SHAPES` — jedyną z sumy goli i tylko
„powyżej". Liczy ją `goals.js`, nie macierz:

1. **Stała ligowa i średnie ligowe** — z terminarza ligi (bieżący i poprzedni sezon), tego
   samego, na którym uczy się model sił drużyn. Zero dodatkowych zapytań.
2. **Gole za i przeciw z ostatnich 10 meczów** każdej drużyny — z tego samego terminarza.
3. **Strzały i strzały celne** — z kolekcji `FixtureStats`, którą co noc o 3:00 napełnia
   `fixtureStats.js` (`/api/cron/fixture-stats`, budżet 1200 zapytań; pierwsze napełnienie
   ~3 000 meczów w kilka nocy, potem ~150 dziennie). Mecz bez statystyk u dostawcy też jest
   zapisywany (z `null`), żeby nie pytać o niego drugi raz.
4. **Wariant per mecz**: `shots`, gdy obie drużyny mają strzały w ≥ 6 z ostatnich 10 meczów,
   inaczej `goals`. Oba były zmierzone: `goals` daje ~50 typów na sezon na 11 lig przy
   trafności 72 %, `shots` ~95 przy 74 %. Pierwszej nocy po wdrożeniu wszystko idzie na
   `goals`; w miarę zbierania strzałów ligi przechodzą na `shots` same.
5. **Kafelki goli w analizie** (oczekiwana suma, „powyżej 2,5", „obie strzelą") pochodzą z tego
   samego rachunku: przed meczem liczby skalibrowane (BTTS też — skalibrowany bije stałą,
   t = 3,5 — ale WYŁĄCZNIE do opisu, typów z niego nie ma), w trakcie z macierzy dla reszty
   meczu. `bindAnalysisToModel` nadpisuje to, co model językowy przepisał, więc kafelek
   „Over 2.5: 68 %" i typ „Powyżej 2.5 gola: 68 %" to jedna liczba.
6. **Norma jest ligowa** i wędruje z typem (`baseRate`), nie z tabeli w polityce. Typ na sumę
   goli BEZ normy — np. napisany przez model językowy z własnej głowy — dostaje
   `market_not_measured` i nie wchodzi do statystyki. To bezpiecznik: liczą się wyłącznie
   typy z kalibracji.

Regresję odtwarza się jedną komendą (patrz nagłówek `goalsExperiment.mjs`, `--emit`); plik
`goalsCalibrationData.js` jest generowany i trafia do repozytorium, żeby produkcja nie
uczyła niczego w locie. Warto ją przeliczać raz na sezon.

Zastrzeżenie, które zostaje: pomiar obejmuje wyłącznie czołowe ligi z archiwum. Ligi niższe
i pozaeuropejskie dostają tę samą regresję (cechy są względem ligi, więc przenoszą się), ale
ich trafność trzeba sprawdzić po pierwszych rozliczonych typach w panelu skuteczności —
rynek „Suma goli" ma tam osobny wiersz.

## Pule łączone — puchary i reprezentacje (od września 2026)

Model jednej ligi nie umie ocenić Ligi Mistrzów (drużyna ma osiem meczów z rywalami z innych
lig) ani Ligi Narodów (sześć meczów na dwa lata). Te rozgrywki były wyłączone — akurat te,
którymi interesuje się najwięcej ludzi. `pools.js` ocenia drużyny na WSZYSTKICH ich meczach:

- **`europe`** — 21 lig krajowych Europy + Liga Mistrzów, Liga Europy, Liga Konferencji,
  Superpuchar. Ligi łączą się przez mecze pucharowe. Liczy puchary europejskie i puchary
  krajowe (tylko gdy obie drużyny są w puli). Ligi krajowe nadal liczy model swojej ligi.
- **`international`** — mundial, Euro, Liga Narodów, eliminacje (5 kontynentów + Euro),
  turnieje kontynentalne, towarzyskie (waga 0,5). Okno 4 lata, wolniejsze wygaszanie
  (połowa po ~460 dniach), turnieje finałowe bez przewagi gospodarza.

Drużyna z mniej niż 8 (kluby) / 6 (reprezentacje) meczami w oknie jest nieznana — bez prognozy.
„Rozegrane" dla progu `MIN_PLAYED` to mecze w puli z ostatniego roku, nie w tych rozgrywkach.

Backtest `international` (943 mecze po lipcu 2025, 60 % pokrycia):

| rozgrywki | n | log loss model | częstości |
|---|---|---|---|
| razem | 943 | **0,852** | 1,053 (t = 11,8) |
| mundial 2026 | 104 | 0,806 | 1,058 |
| Liga Narodów | 30 | 0,799 | 1,065 |
| eliminacje MŚ Europa | 156 | 0,730 | 1,041 |
| towarzyskie | 439 | 0,935 | 1,041 |

Typy po polityce: 696, obiecane 77,8 %, trafiło 79,3 %. Uwaga przy czytaniu: w meczach
reprezentacji różnice sił są ogromne (Hiszpania – San Marino), więc przewaga nad częstościami
jest większa niż w ligach — to nie znaczy, że model jest tu „lepszy", tylko że łatwiej go
pobić bazowej linii. Kalibracja typów (obiecane ≈ trafione) jest tu ważniejszą miarą.

Backtest `europe` (serwer, wrzesień 2026; 836 meczów po lipcu 2025, 39 % pokrycia — reszta to
drużyny z lig spoza puli):

| rozgrywki | n | log loss model | częstości | t |
|---|---|---|---|---|
| razem | 836 | **0,965** | 1,046 | 4,63 |
| Liga Mistrzów | 239 | 0,944 | 1,038 | 3,22 |
| Liga Europy | 247 | 0,958 | 1,033 | 2,66 |
| Liga Konferencji | 229 | 1,015 | 1,057 | 1,18 (w szumie) |

Typy po polityce: 545, obiecane 74,9 %, trafiło 70,8 % — model jest tu o ~4 pkt za pewny
siebie, najbardziej przy wygranej gości (70 % obiecane, 60 % trafione) i 1X (84 % / 74 %).
To ten sam kierunek, który widać w ligach powyżej 70 %; do poprawienia kalibracją, gdy dziennik
prognoz zbierze dość meczów pucharowych. Nadal: typ na wygraną gości trafia 60 % przy normie 31 %.

Ponowne uruchomienie na serwerze:

```bash
node --experimental-loader ./test/helpers/alias.mjs lib/model/poolBacktest.mjs --pool=europe
```

Jeśli werdykt wyjdzie negatywny, pulę wyłącza się usunięciem jej z `POOLS` (rozgrywki wracają
do stanu „bez prognoz"). Dziennik prognoz (`ModelForecast.pool`) mierzy obie pule na żywo.

## Dziennik prognoz — jak model będzie się sprawdzał i uczył

Typy (`Pick`) to kilkadziesiąt rozliczonych na miesiąc: za mało, żeby w rozsądnym czasie
sprawdzić kalibrację, i za mało, żeby czegokolwiek się nauczyć. Od września 2026 KAŻDA
prognoza modelu (lista, panel, mail, asystent — to jedno `hintsForDate`) trafia do
`ModelForecast`: wszystkie rynki, wariant „powyżej 2,5", plakietka, a w nocy wynik. Pierwsza
prognoza w oknie 48 h przed meczem zostaje; kolejne policzenia niczego nie nadpisują.
To ~3 000 prognoz miesięcznie przy zerowym koszcie zapytań (wyniki idą po 20 na zapytanie).

Kolejność działań, z progami:

1. **Po ~2 000 prognoz z wynikiem (ok. 2 miesiące)** — `forecastCheck.mjs`: czy „66 %"
   trafia w 66 %, czy `shots` bije `goals`, które ligi są na minusie. Decyzje: korekta
   nadmiernej pewności (dziś wiemy, że powyżej 70 % model jest ~10 pkt za pewny siebie),
   wyłączenie lig, gdzie zysk nad stałą jest ujemny.
2. **Po ~10 000 (ok. pół roku)** — przeliczenie regresji „powyżej 2,5" na własnych danych
   (z `FixtureStats`, w tym xG tam, gdzie dostawca je daje) i porównanie z archiwum.
3. **Cechy per drużyna** — dopiero gdy będzie ≥ 100 prognoz na drużynę; wcześniej to szum.

## Rynek bukmacherski: sufit i pomiar, nigdy baza (stan do 21.11.2026)

**Od 21.11.2026 rynek jest też warunkiem typu i — przy „1", „X2", „powyżej 2,5" — źródłem pokazanej
szansy; sekcja „Model wybiera, kurs potwierdza" niżej.** Bazą przewagi nadal nie jest. Do tej daty kursy były w dwóch wąskich rolach, obie bez śladu w treści
i interfejsie:

- **Sufit „to już wszyscy wiedzą"** — `MARKET_CEILING` w `lib/picks/policy.js`. Gdy rynek
  (po zdjęciu marży) daje selekcji co najmniej tyle procent, typu nie wystawiamy, choćby
  model przechodził próg przewagi. Kursy jednego meczu przychodzą z `oddsByFixture`
  i trafiają do polityki przez `meetsPolicy(..., { market })`; przy typie zostaje
  `marketProbability` wyłącznie do pomiaru.
- **Linia odniesienia w backteście** — `marketData.mjs` pobiera kursy zamknięcia
  z football-data.co.uk (Pinnacle, średnia rynku, Bet365) dla lig z `FOOTBALL_DATA_CODES`,
  dopasowuje je do meczów po dacie i nazwach drużyn i backtest zestawia model z rynkiem
  na tych samych meczach: log loss, Brier, kalibracja w kubełkach i liczba „pewniaków",
  które sufit odetnie. `--market=off` wyłącza.
- **Pomiar na produkcji** — `marketCheck.mjs` liczy to samo na rozliczonych typach
  z zapisanym `marketProbability`; jedyne źródło dla lig spoza archiwum i dla rynku
  „drużyna strzeli".

Granica, której pilnujemy: rynek nie jest bazą do liczenia przewagi. „Przewaga nad rynkiem"
to value betting — mechanika usunięta z serwisu świadomie.

## Typy przy kursie ≥ 1,50 — eksperyment i tryb cienia (wrzesień 2026)

Pytanie właściciela: czy dać zakładkę z typami modelu, przy których kurs wynosi co najmniej 1,50?
Zanim cokolwiek trafi do interfejsu, dwa pomiary tą samą definicją (`oddsShadow.js`: reguły,
rozliczenie, bilans po stałej stawce, polski podatek 12% od stawki, CLV).

**Historia — `oddsExperiment.mjs`** (11 lig z football-data, walk-forward, 10 369 meczów
od lipca 2023, kurs otwarcia średniej rynku):

| reguła | zakładów | model obiecywał | trafione | zwrot | po podatku PL |
|---|---|---|---|---|---|
| plakietka modelu, kurs ≥ 1,50 | 1302 | 67,5% | 55,7% | −6,8% ±4,6 | −18,0% |
| wartość wg modelu ≥ 5% | 6322 | 37,8% | 28,2% | −14,2% | −24,5% |
| wartość wg modelu ≥ 10% | 4436 | 38,0% | 26,6% | −16,9% | −26,9% |
| wszystkie plakietki (bez progu kursu) | 6010 | 74,8% | 72,9% | −2,7% | −14,4% |

Wynik ujemny w każdym sezonie osobno, CLV ujemne (kurs częściej rośnie, niż spada, do
zamknięcia — rynek odchodzi od modelu). Wniosek: plakietki jako całość są uczciwie
skalibrowane, ale tam, gdzie rynek płaci ≥ 1,50, model przesadza o ~12 pkt. Zgadza się
z pierwszymi 23 rozliczonymi typami z produkcji (obiecane ~71%, trafione 48%).

**Żywe dane — tryb cienia.** Archiwum nie ma mniejszych lig, „powyżej 2,5" ani „drużyna
strzeli", więc co 20 minut (`oddsShadowJob.js`, `/api/cron/odds-snapshot`) do dziennika
prognoz trafiają kursy API-Football: otwarcie od 9:00 w dniu meczu i zamknięcie 10–30 minut
przed meczem. Raport: `oddsShadowCheck.mjs`. Kryteria zakładki ustalone przed zbieraniem
danych: ≥ 300 zakładów reguły „plakietka", zwrot > 0, CLV ≥ 0, trafność najwyżej 5 pkt
pod obietnicą. Nawet wtedy po podatku 12% zakład wychodzi na plus dopiero przy zwrocie
powyżej ~14%, więc zakładka nie może obiecywać zarobku.

## Plakietki według kursu — pomiar pod kupony (24.10.2026)

Ten sam dziennik prognoz, 27 dni (27.09–23.10.2026), plakietki z porannym kursem i wynikiem
w ligach sprawdzonych, mecze 12:00–23:00 (tak jak na kupon). Rynek = 1/kurs (z marżą).

| kurs plakietki | typów | model obiecywał | trafione | rynek |
|---|---|---|---|---|
| 1,05–1,20 | 93 | 82,6% | 90,3% ±3,1 | 88,6% |
| 1,20–1,30 | 86 | 77,0% | 80,2% ±4,3 | 80,5% |
| 1,30–1,40 | 73 | 73,6% | 76,7% ±4,9 | 74,6% |
| 1,40–1,50 | 51 | 70,5% | 56,9% ±6,9 | 69,7% |
| 1,50–1,60 | 34 | 70,9% | 52,9% ±8,6 | 64,9% |
| 1,60–1,80 | 26 | 66,2% | 50,0% ±9,8 | 60,2% |

Poniżej 1,40 model trafia tyle, ile obiecuje, albo więcej; od 1,40 przesadza o 13–18 pkt —
żywe dane potwierdzają eksperyment z archiwów. Drugi wniosek: w przedziale 1,05–1,40 typy,
przy których model był PEWNIEJSZY od bukmacherów (szansa modelu > 1/kurs), trafiły 73%
(51/70) przy obiecanych 83%, a te, przy których rynek był co najmniej tak pewny jak model —
87% (158/182) przy obiecanych 76%. Rozbieżność „w górę" to tu raczej błąd modelu niż okazja.
Wnioski weszły do zasad kuponów od 25.10.2026 (`lib/coupons/build.js`: granica 1,40 zostaje,
nowy warunek zgody rynku z modelem, kurs łączny 2,4–2,8 z jak najmniejszej liczby typów —
tam też symulacja wariantów). Próba mała; pomiar warto powtórzyć po kolejnym miesiącu.

## Nowe ligi — sprawdzian i okres próbny (od października 2026)

Każda liga ma własne dopasowanie, więc dopisanie nowej NIE zmienia prognoz w pozostałych.
Jedyny punkt styku to pule pucharowe (`pools.js`) — mają zamkniętą listę lig i test
(`test/model/probation.test.mjs`) pilnuje, żeby liga próbna się na niej nie znalazła.

Kolejność:

1. **Sprawdzian** — `leagueCheck.mjs` (zasady w `leagueCheck.js`): ostatni rok jako okres testowy,
   model per liga przeliczany co 14 dni wyłącznie na wcześniejszych meczach, linia bazowa
   z częstości TEJ ligi, typy po polityce produkcji. Progi ustalone przed uruchomieniem:
   ≥ 150 meczów z prognozą, pokrycie ≥ 60%, zysk w log lossie z t ≥ 1,5, typy najwyżej 6 pkt
   poniżej obietnicy. Obok kandydatów te same liczby dla kilku działających lig.
2. **Poziom 3 w `LEAGUE_TIERS`** — tylko ligi z werdyktem „dopuszczona". Plakietki, analizy,
   kupon live i asystent działają; kupony, typ dnia, wyższe kursy, raporty, kolejka i poranny
   mail — nie. Typy liczone osobno (`/api/stats/picks?leagues=probation`, pigułka „Nowe ligi").
3. **Awans na poziom 2** po ≥ 150 rozliczonych typach, gdy trafione nie niżej niż 6 pkt pod obietnicą.

```bash
node --experimental-loader ./test/helpers/alias.mjs lib/model/leagueCheck.mjs
```

Koszt ~3 zapytania na ligę; wynik także w kolekcji `modelleaguechecks`.

**Przebieg na serwerze 21.10.2026** (rok testowy od 21.10.2025, 166 zapytań): dopuszczone
**19 z 49** — decyzją właściciela od razu na poziom 2 (pełna oferta, główna skuteczność), bez
okresu próbnego; poziom 3 zostaje jako mechanizm dla lig na granicy w kolejnych przebiegach. Typy razem 5390 — obiecane 81,4%, trafione 78,8%. Najmocniejsze: Bułgaria (t 4,2;
81/81%), Grecja (3,8; 82/82%), Egipt (3,8; 80/81%), ZEA, Izrael, Turcja 1. Lig, Ukraina, Serie B
(2,8; 79/79%), Ligue 2. Odpadły m.in. 2. Bundesliga, LaLiga 2, Liga Portugal 2, Challenger Pro
League, J2, A-League (model nie bije częstości ligi) i Eerste Divisie, League Two, 3. Liga, Chiny,
Brazylia Serie B (przewaga w szumie). K League 2 przeszła próg t, ale typy przesadzały (81/74%).

Te same liczby dla lig, które już działały: Eredivisie (t 2,8; 83/83%) i Brazylia Serie A
(2,3; 80/78%) przechodzą; Championship (0,7), Allsvenskan (0,7) i MLS (0,6) są w szumie,
a **I liga (Polska) wypada poniżej częstości** (t −1,6; 81/72%). Ich nie ruszaliśmy — to
kandydaci do decyzji na podstawie dziennika prognoz, nie jednego przebiegu.

## Model wybiera, kurs potwierdza — szansa, korekta, kupony, live (21.11.2026)

Punkt wyjścia (21.11.2026): 1354 rozliczone typy AI, 72% trafionych; typy 80–89% trafiały 77%
(obiecane 84%), 90%+ — 84% (92%); „goście strzelą" 85% → 67%; analiza na żywo 44 typy, 57% przy 72%;
kupony od 25.10: dnia 2/14 (w 14 z 28 dni bez kuponu), 3-dniowy 3/19, 5-dniowy 8/19. Dziennik prognoz:
2358 meczów z wynikiem (18.09–16.11.2026), z tego 2081 z porannym kursem (`odds.open`, od 27.09).
Log loss 1X2: częstości 1,061, model 0,971, rynek 0,946 (do 19.10: 1,063 / 0,957 / 0,930; od 20.10:
1,060 / 0,978 / 0,953). Każda decyzja niżej — na podziale PO DACIE (do 19.10 / od 20.10) albo tydzień
po tygodniu. Skrypty pomiarowe poza repozytorium, baza tylko do odczytu.

### 1. „Goście strzelą gola" — wyłączone (`BANNED_TEAM_GOALS_SIDES`, `lib/picks/policy.js`)

| szansa modelu | meczów | model | fakt | rynek (po marży) |
|---|---|---|---|---|
| 75–80% | 315 | 77,5% | 78,1% | 76,8% |
| 80–85% | 244 | 82,4% | 75,4% | 80,1% |
| 85–90% | 151 | 87,2% | 84,1% | 84,4% |
| 90%+ | 100 | 92,9% | 89,0% | 87,5% |

| plakietki „goście strzelą" | do 19.10 | od 20.10 |
|---|---|---|
| wszystkie | 46: 85% → 85% | 60: 85% → 62% |
| mecze nad progiem 82% | 129: 86% → 86% | 208: 86% → 78% |

Nachylenie „logit szansy → wynik" 0,61 (do 19.10 0,70, od 20.10 0,55; gospodarze 0,85, „1" 0,89,
„2" 0,94). Korekta krzywą dopasowaną do 19.10 nadal obiecywała za dużo później (nad progiem 85% → 80%,
plakietki 48: 84% → 67%), potwierdzenie kursem też nie ratuje (33 plakietki, 79%; od 20.10 74%).
Decyzja: wyłączone jedną regułą w `isBannedMarket` (plakietki, raport, analiza przed i w trakcie meczu,
typ dnia, kupony, kreator, asystent). **„Gospodarze strzelą" zostają** — model skalibrowany (85–90%:
87% → 89%, 90%+: 93% → 95%), nad progiem 91% w obu połowach 95–97%, typy 22/22 przy 92%.

### 2. Kurs potwierdza, szansa według sprawdzianu (`lib/picks/chance.js`)

Na WSZYSTKICH meczach z kursem rynek jest lepszy od modelu przy każdej selekcji, w obu połowach:

| Brier | „1" / „X2" | „2" / „1X" | gosp. strzelą | goście strzelą | powyżej 2,5 |
|---|---|---|---|---|---|
| model | 0,2145 | 0,1877 | 0,1599 | 0,1998 | 0,2399 |
| szansa z kursu | **0,2058** | **0,1797** | **0,1537** | **0,1933** | **0,2357** |

Ale pokazujemy szansę tylko przy typach, a tam główny zysk to NIEZGODA — plakietka modelu według tego,
czy szansa z kursu sama przechodzi próg (obiecane → trafione):

| | do 19.10 | od 20.10 |
|---|---|---|
| kurs potwierdza | 247: 74,9% → **83,0%** | 558: 76,0% → **78,3%** |
| kurs nie potwierdza | 146: 74,5% → 58,9% | 344: 73,8% → 60,2% |

Bez parametru dopasowanego do danych (próg to polityka), w obu połowach i przy każdej selekcji osobno.
Na samych potwierdzonych typach obie liczby są blisko i obie ostrożne, więc źródło wybieramy per
selekcja — sprawdzian tydzień po tygodniu od 11.10 (Brier model / kurs):

| selekcja | typów | model / kurs | tygodnie z kursem lepszym | od 20.10 | pokazujemy |
|---|---|---|---|---|---|
| „1" | 253 | 0,1842 / 0,1838 | 3 z 7 | 0,1936 / 0,1901 | **kurs** |
| „X2" | 317 | 0,1653 / 0,1637 | 4 z 7 | 0,1668 / 0,1643 | **kurs** |
| powyżej 2,5 | 13 | 0,2014 / 0,1872 | — | 0,1622 / 0,1432 | **kurs** (mała próba) |
| „2" | 82 | 0,1549 / 0,1608 | 2 z 6 | 0,1405 / 0,1508 | **model** (lepszy w obu połowach) |
| „1X" | 197 | 0,1055 / 0,1082 | 2 z 7 | model lepszy w obu połowach | **model** |
| gosp. strzelą | — | kurs nie może potwierdzić: próg 91% > sufit 90% | | | **model**, tylko sufit |

Przy niezgodzie (typ odpada, zostaje wiersz w analizie albo typ zapasowy) — ostrożniejsza z dwóch
liczb: tam kurs jest bliżej faktów przy każdej selekcji („X2" od 20.10: model 72,5%, kurs 60,7%,
weszło 59,4%). Wynik na plakietkach z kursem:

| wariant | do 19.10 | od 20.10 |
|---|---|---|
| zasady sprzed zmiany (model, z „gośćmi strzelą") | 393: 74,8% → 74,0%, Brier 0,1802 | 902: 75,2% → 71,4%, 0,2018 |
| kurs zawsze (pierwsza wersja tej zmiany) | 257: 73,8% → 81,7%, 0,1499 | 592: 74,2% → 78,4%, 0,1657 |
| **tabela źródeł (wdrożone)** | 263: 75,1% → 82,9%, **0,1401** | 607: 75,8% → 79,7%, **0,1552** |
| w tym 80%+ | 79: 85,0% → 92,4% | 207: 84,5% → 88,9% |
| dawne plakietki 80%+ | 128: 84,3% → 85,2% | 322: 83,9% → 76,7% |

Plakietek mniej (dziennie 11 zamiast 17 i 22 zamiast 33), każda obiecuje prawdę albo mniej. Podniesienie
liczb o tę ostrożność świadomie NIE wdrożone. Marża kursów jednostronnych (`ONE_SIDED_MARGIN` 1,06):
1/kurs ÷ częstość 1,05 (gospodarze strzelą), 1,06 (goście), 1,05 (powyżej 2,5); marża 1X2 1,069.

Gdzie działa: plakietki (`hints.js`, poranne zdjęcie z dziennika — zero nowych zapytań), raport
(`confirmMarkets`), analiza przed meczem (kandydat tylko przy obu progach), typ dnia, kupony i kreator,
asystent (`model_dla_meczu` z kursem). Bez kursu — szansa modelu po korekcie (pkt 3). Przy typie
zapisujemy `probability` (pokazana), `modelProbability`, `marketProbability`, `chanceSource`
(`market` / `model` / `live` / `provider`) i `calibrationVersion`; typ dnia także `chanceConfirmed`.
Historii nie przeliczamy. Odpowiedź API plakietek nie niesie liczb do pomiaru (`publicHint`).

Plakietka przed porannym zdjęciem kursów (mecze jutra) jest WSTĘPNA: szansa modelu, podpis „bez
potwierdzenia kursami", i nie wchodzi do skuteczności — `recordHintPicks` zapisuje plakietkę dopiero
z kursem (albo gdy wiadomo, że kursu nie będzie, albo na godzinę przed meczem). Dziennik prognoz dalej
zapisuje plakietkę SAMEGO modelu (`hint`, z `hint.raw` przed korektą) — to ją mierzymy.

**Zasady, które zmieniły się świadomie.** „Rynek nigdy bazą" → rynek nie jest bazą PRZEWAGI (ta dalej
od normy, `MIN_LIFT` bez zmian), ale jest WARUNKIEM typu i przy „1", „X2", „powyżej 2,5" źródłem
pokazanej szansy. `MARKET_CEILING` (90) zostaje. Treści AI dalej nie piszą o kursach ani „przewadze nad
rynkiem" (prompty `report/7`, `match-analysis/17`, `assistant/7` dostają tylko źródło procentu). Podpisy:
„szansa z kursów" / „według modelu, kursy potwierdziły typ" / „według modelu".

### 3. Korekta zawyżonych procentów (`lib/model/chanceCalibration.js` + generowany `chanceCalibrationData.js`)

Rozliczone typy: 80–89% → 77%, 90%+ → 84%. Bez „gości strzelą" 80–89%: do 19.10 92 typy, 84% → 80%;
od 20.10 278, 83% → 79%; 90%+: 26, 93% → 81% i 29, 92% → 90%. Mechanizm: monotoniczne przesunięcie
logitu per selekcja, tylko w dół (w stronę faktów, nigdy w górę), najwyżej 8 pkt, minimum 150
plakietek, sprawdzian tydzień po tygodniu (≥ 100 plakietek), wersja i data w pliku. Odświeżanie:
`node --experimental-loader ./test/helpers/alias.mjs lib/model/chanceCalibration.mjs --emit=lib/model/chanceCalibrationData.js`
(plik w repozytorium, jak `goalsCalibrationData.js`). **Od 22.11.2026 korektę liczy i — przez
bezpieczniki — włącza co tydzień zadanie `weeklyJob.js`; plik jest już tylko zapasem** (sekcja z 22.11.2026).

Sprawdzian tydzień po tygodniu na plakietkach modelu bez „gości strzelą" (1228 od 2.10; korekta
dopasowana wyłącznie na wcześniejszych tygodniach):

| kształt korekty | Brier | 80%+ (360): obiecane → po korekcie → trafione |
|---|---|---|
| bez korekty | 0,1935 | 83,8% → — → 81,7% |
| przesunięcie per selekcja (wdrożony mechanizm) | 0,1935 | 83,8% → 82,2% → 81,7% |
| regresja logit na wszystkich meczach | 0,1936 | 83,8% → 81,2% → 81,7% |
| izotoniczna na wszystkich meczach (tylko w dół, limit) | 0,1930 | 83,8% → 80,6% → 81,7% (Brier 80%+ gorszy: 0,1506 / 0,1486) |

Generator z 21.11 nie włączył korekty w żadnej selekcji („X2" 0,1897 → 0,1916, „1" 0,2081 → 0,2086;
„1X" i „2" — za krótki sprawdzian). Mechanizm jest podłączony wszędzie, gdzie pokazujemy szansę modelu
(raport, plakietki, analiza, typ dnia, asystent, a przez nie kupony) i włączy się sam, gdy dziennik to
potwierdzi. Zawyżone 80%+ naprawiają dziś wyłączenie „gości strzelą" i potwierdzenie kursem (80%+ na
plakietkach z kursem: 92% i 89% trafionych przy 85% obiecanych — tabela w pkt 2). Szansa na żywo nie
przechodzi przez korektę — była mierzona na prognozach przedmeczowych.

### 4. Kupony (`lib/coupons/build.js` — pełna tabela symulacji w nagłówku)

Noga = plakietka potwierdzona kursem (`chanceConfirmed`). Kupon dnia i 3-dniowy: 2,0–2,5, najwyżej
3 mecze, nogi 1,05–1,60. 5-dniowy: 2,4–2,8, do 5 meczów, nogi do 1,40 — zmienia się tylko potwierdzenie.
Kreator: nogi jak kupon dnia. Dawny warunek „kurs × szansa modelu ≤ 100" usunięty. Symulator
sprawdzony na prawdziwych kuponach od 25.10 (zasady z 25.10: 2/12, 3/19, 6/18 wobec 2/14, 3/19, 8/19).

| wariant (dni 27.09–16.11) | dni z kuponem | kurs | meczów | weszło do 19.10 / od 20.10 |
|---|---|---|---|---|
| dnia: zasady z 25.10 | 25/49 | 2,45 | 3,6 | 5/9, 4/16 |
| dnia: zasady z 25.10 + potwierdzenie | 31/49 | 2,43 | 3,5 | 6/11, 12/20 |
| dnia: dokładnie 2 mecze, nogi do 1,60 | 26/49 | 2,08 | 2,0 | 4/10, 10/16 |
| dnia: pojedynczy typ 1,40–1,80 | 33/49 | 1,45 | 1,0 | 8/15, 13/18 |
| **dnia: 2–3 mecze, nogi do 1,60** | **41/49** | 2,09 | 2,4 | 10/18, 14/23 |
| 3-dniowy: zasady z 25.10 | 46/47 | 2,43 | 3,4 | 9/22, 5/24 |
| **3-dniowy: 2–3 mecze, nogi do 1,60** | 46/47 | 2,06 | 2,1 | 11/22, 16/24 |
| 5-dniowy: zasady z 25.10 | 45/45 | 2,42 | 3,1 | 4/22, 7/23 |
| **5-dniowy: + potwierdzenie** | 45/45 | 2,41 | 3,1 | 7/22, 13/23 |

Nogi 1,40–1,60 trafiają tyle, ile obiecują (115: ~65% → ~65%), poniżej 1,40 więcej. Pojedynczy typ
odrzucony: kurs ~1,45 zamiast ok. 2,0, do 19.10 53% przy 67%. Próba mała (kilkadziesiąt kuponów,
bez sprawdzania wiadomości w symulacji, 3- i 5-dniowe dzielą mecze) — pewne są częstość, liczba meczów
i to, że szansa nie obiecuje za dużo; „weszło" może się wahać.

### 5. Analiza na żywo (`lib/analysis/model.js`)

44 typy: 57% przy 72% (do 19.10 10 → 70%, od 20.10 34 → 53%); bez modelu 12 → 50%, zapasowe i poniżej
progu 24 → 50%, poniżej 60% 7 → 14%. Nogi kuponu live (`lib/live/select.js`): 83 → 87% przy 82%,
w obecnych widełkach 1,20–1,60 — 46 → 78% przy 77%. Od 21.11: typ w trakcie meczu tylko z selekcji,
która przechodzi `liveSelections` (zgoda `LIVE_AGREEMENT`, weto za czerwoną kartkę), kurs live
1,20–1,60 (szansa nie schodzi poniżej ~62%) i minuta 10–80; szansa = ostrożniejsza z: wyliczenie
i 100/kurs live. **Bez kursów live (albo bez modelu ligi) — bez typu**, tylko kierunek poza statystyką.
Kursów live przy typach z analizy wcześniej nie zapisywano, więc reguły nie da się sprawdzić wstecz
na tych 44 typach; od teraz `marketProbability` przy typie live to 100/kurs live — po kilku tygodniach
policzyć trafienia nowych typów i kalibrację szansy live.

## Strzały celne w sile drużyn i cotygodniowa kalibracja (22.11.2026)

### 1. Pokrycie strzałów w `FixtureStats` (tylko odczyt, 22.11)

8585 meczów, strzały celne w 90%. Od sierpnia 2026, w 49 ligach liczonych modelem jednej ligi:
**40 lig ma strzały celne w ≥ 90% meczów**, 4 w 50–90% (292, 172, 301, 296), 5 prawie wcale (107, 98,
332, 318, 255; tam reguła per mecz zostawia same gole). Przed wrześniem kolekcja ma tylko ~12 ostatnich
meczów drużyny (start zbieracza). Przez wygaszanie po dacie strzały pokrywają mimo to ok. 2/3 wagi
dwuletniego okna modelu. Reguła per mecz (niżej) przepuściłaby strzały w **86,9%** meczów dziennika
od 1.10 (1667 z 1919). Puchary i reprezentacje (pule) zostają na golach, bo zbieracz ich nie obejmuje.

### 2. Pomiar: walk-forward, podział po dacie

Archiwum: 11 lig football-data.co.uk, sezony 2022–2026, przeliczanie co 7 dni, strzały ze wszystkich
meczów. Dziennik: 619 meczów dziennika z tych 11 lig, dopasowanych do archiwum po dacie i nazwach.
Reszta z 2081 meczów z porannym kursem to ligi spoza archiwum: ich historia jest tylko w API, więc
pełny pomiar robi serwer (pkt 5). Na dzienniku przeliczanie co dobę jak na produkcji, a strzały TYLKO
z meczów, które produkcja ma w `FixtureStats` (od 1.09 wszystkie, wcześniej ostatnie 12 meczów drużyny),
z regułą per mecz. Log loss 1X2, w nawiasie zysk wobec samych goli / t:

| okres | meczów | gole (dziś) | S70 (wdrożone) | S50 | rynek |
|---|---|---|---|---|---|
| archiwum 08.2024–07.2025 | 3798 | 0,9970 | 0,9907 (+0,0064 / **5,7**) | 0,9889 (+0,0081 / 4,4) | 0,9636 (zamknięcie) |
| archiwum 08.2025–17.09.2026 | 4280 | 1,0182 | 1,0132 (+0,0050 / **5,2**) | 1,0120 (+0,0063 / 4,0) | 0,9808 |
| dziennik do 19.10 | 295 | 1,0528 | 1,0439 (+0,0089 / **2,4**) | 1,0401 (+0,0127 / 2,1) | 0,9477 (poranny, 195 meczów) |
| dziennik od 20.10 | 324 | 0,9572 | 0,9567 (+0,0005 / 0,1) | 0,9584 (**−0,0013** / −0,2) | 0,9361 (poranny, 323) |

Brier 1X2 zmienia się tak samo (archiwum 0,5934 → 0,5894 i 0,6053 → 0,6022; dziennik 0,6187 → 0,6134
i 0,5670 → 0,5659). S70 jest na plusie w **11 z 11 lig w obu okresach archiwum** (t 1,4–3,6 na ligę).
Luka do rynku na porannym kursie: 0,9938 → 0,9874 (do 19.10) i 0,9560 → 0,9554 (od 20.10).

**Dlaczego 0,7, a nie zamówione 0,5.** S50 ma większy zysk na archiwum, ale na dzienniku od 20.10
wychodzi na minus (w granicach szumu), a warunek wdrożenia brzmiał „poprawia OBA okresy". S70 jest
na plusie we wszystkich czterech okresach, ma wyższe t (mniejszy rozrzut) i mniej zmienia liczby, które
użytkownik już zna. Waga jest zmienną środowiskową: `MODEL_SHOTS_WEIGHT=0.5` przełącza na S50 bez
zmiany kodu.

Rynki goli (Brier; regresja na macierzy modelu goli / na macierzy S70):

| | arch. 1 | arch. 2 | dz. do 19.10 | dz. od 20.10 |
|---|---|---|---|---|
| powyżej 2,5 (skalibrowane) | 0,2427 / 0,2429 | 0,2442 / 0,2439 | 0,2365 / 0,2359 | 0,2384 / 0,2385 |
| BTTS (skalibrowane) | 0,2463 / 0,2463 | 0,2456 / 0,2455 | 0,2424 / 0,2422 | 0,2446 / 0,2451 |
| gospodarze strzelą | 0,1657 / 0,1644 | 0,1701 / 0,1682 | 0,1700 / 0,1674 | 0,1437 / 0,1432 |

Regresja goli nic nie zyskuje na macierzy S70, więc **zostaje na macierzy modelu goli** i rynki goli
są bez zmian z definicji. Gole drużyny zyskałyby odrobinę, ale plakietek „gospodarze strzelą" z tego
nie przybywa, a plakietek ogółem jest wtedy mniej. Zostają na golach: jedna zmiana naraz.

Kubełki (1, 2, 1X, X2 razem; obiecane → weszło):

| przedział | arch. 08.2025–, gole | arch., S70 | dziennik od 20.10, gole | dziennik, S70 |
|---|---|---|---|---|
| 70–80% | 74,7 → 73,6 | 74,7 → 75,0 | 75,3 → 72,8 | 75,1 → 74,1 |
| 80–90% | 84,4 → 81,5 | 84,3 → 82,6 | 84,5 → 77,7 | 84,5 → 80,5 |
| 90%+ | 93,9 → 88,8 | 93,7 → 89,6 | 93,9 → 100 (33) | 93,1 → 100 (27) |

Plakietki według zasad produkcji (`evaluateMarkets` → `confirmMarkets` → `bestHint`):

| | gole | S70 |
|---|---|---|
| sam model, archiwum 08.2024–07.2025 | 2350 (10,4 dziennie): 74,8% → 71,9%, Brier 0,1985 | 2188 (9,6 dziennie): 74,6% → 74,4%, **0,1869** |
| sam model, archiwum 08.2025–17.09.2026 | 2429 (9,3 dziennie): 74,7% → 72,4%, 0,1945 | 2244 (8,6 dziennie): 74,3% → 73,9%, **0,1874** |
| potwierdzone kursem zamknięcia (tylko 1X2), arch. 1 | 1740: 76,4% → 78,3%, 0,1657 | 1728: 76,5% → 78,9%, **0,1630** |
| potwierdzone kursem zamknięcia, arch. 2 | 1791: 75,8% → 78,7%, **0,1625** | 1770: 75,7% → 78,3%, 0,1639 |
| **dziennik do 19.10, poranny kurs (jak na produkcji)** | 88: 75,5% → 79,5%, 0,1541 | 87: 76,0% → 79,3%, **0,1503** |
| **dziennik od 20.10** | 148: 76,0% → 79,1%, 0,1667 | 146: 76,4% → 80,1%, **0,1645** |

Dla użytkownika: plakietek z kursem jest tyle samo (1–2% mniej), trafienia bez zmian albo trochę
lepsze. Plakietek bez kursu (wstępne na jutro, mecze bez kursów) jest ~7% mniej, ale obiecują tyle,
ile wchodzi, zamiast 2–3 pkt za dużo. Szanse 1X2 w analizie i na liście rzadziej pokazują 80%+ tam,
gdzie wchodzi 78%.

### 3. Tabela źródeł szansy (`MARKET_CHANCE_KEYS`) bez zmian

Ten sam sprawdzian co 21.11 (potwierdzone plakietki od 11.10; Brier model / kurs; tygodnie z kursem
lepszym) na 619 meczach dziennika z 11 lig. Model goli wobec S70:

| selekcja | gole | S70 | kierunek |
|---|---|---|---|
| „1" | 54: 0,1881 / 0,1875, 2 z 5 | 47: 0,1863 / 0,1834, 4 z 5 | kurs ≤ model w obu |
| „X2" | 94: 0,1883 / 0,1915, 1 z 5 | 93: 0,1889 / 0,1894, 1 z 5 | model ≤ kurs w obu |
| „2" | 21: 0,1546 / 0,1472, 2 z 5 | 20: 0,1627 / 0,1518, 3 z 5 | kurs w obu |
| „1X" | 19: 0,0931 / 0,1011, 1 z 5 | 27: 0,0998 / 0,1038, 2 z 5 | model w obu |

Przejście na S70 nie odwraca żadnej selekcji, więc tabela zostaje. Na tym podzbiorze „X2" i „2"
wychodzą inaczej niż na pełnym dzienniku z 21.11; przy 20–90 typach to szum, więc obowiązuje decyzja
z pełnego dziennika. Od teraz tabelę przelicza co tydzień raport (pkt 4), na pełnym dzienniku, już
z prognozami `dixon-coles/6`. Gdy wynik różni się od obowiązującej tabeli o więcej niż 0,002 Briera,
raport oznacza selekcję „DO DECYZJI". Tabela sama się nie przełącza, bo to zmienia liczbę, którą widzi
użytkownik. Pierwszy podgląd (22.11, 28 dni, model goli): „1" 142 typy, model 0,1813 / kurs 0,1840.
To sygnał do obejrzenia za 2–3 tygodnie, już na nowym modelu.

### 4. Co wdrożone

- **`dixon-coles/6`** (`shotStrength.js`, `index.js`, `analysis/model.js`): obok modelu goli działa
  drugi model sił, uczony na „golach skorygowanych" 0,7·gole + 0,3·k·strzały celne (`k` = gole /
  strzały celne ligi z tych samych danych). 1X2 i podwójna szansa pochodzą z niego, gdy OBIE drużyny
  mają strzały celne w ≥ 6 z ostatnich 10 meczów (`enoughShotHistory`, ta sama reguła co wariant `shots`
  regresji goli). W pozostałych meczach liczy model goli. Gole drużyny, suma, BTTS, najbardziej
  prawdopodobny wynik, oczekiwane gole i mecz w trakcie zawsze liczy model goli. Jedno zapytanie do bazy
  na ligę co 6 h. Liga z < 30 meczami ze strzałami albo bez bazy liczy się jak w `/5`. Pule bez zmian.
- Dziennik zapisuje `strength` (`shots` / `goals`), a raport porównuje obie drogi na żywo.
- **Wyłącznik**: `MODEL_SHOTS=off` w `.env` i `.env.local` (`server.js` i Next czytają różne pliki),
  potem `pm2 restart all`; wersja wraca do `dixon-coles/5`. `MODEL_SHOTS_WEIGHT=0.5` ustawia wagę S50.
- **Cotygodniowe zadanie**, poniedziałek 6:30 czasu polskiego (`scheduler.cjs` → `/api/cron/model-weekly`,
  `INTERNAL_API_SECRET`; `MODEL_WEEKLY_ENABLED=false` wyłącza). Liczy korektę szansy per selekcja
  (`fitSelection`, jak generator) i włącza ją sama tylko wtedy, gdy przejdzie bezpieczniki z
  `weeklyCalibration.js`:
  - próba: 150 plakietek selekcji, 100 w sprawdzianie, 300 razem;
  - poprawa walk-forward na całości I na ostatnich 4 tygodniach (≥ 40 plakietek);
  - tylko w stronę faktów: model musiał zawyżać, po korekcie jest bliżej faktów, nigdy w górę,
    najwyżej 8 pkt;
  - **najwyżej 2 pkt zmiany na tydzień**; szkodzącą korektę też wyłącza krokami, a brak danych nie
    zdejmuje działającej;
  - wersja i data w bazie (`ChanceCalibration`), poprzednia zostaje. Next i `server.js` czytają aktywną
    co kwadrans.
  Podgląd 22.11 na prawdziwym dzienniku: **bez zmian** („X2" i „1": sprawdzian nie potwierdza, także
  na ostatnich tygodniach; reszta: za mała próba).
- **Raport** idzie mailem do kont z rolą `admin` (nadawca jak w porannym mailu): korekta i powody,
  log loss model / rynek (7 i 28 dni, siła ze strzałów osobno), kubełki obietnica/fakt na plakietkach,
  tabela źródeł szansy, kupony, CLV (`odds.close`). **Panel `/admin/model`**: obowiązująca korekta,
  historia wersji z przyciskiem „Wycofaj do poprzedniej wersji" i raporty tygodni.

### 5. Na serwerze

```bash
cd /var/www/html/czat-sportowy
node --experimental-loader ./test/helpers/alias.mjs lib/model/xgExperiment.mjs --source=api --split=2026-09-01
```

~100 zapytań (terminarze z cache'u Redisa), wynik w terminalu i w `modelxgchecks`. Czytać wiersz
**`S70R`** (dokładnie produkcja: waga 0,7 i reguła per mecz) w tabeli „WSZYSTKIE MECZE TESTOWE" i w
„WERDYKT". `TAK` (zysk dodatni, `t ≥ 2`, dodatni w obu połowach) znaczy: zostaje. Zysk ujemny albo
„nie" z ujemną którąś połową znaczy: wyłączyć (`MODEL_SHOTS=off`) albo przejść na `S50R`, jeśli to on
ma „TAK". Linia „KONTROLA" porównuje wynik z tym, co produkcja zapisała (do `/5` ma być blisko G,
od `/6` blisko `S70R`), i podaje, w ilu meczach reguła przepuściła strzały. Podgląd raportu tygodnia
bez zapisu i bez maila:

```bash
curl -s -X POST -H "x-internal-secret: $INTERNAL_API_SECRET" "http://127.0.0.1:3001/api/cron/model-weekly?dryRun=1"
```

Ryzyka: dziennik w pomiarze to 30% meczów z kursem (11 lig archiwum), reszta lig dopiero na serwerze;
od 20.10 zysk jest zerowy. Gdy w jakiejś lidze zbieracz przestanie pobierać strzały, reguła per mecz
sama przełączy jej mecze na gole po kilku kolejkach (okno 10 meczów).

## Uruchomienie backtestu

Wymaga ważnego klucza `API_SPORTS_KEY`, więc w praktyce uruchamia się go na serwerze:

```bash
node --experimental-loader ./test/helpers/alias.mjs lib/model/backtest.mjs
```

Parametry:

```bash
--market=off             bez kursów zamknięcia z football-data.co.uk
--seasons=2024,2025      sezony do pobrania (domyślnie 2024,2025)
--split=2025-07-01       data podziału na uczące i testowe
--leagues=39,140,135     ograniczenie do wybranych lig (domyślnie wszystkie z LEAGUE_TIERS)
--refit-days=14          co ile dni przeliczać model na danych testowych; 0 wyłącza
```

Koszt: **jedno zapytanie na ligę i sezon**. Pełny przebieg to około 80 zapytań przy dziennym
limicie 7500, bo `fixtures?league=&season=` oddaje cały sezon z wynikami naraz.

Kod wyjścia `0` znaczy, że przewaga nad częstościami jest **istotna statystycznie**; `2` —
że jej nie ma albo nie da się jej odróżnić od przypadku.

Model przelicza się w trakcie okresu testowego co `--refit-days`, ucząc się wyłącznie na
meczach rozegranych wcześniej — tak jak robiłaby to produkcja. Uczenie raz na cały sezon
zaniża wynik i karze model za beniaminków, o których przez rok nie mógł nic wiedzieć.

## Jak czytać wynik

- **log loss** i **Brier score** — mniej znaczy lepiej. To one decydują.
- **statystyka t** przy różnicy log lossu — poniżej 2 przewaga jest w granicach szumu,
  niezależnie od tego, jak ładnie wygląda sama średnia.
- **odsetek meczów z nieznaną drużyną** — dla nich model nie wnosi nic ponad częstości,
  więc wysoki udział rozwadnia cały wynik.
- Punkty odniesienia dla log lossu 1X2: 1,0986 to prognoza „1/3 na każdy wynik”,
  a przyzwoity model statystyczny na czołowych ligach osiąga 0,98–1,01.
- **trafienia 1X2** — podane wyłącznie dla kontekstu. Odsetek trafień nagradza pewne siebie
  zgadywanie: „zawsze gospodarz" ma około 45% i zero wartości prognostycznej.
- Podział jest **po dacie, nigdy losowy**. Losowy pozwoliłby uczyć się z kolejek rozegranych
  po tych, które model ocenia, i zawyżyłby wynik.

## Co model wie, a czego nie

Wie: kto z kim grał, jaki był wynik, kiedy, i kto grał u siebie. Z tego wyprowadza siłę
ataku i obrony każdej drużyny w skali ligi. Od `dixon-coles/6` wie też, ile strzałów celnych
oddała każda strona (siła w 1X2, gdy obie drużyny mają strzały — sekcja z 22.11.2026).

Nie wie: o kontuzjach, składach, stawce meczu, pogodzie ani zmęczeniu. To zostaje rolą
modelu językowego, który dostaje prognozę liczbową i ma ją uzasadnić **albo
zakwestionować** wskazując czynnik spoza danych.
