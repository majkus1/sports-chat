import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const teamIds = searchParams.get('teamIds');
  const locale = searchParams.get('locale') || 'en';

  if (!teamIds) {
    return new NextResponse('Error: teamIds parameter is required', { status: 400 });
  }

  // Determine custom language file based on locale
  // Use relative path since files are in public/ folder
  const customLangFile = locale === 'pl' 
    ? '/pl-football-widget.json'
    : '/en-football-widget.json';

  // Translations for headers
  const translations = {
    pl: {
      h2h: 'Statystyki bezpośrednie'
    },
    en: {
      h2h: 'Head to Head'
    }
  };
  const t = translations[locale] || translations.en;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Head to Head</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            width: 100%;
            height: 100vh;
            overflow: auto;
            background-color: #f1f1f1;
            font-family: 'Roboto Condensed', sans-serif;
        }
        .widget-wrapper {
            max-width: 1100px;
            margin: 60px auto 0 auto;
            padding: 20px;
            width: 100%;
        }
        .h2h-container {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .h2h-container h2 {
            margin-bottom: 15px;
            font-size: 24px;
            font-weight: bold;
            color: #333;
            font-family: 'Roboto Condensed', sans-serif;
        }
        /* Custom theme for API-Sports widgets */
        api-sports-widget[data-theme="CzatSportowy"] {
            --primary-color: #173b45;
            --success-color: #2ecc58;
            --warning-color: #f39c12;
            --danger-color: #e74c3c;
            --light-color: #898989;
            --home-color: var(--primary-color);
            --away-color: #ffc107;
            --text-color: #333;
            --text-color-info: #333;
            --background-color: #fff;
            --primary-font-size: 0.72rem;
            --secondary-font-size: 0.75rem;
            --button-font-size: 0.8rem;
            --title-font-size: 0.9rem;
            --header-text-transform: uppercase;
            --button-text-transform: uppercase;
            --title-text-transform: uppercase;
            --border: 1px solid #95959530;
            --game-height: 2.3rem;
            --league-height: 2.35rem;
            --score-size: 2.25rem;
            --flag-size: 22px;
            --teams-logo-size: 18px;
            --teams-logo-size-xl: 5rem;
            --hover: rgba(23, 59, 69, 0.15);
        }
        /* Apply Roboto Condensed font to all widget elements */
        api-sports-widget[data-theme="CzatSportowy"] * {
            font-family: 'Roboto Condensed', sans-serif !important;
        }
        @media (max-width: 768px) {
            .widget-wrapper {
                padding: 10px;
            }
            .h2h-container h2 {
                font-size: 20px;
            }
        }
        /* Ukryj wszystkie logo drużyn */
        .team-logo,
        img[src*="logo"],
        img[src*="badge"],
        img[src*="team"],
        img[alt*="logo"],
        img[alt*="badge"],
        img[alt*="team"],
        [class*="team-logo"],
        [class*="badge"],
        [class*="logo"],
        [data-logo],
        [data-badge],
        [data-team-logo],
        api-sports-widget img[src*="logo"],
        api-sports-widget img[src*="badge"],
        api-sports-widget img[src*="team"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            width: 0 !important;
            height: 0 !important;
        }
    </style>
</head>
<body>
    <div class="widget-wrapper">
        <div class="h2h-container">
            <h2>${t.h2h}</h2>
            <div id="h2h-content">
                <api-sports-widget 
                    data-type="h2h" 
                    data-h2h="${teamIds}"
                    data-target-game="modal"
                    data-target-standings="modal"
                ></api-sports-widget>
            </div>
        </div>
    </div>

    <!-- Configuration widget - MUST BE AFTER h2h widget and ONLY ONCE per page -->
    <api-sports-widget 
        data-type="config"
        data-key="${process.env.API_SPORTS_KEY || ''}"
        data-sport="football"
        data-lang="custom"
        data-custom-lang="${customLangFile}"
        data-theme="CzatSportowy"
        data-show-errors="true"
    ></api-sports-widget>
    
    <!-- Load widget script -->
    <script type="module" crossorigin src="https://widgets.api-sports.io/3.1.0/widgets.js"></script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html',
    },
  });
}

