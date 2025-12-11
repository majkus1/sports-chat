import { NextResponse } from 'next/server';
import { getAgentLimit, incrementAgentLimit } from '@/lib/redis';
import { getCookieRouteHandler, verifyJwt } from '@/lib/auth';
import connectToDb from '@/lib/db';
import User from '@/models/User';

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://localhost:5000';
const MAX_AGENT_RUNS_PER_DAY = 1;

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, language = 'pl' } = body;

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'Nieprawidłowy adres email' },
        { status: 400 }
      );
    }

    // Walidacja języka (tylko 'pl' lub 'en')
    const validLanguage = language === 'en' ? 'en' : 'pl';

    // Get user IP address (same logic as getOrCreateAnalysis)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = request.headers.get('x-client-ip');
    
    // Helper to check if IP is localhost
    const isLocalhostIP = (ipAddr) => {
      if (!ipAddr) return false;
      return ipAddr === '127.0.0.1' || 
             ipAddr === '::1' || 
             ipAddr.startsWith('::ffff:127.0.0.1') || 
             ipAddr === 'localhost' ||
             ipAddr === 'unknown';
    };
    
    // Get first IP from forwarded-for (if multiple IPs, take the first one)
    let forwardedIp = forwarded?.split(',')[0]?.trim() || null;
    
    // If forwarded is localhost but realIp is available, use realIp instead
    let ip = null;
    if (forwardedIp && !isLocalhostIP(forwardedIp)) {
      ip = forwardedIp; // Use forwarded if it's not localhost
    } else if (realIp && !isLocalhostIP(realIp)) {
      ip = realIp; // Use realIp if forwarded is localhost but realIp is valid
    } else if (clientIp && !isLocalhostIP(clientIp)) {
      ip = clientIp; // Use clientIp as fallback
    } else {
      ip = 'localhost'; // Only use localhost if all IPs are localhost/unknown
    }

    // Check if user is authenticated
    let userId = null;
    let isAuthenticated = false;
    let username = null;
    let isUnlimitedUser = false;
    
    try {
      const accessToken = await getCookieRouteHandler('accessToken');
      if (accessToken) {
        const decoded = verifyJwt(accessToken, process.env.JWT_SECRET);
        userId = decoded.userId;
        isAuthenticated = true;
        
        // Pobierz username z bazy danych aby sprawdzić czy to konto testowe
        try {
          await connectToDb();
          const user = await User.findById(userId).select('username');
          if (user) {
            username = user.username;
            // Sprawdź czy to konto testowe bez limitu
            if (username === 'michalipka1') {
              isUnlimitedUser = true;
            }
          }
        } catch (dbError) {
          // Jeśli nie udało się pobrać username, kontynuuj normalnie
          if (process.env.NODE_ENV === 'development') {
            console.error('Error fetching username:', dbError);
          }
        }
      }
    } catch (error) {
      // User not authenticated or token invalid
      isAuthenticated = false;
    }

    // Check agent limit BEFORE calling FastAPI (pomiń dla konta testowego)
    if (!isUnlimitedUser) {
      const limitIdentifier = isAuthenticated ? userId : ip;
      const currentLimit = await getAgentLimit(limitIdentifier, isAuthenticated);

      if (currentLimit >= MAX_AGENT_RUNS_PER_DAY) {
        // Limit exceeded
        const limitMessages = {
          pl: {
            loggedIn: 'Osiągnąłeś dzienny limit uruchomień agenta (1 raz dziennie). Wróć jutro.',
            notLoggedIn: 'Osiągnąłeś dzienny limit uruchomień agenta (1 raz dziennie). Zaloguj się, aby uzyskać dodatkowe uruchomienie.'
          },
          en: {
            loggedIn: 'You have reached the daily limit of agent runs (1 per day). Come back tomorrow.',
            notLoggedIn: 'You have reached the daily limit of agent runs (1 per day). Log in to get an additional run.'
          }
        };
        const messages = limitMessages[validLanguage] || limitMessages.pl;
        
        return NextResponse.json(
          {
            success: false,
            error: 'limit_exceeded',
            message: isAuthenticated ? messages.loggedIn : messages.notLoggedIn,
            limit: MAX_AGENT_RUNS_PER_DAY,
            used: currentLimit,
            isLoggedIn: isAuthenticated
          },
          { status: 429 }
        );
      }
    } // Koniec sprawdzania limitu (tylko jeśli nie jest unlimited user)

    // Wywołanie FastAPI
    const response = await fetch(`${FASTAPI_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, language: validLanguage }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: data.detail || 'Błąd podczas generowania raportu' },
        { status: response.status }
      );
    }

    // Increment limit only after successful agent run (pomiń dla konta testowego)
    if (data.success && !isUnlimitedUser) {
      const limitIdentifier = isAuthenticated ? userId : ip;
      await incrementAgentLimit(limitIdentifier, isAuthenticated);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Agent Limit] Incremented for ${isAuthenticated ? 'user' : 'IP'}: ${limitIdentifier}`);
      }
    } else if (data.success && isUnlimitedUser) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Agent Limit] Skipped for unlimited user: ${username}`);
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Error calling FastAPI:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: 'Nie udało się połączyć z serwerem. Sprawdź czy serwer FastAPI jest uruchomiony.' 
      },
      { status: 500 }
    );
  }
}


