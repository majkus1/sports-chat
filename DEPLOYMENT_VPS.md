# Instrukcja wdrożenia na VPS

## Wymagania

1. **Redis** - musi być uruchomiony i dostępny
2. **FastAPI** - serwer agenta AI musi być uruchomiony
3. **Next.js** - aplikacja główna
4. **Zmienne środowiskowe** - odpowiednio skonfigurowane

## Konfiguracja zmiennych środowiskowych

### W pliku `.env` lub `.env.production` dla Next.js:

```bash
# Redis (używany do limitów agenta i analiz)
REDIS_URL=redis://localhost:6379
# lub jeśli Redis jest na innym serwerze:
# REDIS_URL=redis://your-redis-server:6379

# FastAPI Agent (serwer agenta AI)
FASTAPI_URL=http://localhost:5000
# Jeśli FastAPI jest na innym porcie lub serwerze:
# FASTAPI_URL=http://localhost:5000

# JWT Secret (dla autentykacji)
JWT_SECRET=your-secret-key-here
REFRESH_TOKEN_SECRET=your-refresh-secret-key-here

# MongoDB (jeśli używane)
MONGODB_URI=your-mongodb-connection-string
```

## Uruchomienie serwisów

### 1. Redis
```bash
# Sprawdź czy Redis działa
redis-cli ping
# Powinno zwrócić: PONG

# Jeśli nie działa, uruchom:
sudo systemctl start redis
sudo systemctl enable redis
```

### 2. FastAPI Agent (przez PM2)

Utwórz plik `ecosystem.config.js` w głównym katalogu:

```javascript
module.exports = {
  apps: [
    {
      name: 'nextjs-app',
      script: 'npm',
      args: 'start',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'fastapi-agent',
      script: 'fastapi_server.py',
      interpreter: 'python3',
      cwd: './ai_agent',
      env: {
        PORT: 5000,
        PYTHONUNBUFFERED: '1'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
      error_file: './logs/fastapi-error.log',
      out_file: './logs/fastapi-out.log'
    }
  ]
};
```

Uruchom:
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Weryfikacja działania

### 1. Sprawdź czy Redis działa:
```bash
redis-cli ping
```

### 2. Sprawdź czy FastAPI działa:
```bash
curl http://localhost:5000/
# Powinno zwrócić: {"message":"AI Agent API is running"}
```

### 3. Sprawdź limity agenta:

Limity są przechowywane w Redis z kluczami:
- `agent_limit:ip:${ip}:${today}` - dla niezalogowanych użytkowników
- `agent_limit:user:${userId}:${today}` - dla zalogowanych użytkowników

Możesz sprawdzić w Redis:
```bash
redis-cli
> KEYS agent_limit:*
> GET agent_limit:ip:192.168.1.1:2025-12-11
```

## Jak działa na VPS:

1. **Wykrywanie IP**: 
   - Automatycznie wykrywa prawdziwe IP użytkownika przez reverse proxy/load balancer
   - Obsługuje nagłówki: `x-forwarded-for`, `x-real-ip`, `x-client-ip`
   - Zabezpiecza przed localhost (używa 'localhost' tylko jeśli wszystkie IP są localhost)

2. **Limity**:
   - Niezalogowany: 1 raz dziennie na IP
   - Zalogowany: 1 raz dziennie na user ID
   - Automatyczne resetowanie o północy (TTL w Redis)

3. **Redis**:
   - Jeśli Redis nie jest dostępny, aplikacja działa (fail-open), ale limity nie działają
   - W produkcji upewnij się że Redis działa!

4. **FastAPI**:
   - Musi być uruchomiony na porcie 5000 (lub innym, wtedy zmień FASTAPI_URL)
   - Next.js komunikuje się z FastAPI przez localhost (na tym samym serwerze)

## Troubleshooting

### Problem: Limity nie działają
- Sprawdź czy Redis działa: `redis-cli ping`
- Sprawdź logi Next.js: `pm2 logs nextjs-app`
- Sprawdź zmienną środowiskową: `REDIS_URL`

### Problem: FastAPI nie odpowiada
- Sprawdź czy FastAPI działa: `curl http://localhost:5000/`
- Sprawdź logi: `pm2 logs fastapi-agent`
- Sprawdź zmienną środowiskową: `FASTAPI_URL`

### Problem: IP wykrywa się jako localhost
- Sprawdź konfigurację reverse proxy (nginx/apache)
- Upewnij się że nagłówki `x-forwarded-for` lub `x-real-ip` są przekazywane
- W logach Next.js zobaczysz wykryte IP (w development mode)

