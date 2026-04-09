# Pomysły na rozwój Czat Sportowy – społeczność, monetyzacja, wyróżnienie

## Stan obecny (krótko)

- **Czat na mecz**: pokoje `Liga-{fixtureId}` – dyskusja przy konkretnym meczu (przed/live).
- **AI**: analiza GPT-4 (double chance + gole), limit 3/dzień; raport e-mail (Python) 1/dzień.
- **Dane**: API-Football (mecze, predykcje, statystyki), API-Sports (widgety H2H, tabele).
- **Auth**: JWT, Google OAuth, weryfikacja e-mail.
- **Brak**: linków afiliacyjnych, płatności, tipsterów społeczności, ankiet przy meczach.

---

## 1. Afiliacja z bukmacherami (niskie ryzyko, szybki zwrot)

### 1.1 Przycisk „Zobacz kursy u partnera” przy analizie

**Co:** Obok tekstu analizy i przewidywania – jeden przycisk CTA, np. *„Zobacz kursy i obstaw u partnera”* → link afiliacyjny (np. Betsson, LVBet, STS – z ID partnera).

**Dlaczego to działa:**  
Użytkownik właśnie przeczytał analizę i przewidywanie. Naturalny moment, żeby „zobaczyć kursy” – nie pokazujesz kursów w treści (zgodnie z polityką), ale kierujesz do bukmachera. Dla bukmachera = jakościowy ruch (użytkownik już „ogrzany” analizą).

**Wdrożenie:**  
- Zmienna env, np. `NEXT_PUBLIC_PARTNER_BETTING_URL` (opcjonalnie z parametrem `?ref=xxx`).  
- W `ChatComponent.js` w sekcji `match-analysis` (gdzie jest `analysis.pred`) dodać warunkowy blok z linkiem.  
- Jedna strona w panelu (lub plik konfiguracyjny) z listą partnerów: nazwa, URL, etykieta (np. „Freebet 50 zł dla nowych”) – w przyszłości łatwo dodać A/B test lub rotację.

**Trudność:** niska.  
**Czas:** ok. 1–2 h.

### 1.2 Sekcja „Partnerzy” / „Freebety” w menu

**Co:** W menu (FootballMenu lub NavBar) pozycja np. *„Freebety”* lub *„Partnerzy”* → strona z listą bukmacherów: logo, krótki opis, przycisk (link afiliacyjny), ewentualnie „Freebet 50 zł”, „Bonus 100%” itd.

**Dlaczego:**  
Bukmacherzy często mają programy freebetów dla nowych. Ty zbierasz prowizję za rejestracje; użytkownicy dostają jasną listę ofert. Można później dodać filtrowanie (np. tylko freebety, tylko live).

**Wdrożenie:**  
- Nowa strona `[locale]/partnerzy` lub `[locale]/freebety`.  
- Dane: tablica obiektów (nazwa, url, opis, bonus, logo) – na start w pliku JS/JSON lub w DB.  
- Prosty layout: karty z CTA.

**Trudność:** niska.  
**Czas:** ok. 2–3 h.

### 1.3 E-mail z raportem AI + link do partnera

**Co:** W stopce lub na końcu raportu AI (Python, `email_sender`) dodać jeden blok: *„Zobacz kursy na dzisiejsze mecze u naszego partnera [nazwa]”* z linkiem afiliacyjnym.

**Dlaczego:**  
Odbiorca raportu to osoba zainteresowana typowaniem. Jedna linijka w mailu = dodatkowy kanał rejestracji dla bukmachera i przychód dla Ciebie.

**Wdrożenie:**  
- W `email_sender` (Python) lub w szablonie (jeśli jest) dodać stały fragment HTML/tekstu z `PARTNER_BETTING_URL` z env.  
- Zachować dyskretny charakter (jedna linijka), żeby raport nie wyglądał na „reklamówkę”.

**Trudność:** niska.  
**Czas:** ok. 1 h.

---

## 2. Zaangażowanie społeczności (funkcje „których nie ma”)

### 2.1 Szybka ankieta przy meczu: „Kto wygra?” (1–2–X)

