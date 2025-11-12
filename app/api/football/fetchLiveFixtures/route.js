import axios from 'axios';

export async function GET(request) {
  const options = {
    method: 'GET',
    url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
    params: { live: 'all' },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
  };

  try {
    const response = await axios.request(options);
    return Response.json({ fixtures: response.data.response }, { status: 200 });
  } catch (error) {
    console.error('Error fetching live fixtures:', error);
    return Response.json({ error: 'Failed to fetch live fixtures' }, { status: 500 });
  }
}

