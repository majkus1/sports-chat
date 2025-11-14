import { createClient } from 'redis';

let redisClient = null;

// Singleton pattern for Redis client
export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log('[Redis] getRedisClient called, REDIS_URL:', redisUrl);
  
  redisClient = createClient({
    url: redisUrl,
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Client Error:', err.code || err.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Client Connected');
  });

  try {
    await redisClient.connect();
    console.log('[Redis] Connection established successfully');
    return redisClient;
  } catch (error) {
    console.error('[Redis] Failed to connect:', error.code || error.message);
    // Return null if Redis is not available - app should still work
    redisClient = null;
    return null;
  }
}

// Helper to safely get value from Redis
export async function getFromCache(key) {
  try {
    const client = await getRedisClient();
    if (!client) {
      console.log('[Redis] Cache GET - client not available for key:', key);
      return null;
    }
    
    const value = await client.get(key);
    if (value) {
      console.log('[Redis] Cache HIT for key:', key);
      return JSON.parse(value);
    } else {
      console.log('[Redis] Cache MISS for key:', key);
      return null;
    }
  } catch (error) {
    console.error('[Redis] GET error for key:', key, error.code || error.message);
    return null;
  }
}

// Helper to safely set value in Redis with expiration
export async function setInCache(key, value, expirationSeconds) {
  try {
    const client = await getRedisClient();
    if (!client) {
      console.log('[Redis] Cache SET - client not available for key:', key);
      return false;
    }
    
    await client.setEx(key, expirationSeconds, JSON.stringify(value));
    console.log('[Redis] Cache SET for key:', key, 'expires in', expirationSeconds, 'seconds');
    return true;
  } catch (error) {
    console.error('[Redis] SET error for key:', key, error.code || error.message);
    return false;
  }
}

// Helper to delete key from Redis
export async function deleteFromCache(key) {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    await client.del(key);
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Redis DELETE error:', error);
    }
    return false;
  }
}