**Co:** W panelu meczu (obok czatu), zanim się zacznie lub na live: trzy przyciski *Gospodarze / Remis / Goście*. Użytkownik klika raz. Wynik zbierany per fixture (np. w Redis lub MongoDB).

**Wyświetlanie:**  
„Społeczność: 62% Gospodarze, 18% Remis, 20% Goście” – obok analizy AI. Można dodać mały wykres (pasek lub donut).

**Dlaczego to jest „nie typowe”:**  
Większość serwisów ma albo tylko komentarze, albo tylko typy ekspertów. Tutaj: **zbiorowa prognoza widzów tego konkretnego meczu** w jednym miejscu, od razu przy czacie i AI. To buduje poczucie „my tu razem obstawiamy/oceniamy”.

**Wdrożenie:**  
- Model: np. `MatchPoll` lub kolekcja `polls`: `fixtureId`, `votesHome`, `votesDraw`, `votesAway`, opcjonalnie `userId` (żeby jeden użytkownik = jeden głos na mecz).  
- API: `POST /api/football/poll-vote` (fixtureId, choice: 1|X|2), `GET /api/football/poll?fixtureId=...` (zwraca liczby i %).  
- Front: w `ChatComponent` lub w bloku „predykcje/statystyki” mały komponent Poll (3 przyciski + wyniki).  
- Limit: 1 głos na użytkownika (lub na IP dla anonimów) na fixture.

**Trudność:** niska–średnia.  
**Czas:** ok. 4–6 h.

### 2.2 „Przewidywanie goli” (konkretna liczba)

**Co:** Opcjonalne rozszerzenie ankiety: drugi wybór *„Ile bramek w meczu?”* – przedział 0–1, 2–3, 4–5, 6+ (lub dokładna liczba 0–6+). Wyniki znów jako „Społeczność: 45% 2–3 gole” itd.

**Dlaczego:**  
Wykorzystujesz to, co już macie (analiza AI mówi o golach). Społeczność „typuje” też gole; można później porównać z AI („AI: 2–3, Społeczność: 2–3”).

**Wdrożenie:**  
- Te same endpointy co ankieta 1–2–X, rozszerzone o pole `goalsRange` lub osobna kolekcja/klucze Redis.  
- UI: drugi rząd przycisków lub rozwijana lista.

**Trudność:** niska.  
**Czas:** ok. 2–3 h (po zrobieniu 2.1).

### 2.3 „Tipster tygodnia” / „Osoba z najlepszą passą”

**Co:** Na podstawie **historii głosów w ankietach** (kto głosował na wygranego / na właściwy przedział bramek) liczyć „trafienia” użytkownika. Na stronie głównej lub w menu: *„Tipster tygodnia: [nick] – 12/15 trafionych wyników”*.

**Dlaczego:**  
Gamifikacja bez wprowadzania prawdziwych typów za pieniądze. Ludzie lubią rankingi i „kto ma rację”. Bukmacherzy mogą to wykorzystać (np. „typster tygodnia dostaje freebet od partnera”) – wtedy i społeczność, i partner zyskują.

**Wdrożenie:**  
- Przy zapisie głosu zapisywać też `userId` (jeśli zalogowany).  
- Po zakończeniu meczu (wynik z API-Football) – job/cron lub on-demand: przeliczyć kto trafił 1–2–X i ewentualnie gole.  
- Kolekcja `UserStats` lub rozszerzenie `User`: `correctPolls`, `totalPolls`, `streak`, `lastUpdated`.  
- Strona lub widget: ranking (top 10) + „Tipster tygodnia”.

**Trudność:** średnia (potrzebny wynik meczu i okresowe przeliczanie).  
**Czas:** ok. 6–10 h.

---

## 3. Wykorzystanie tego, co już macie

### 3.1 „Mecz dnia” z wyróżnieniem

**Co:** Jeden mecz dziennie oznaczony jako „Mecz dnia” (np. wybrany ręcznie w adminie lub automatycznie – np. najpopularniejsza liga o danej godzinie). Na liście przedmeczowej: badge „Mecz dnia”, ewentualnie inny kolor lub ikonka.

