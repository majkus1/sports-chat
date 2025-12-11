from data_fetcher import get_today_fixtures, get_predictions, get_odds
from ai_analyzer import analyze_match_with_ai
from datetime import datetime
import pytz


def build_agent_report(language="pl"):
    """
    Generuje raport z analizą meczów.
    
    Args:
        language: Język raportu ("pl" lub "en"), domyślnie "pl"
    """
    fixtures = get_today_fixtures()
    if not fixtures:
        return "Brak meczów na dziś." if language == 'pl' else "No matches today."

    full_report = ""

    for f in fixtures:
        fixture_id = f["fixture"]["id"]
        home = f["teams"]["home"]["name"]
        away = f["teams"]["away"]["name"]

        # === POBIERAMY DATĘ MECZU Z FIXTURE I KONWERTUJEMY NA CZAS POLSKI ===
        raw_date = f["fixture"]["date"]             # format np. "2025-01-08T19:45:00+00:00" lub "2025-01-08T19:45:00Z"
        # Parsuj datę (normalizuj format)
        if raw_date.endswith('Z'):
            date_str = raw_date.replace("Z", "+00:00")
        elif '+' not in raw_date and '-' not in raw_date[-6:]:
            # Jeśli nie ma timezone, dodaj UTC
            date_str = raw_date + "+00:00"
        else:
            date_str = raw_date
        
        date_obj = datetime.fromisoformat(date_str)
        
        # Konwertuj na czas polski (UTC+1 lub UTC+2 w zależności od czasu letniego)
        poland_timezone = pytz.timezone('Europe/Warsaw')
        
        # Jeśli data nie ma timezone, traktuj jako UTC
        if date_obj.tzinfo is None:
            utc_timezone = pytz.UTC
            date_obj = utc_timezone.localize(date_obj)
        
        # Konwertuj na czas polski
        poland_time = date_obj.astimezone(poland_timezone)
        match_time = poland_time.strftime("%Y-%m-%d %H:%M")

        predictions = get_predictions(fixture_id)
        odds = get_odds(fixture_id)

        analysis = analyze_match_with_ai(f, predictions, odds, language)

        full_report += "\n==============================\n"
        full_report += f"{home} vs {away}\n"
        full_report += f"{match_time}\n"   # <-- DODANA LINIA
        full_report += analysis  # <-- TYLKO analiza od AI
        full_report += "\n"

    return full_report
