/**
 * Konfiguracja PM2 dla serwera.
 *
 * Dwa procesy: aplikacja Next (port 3001) i serwer socketów (port 3000). Ten drugi
 * prowadzi też dobowe rozliczanie typów — patrz lib/picks/scheduler.cjs — więc nie ma
 * potrzeby konfigurowania systemowego crona.
 *
 * Wpis `fastapi-agent` został usunięty razem z odłączeniem starego agenta raportów:
 * aplikacja nie woła już FastAPI, więc uruchamianie tego procesu zajmowałoby pamięć
 * i przewracało `pm2 start` na maszynach bez Pythona. Katalog `ai_agent/` zostaje w repo.
 */
module.exports = {
  apps: [
    {
      name: "czat-sportowy-backend",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      error_file: "./logs/backend-error.log",
      out_file: "./logs/backend-out.log",
      env: {
        NODE_ENV: "development",
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        /*
         * Harmonogram rozliczania typów.
         *
         * `NEXT_INTERNAL_URL` musi wskazywać aplikację Next po pętli lokalnej — zadanie
         * woła jej trasę `/api/cron/settle-picks`, więc nie przechodzi przez nginx
         * ani przez internet. Godzina 4:00 daje pewność, że nawet późne mecze z Ameryki
         * Południowej mają już oficjalne wyniki.
         */
        NEXT_INTERNAL_URL: "http://127.0.0.1:3001",
        SETTLE_PICKS_HOUR: 4,
      },
    },
    {
      name: "czat-sportowy-frontend",
      script: "npm",
      args: "start",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1G",
      error_file: "./logs/frontend-error.log",
      out_file: "./logs/frontend-out.log",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
