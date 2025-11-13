import { createClient } from 'redis';

let redisClient = null;

// Singleton pattern for Redis client
export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  
  redisClient = createClient({
    url: redisUrl,
  });

  redisClient.on('error', (err) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('Redis Client Error:', err);
    }
  });

  redisClient.on('connect', () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Redis Client Connected');
    }
  });

  try {
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Failed to connect to Redis:', error);
    }
    // Return null if Redis is not available - app should still work
    return null;
  }
}

// Helper to safely get value from Redis
export async function getFromCache(key) {
  try {
    const client = await getRedisClient();
    if (!client) return null;
    
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Redis GET error:', error);
    }
    return null;
  }
}

// Helper to safely set value in Redis with expiration
export async function setInCache(key, value, expirationSeconds) {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    await client.setEx(key, expirationSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Redis SET error:', error);
    }
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


