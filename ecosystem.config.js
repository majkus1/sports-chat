module.exports = {
  apps: [
    {
      name: "czat-sportowy-backend", // Nazwa backendu w PM2
      script: "server.js", // Ścieżka do pliku serwera
      env: {
        NODE_ENV: "development", // Środowisko domyślne
      },
      env_production: {
        NODE_ENV: "production", // Środowisko produkcyjne
      },
    },
    {
      name: "czat-sportowy-frontend", // Nazwa frontendu w PM2
      script: "npm", // Polecenie do uruchomienia frontendu
      args: "start", // Argumenty przekazane do `npm`
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
    {
      name: "fastapi-agent", // Nazwa agenta AI w PM2
      script: "fastapi_server.py", // Plik serwera FastAPI
      interpreter: "python3", // Interpreter Python (użyj python3)
      cwd: "./ai_agent", // Katalog roboczy - folder ai_agent
      env: {
        PORT: 5000,
        PYTHONUNBUFFERED: "1", // Ważne dla logów w PM2
      },
      env_production: {
        PORT: 5000,
        PYTHONUNBUFFERED: "1",
      },
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "1G",
      error_file: "./logs/fastapi-error.log",
      out_file: "./logs/fastapi-out.log",
    },
  ],
};

