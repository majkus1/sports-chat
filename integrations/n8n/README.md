# n8n — automatyzacje Czatu Sportowego

Dwa workflowy do zaimportowania w n8n. Oba czytają jeden endpoint aplikacji
(`GET /api/integrations/daily-brief`, nagłówek `x-internal-secret`), więc **liczby w postach
i raportach pochodzą z tych samych funkcji co strona** — n8n niczego nie liczy sam i nie ma
dostępu do bazy.

| Workflow | Kiedy | Co robi | Po co |
|---|---|---|---|
| `poranny-post-telegram.json` | 10:00 | Typ dnia + kupon dnia + wczorajszy wynik → LLM pisze post → **walidacja** → kanał Telegram | Dystrybucja: codzienny powód, żeby wejść na stronę (linki z UTM — mierzalne wejścia) |
| `wieczorny-raport-wlasciciela.json` | 23:30 | KPI dnia, koszty AI, rejestracje, wyniki → alarmy (kod) → LLM redaguje → prywatna wiadomość | Monitoring produkcji bez zaglądania do bazy i logów |

## Jak działa poranny post

```
Harmonogram → Konfiguracja → GET daily-brief → Fakty i szablon (kod) → Jest co publikować?
  → LLM pisze post → Walidacja (kod) → Telegram (kanał) → Użyto szablonu? → alert do właściciela
```

- **Fakty i szablon** — kod buduje listę faktów (liczby sformatowane raz) i gotowy post awaryjny bez LLM.
- **LLM** dostaje wyłącznie fakty i zasady (żadnych liczb spoza faktów, bez „pewniak", bez
  bukmacherów, wczorajsza przegrana podana uczciwie). Stopkę prawną (18+, „szacunki, nie pewniaki")
  dokleja kod — nie model.
- **Walidacja (anty-halucynacje)** — każda liczba w tekście musi występować w faktach; zakazane słowa;
  długość; obecność meczu typu dnia. Nie przeszło → publikuje się szablon z faktów, a właściciel
  dostaje alert z powodem. Błąd API modelu (`onError: continue`) kończy się tak samo.
- Sprawdzone na danych z 22.10.2026: post od LLM przeszedł walidację; przy zbyt małym limicie
  tokenów (model „myślał" i zwrócił pusty tekst) poszedł szablon + alert — stąd `reasoningEffort: none`.

## Jak działa wieczorny raport

- **KPI i alarmy liczy kod** (deterministycznie): wydatki AI ≥ 70% dziennego progu, chybiony typ dnia,
  kupon, który nie wszedł (z meczem, który zawiódł), skuteczność 30 dni < norma + 10 pkt, zero
  rejestracji, typy odrzucone przez sprawdzanie wiadomości.
- LLM tylko redaguje 3–5 punktów i jedno zalecenie. Pod spodem zawsze surowe KPI z kodu;
  gdy LLM zawiedzie — idą same KPI.

## Uruchomienie (ok. 10 minut)

1. n8n lokalnie: `npx n8n` (albo `docker run -it --rm -p 5678:5678 n8nio/n8n`) → http://localhost:5678.
   Na serwerze produkcyjnym (512 MB RAM) n8n się nie zmieści — n8n Cloud albo osobna mała maszyna.
2. **Import**: Workflows → Import from File → oba pliki JSON.
3. **Poświadczenia** (Credentials):
   - *Header Auth* „Czat Sportowy — x-internal-secret": Name `x-internal-secret`, Value = `INTERNAL_API_SECRET` z `.env` serwera.
   - *OpenAI* „OpenAI": klucz API.
   - *Telegram* „Telegram — bot Czat Sportowy": token z @BotFather. Bota dodać jako administratora kanału.
4. **Konfiguracja** (pierwszy węzeł Set w każdym workflow): `baseUrl` (produkcja albo
   `http://localhost:3001`), `telegramChannel` (np. `@czatsportowy`), `ownerChatId` (swój chat id,
   np. z @userinfobot), `model`.
5. „Execute workflow" ręcznie → podgląd każdego kroku → włączyć (Active).

## Pomiar efektu

- Wejścia z kanału: UTM `utm_source=telegram&utm_medium=n8n&utm_campaign=poranny-post` (GA4).
- Jakość LLM: odsetek postów z szablonu (`zrodlo: szablon`) i powody odrzuceń — widać w historii wykonań n8n.
- Koszt: ~1 tys. tokenów na post (~0,003 USD przy gpt-5.6-luna).
