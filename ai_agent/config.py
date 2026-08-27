"""Konfiguracja agenta AI — wszystkie wartości pochodzą z ai_agent/.env (patrz .env.example).

Wcześniej klucze były wpisane w tym pliku. Plik był w .gitignore, ale jego skompilowana
wersja trafiała do __pycache__, więc sekrety i tak lądowały poza zamierzonym miejscem.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")


def _required(name):
    """Brak klucza ma wysypać proces na starcie, a nie dopiero przy pierwszym wywołaniu API."""
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(
            f"Brak zmiennej środowiskowej {name}. Uzupełnij ai_agent/.env (wzór w .env.example)."
        )
    return value


API_FOOTBALL_KEY = _required("API_FOOTBALL_KEY")
API_FOOTBALL_HOST = os.getenv("API_FOOTBALL_HOST", "v3.football.api-sports.io")

OPENAI_API_KEY = _required("OPENAI_API_KEY")

SMTP_EMAIL = _required("SMTP_EMAIL")
SMTP_APP_PASSWORD = _required("SMTP_APP_PASSWORD")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))

RECIPIENT_EMAIL = os.getenv("RECIPIENT_EMAIL", SMTP_EMAIL)

# Wspólny sekret dla wywołań serwer-serwer z Next.js. Pusty = endpoint /run zablokowany.
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "").strip()
