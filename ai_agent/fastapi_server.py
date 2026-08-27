import os
import secrets

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, EmailStr

from config import INTERNAL_API_SECRET
from main import run_agent_for_email

app = FastAPI(title="AI Agent API", version="1.0.0")

# Brak CORS-u celowo: ta usługa jest wołana wyłącznie serwer-serwer przez Next.js,
# nigdy z przeglądarki. Wcześniej allow_origins=["*"] razem z allow_credentials=True
# pozwalało dowolnej stronie uruchomić agenta i spalić budżet OpenAI/API-Football.


class EmailRequest(BaseModel):
    email: EmailStr
    language: str = "pl"  # Domyślnie polski


def _require_internal_secret(provided):
    """Limity dzienne żyją w Next.js, więc bezpośredni dostęp do /run musi być zamknięty."""
    if not INTERNAL_API_SECRET:
        raise HTTPException(
            status_code=503,
            detail="INTERNAL_API_SECRET nie jest ustawiony — endpoint zablokowany.",
        )
    if not provided or not secrets.compare_digest(provided, INTERNAL_API_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/")
def root():
    return {"message": "AI Agent API is running"}


@app.post("/run")
async def run_agent(request: EmailRequest, x_internal_secret: str = Header(default="")):
    """
    Endpoint do uruchomienia agenta AI dla podanego emaila.

    Args:
        request: JSON z polami "email" i "language" (opcjonalne, domyślnie "pl")
        x_internal_secret: wspólny sekret ustawiony po stronie Next.js

    Returns:
        dict: {"success": bool, "message": str}
    """
    _require_internal_secret(x_internal_secret)

    try:
        # Walidacja języka (tylko 'pl' lub 'en')
        language = request.language if request.language in ["pl", "en"] else "pl"
        result = run_agent_for_email(request.email, language)

        if result["success"]:
            return result
        raise HTTPException(status_code=400, detail=result["message"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Wewnętrzny błąd serwera: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 5000))
    # Nasłuch tylko na pętli lokalnej — usługa nie ma być osiągalna z sieci.
    host = os.getenv("FASTAPI_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port)
