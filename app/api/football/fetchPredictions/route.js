import axios from 'axios';

// Helper function to extract statistics from predictions response
function extractStatsFromPredictions(predictionsData) {
  if (!predictionsData || !predictionsData.response || !predictionsData.response[0]) {
    return null;
  }

  const data = predictionsData.response[0];
  const homeTeam = data.teams?.home;
  const awayTeam = data.teams?.away;

  if (!homeTeam || !awayTeam) {
    return null;
  }

  // Extract home team statistics
  const extractTeamStats = (team) => {
    const league = team.league || {};
    const last5 = team.last_5 || {};
    const goals = league.goals || {};
    const goalsFor = goals.for || {};
    const goalsAgainst = goals.against || {};

    return {
      // Basic stats
      playedTotal: league.fixtures?.played?.total || 0,
      form: league.form || last5.form || 'N/A',
      
      // Last 5 matches
      last5Form: last5.form || 'N/A',
      last5Att: last5.att || 'N/A',
      last5Def: last5.def || 'N/A',
      last5GoalsFor: last5.goals?.for?.total || 0,
      last5GoalsAgainst: last5.goals?.against?.total || 0,
      last5GoalsForAvg: last5.goals?.for?.average || '0',
      last5GoalsAgainstAvg: last5.goals?.against?.average || '0',
      
      // Fixtures
      winstotal: league.fixtures?.wins?.total || 0,
      winshome: league.fixtures?.wins?.home || 0,
      winsaway: league.fixtures?.wins?.away || 0,
      drawstotal: league.fixtures?.draws?.total || 0,
      drawshome: league.fixtures?.draws?.home || 0,
      drawsaway: league.fixtures?.draws?.away || 0,
      losestotal: league.fixtures?.loses?.total || 0,
      loseshome: league.fixtures?.loses?.home || 0,
      losesaway: league.fixtures?.loses?.away || 0,
      
      // Goals for
      goalsfortotal: goalsFor.total?.total || 0,
      goalsforhome: goalsFor.total?.home || 0,
      goalsforaway: goalsFor.total?.away || 0,
      goalsForAvgTotal: goalsFor.average?.total || '0',
      goalsForAvgHome: goalsFor.average?.home || '0',
      goalsForAvgAway: goalsFor.average?.away || '0',
      
      // Goals against
      goalsagatotal: goalsAgainst.total?.total || 0,
      goalsagahome: goalsAgainst.total?.home || 0,
      goalsagaaway: goalsAgainst.total?.away || 0,
      goalsAgainstAvgTotal: goalsAgainst.average?.total || '0',
      goalsAgainstAvgHome: goalsAgainst.average?.home || '0',
      goalsAgainstAvgAway: goalsAgainst.average?.away || '0',
      
      // Under/Over for goals scored
      goalsOver05: goalsFor.under_over?.['0.5']?.over || 0,
      goalsUnder05: goalsFor.under_over?.['0.5']?.under || 0,
      goalsOver15: goalsFor.under_over?.['1.5']?.over || 0,
      goalsUnder15: goalsFor.under_over?.['1.5']?.under || 0,
      goalsOver25: goalsFor.under_over?.['2.5']?.over || 0,
      goalsUnder25: goalsFor.under_over?.['2.5']?.under || 0,
      goalsOver35: goalsFor.under_over?.['3.5']?.over || 0,
      goalsUnder35: goalsFor.under_over?.['3.5']?.under || 0,
      
      // Under/Over for goals conceded
      goalsOver05aga: goalsAgainst.under_over?.['0.5']?.over || 0,
      goalsUnder05aga: goalsAgainst.under_over?.['0.5']?.under || 0,
      goalsOver15aga: goalsAgainst.under_over?.['1.5']?.over || 0,
      goalsUnder15aga: goalsAgainst.under_over?.['1.5']?.under || 0,
      goalsOver25aga: goalsAgainst.under_over?.['2.5']?.over || 0,
      goalsUnder25aga: goalsAgainst.under_over?.['2.5']?.under || 0,
      goalsOver35aga: goalsAgainst.under_over?.['3.5']?.over || 0,
      goalsUnder35aga: goalsAgainst.under_over?.['3.5']?.under || 0,
      
      // Clean sheets
      cleansheettotal: league.clean_sheet?.total || 0,
      cleansheethome: league.clean_sheet?.home || 0,
      cleansheetaway: league.clean_sheet?.away || 0,
      
      // Failed to score
      failedtoscoretotal: league.failed_to_score?.total || 0,
      failedtoscorehome: league.failed_to_score?.home || 0,
      failedtoscoreaway: league.failed_to_score?.away || 0,
      
      // Biggest
      biggestWin: league.biggest?.wins?.home || league.biggest?.wins?.away || null,
      biggestLoss: league.biggest?.loses?.home || league.biggest?.loses?.away || null,
      biggestStreakWins: league.biggest?.streak?.wins || 0,
      biggestStreakDraws: league.biggest?.streak?.draws || 0,
      biggestStreakLoses: league.biggest?.streak?.loses || 0,
      
      // Penalties
      penaltyScored: league.penalty?.scored?.total || 0,
      penaltyMissed: league.penalty?.missed?.total || 0,
      penaltyTotal: league.penalty?.total || 0,
      
      // Most used formation
      mostUsedFormation: league.lineups?.[0]?.formation || 'N/A',
    };
  };

  return {
    prediction: data.predictions?.advice || null,
    predictionPercent: {
      home: data.predictions?.percent?.home || '0%',
      draw: data.predictions?.percent?.draw || '0%',
      away: data.predictions?.percent?.away || '0%',
    },
    predictionWinner: data.predictions?.winner?.name || null,
    predictionGoals: {
      home: data.predictions?.goals?.home || null,
      away: data.predictions?.goals?.away || null,
    },
    winOrDraw: data.predictions?.win_or_draw || null,
    homeStats: extractTeamStats(homeTeam),
    awayStats: extractTeamStats(awayTeam),
    comparison: {
      form: data.comparison?.form || { home: '0%', away: '0%' },
      att: data.comparison?.att || { home: '0%', away: '0%' },
      def: data.comparison?.def || { home: '0%', away: '0%' },
      poisson: data.comparison?.poisson_distribution || { home: '0%', away: '0%' },
      h2h: data.comparison?.h2h || { home: '0%', away: '0%' },
      goals: data.comparison?.goals || { home: '0%', away: '0%' },
      total: data.comparison?.total || { home: '0%', away: '0%' },
    },
    h2h: data.h2h || [],
  };
}

export async function POST(request) {
  const body = await request.json();
  const { fixtureId } = body || {};
  
  if (!fixtureId) {
    return Response.json({ error: 'Missing fixtureId in request body' }, { status: 400 });
  }

  const options = {
    method: 'GET',
    url: 'https://api-football-v1.p.rapidapi.com/v3/predictions',
    params: { fixture: fixtureId },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
  };

  try {
    const response = await axios.request(options);
    const extractedData = extractStatsFromPredictions(response.data);
    
    if (!extractedData) {
      return Response.json({ error: 'No prediction data available' }, { status: 404 });
    }
    
    return Response.json(extractedData, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching predictions:', error);
    }
    return Response.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }
}

