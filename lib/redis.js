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

// Helper to get analysis limit count
export async function getAnalysisLimit(identifier, isUser = false) {
  try {
    const client = await getRedisClient();
    if (!client) return 0; // If Redis unavailable, allow (fail open)
    
    const key = isUser ? `analysis_limit:user:${identifier}` : `analysis_limit:ip:${identifier}`;
    const value = await client.get(key);
    return value ? parseInt(value, 10) : 0;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Redis] GET limit error:', error);
    }
    return 0; // Fail open - allow if Redis error
  }
}

// Helper to increment analysis limit count
export async function incrementAnalysisLimit(identifier, isUser = false) {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    const key = isUser ? `analysis_limit:user:${identifier}` : `analysis_limit:ip:${identifier}`;
    
    // Get current value or set to 0
    const current = await client.get(key);
    const newValue = current ? parseInt(current, 10) + 1 : 1;
    
    // Calculate TTL until midnight (next day)
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const secondsUntilMidnight = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
    
    // Set with TTL
    await client.setEx(key, secondsUntilMidnight, newValue.toString());
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Redis] Incremented limit for ${isUser ? 'user' : 'IP'}: ${identifier}, new value: ${newValue}, expires in ${secondsUntilMidnight}s`);
    }
    
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Redis] INCR limit error:', error);
    }
    return false;
  }
}

// Helper to check if IP is VPN (with cache)
export async function checkVPN(ip) {
  try {
    // Check cache first
    const cacheKey = `vpn_check:${ip}`;
    const cached = await getFromCache(cacheKey);
    if (cached !== null) {
      return cached.isVPN === true;
    }
    
    // If not in cache, check via API
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=proxy`);
      const data = await response.json();
      
      const isVPN = data.proxy === true || data.status === 'fail';
      
      // Cache result for 1 hour
      await setInCache(cacheKey, { isVPN }, 3600);
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`[VPN Check] IP ${ip}: ${isVPN ? 'VPN detected' : 'Not VPN'}`);
      }
      
      return isVPN;
    } catch (apiError) {
      // If API fails, allow request (fail open)
      if (process.env.NODE_ENV === 'development') {
        console.error('[VPN Check] API error:', apiError);
      }
      return false; // Allow if API fails
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[VPN Check] Error:', error);
    }
    return false; // Allow if error
  }
}





