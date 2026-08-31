# Model prognoz

Własny model liczbowy: siły ataku i obrony drużyn szacowane z wyników, rozkład wyniku
z korektą Dixona-Colesa, wszystkie rynki wyprowadzone z jednej macierzy.

## Pliki

| Plik | Rola |
|---|---|
| `dixonColes.js` | macierz prawdopodobieństw wyniku i wyprowadzone z niej rynki |
| `ratings.js` | szacowanie sił drużyn, przewagi boiska i korekty `rho` z historycznych wyników |
| `backtest.mjs` | sprawdzenie modelu na meczach, których nie widział podczas uczenia |

## Stan: NIE JEST PODPIĘTY DO PRODUKCJI

Selekcja typów nadal korzysta z prognoz dostawcy. Model wchodzi do produkcji **wyłącznie
wtedy, gdy backtest wykaże, że bije linie odniesienia** na danych testowych. Model, który
nie bije prostego licznika częstości, nie jest wart wywołania — a wynik negatywny też jest
wynikiem i trzeba go przyjąć.

## Uruchomienie backtestu

Wymaga ważnego klucza `API_SPORTS_KEY`, więc w praktyce uruchamia się go na serwerze:

```bash
node --experimental-loader ./test/helpers/alias.mjs lib/model/backtest.mjs
```

Parametry:

```bash
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
