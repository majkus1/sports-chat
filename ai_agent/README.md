# AI Agent - FastAPI Server

Serwer FastAPI do generowania i wysyłania raportów analizy meczów piłkarskich.

## Instalacja

1. Zainstaluj zależności:
```bash
pip install -r requirements.txt
```

## Konfiguracja

Upewnij się, że plik `config.py` zawiera poprawne dane:
- `SMTP_EMAIL` - adres email do wysyłki
- `SMTP_APP_PASSWORD` - hasło aplikacji Gmail
- `API_FOOTBALL_KEY` - klucz API do API-Football
- `OPENAI_API_KEY` - klucz API do OpenAI

## Uruchomienie

### Lokalnie (development):
```bash
python fastapi_server.py
```

Serwer uruchomi się na porcie 5000 (domyślnie) lub na porcie określonym w zmiennej środowiskowej `PORT`.

### Produkcja (PM2):

1. Utwórz plik `ecosystem.config.js` w głównym katalogu projektu:
```javascript
module.exports = {
  apps: [
    {
      name: 'fastapi-agent',
      script: 'fastapi_server.py',
      interpreter: 'python3',
      cwd: './ai_agent',
      env: {
        PORT: 5000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '1G'
    }
  ]
};
```

2. Uruchom przez PM2:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Endpointy

### POST /run
Uruchamia agenta AI dla podanego emaila.

**Request:**
```json
{
  "email": "example@email.com"
}
```

**Response (sukces):**
```json
{
  "success": true,
  "message": "Raport został wygenerowany i wysłany na podany email."
}
```

**Response (błąd):**
```json
{
  "detail": "Błąd podczas generowania raportu: ..."
}
```

## Integracja z Next.js

W pliku `.env` lub `.env.local` w projekcie Next.js dodaj:
```
FASTAPI_URL=http://localhost:5000
```

W produkcji na VPS:
```
FASTAPI_URL=http://localhost:5000
```
lub
```
FASTAPI_URL=http://your-server-ip:5000
```


