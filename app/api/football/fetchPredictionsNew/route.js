import axios from 'axios';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');
  const dt = date || new Date().toISOString().slice(0, 10);

  try {
    const response = await axios.get('https://today-football-prediction.p.rapidapi.com/predictions/list', {
      params: { date: dt },
      headers: {
        'x-rapidapi-key': process.env.TODAY_PREDICTION_KEY,
        'x-rapidapi-host': 'today-football-prediction.p.rapidapi.com',
      },
    });

    const matches = response.data.matches || [];
    const simplified = matches.map((m) => ({
      id: m.id,
      home_team: m.home_team,
      away_team: m.away_team,
      date: m.date,
      prediction: m.prediction,
      prediction_odd: m.prediction_odd,
      prediction_probability: m.prediction_probability,
    }));

    return Response.json({ matches: simplified }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Prediction API error:', error.response?.data || error.message);
    }
    return Response.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }
}

