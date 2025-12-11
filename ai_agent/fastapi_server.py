from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from main import run_agent_for_email
import os

app = FastAPI(title="AI Agent API", version="1.0.0")

# CORS middleware - pozwala na requesty z Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # W produkcji ustaw konkretne domeny
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EmailRequest(BaseModel):
    email: EmailStr
    language: str = "pl"  # Domyślnie polski


@app.get("/")
def root():
    return {"message": "AI Agent API is running"}


@app.post("/run")
async def run_agent(request: EmailRequest):
    """
    Endpoint do uruchomienia agenta AI dla podanego emaila.
    
    Args:
        request: JSON z polami "email" i "language" (opcjonalne, domyślnie "pl")
        
    Returns:
        dict: {"success": bool, "message": str}
    """
    try:
        # Walidacja języka (tylko 'pl' lub 'en')
        language = request.language if request.language in ['pl', 'en'] else 'pl'
        result = run_agent_for_email(request.email, language)
        
        if result["success"]:
            return result
        else:
            raise HTTPException(status_code=400, detail=result["message"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Wewnętrzny błąd serwera: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5000))
    uvicorn.run(app, host="0.0.0.0", port=port)


