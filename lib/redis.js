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

// Helper to get today's date string in YYYY-MM-DD format
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get analysis limit count
export async function getAnalysisLimit(identifier, isUser = false) {
  try {
    const client = await getRedisClient();
    if (!client) return 0; // If Redis unavailable, allow (fail open)
    
    // Use date in key to automatically reset limits at midnight
    const today = getTodayDateString();
    const key = isUser 
      ? `analysis_limit:user:${identifier}:${today}` 
      : `analysis_limit:ip:${identifier}:${today}`;
    
    // Check if key exists
    const value = await client.get(key);
    
    // If key doesn't exist, return 0 (no limit used today)
    if (!value) {
      return 0;
    }
    
    return parseInt(value, 10);
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
    
    // Use date in key to automatically reset limits at midnight
    const today = getTodayDateString();
    const key = isUser 
      ? `analysis_limit:user:${identifier}:${today}` 
      : `analysis_limit:ip:${identifier}:${today}`;
    
    // Get current value or set to 0
    const current = await client.get(key);
    const newValue = current ? parseInt(current, 10) + 1 : 1;
    
    // Calculate TTL until midnight (next day) - always reset at midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0); // Set to midnight today
    midnight.setDate(midnight.getDate() + 1); // Add 1 day to get tomorrow's midnight
    const secondsUntilMidnight = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
    
    // Set with TTL - always set TTL to midnight of next day
    // When TTL expires, the key will be deleted, and next day a new key with today's date will be created
    await client.setEx(key, secondsUntilMidnight, newValue.toString());
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Redis] Incremented limit for ${isUser ? 'user' : 'IP'}: ${identifier}, new value: ${newValue}, expires in ${secondsUntilMidnight}s (at midnight)`);
    }
    
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Redis] INCR limit error:', error);
    }
    return false;
  }
}

// Helper to get agent limit count
export async function getAgentLimit(identifier, isUser = false) {
  try {
    const client = await getRedisClient();
    if (!client) return 0; // If Redis unavailable, allow (fail open)
    
    // Use date in key to automatically reset limits at midnight
    const today = getTodayDateString();
    const key = isUser 
      ? `agent_limit:user:${identifier}:${today}` 
      : `agent_limit:ip:${identifier}:${today}`;
    
    // Check if key exists
    const value = await client.get(key);
    
    // If key doesn't exist, return 0 (no limit used today)
    if (!value) {
      return 0;
    }
    
    return parseInt(value, 10);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Redis] GET agent limit error:', error);
    }
    return 0; // Fail open - allow if Redis error
  }
}

// Helper to increment agent limit count
export async function incrementAgentLimit(identifier, isUser = false) {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    // Use date in key to automatically reset limits at midnight
    const today = getTodayDateString();
    const key = isUser 
      ? `agent_limit:user:${identifier}:${today}` 
      : `agent_limit:ip:${identifier}:${today}`;
    
    // Get current value or set to 0
    const current = await client.get(key);
    const newValue = current ? parseInt(current, 10) + 1 : 1;
    
    // Calculate TTL until midnight (next day) - always reset at midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0); // Set to midnight today
    midnight.setDate(midnight.getDate() + 1); // Add 1 day to get tomorrow's midnight
    const secondsUntilMidnight = Math.ceil((midnight.getTime() - now.getTime()) / 1000);
    
    // Set with TTL - always set TTL to midnight of next day
    await client.setEx(key, secondsUntilMidnight, newValue.toString());
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Redis] Incremented agent limit for ${isUser ? 'user' : 'IP'}: ${identifier}, new value: ${newValue}, expires in ${secondsUntilMidnight}s (at midnight)`);
    }
    
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Redis] INCR agent limit error:', error);
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

// Helper to acquire a lock for analysis generation (prevents concurrent generation per user/IP)
// This lock is per user/IP, not per fixture - prevents user from generating multiple analyses simultaneously
export async function acquireAnalysisLock(userIdentifier, timeoutSeconds = 300) {
  try {
    const client = await getRedisClient();
    if (!client) {
      // If Redis unavailable, log warning but DENY (fail closed) to prevent concurrent generation
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[Analysis Lock] Redis unavailable - denying lock for user/IP ${userIdentifier}`);
      }
      return false; // Deny if Redis unavailable (fail closed)
    }
    
    const lockKey = `analysis_lock_user:${userIdentifier}`;
    
    // Try to set lock with expiration (NX = only if not exists)
    const result = await client.set(lockKey, '1', {
      EX: timeoutSeconds, // Lock expires in 5 minutes (300 seconds)
      NX: true, // Only set if key doesn't exist
    });
    
    if (result === 'OK') {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Analysis Lock] Acquired lock for user/IP ${userIdentifier}`);
      }
      return true; // Lock acquired
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Analysis Lock] Lock already exists for user/IP ${userIdentifier} - user is already generating an analysis`);
      }
      return false; // Lock already exists (user is already generating another analysis)
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Analysis Lock] Error acquiring lock:', error);
    }
    // Fail closed - deny if Redis error to prevent concurrent generation
    return false;
  }
}

// Helper to release analysis lock
export async function releaseAnalysisLock(userIdentifier) {
  try {
    const client = await getRedisClient();
    if (!client) return false;
    
    const lockKey = `analysis_lock_user:${userIdentifier}`;
    await client.del(lockKey);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analysis Lock] Released lock for user/IP ${userIdentifier}`);
    }
    
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Analysis Lock] Error releasing lock:', error);
    }
    return false;
  }
}





