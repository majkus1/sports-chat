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
z `lib/picks/policy.js` — sam wysoki procent nie wystarcza.

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

Co z tego wynika dla produkcji: „powyżej 2,5" da się włączyć jako osobny rynek — jako warstwę
kalibrującą nad DC z cechami drużyn, nie jako surowe `totalGoals`. Do cech potrzeba strzałów
z ostatnich meczów: dla 11 lig z archiwum za darmo, dla reszty z `fixtures/statistics`
u dostawcy (~150 zapytań dziennie, 2 % limitu). Eksperyment obejmuje wyłącznie czołowe ligi;
przed włączeniem niższych trzeba ten sam pomiar powtórzyć na ich danych.

## Rynek bukmacherski: sufit i pomiar, nigdy baza

Kursy wróciły do serwisu w dwóch wąskich rolach, obie bez śladu w treści i interfejsie:

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
ataku i obrony każdej drużyny w skali ligi.

Nie wie: o kontuzjach, składach, stawce meczu, pogodzie ani zmęczeniu. To zostaje rolą
modelu językowego, który dostaje prognozę liczbową i ma ją uzasadnić **albo
zakwestionować** wskazując czynnik spoza danych.
