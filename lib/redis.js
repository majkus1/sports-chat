import { createClient } from 'redis';

let redisClient = null;
let connecting = null;

/** Po nieudanym połączeniu odpuszczamy na chwilę, zamiast próbować przy każdym żądaniu. */
const RETRY_COOLDOWN_MS = 10_000;
const CONNECT_TIMEOUT_MS = 2000;
let unavailableUntil = 0;

// Singleton pattern for Redis client
export async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  // Redis jest cache'em, nie źródłem prawdy — gdy nie odpowiada, trasy mają działać dalej
  // (wolniej, bez cache'u), a nie czekać. Bez tego okna każde żądanie ponawiało próbę
  // połączenia i potrafiło zawiesić odpowiedź na kilkadziesiąt sekund.
  if (Date.now() < unavailableUntil) return null;

  // Równoległe żądania mają współdzielić jedną próbę połączenia.
  if (connecting) return connecting;

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  connecting = (async () => {
    const client = createClient({
      url: redisUrl,
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        // Domyślna strategia ponawia w nieskończoność; tutaj po trzech próbach
        // odpuszczamy, żeby `connect()` odrzuciło się zamiast wisieć.
        reconnectStrategy: (retries) => (retries > 2 ? false : Math.min(200 * 2 ** retries, 1000)),
      },
    });

    // Bez tego nasłuchu nieobsłużony błąd klienta wywraca proces.
    client.on('error', (err) => {
      if (process.env.NODE_ENV === 'development') {
        console.error('[Redis] Client Error:', err.code || err.message);
      }
    });

    try {
      await client.connect();
      redisClient = client;
      unavailableUntil = 0;
      return client;
    } catch (error) {
      console.warn(`[Redis] Niedostępny (${error.code || error.message}) — działam bez cache'u.`);
      redisClient = null;
      unavailableUntil = Date.now() + RETRY_COOLDOWN_MS;
      client.destroy?.();
      return null;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
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
// Liczniki limitów przeniesione do lib/billing/entitlements.js — limity wynikają teraz
// z planu konta, a nie z liczb zaszytych w trasach. Usunięto też nieużywany checkVPN.

// Helper to acquire a lock for analysis generation (prevents concurrent generation per user/IP)
// This lock is per user/IP, not per fixture - prevents user from generating multiple analyses simultaneously
export async function acquireAnalysisLock(userIdentifier, timeoutSeconds = 300) {
  try {
    const client = await getRedisClient();
    if (!client) {
      /*
       * Bez Redisa przepuszczamy.
       *
       * To blokada przed dwoma równoległymi generowaniami tego samego użytkownika, a nie
       * zabezpieczenie przed nadużyciem — od tego jest dzienny limit z planu, liczony osobno.
       * Odmowa przy niedostępnym Redisie kładła całą funkcję: każde kliknięcie kończyło się
       * komunikatem „analiza jest już generowana", choć nic się nie generowało.
       * Najgorsze, co grozi po przepuszczeniu, to jedna analiza wykonana dwa razy.
       */
      console.warn(`[Analysis Lock] Redis niedostępny — przepuszczam ${userIdentifier}`);
      return true;
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





