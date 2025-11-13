import axios from 'axios';

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
    const prediction = response.data.response[0]?.predictions?.advice || null;
    return Response.json({ prediction }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching predictions:', error);
    }
    return Response.json({ error: 'Failed to fetch predictions' }, { status: 500 });
  }
}

