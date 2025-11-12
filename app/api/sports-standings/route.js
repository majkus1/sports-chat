import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leagueId = searchParams.get('leagueId');
  const season = searchParams.get('season') || '2025';

  if (!leagueId) {
    return new NextResponse('Error: leagueId parameter is required', { status: 400 });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>League Standings</title>
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
        }
        .widget-wrapper {
            max-width: 1100px;
            margin: 60px auto 0 auto;
            padding: 20px;
            width: 100%;
        }
        .standings-container {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .standings-container h2 {
            margin-bottom: 15px;
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        .games-container {
            background: #fff;
            border-radius: 8px;
            padding: 15px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .games-container h2 {
            margin-bottom: 15px;
            font-size: 24px;
            font-weight: bold;
            color: #333;
        }
        @media (max-width: 768px) {
            .widget-wrapper {
                padding: 10px;
            }
            .standings-container h2,
            .games-container h2 {
                font-size: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="widget-wrapper">
        <div class="standings-container">
            <h2>League Standings</h2>
            <div id="standings-content">
                <api-sports-widget 
                    data-type="standings" 
                    data-league="${leagueId}"
                    data-season="${season}"
                    data-target-team="modal"
                ></api-sports-widget>
            </div>
        </div>
        
        <div class="games-container">
            <h2>League Games</h2>
            <div id="games-content">
                <api-sports-widget 
                    data-type="games" 
                    data-league="${leagueId}"
                    data-target-game="modal"
                    data-target-standings="modal"
                ></api-sports-widget>
            </div>
        </div>
    </div>

    <!-- Configuration widget - MUST BE AFTER other widgets and ONLY ONCE per page -->
    <api-sports-widget 
        data-type="config"
        data-key="2e2840f792c22b93afecb2e6341e2de6"
        data-sport="football"
        data-lang="en"
        data-theme="white"
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

