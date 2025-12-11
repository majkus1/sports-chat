from agent import build_agent_report
from email_sender import send_email


def run_agent_for_email(email, language="pl"):
    """
    Generuje raport i wysyła go na podany email.
    
    Args:
        email: Adres email odbiorcy raportu
        language: Język raportu ("pl" lub "en"), domyślnie "pl"
        
    Returns:
        dict: {"success": True/False, "message": "..."}
    """
    try:
        # Walidacja języka
        language = language if language in ['pl', 'en'] else 'pl'
        
        print(f"Analizuję mecze dla {email} w języku {language}...")
        report = build_agent_report(language)

        # Komunikat w odpowiednim języku
        no_matches_msg = "Brak meczów na dziś." if language == 'pl' else "No matches today."
        if not report or report == no_matches_msg:
            return {
                "success": False,
                "message": no_matches_msg
            }

        # Temat emaila
        email_subject = "AGENT AI CZATSPORTOWY.PL"
        
        print(f"Wysyłam email na {email}...")
        send_email(email_subject, report, recipient_email=email, language=language)

        print("Gotowe!")
        success_msg = "Raport został wygenerowany i wysłany na podany email." if language == 'pl' else "Report has been generated and sent to the provided email."
        return {
            "success": True,
            "message": success_msg
        }
    except Exception as e:
        error_msg = f"Błąd podczas generowania raportu: {str(e)}" if language == 'pl' else f"Error generating report: {str(e)}"
        print(error_msg)
        return {
            "success": False,
            "message": error_msg
        }


if __name__ == "__main__":
    print("Analizuję mecze...")
    report = build_agent_report("pl")  # Domyślnie polski dla bezpośredniego uruchomienia

    print("Wysyłam email...")
    send_email("AGENT AI CZATSPORTOWY.PL", report, language="pl")

    print("Gotowe!")
