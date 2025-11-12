import axios from 'axios';

export async function GET(request) {
  const today = new Date();
  const formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

  const options = {
    method: 'GET',
    url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
    params: { date: formattedDate },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
    },
  };

  try {
    const response = await axios.request(options);
    return Response.json(response.data, { status: 200 });
  } catch (error) {
    console.error('Error fetching fixtures:', error);
    return Response.json({ message: 'Error fetching fixtures' }, { status: 500 });
  }
}

