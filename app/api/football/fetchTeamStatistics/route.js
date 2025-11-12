import axios from 'axios';

export async function POST(request) {
  const body = await request.json();
  const { teamId, leagueId } = body || {};
  
  if (!teamId || !leagueId) {
    return Response.json({ error: 'Missing teamId or leagueId in request body' }, { status: 400 });
  }

  const options = {
    method: 'GET',
    url: 'https://api-football-v1.p.rapidapi.com/v3/teams/statistics',
    params: {
      league: leagueId,
      season: '2025',
      team: teamId,
    },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
  };

  try {
    const response = await axios.request(options);

    const playedTotal = response.data.response?.fixtures?.played?.total || 0;
    const form = response.data.response?.form || 'N/A';

    const goalsOver05 = response.data.response?.goals?.for?.under_over?.['0.5']?.over || 0;
    const goalsUnder05 = response.data.response?.goals?.for?.under_over?.['0.5']?.under || 0;

    const goalsOver15 = response.data.response?.goals?.for?.under_over?.['1.5']?.over || 0;
    const goalsUnder15 = response.data.response?.goals?.for?.under_over?.['1.5']?.under || 0;

    const goalsOver25 = response.data.response?.goals?.for?.under_over?.['2.5']?.over || 0;
    const goalsUnder25 = response.data.response?.goals?.for?.under_over?.['2.5']?.under || 0;

    const goalsOver35 = response.data.response?.goals?.for?.under_over?.['3.5']?.over || 0;
    const goalsUnder35 = response.data.response?.goals?.for?.under_over?.['3.5']?.under || 0;

    const goalsOver05aga = response.data.response?.goals?.against?.under_over?.['0.5']?.over || 0;
    const goalsUnder05aga = response.data.response?.goals?.against?.under_over?.['0.5']?.under || 0;

    const goalsOver15aga = response.data.response?.goals?.against?.under_over?.['1.5']?.over || 0;
    const goalsUnder15aga = response.data.response?.goals?.against?.under_over?.['1.5']?.under || 0;

    const goalsOver25aga = response.data.response?.goals?.against?.under_over?.['2.5']?.over || 0;
    const goalsUnder25aga = response.data.response?.goals?.against?.under_over?.['2.5']?.under || 0;

    const goalsOver35aga = response.data.response?.goals?.against?.under_over?.['3.5']?.over || 0;
    const goalsUnder35aga = response.data.response?.goals?.against?.under_over?.['3.5']?.under || 0;

    const goalsfortotal = response.data.response?.goals?.for?.total?.total || 0;
    const goalsforhome = response.data.response?.goals?.for?.total?.home || 0;
    const goalsforaway = response.data.response?.goals?.for?.total?.away || 0;

    const goalsagatotal = response.data.response?.goals?.against?.total?.total || 0;
    const goalsagahome = response.data.response?.goals?.against?.total?.home || 0;
    const goalsagaaway = response.data.response?.goals?.against?.total?.away || 0;

    const winstotal = response.data.response?.fixtures?.wins?.total || 0;
    const winshome = response.data.response?.fixtures?.wins?.home || 0;
    const winsaway = response.data.response?.fixtures?.wins?.away || 0;

    const drawstotal = response.data.response?.fixtures?.draws?.total || 0;
    const drawshome = response.data.response?.fixtures?.draws?.home || 0;
    const drawsaway = response.data.response?.fixtures?.draws?.away || 0;

    const losestotal = response.data.response?.fixtures?.loses?.total || 0;
    const loseshome = response.data.response?.fixtures?.loses?.home || 0;
    const losesaway = response.data.response?.fixtures?.loses?.away || 0;

    const cleansheettotal = response.data.response?.clean_sheet?.total || 0;
    const cleansheethome = response.data.response?.clean_sheet?.home || 0;
    const cleansheetaway = response.data.response?.clean_sheet?.away || 0;

    const failedtoscoretotal = response.data.response?.failed_to_score?.total || 0;
    const failedtoscorehome = response.data.response?.failed_to_score?.home || 0;
    const failedtoscoreaway = response.data.response?.failed_to_score?.away || 0;

    return Response.json({
      playedTotal,
      form,
      goalsOver05,
      goalsUnder05,
      goalsOver15,
      goalsUnder15,
      goalsOver25,
      goalsUnder25,
      goalsOver35,
      goalsUnder35,
      goalsOver05aga,
      goalsUnder05aga,
      goalsOver15aga,
      goalsUnder15aga,
      goalsOver25aga,
      goalsUnder25aga,
      goalsOver35aga,
      goalsUnder35aga,
      goalsfortotal,
      goalsforhome,
      goalsforaway,
      goalsagatotal,
      goalsagahome,
      goalsagaaway,
      winstotal,
      winshome,
      winsaway,
      drawstotal,
      drawshome,
      drawsaway,
      losestotal,
      loseshome,
      losesaway,
      cleansheettotal,
      cleansheethome,
      cleansheetaway,
      failedtoscoretotal,
      failedtoscorehome,
      failedtoscoreaway,
    }, { status: 200 });
  } catch (error) {
    console.error('Error fetching team statistics:', error);
    return Response.json({ error: 'Failed to fetch team statistics' }, { status: 500 });
  }
}