**Dlaczego:**  
Zachęca do wejścia w jeden konkretny mecz i do czatu; można tam zawsze wstawić link do partnera („Obstaw Mecz Dnia u partnera”).

**Wdrożenie:**  
- Konfig: w DB lub env `fixtureId` / `leagueId` + data, albo reguła (np. pierwszy mecz Ekstraklasy o 18:00).  
- Na liście fixture’ów w `przedmeczowe/page.js` sprawdzać `fixtureId === meczDnia` i renderować badge.

**Trudność:** niska.  
**Czas:** ok. 2 h.

### 3.2 Powiadomienie „Twój mecz za 15 minut”

**Co:** Użytkownik dodaje mecz do „obserwowanych” (serce / gwiazdka). 15 min przed startem (lub inny przedział) dostaje powiadomienie: e-mail lub (później) push.

**Dlaczego:**  
Wraca na stronę w kluczowym momencie; więcej wejść na czat i na live. Zwiększa szansę kliknięcia w link partnera.

**Wdrożenie:**  
- Kolekcja `UserWatchlist`: `userId`, `fixtureIds[]`, `notifyMinutesBefore` (np. 15).  
- Cron (np. co 5 min): sprawdzić mecze startujące za N minut, dla każdego fixture znaleźć userów z watchlisty, wysłać e-mail (istniejący `mailer`).  
- Front: przy meczu przycisk „Przypomnij mi” → zapis w watchlist.

**Trudność:** średnia.  
**Czas:** ok. 4–6 h.

### 3.3 Raport AI tylko dla zalogowanych (lub z limitem) + CTA partnera

**Co:** Obecnie raport e-mail jest limitowany (1/dzień). Można zostawić to tak i przy limicie pokazać: *„Osiągnąłeś limit. Zarejestruj się u partnera [X] i odbierz freebet – a my damy Ci dodatkowy raport”* (np. po rejestracji przez Twój link i weryfikacji – ręcznie lub przez webhook partnera – odblokować jeden raport).  
Prostsza wersja: po prostu przy limicie raportu pokazać przycisk do rejestracji u partnera („Freebet + więcej analiz”).

**Wdrożenie:**  
- Tekst w UI na `/pilka-nozna/ai-agent` gdy limit: dodać blok z linkiem afiliacyjnym.  
- Opcjonalnie: w backendzie po rejestracji z `ref=partner_id` zapisać w User i dać np. +1 raport.

**Trudność:** niska (tylko CTA) do średniej (integracja z partnerem).  
**Czas:** 1–4 h.

---

## 4. Pomysły „wyróżniające” (średni nakład)

### 4.1 „Sentyment czatu” na żywo

**Co:** Na live: obok czatu krótki komunikat typu *„Sentyment: 78% użytkowników pisze pozytywnie o gospodarzach”*. Źródło: prosta analiza ostatnich N wiadomości (słowa kluczowe / emocje) – może uproszczony model (np. lista słów „dobry”, „słaby”, „gol”) lub w przyszłości mały NLP.

**Dlaczego:**  
Nikt w typowych serwisach bukmacherskich nie pokazuje „co ludzie na czacie myślą w tym momencie”. To unikalna cecha: połączenie czatu + sport + live.

**Wdrożenie:**  
- Co 1–2 min zbierane ostatnie 50–100 wiadomości z pokoju; prosta heurystyka (słowa pozytyw/negatyw wobec „gospodarze”/„goście”) lub zewnętrzne API sentiment.  
- Socket lub polling: front odświeża „Sentyment” w bloku nad/bok czatu.

**Trudność:** średnia.  
**Czas:** ok. 6–8 h (wersja uproszczona).

### 4.2 Historia „co społeczność typowała” vs wynik

**Co:** Po zakończeniu meczu na stronie wyników (lub w modalu „Wyniki”) przy danym meczu: *„Społeczność typowała: 62% 1, 18% X, 20% 2. Wynik: 2–1 (gospodarze). 62% trafiło.”*

**Dlaczego:**  
Użytkownicy zobaczą, że ich głos „liczy się” i jest podsumowany; buduje zaufanie do ankiety i zachęca do głosowania w kolejnych meczach.

