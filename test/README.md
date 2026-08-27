# Testy

```bash
npm test
```

Uruchamia wbudowany runner Node.js (`node --test`). Nie ma tu żadnego frameworka testowego
ani dodatkowych zależności — przy kilku plikach testowych byłyby kosztem bez pokrycia.

## Czego wymagają

Tylko `DATABASE_URL` w `.env.local`. **Kluczy Stripe'a nie trzeba** — `test/helpers/setup.mjs`
podstawia własne wartości testowe, więc testy nigdy nie dotkną prawdziwego konta Stripe,
a przechodzą także na świeżo sklonowanym repozytorium.

Serwer deweloperski nie musi działać: testy wołają funkcje tras bezpośrednio.

## Dlaczego integracyjne, a nie jednostkowe

Testy sięgają po prawdziwą bazę i prawdziwą weryfikację podpisu Stripe'a. To wybór, nie
niedopatrzenie: dwa najważniejsze zabezpieczenia w kodzie płatności leżą **poza** naszym kodem.

Idempotencja opiera się na unikalnym indeksie w MongoDB — z atrapą bazy test sprawdzałby
wyłącznie to, czy atrapa działa. Weryfikacja podpisu to kryptografia po stronie biblioteki
Stripe'a; podstawiona atrapa przepuściłaby dokładnie ten błąd, który ma wykryć.

Testy zakładają własne konto o nazwie `test-webhook-<znacznik czasu>` i kasują je razem
z księgą w kroku `after()`.

## Co jest pokryte

`test/billing/webhook.test.mjs` — 14 przypadków obejmujących każdy sposób, w jaki webhook
może kosztować pieniądze:

- zły podpis i brak nagłówka z podpisem kończą się kodem 400 (jedyne dopuszczalne błędy),
- płatność nieopłacona, kwota niezgodna z cennikiem, brak metadanych, nieznany pakiet
  i tryb subskrypcyjny nie naliczają kredytów, a mimo to zwracają 200,
- opłacona sesja nalicza kredyty i zostawia wpis w księdze z identyfikatorem płatności,
- to samo zdarzenie przysłane dwa razy nalicza kredyty raz,
- płatność odroczona (BLIK) nalicza po potwierdzeniu, a nieudana nie nalicza wcale,
- zwrot odejmuje kredyty właściwego zakupu, a zwrot bez pasującego zakupu niczego nie zmienia.

### Dlaczego prawie wszystko zwraca 200

Stripe traktuje każdą odpowiedź spoza zakresu 2xx jako awarię i ponawia zdarzenie przez wiele
dni, a po serii niepowodzeń wyłącza endpoint. Ponowienie nigdy nie naprawi błędu w danych —
metadane same się nie zmienią — a wyłączony endpoint zatrzyma wszystkie kolejne płatności.
Dlatego kodem błędu odpowiadamy wyłącznie przy złym podpisie, czyli w jedynym przypadku,
w którym ponowienie ma sens.
