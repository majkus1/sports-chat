import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import SMTP_EMAIL, SMTP_APP_PASSWORD, SMTP_SERVER, SMTP_PORT, RECIPIENT_EMAIL


def send_email(subject, body, recipient_email=None, language="pl"):
    """
    Wysyła email z raportem w formacie HTML.
    
    Args:
        subject: Temat wiadomości
        body: Treść wiadomości (raport)
        recipient_email: Adres email odbiorcy (opcjonalny, domyślnie RECIPIENT_EMAIL z config)
        language: Język emaila ("pl" lub "en"), domyślnie "pl"
    """
    if recipient_email is None:
        recipient_email = RECIPIENT_EMAIL
    
    # Teksty nagłówka w odpowiednim języku
    header_texts = {
        "pl": {
            "title": "Agent AI czatsportowy.pl",
            "subtitle": "Sekcja: Piłka nożna",
            "description": "Poniżej analizy najbliższych kilku meczów:"
        },
        "en": {
            "title": "AI Agent czatsportowy.pl",
            "subtitle": "Section: Football",
            "description": "Below are the analyses of the upcoming matches:"
        }
    }
    
    texts = header_texts.get(language, header_texts["pl"])
    
    # Konwersja raportu na HTML (zachowanie formatowania)
    report_html = body.replace('\n', '<br>')
    report_html = report_html.replace('==============================', '<hr style="border: 1px solid #ddd; margin: 20px 0;">')
    
    # Szablon HTML
    html_content = f"""
    <!DOCTYPE html>
    <html lang="{language}">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 800px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
            }}
            .email-container {{
                background-color: #ffffff;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }}
            .header {{
                text-align: center;
                padding-bottom: 20px;
                border-bottom: 3px solid #173b45;
                margin-bottom: 30px;
            }}
            .header h1 {{
                color: #173b45;
                margin: 0;
                font-size: 28px;
                font-weight: bold;
            }}
            .header h2 {{
                color: #2ecc58;
                margin: 10px 0 0 0;
                font-size: 18px;
                font-weight: normal;
            }}
            .description {{
                color: #666;
                font-size: 16px;
                margin-bottom: 30px;
                padding: 15px;
                background-color: #f9f9f9;
                border-left: 4px solid #173b45;
                border-radius: 4px;
            }}
            .report-content {{
                color: #333;
                font-size: 14px;
                line-height: 1.8;
            }}
            .report-content hr {{
                border: none;
                border-top: 2px solid #e0e0e0;
                margin: 25px 0;
            }}
            .footer {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 1px solid #e0e0e0;
                text-align: center;
                color: #999;
                font-size: 12px;
            }}
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <h1>{texts["title"]}</h1>
                <h2>{texts["subtitle"]}</h2>
            </div>
            <div class="description">
                {texts["description"]}
            </div>
            <div class="report-content">
                {report_html}
            </div>
            <div class="footer">
                <p>czatsportowy.pl - Twój przewodnik po świecie sportu</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # Tworzenie wiadomości multipart (HTML + plain text fallback)
    # WAŻNE: Plain text musi być dodany PIERWSZY, a HTML DRUGI
    # Klienty email preferują ostatnią część w 'alternative', więc HTML będzie domyślnie wyświetlany
    msg = MIMEMultipart('alternative')
    msg["Subject"] = subject
    msg["From"] = SMTP_EMAIL
    msg["To"] = recipient_email
    
    # Wersja plain text jako fallback (dodaj PIERWSZA)
    text_part = MIMEText(body, "plain", "utf-8")
    msg.attach(text_part)
    
    # Wersja HTML (dodaj DRUGA - będzie preferowana przez klienty email)
    html_part = MIMEText(html_content, "html", "utf-8")
    msg.attach(html_part)

    with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
        server.login(SMTP_EMAIL, SMTP_APP_PASSWORD)
        server.sendmail(SMTP_EMAIL, recipient_email, msg.as_string())