**Wdrożenie:**  
- Zapisywać wyniki meczów (np. w Redis lub w kolekcji `FixtureResults` – fixtureId, goalsHome, goalsAway, finishedAt).  
- Strona/modal wyników: dla każdego meczu pobrać wyniki ankiety (2.1) + wynik; wyliczyć % trafień i wyświetlić.

**Trudność:** niska–średnia (zależnie od tego, jak już trzymacie wyniki).  
**Czas:** ok. 4 h (po wdrożeniu 2.1 i zapisie wyników).

---

## 5. Monetyzacja bez bukmacherów (dodatkowo)

### 5.1 Premium: więcej analiz / więcej raportów

**Co:** Limit 3 analiz/dzień i 1 raport/dzień zostaje dla darmowych. Po opłacie (np. subskrypcja miesięczna): np. 20 analiz/dzień i 3 raporty/dzień (lub nielimitowane).

**Wdrożenie:**  
- W `User` pole `plan: 'free' | 'premium'` (lub `premiumUntil: Date`).  
- W API analiz i raportu: jeśli `user.plan === 'premium'`, nie sprawdzać limitu (lub wyższy limit).  
- Płatności: Stripe (subskrypcja) lub jednorazowy zakup – osobny flow rejestracji płatności.

**Trudność:** średnia–duża.  
**Czas:** zależnie od wyboru płatności (Stripe ~1–2 dni).

### 5.2 Reklama displayowa tylko w wybranych miejscach

**Co:** Jedna lub dwie strefy reklamowe (np. pod listą meczów, w sidebarze) – Google AdSense lub bezpośrednio od bukmacherów (bannery).  
**Uwaga:** W wielu krajach reklamy bukmacherskie są regulowane – warto sprawdzić prawo.

---

## 6. Kolejność wdrożenia (rekomendacja)

1. **Szybko (1–2 dni)**  
   - 1.1 Przycisk „Zobacz kursy u partnera” przy analizie.  
   - 1.2 Strona „Partnerzy” / „Freebety” z linkami afiliacyjnymi.  
   - 1.3 Link do partnera w e-mailu z raportem AI.

2. **Krótki horyzont (tydzień)**  
   - 2.1 Ankieta „Kto wygra?” (1–2–X) przy meczu + wyświetlanie „Społeczność: X% / Y% / Z%”.  
   - 3.1 „Mecz dnia” z badge’em.  
   - 3.3 CTA partnera przy limicie raportu (i ewentualnie przy limicie analiz).

3. **Średni horyzont (2–3 tygodnie)**  
   - 2.2 Przewidywanie goli (ankieta).  
   - 2.3 Tipster tygodnia (ranking trafień z ankiet).  
   - 3.2 „Przypomnij mi” (watchlist + e-mail).  
   - 4.2 „Co społeczność typowała” vs wynik po meczu.

4. **Później (gdy będzie ruch i partnerzy)**  
   - 4.1 Sentyment czatu na żywo.  
   - 5.1 Premium (więcej analiz/raportów).  
   - 5.2 Reklamy (jeśli zgodne z prawem).

---

## 7. Podsumowanie

- **Monetyzacja:** Zacznij od linków afiliacyjnych przy analizie, w menu (Freebety/Partnerzy) i w raporcie e-mail – mały nakład, szybki test z bukmacherami.  
- **Społeczność:** Ankieta 1–2–X (i gole) przy meczu + „Społeczność: X%” to funkcja, której brakuje na rynku i która naturalnie łączy się z Twoim czatem i AI.  
- **Wyróżnienie:** „Tipster tygodnia”, „Mecz dnia”, „Co społeczność typowała vs wynik” i w przyszłości „Sentyment czatu” budują obraz platformy opartej na zbiorowej mądrości i live’ie, a nie tylko na suchych kursach.  
- Wszystko można budować krok po kroku na obecnym stacku (Next.js, Express, Socket.IO, MongoDB, Redis, Python), bez rewolucji w architekturze.

Jeśli wskażesz, który punkt chcesz wdrożyć pierwszy (np. 1.1 + 2.1), mogę rozpisać konkretne zmiany w plikach (endpointy, modele, komponenty).
