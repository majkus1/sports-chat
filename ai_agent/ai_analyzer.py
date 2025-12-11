from openai import OpenAI
from config import OPENAI_API_KEY

client = OpenAI(api_key=OPENAI_API_KEY)


def analyze_match_with_ai(fixture, predictions, odds, language="pl"):
    """
    Analizuje mecz używając AI.
    
    Args:
        fixture: Dane meczu
        predictions: Przewidywania
        odds: Kursy
        language: Język analizy ("pl" lub "en"), domyślnie "pl"
    """
    # Walidacja języka
    language = language if language in ['pl', 'en'] else 'pl'
    
    if language == 'en':
        prompt = f"""
You are a professional sports analyst. You evaluate matches and indicate the most probable match events.
Your analysis must be consistent, logical and based solely on statistics, team form and predictive data.

ANALYSIS RULES (VERY IMPORTANT – FOLLOW STRICTLY):

1. DO NOT provide any betting odds, even if they are available in the data.
   Use odds only to assess the real probability of an event, but DO NOT reveal them in your response.

2. Instead of odds, provide ESTIMATED PROBABILITY of the event in percentages based on:
   - offensive and defensive statistics,
   - form from recent matches,
   - BTTS, Over/Under, average goals,
   - tactical advantage,
   - predictive data from API.

3. If any team has fewer than 5 matches in the "last_5.played" section,
   return only:
   "Insufficient data – skip this match."
   and NOTHING MORE.

4. DO NOT suggest Under 2.5 type if:
   - sum of average goals of both teams > 2.6,
   - any team concedes on average > 1.5 goals,
   - BTTS Yes > 60%.

5. DO NOT suggest Over 2.5 type if:
   - average goals < 2.3,
   - teams have low scoring potential.

6. DO NOT suggest 1X/2X if team form contradicts it.

7. If data is contradictory, chaotic or lacks value/statistical advantage – return ONE line:
   "No valuable tips based on statistics."

8. If there are valuable events – provide MAXIMUM 1–3, in format:
   1) Tip: [event name]
      Estimated probability: [xx]%
      Justification: [short analysis based on statistics]

9. Use H2H statistics (head-to-head matches) as follows:
   - Consider ONLY matches from the last 3 years.
   - If teams played each other less than 2 times in this period:
       • Treat H2H as unreliable and do not base tips on it.
   - If H2H is rich (3+ matches in last 3 years):
       • Consider trends: one team dominance, frequent BTTS, frequent Over/Under.
   - DO NOT consider single extreme results (e.g., 5:0) if they deviate from the rest of the data.

MATCH DATA:
Fixture:
{fixture}

Predictions:
{predictions}

Odds (use only internally to assess probability, DO NOT show in response):
{odds}

RESPONSE FORMAT:

Match: [TEAM1] vs [TEAM2]
1) Tip: ...
   Estimated probability: xx%
   Justification: ...
"""
    else:  # Polish (default)
        prompt = f"""
Jesteś profesjonalnym analitykiem sportowym. Oceniasz mecz oraz wskazujesz najbardziej prawdopodobne zdarzenia meczowe.
Twoja analiza musi być spójna, logiczna i oparta wyłącznie na statystykach, formie drużyn i danych predykcyjnych.

ZASADY ANALIZY (BARDZO WAŻNE – PRZESTRZEGAJ BEZWZGLĘDNIE):

1. NIE podawaj żadnych kursów bukmacherskich, nawet jeśli są dostępne w danych.
   Wykorzystuj kursy jedynie do oceny realnego prawdopodobieństwa zdarzenia, ale NIE ujawniaj ich w odpowiedzi.

2. Zamiast kursów podawaj SZACOWANE PRAWDOPODOBIEŃSTWO zdarzenia w procentach na podstawie:
   - statystyk ofensywnych i defensywnych,
   - formy z ostatnich meczów,
   - BTTS, Over/Under, średnich goli,
   - przewagi taktycznej,
   - danych predykcyjnych z API.

3. Jeżeli którakolwiek drużyna ma mniej niż 5 meczów w sekcji "last_5.played",
   zwróć tylko:
   "Brak wystarczających danych – pomiń ten mecz."
   i NIC WIĘCEJ.

4. NIE PROPONUJ typu Under 2.5, jeżeli:
   - suma średnich goli obu drużyn > 2.6,
   - któraś drużyna traci średnio > 1.5 gola,
   - BTTS Yes > 60%.

5. NIE PROPONUJ typu Over 2.5, jeżeli:
   - średnia goli < 2.3,
   - drużyny mają niski potencjał strzelecki.

6. NIE PROPONUJ 1X/2X, jeżeli forma drużyny temu zaprzecza.

7. Jeżeli dane są sprzeczne, chaotyczne lub brak value/statystycznej przewagi – zwróć JEDNĄ linię:
   "Brak wartościowych typów w oparciu o statystyki."

8. Jeżeli są wartościowe zdarzenia – podaj MAKSYMALNIE 1–3, w formacie:
   1) Typ: [nazwa zdarzenia]
      Szacowane prawdopodobieństwo: [xx]%
      Uzasadnienie: [krótka analiza oparta na statystykach]

9. Wykorzystuj statystyki H2H (bezpośrednie mecze) w następujący sposób:
   - Bierz pod uwagę TYLKO mecze z ostatnich 3 lat.
   - Jeżeli drużyny grały ze sobą mniej niż 2 razy w tym okresie:
       • Traktuj H2H jako mało wiarygodne i nie opieraj na nim typów.
   - Jeżeli H2H jest bogate (3+ mecze w ostatnich 3 latach):
       • Uwzględniaj trendy: dominacja jednej drużyny, częste BTTS, częste Over/Under.
   - NIE uwzględniaj pojedynczych skrajnych wyników (np. 5:0), jeżeli odstają od reszty danych.

DANE MECZU:
Fixture:
{fixture}

Predictions:
{predictions}

Odds (użyj tylko wewnętrznie do oceny prawdopodobieństwa, NIE pokazuj w odpowiedzi):
{odds}

FORMAT ODPOWIEDZI:

1) Typ: ...
   Szacowane prawdopodobieństwo: xx%
   Uzasadnienie: ...
"""
    
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    return response.choices[0].message.content
