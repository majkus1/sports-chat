# Model prognoz

Własny model liczbowy: siły ataku i obrony drużyn szacowane z wyników, rozkład wyniku
z korektą Dixona-Colesa, wszystkie rynki wyprowadzone z jednej macierzy.

## Pliki

| Plik | Rola |
|---|---|
| `dixonColes.js` | macierz prawdopodobieństw wyniku i wyprowadzone z niej rynki |
| `ratings.js` | szacowanie sił drużyn, przewagi boiska i korekty `rho` z historycznych wyników |
| `backtest.mjs` | sprawdzenie modelu na meczach, których nie widział podczas uczenia |

## Stan: PODPIĘTY DO PRODUKCJI — raporty i analizy pojedynczych meczów

Model wszedł do produkcji po tym, jak backtest wykazał przewagę nad liniami odniesienia
(log loss 1X2 1,0348 wobec 1,0717 dla częstości, t = 6,60 na 8715 meczach testowych).
Rynki zależne od sumy goli przegrały z częstością i pozostają wyłączone — patrz
`USABLE_MARKETS` w `index.js`. Rynek bukmacherski jest od modelu lepszy (0,9842 wobec
1,0137 na 3692 meczach z kursami zamknięcia) i to jest stan oczekiwany, nie usterka.

Gdzie liczy:

- **Raport AI** — `lib/reports/service.js`: kandydaci i ich prawdopodobieństwa pochodzą
  z modelu, prognoza dostawcy jest tylko potwierdzeniem.
- **Analiza meczu (przed meczem i w trakcie)** — `lib/analysis/model.js`: szanse 1X2 i selekcje
  liczy model, a model językowy je uzasadnia albo odrzuca. W meczu w trakcie `inPlayMarkets`
  liczy rozkład pozostałych goli przy aktualnym wyniku, a norma to przeciętna para drużyn
  w tej samej sytuacji.

Typ liczy się do skuteczności tylko wtedy, gdy przewyższa normę swojej selekcji o margines
z `lib/picks/policy.js` — sam wysoki procent nie wystarcza.

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
