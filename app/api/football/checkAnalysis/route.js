import connectToDb from '@/lib/db';
import MatchAnalysis from '@/models/MatchAnalysis';
import { getAnalysisLimit } from '@/lib/redis';
import { getCookieRouteHandler, verifyJwt } from '@/lib/auth';

export async function POST(request) {
  try {
    const body = await request.json();
    const { fixtureId, language, isLive } = body || {};
    
    if (!fixtureId) {
      return Response.json({ error: 'Missing fixtureId in request body' }, { status: 400 });
    }

    const headerLang = request.headers.get('x-lang') || request.headers.get('accept-language') || '';
    const detected = (language || String(headerLang)).toLowerCase();
    const lang2 = detected.startsWith('pl') ? 'pl' : detected.startsWith('en') ? 'en' : 'pl';

    // For live matches, skip database check and go straight to limit check
    // For pre-match, check database first
    if (!isLive) {
      await connectToDb();
      
      // FIRST: Check if analysis exists in database (only for pre-match)
      const existingAnalysis = await MatchAnalysis.findOne({ fixtureId, language: lang2 });
      
      if (existingAnalysis) {
        // Analysis exists - return it immediately
        return Response.json({ 
          exists: true, 
          analysis: existingAnalysis.analysis,
          canGenerate: true // Can always view existing analysis
        }, { status: 200 });
      }
    }
    
    // SECOND: Analysis doesn't exist (or is live match) - check if user can generate (check limit)
    // Get user IP address (same logic as getOrCreateAnalysis)
    const forwarded = request.headers.get('x-forwarded-for');
    const realIp = request.headers.get('x-real-ip');
    const clientIp = request.headers.get('x-client-ip');
    
    const isLocalhostIP = (ipAddr) => {
      if (!ipAddr) return false;
      return ipAddr === '127.0.0.1' || 
             ipAddr === '::1' || 
             ipAddr.startsWith('::ffff:127.0.0.1') || 
             ipAddr === 'localhost' ||
             ipAddr === 'unknown';
    };
    
    let forwardedIp = forwarded?.split(',')[0]?.trim() || null;
    let ip = null;
    if (forwardedIp && !isLocalhostIP(forwardedIp)) {
      ip = forwardedIp;
    } else if (realIp && !isLocalhostIP(realIp)) {
      ip = realIp;
    } else if (clientIp && !isLocalhostIP(clientIp)) {
      ip = clientIp;
    } else {
      ip = 'localhost';
    }

    // Check if user is authenticated
    let userId = null;
    let isAuthenticated = false;
    
    try {
      const accessToken = await getCookieRouteHandler('accessToken');
      if (accessToken) {
        const decoded = verifyJwt(accessToken, process.env.JWT_SECRET);
        userId = decoded.userId;
        isAuthenticated = true;
      }
    } catch (error) {
      isAuthenticated = false;
    }

    // Check analysis limit
    const limitIdentifier = isAuthenticated ? userId : ip;
    const currentLimit = await getAnalysisLimit(limitIdentifier, isAuthenticated);
    const MAX_ANALYSES_PER_DAY = 3;
    
    const canGenerate = currentLimit < MAX_ANALYSES_PER_DAY;
    
    return Response.json({ 
      exists: false,
      canGenerate,
      limitExceeded: !canGenerate,
      currentLimit,
      maxLimit: MAX_ANALYSES_PER_DAY,
      isLoggedIn: isAuthenticated
    }, { status: 200 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error checking analysis:', error);
    }
    // On error, allow generation (fail open)
    return Response.json({ 
      error: 'Failed to check analysis', 
      exists: false,
      canGenerate: true 
    }, { status: 500 });
  }
}

