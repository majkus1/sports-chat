import axios from 'axios';
import { getFromCache, setInCache } from '@/lib/redis';

// Helper function to get midnight timestamp for a given date
function getMidnightTimestamp(dateString) {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(23, 59, 59, 999); // End of day
  return date.getTime();
}

// Helper function to calculate expiration time in seconds (until midnight)
function getExpirationSeconds(dateString) {
  const expiresAt = getMidnightTimestamp(dateString);
  const now = Date.now();
  const secondsUntilMidnight = Math.ceil((expiresAt - now) / 1000);
  // Minimum 60 seconds, maximum 24 hours
  return Math.max(60, Math.min(secondsUntilMidnight, 24 * 60 * 60));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');
  
  let formattedDate;
  if (dateParam) {
    formattedDate = dateParam;
  } else {
    const today = new Date();
    formattedDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  }

  // Cache key for this date
  const cacheKey = `fixtures:${formattedDate}`;

  try {
    // Try to get from Redis cache first
    const cachedData = await getFromCache(cacheKey);
    if (cachedData) {
      return Response.json(cachedData, { status: 200 });
    }

    // Cache miss - fetch from API
    const options = {
      method: 'GET',
      url: 'https://api-football-v1.p.rapidapi.com/v3/fixtures',
      params: { date: formattedDate },
      headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
      },
    };

    const response = await axios.request(options);
    const data = response.data;

    // Store in Redis cache (expires at midnight for this date)
    const expirationSeconds = getExpirationSeconds(formattedDate);
    await setInCache(cacheKey, data, expirationSeconds);

    return Response.json(data, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching fixtures:', error);
    }
    return Response.json({ message: 'Error fetching fixtures' }, { status: 500 });
  }
}

