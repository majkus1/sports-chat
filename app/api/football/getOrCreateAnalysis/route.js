import { OpenAI } from 'openai';
import connectToDb from '@/lib/db';
import MatchAnalysis from '@/models/MatchAnalysis';
import { getAnalysisLimit, incrementAnalysisLimit, acquireAnalysisLock, releaseAnalysisLock } from '@/lib/redis';
import { getCookieRouteHandler, verifyJwt } from '@/lib/auth';

export async function POST(request) {
  if (process.env.NODE_ENV === 'development') {
    console.log('=== getOrCreateAnalysis endpoint called ===');
    console.log('Request method:', request.method);
    console.log('Request URL:', request.url);
  }
  
  try {
    const body = await request.json();
    if (process.env.NODE_ENV === 'development') {
      console.log('Request body received, fixtureId:', body?.fixtureId, 'isLive:', body?.isLive);
    }
    
    const {
      fixtureId: rawFixtureId,
      prediction,
      predictionPercent,
      predictionWinner,
      predictionGoals,
      winOrDraw,
      homeTeam,
      awayTeam,
      homeStats,
      awayStats,
      isLive,
      currentGoals,
      language: bodyLang,
      comparison,
      h2h,
    } = body || {};

    // Ensure fixtureId is always a string for consistent lock keys
    const fixtureId = String(rawFixtureId || '').trim();
    if (!fixtureId) {
      return Response.json({ error: 'Missing fixtureId in request body' }, { status: 400 });
    }

    const headerLang = request.headers.get('x-lang') || request.headers.get('accept-language') || '';
    const detected = (bodyLang || String(headerLang)).toLowerCase();
    const lang2 = detected.startsWith('pl') ? 'pl' : detected.startsWith('en') ? 'en' : 'pl';

    // Get user IP address first (needed for lock identifier and rate limiting)
    // Always use real IP address - this ensures limit is per IP, not per browser/cookie
    // Priority: x-forwarded-for (first IP) > x-real-ip > x-client-ip
    // BUT: if forwarded is localhost, prefer realIp if available
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
    // This handles cases where reverse proxy sets forwarded to localhost but realIp has the actual client IP
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
    
    // Log IP for debugging (only in production to diagnose rate limiting issues)
    if (process.env.NODE_ENV === 'production') {
      console.log(`[IP Detection] Detected IP: ${ip}, forwarded: ${forwarded}, realIp: ${realIp}, clientIp: ${clientIp}`);
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
      // User not authenticated or token invalid
      isAuthenticated = false;
    }

    // Determine user identifier for lock (user ID if authenticated, IP if not)
    const userIdentifier = isAuthenticated ? `user:${userId}` : `ip:${ip}`;

    // Acquire lock FIRST to prevent concurrent analysis generation for the same user/IP
    // This lock is per user/IP, not per fixture - prevents user from generating multiple analyses simultaneously
    // This must be done BEFORE checking the database to prevent race conditions
    // Works for both live and pre-match matches
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analysis Lock] Attempting to acquire lock for user/IP ${userIdentifier}, fixture ${fixtureId}, isLive: ${isLive}`);
    }
    
    const lockAcquired = await acquireAnalysisLock(userIdentifier);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analysis Lock] Lock acquisition result for user/IP ${userIdentifier}: ${lockAcquired}`);
    }
    
    if (!lockAcquired) {
      // User is already generating another analysis (for any match)
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Analysis Lock] Lock denied - user/IP ${userIdentifier} is already generating an analysis`);
      }
      const messages = {
        pl: 'Analiza jest już generowana w innym meczu. Spróbuj ponownie po zakończeniu generowania.',
        en: 'Analysis is already being generated for another match. Please try again after the current generation is complete.'
      };
      return Response.json(
        {
          error: 'generation_in_progress',
          message: messages[lang2] || messages.pl
        },
        { status: 429 }
      );
    }

    try {
      // Check if analysis already exists FIRST (only for pre-match, not for live)
      // If analysis exists in database, return it without checking limits
      await connectToDb();
      
      // For live matches, always generate new analysis (don't use cached pre-match analysis)
      if (!isLive) {
        const existingAnalysis = await MatchAnalysis.findOne({ fixtureId, language: lang2 });
        if (existingAnalysis) {
          // If analysis exists for pre-match, return it without checking limits
          // Release lock before returning
          await releaseAnalysisLock(userIdentifier);
          return Response.json({ analysis: existingAnalysis.analysis }, { status: 200 });
        }
      }

      // Check analysis limit ONLY if analysis doesn't exist in database
      // This applies to both live matches and pre-match matches without cached analysis
      const limitIdentifier = isAuthenticated ? userId : ip;
      const currentLimit = await getAnalysisLimit(limitIdentifier, isAuthenticated);
      const MAX_ANALYSES_PER_DAY = 3;

      if (currentLimit >= MAX_ANALYSES_PER_DAY) {
        // Limit exceeded - release lock before returning
        await releaseAnalysisLock(userIdentifier);
        const limitMessages = {
          pl: {
            loggedIn: 'Osiągnąłeś dzienny limit 3 analiz. Wróć jutro lub wkrótce wykup dostęp do nieskończonej liczby analiz.',
            notLoggedIn: 'Osiągnąłeś dzienny limit 3 analiz. Zaloguj się lub zarejestruj, aby wygenerować więcej analiz.'
          },
          en: {
            loggedIn: 'You have reached the daily limit of 3 analyses. Come back tomorrow or purchase unlimited access soon.',
            notLoggedIn: 'You have reached the daily limit of 3 analyses. Log in or register to generate more analyses.'
          }
        };
        const messages = limitMessages[lang2] || limitMessages.pl;
        if (isAuthenticated) {
          return Response.json(
            {
              error: 'limit_exceeded',
              message: messages.loggedIn,
              limit: MAX_ANALYSES_PER_DAY,
              used: currentLimit,
              isLoggedIn: true
            },
            { status: 429 }
          );
        } else {
          return Response.json(
            {
              error: 'limit_exceeded',
              message: messages.notLoggedIn,
              limit: MAX_ANALYSES_PER_DAY,
              used: currentLimit,
              isLoggedIn: false
            },
            { status: 429 }
          );
        }
      }

      const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      maxRetries: 2,
    });

    // Helper function to format H2H history
    const formatH2H = (h2hData) => {
      if (!h2hData || !Array.isArray(h2hData) || h2hData.length === 0) {
        return 'No previous head-to-head matches available.';
      }
      return h2hData.slice(0, 3).map((match, idx) => {
        const homeTeam = match.teams?.home?.name || 'Unknown';
        const awayTeam = match.teams?.away?.name || 'Unknown';
        const homeGoals = match.goals?.home || 0;
        const awayGoals = match.goals?.away || 0;
        const date = match.fixture?.date ? new Date(match.fixture.date).toLocaleDateString() : 'Unknown date';
        return `${idx + 1}. ${homeTeam} ${homeGoals} - ${awayGoals} ${awayTeam} (${date})`;
      }).join('\n');
    };

    // Helper to safely get values
    const safeGet = (obj, path, defaultValue = 'N/A') => {
      try {
        const keys = path.split('.');
        let value = obj;
        for (const key of keys) {
          value = value?.[key];
          if (value === null || value === undefined) return defaultValue;
        }
        return value;
      } catch {
        return defaultValue;
      }
    };

    const prompts = {
      en: isLive
        ? `Please provide a concise but specific textual analysis of the football match currently taking place between ${homeTeam} and ${awayTeam}. The current score is ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}. Always start the analysis by mentioning the current score; make sure to always begin with this.

Statistics for the home team, ${homeTeam}, from their matches so far:
Total matches played: ${homeStats.playedTotal}
Total matches won: ${homeStats.winstotal} (Home: ${homeStats.winshome}, Away: ${homeStats.winsaway})
Total matches drawn: ${homeStats.drawstotal} (Home: ${homeStats.drawshome}, Away: ${homeStats.drawsaway})
Total matches lost: ${homeStats.losestotal} (Home: ${homeStats.loseshome}, Away: ${homeStats.losesaway})
Form (last matches): ${homeStats.form}
Last 5 matches form: ${safeGet(homeStats, 'last5Form', 'N/A')} | Attack: ${safeGet(homeStats, 'last5Att', 'N/A')} | Defense: ${safeGet(homeStats, 'last5Def', 'N/A')}
Last 5 matches goals: ${safeGet(homeStats, 'last5GoalsFor', 0)} scored (avg: ${safeGet(homeStats, 'last5GoalsForAvg', '0')}), ${safeGet(homeStats, 'last5GoalsAgainst', 0)} conceded (avg: ${safeGet(homeStats, 'last5GoalsAgainstAvg', '0')})
Average goals scored: ${safeGet(homeStats, 'goalsForAvgTotal', '0')} total (Home: ${safeGet(homeStats, 'goalsForAvgHome', '0')}, Away: ${safeGet(homeStats, 'goalsForAvgAway', '0')})
Average goals conceded: ${safeGet(homeStats, 'goalsAgainstAvgTotal', '0')} total (Home: ${safeGet(homeStats, 'goalsAgainstAvgHome', '0')}, Away: ${safeGet(homeStats, 'goalsAgainstAvgAway', '0')})
Total goals scored: ${homeStats.goalsfortotal} (Home: ${homeStats.goalsforhome}, Away: ${homeStats.goalsforaway})
Total goals conceded: ${homeStats.goalsagatotal} (Home: ${homeStats.goalsagahome}, Away: ${homeStats.goalsagaaway})
Matches with over 0.5 goals scored: ${homeStats.goalsOver05} | Under: ${homeStats.goalsUnder05}
Matches with over 1.5 goals scored: ${homeStats.goalsOver15} | Under: ${homeStats.goalsUnder15}
Matches with over 2.5 goals scored: ${homeStats.goalsOver25} | Under: ${homeStats.goalsUnder25}
Matches with over 3.5 goals scored: ${homeStats.goalsOver35} | Under: ${homeStats.goalsUnder35}
Matches with over 0.5 goals conceded: ${homeStats.goalsOver05aga} | Under: ${homeStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${homeStats.goalsOver15aga} | Under: ${homeStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${homeStats.goalsOver25aga} | Under: ${homeStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${homeStats.goalsOver35aga} | Under: ${homeStats.goalsUnder35aga}
Total clean sheets: ${homeStats.cleansheettotal} (Home: ${homeStats.cleansheethome}, Away: ${homeStats.cleansheetaway})
Matches without scoring: ${homeStats.failedtoscoretotal} (Home: ${homeStats.failedtoscorehome}, Away: ${homeStats.failedtoscoreaway})
Biggest win: ${safeGet(homeStats, 'biggestWin', 'N/A')} | Biggest loss: ${safeGet(homeStats, 'biggestLoss', 'N/A')}
Best streak: ${safeGet(homeStats, 'biggestStreakWins', 0)} wins, ${safeGet(homeStats, 'biggestStreakDraws', 0)} draws, ${safeGet(homeStats, 'biggestStreakLoses', 0)} losses
Penalties: ${safeGet(homeStats, 'penaltyScored', 0)} scored, ${safeGet(homeStats, 'penaltyMissed', 0)} missed (Total: ${safeGet(homeStats, 'penaltyTotal', 0)})
Most used formation: ${safeGet(homeStats, 'mostUsedFormation', 'N/A')}

Statistics for the away team, ${awayTeam}, from their matches so far:
Total matches played: ${awayStats.playedTotal}
Total matches won: ${awayStats.winstotal} (Home: ${awayStats.winshome}, Away: ${awayStats.winsaway})
Total matches drawn: ${awayStats.drawstotal} (Home: ${awayStats.drawshome}, Away: ${awayStats.drawsaway})
Total matches lost: ${awayStats.losestotal} (Home: ${awayStats.loseshome}, Away: ${awayStats.losesaway})
Form (last matches): ${awayStats.form}
Last 5 matches form: ${safeGet(awayStats, 'last5Form', 'N/A')} | Attack: ${safeGet(awayStats, 'last5Att', 'N/A')} | Defense: ${safeGet(awayStats, 'last5Def', 'N/A')}
Last 5 matches goals: ${safeGet(awayStats, 'last5GoalsFor', 0)} scored (avg: ${safeGet(awayStats, 'last5GoalsForAvg', '0')}), ${safeGet(awayStats, 'last5GoalsAgainst', 0)} conceded (avg: ${safeGet(awayStats, 'last5GoalsAgainstAvg', '0')})
Average goals scored: ${safeGet(awayStats, 'goalsForAvgTotal', '0')} total (Home: ${safeGet(awayStats, 'goalsForAvgHome', '0')}, Away: ${safeGet(awayStats, 'goalsForAvgAway', '0')})
Average goals conceded: ${safeGet(awayStats, 'goalsAgainstAvgTotal', '0')} total (Home: ${safeGet(awayStats, 'goalsAgainstAvgHome', '0')}, Away: ${safeGet(awayStats, 'goalsAgainstAvgAway', '0')})
Total goals scored: ${awayStats.goalsfortotal} (Home: ${awayStats.goalsforhome}, Away: ${awayStats.goalsforaway})
Total goals conceded: ${awayStats.goalsagatotal} (Home: ${awayStats.goalsagahome}, Away: ${awayStats.goalsagaaway})
Matches with over 0.5 goals scored: ${awayStats.goalsOver05} | Under: ${awayStats.goalsUnder05}
Matches with over 1.5 goals scored: ${awayStats.goalsOver15} | Under: ${awayStats.goalsUnder15}
Matches with over 2.5 goals scored: ${awayStats.goalsOver25} | Under: ${awayStats.goalsUnder25}
Matches with over 3.5 goals scored: ${awayStats.goalsOver35} | Under: ${awayStats.goalsUnder35}
Matches with over 0.5 goals conceded: ${awayStats.goalsOver05aga} | Under: ${awayStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${awayStats.goalsOver15aga} | Under: ${awayStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${awayStats.goalsOver25aga} | Under: ${awayStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${awayStats.goalsOver35aga} | Under: ${awayStats.goalsUnder35aga}
Total clean sheets: ${awayStats.cleansheettotal} (Home: ${awayStats.cleansheethome}, Away: ${awayStats.cleansheetaway})
Matches without scoring: ${awayStats.failedtoscoretotal} (Home: ${awayStats.failedtoscorehome}, Away: ${awayStats.failedtoscoreaway})
Biggest win: ${safeGet(awayStats, 'biggestWin', 'N/A')} | Biggest loss: ${safeGet(awayStats, 'biggestLoss', 'N/A')}
Best streak: ${safeGet(awayStats, 'biggestStreakWins', 0)} wins, ${safeGet(awayStats, 'biggestStreakDraws', 0)} draws, ${safeGet(awayStats, 'biggestStreakLoses', 0)} losses
Penalties: ${safeGet(awayStats, 'penaltyScored', 0)} scored, ${safeGet(awayStats, 'penaltyMissed', 0)} missed (Total: ${safeGet(awayStats, 'penaltyTotal', 0)})
Most used formation: ${safeGet(awayStats, 'mostUsedFormation', 'N/A')}

Team Comparison:
Form comparison: ${homeTeam} ${safeGet(comparison, 'form.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'form.away', '0%')}
Attack comparison: ${homeTeam} ${safeGet(comparison, 'att.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'att.away', '0%')}
Defense comparison: ${homeTeam} ${safeGet(comparison, 'def.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'def.away', '0%')}
Poisson distribution: ${homeTeam} ${safeGet(comparison, 'poisson.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'poisson.away', '0%')}
Head-to-head advantage: ${homeTeam} ${safeGet(comparison, 'h2h.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'h2h.away', '0%')}
Goals advantage: ${homeTeam} ${safeGet(comparison, 'goals.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'goals.away', '0%')}
Overall advantage: ${homeTeam} ${safeGet(comparison, 'total.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'total.away', '0%')}

Head-to-Head History (last 3 matches):
${formatH2H(h2h)}

Provide a detailed analysis based on the data above. Write only the analysis and conclusion without introductory phrases such as "based on the provided data" or "analyzing the above statistics."

At the end, always include your prediction for the match. The prediction should cover only a draw or a win for one of the teams (double chance). IMPORTANT: Since this is a live match with current score ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}, take the current score into account when making your prediction. Additionally, based on the current score, predicted goals data (${predictionGoals?.home || 'N/A'} for ${homeTeam}, ${predictionGoals?.away || 'N/A'} for ${awayTeam}) and team statistics, provide a general prediction about the remaining goals in the match or total goals expected (e.g., "over 2.5 total goals", "under 1.5 more goals", "home team likely to score at least 1 more goal") or which team is more likely to score more goals. Do NOT provide an exact match score. Always use this format:
Prediction: Roma to win or draw. Expected goals: Over 2.5 total goals in the match.`
        : `Please provide a concise but specific textual analysis of the upcoming football match between ${homeTeam} and ${awayTeam}. 

Prediction details:
- Advice: ${prediction || 'N/A'}
- Predicted winner: ${predictionWinner || 'N/A'}
- Win probability: ${homeTeam} ${predictionPercent?.home || '0%'}, Draw ${predictionPercent?.draw || '0%'}, ${awayTeam} ${predictionPercent?.away || '0%'}
- Predicted goals: ${homeTeam} ${predictionGoals?.home || 'N/A'}, ${awayTeam} ${predictionGoals?.away || 'N/A'}
- Win or draw: ${winOrDraw !== null ? (winOrDraw ? 'Yes' : 'No') : 'N/A'}

Statistics for the home team, ${homeTeam}:
Total matches played: ${homeStats.playedTotal}
Total matches won: ${homeStats.winstotal} (Home: ${homeStats.winshome}, Away: ${homeStats.winsaway})
Total matches drawn: ${homeStats.drawstotal} (Home: ${homeStats.drawshome}, Away: ${homeStats.drawsaway})
Total matches lost: ${homeStats.losestotal} (Home: ${homeStats.loseshome}, Away: ${homeStats.losesaway})
Form (last matches): ${homeStats.form}
Last 5 matches form: ${safeGet(homeStats, 'last5Form', 'N/A')} | Attack: ${safeGet(homeStats, 'last5Att', 'N/A')} | Defense: ${safeGet(homeStats, 'last5Def', 'N/A')}
Last 5 matches goals: ${safeGet(homeStats, 'last5GoalsFor', 0)} scored (avg: ${safeGet(homeStats, 'last5GoalsForAvg', '0')}), ${safeGet(homeStats, 'last5GoalsAgainst', 0)} conceded (avg: ${safeGet(homeStats, 'last5GoalsAgainstAvg', '0')})
Average goals scored: ${safeGet(homeStats, 'goalsForAvgTotal', '0')} total (Home: ${safeGet(homeStats, 'goalsForAvgHome', '0')}, Away: ${safeGet(homeStats, 'goalsForAvgAway', '0')})
Average goals conceded: ${safeGet(homeStats, 'goalsAgainstAvgTotal', '0')} total (Home: ${safeGet(homeStats, 'goalsAgainstAvgHome', '0')}, Away: ${safeGet(homeStats, 'goalsAgainstAvgAway', '0')})
Total goals scored: ${homeStats.goalsfortotal} (Home: ${homeStats.goalsforhome}, Away: ${homeStats.goalsforaway})
Total goals conceded: ${homeStats.goalsagatotal} (Home: ${homeStats.goalsagahome}, Away: ${homeStats.goalsagaaway})
Matches with over 0.5 goals scored: ${homeStats.goalsOver05} | Under: ${homeStats.goalsUnder05}
Matches with over 1.5 goals scored: ${homeStats.goalsOver15} | Under: ${homeStats.goalsUnder15}
Matches with over 2.5 goals scored: ${homeStats.goalsOver25} | Under: ${homeStats.goalsUnder25}
Matches with over 3.5 goals scored: ${homeStats.goalsOver35} | Under: ${homeStats.goalsUnder35}
Matches with over 0.5 goals conceded: ${homeStats.goalsOver05aga} | Under: ${homeStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${homeStats.goalsOver15aga} | Under: ${homeStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${homeStats.goalsOver25aga} | Under: ${homeStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${homeStats.goalsOver35aga} | Under: ${homeStats.goalsUnder35aga}
Total clean sheets: ${homeStats.cleansheettotal} (Home: ${homeStats.cleansheethome}, Away: ${homeStats.cleansheetaway})
Matches without scoring: ${homeStats.failedtoscoretotal} (Home: ${homeStats.failedtoscorehome}, Away: ${homeStats.failedtoscoreaway})
Biggest win: ${safeGet(homeStats, 'biggestWin', 'N/A')} | Biggest loss: ${safeGet(homeStats, 'biggestLoss', 'N/A')}
Best streak: ${safeGet(homeStats, 'biggestStreakWins', 0)} wins, ${safeGet(homeStats, 'biggestStreakDraws', 0)} draws, ${safeGet(homeStats, 'biggestStreakLoses', 0)} losses
Penalties: ${safeGet(homeStats, 'penaltyScored', 0)} scored, ${safeGet(homeStats, 'penaltyMissed', 0)} missed (Total: ${safeGet(homeStats, 'penaltyTotal', 0)})
Most used formation: ${safeGet(homeStats, 'mostUsedFormation', 'N/A')}

Statistics for the away team, ${awayTeam}:
Total matches played: ${awayStats.playedTotal}
Total matches won: ${awayStats.winstotal} (Home: ${awayStats.winshome}, Away: ${awayStats.winsaway})
Total matches drawn: ${awayStats.drawstotal} (Home: ${awayStats.drawshome}, Away: ${awayStats.drawsaway})
Total matches lost: ${awayStats.losestotal} (Home: ${awayStats.loseshome}, Away: ${awayStats.losesaway})
Form (last matches): ${awayStats.form}
Last 5 matches form: ${safeGet(awayStats, 'last5Form', 'N/A')} | Attack: ${safeGet(awayStats, 'last5Att', 'N/A')} | Defense: ${safeGet(awayStats, 'last5Def', 'N/A')}
Last 5 matches goals: ${safeGet(awayStats, 'last5GoalsFor', 0)} scored (avg: ${safeGet(awayStats, 'last5GoalsForAvg', '0')}), ${safeGet(awayStats, 'last5GoalsAgainst', 0)} conceded (avg: ${safeGet(awayStats, 'last5GoalsAgainstAvg', '0')})
Average goals scored: ${safeGet(awayStats, 'goalsForAvgTotal', '0')} total (Home: ${safeGet(awayStats, 'goalsForAvgHome', '0')}, Away: ${safeGet(awayStats, 'goalsForAvgAway', '0')})
Average goals conceded: ${safeGet(awayStats, 'goalsAgainstAvgTotal', '0')} total (Home: ${safeGet(awayStats, 'goalsAgainstAvgHome', '0')}, Away: ${safeGet(awayStats, 'goalsAgainstAvgAway', '0')})
Total goals scored: ${awayStats.goalsfortotal} (Home: ${awayStats.goalsforhome}, Away: ${awayStats.goalsforaway})
Total goals conceded: ${awayStats.goalsagatotal} (Home: ${awayStats.goalsagahome}, Away: ${awayStats.goalsagaaway})
Matches with over 0.5 goals scored: ${awayStats.goalsOver05} | Under: ${awayStats.goalsUnder05}
Matches with over 1.5 goals scored: ${awayStats.goalsOver15} | Under: ${awayStats.goalsUnder15}
Matches with over 2.5 goals scored: ${awayStats.goalsOver25} | Under: ${awayStats.goalsUnder25}
Matches with over 3.5 goals scored: ${awayStats.goalsOver35} | Under: ${awayStats.goalsUnder35}
Matches with over 0.5 goals conceded: ${awayStats.goalsOver05aga} | Under: ${awayStats.goalsUnder05aga}
Matches with over 1.5 goals conceded: ${awayStats.goalsOver15aga} | Under: ${awayStats.goalsUnder15aga}
Matches with over 2.5 goals conceded: ${awayStats.goalsOver25aga} | Under: ${awayStats.goalsUnder25aga}
Matches with over 3.5 goals conceded: ${awayStats.goalsOver35aga} | Under: ${awayStats.goalsUnder35aga}
Total clean sheets: ${awayStats.cleansheettotal} (Home: ${awayStats.cleansheethome}, Away: ${awayStats.cleansheetaway})
Matches without scoring: ${awayStats.failedtoscoretotal} (Home: ${awayStats.failedtoscorehome}, Away: ${awayStats.failedtoscoreaway})
Biggest win: ${safeGet(awayStats, 'biggestWin', 'N/A')} | Biggest loss: ${safeGet(awayStats, 'biggestLoss', 'N/A')}
Best streak: ${safeGet(awayStats, 'biggestStreakWins', 0)} wins, ${safeGet(awayStats, 'biggestStreakDraws', 0)} draws, ${safeGet(awayStats, 'biggestStreakLoses', 0)} losses
Penalties: ${safeGet(awayStats, 'penaltyScored', 0)} scored, ${safeGet(awayStats, 'penaltyMissed', 0)} missed (Total: ${safeGet(awayStats, 'penaltyTotal', 0)})
Most used formation: ${safeGet(awayStats, 'mostUsedFormation', 'N/A')}

Team Comparison:
Form comparison: ${homeTeam} ${safeGet(comparison, 'form.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'form.away', '0%')}
Attack comparison: ${homeTeam} ${safeGet(comparison, 'att.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'att.away', '0%')}
Defense comparison: ${homeTeam} ${safeGet(comparison, 'def.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'def.away', '0%')}
Poisson distribution: ${homeTeam} ${safeGet(comparison, 'poisson.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'poisson.away', '0%')}
Head-to-head advantage: ${homeTeam} ${safeGet(comparison, 'h2h.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'h2h.away', '0%')}
Goals advantage: ${homeTeam} ${safeGet(comparison, 'goals.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'goals.away', '0%')}
Overall advantage: ${homeTeam} ${safeGet(comparison, 'total.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'total.away', '0%')}

Head-to-Head History (last 3 matches):
${formatH2H(h2h)}

Please provide a detailed analysis based on the above data. Write only the analysis and conclusion without introductory phrases such as "based on the provided data" or "analyzing the above statistics."

At the end, always include your prediction for the match. The prediction should cover only a draw or a win for one of the teams (double chance). Additionally, based on the predicted goals data (${predictionGoals?.home || 'N/A'} for ${homeTeam}, ${predictionGoals?.away || 'N/A'} for ${awayTeam}) and team statistics, provide a general prediction about the number of goals in the match (e.g., "over 2.5 goals", "under 1.5 goals", "home team to score at least 2 goals") or which team is more likely to score more goals. Do NOT provide an exact match score. Always use this format:
Prediction: Roma to win or draw. Expected goals: Over 2.5 goals in the match.`,

      pl: isLive
        ? `Proszę o krótką ale konkretną analize tekstową meczu piłki nożnej, który aktualnie trwa między ${homeTeam} a ${awayTeam}. Aktualny wynik meczu to ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}. Zawsze zaczynaj analizę od wspomnienia aktualnego wyniku, pamiętaj o tym zawsze aby od tego zaczynać.

Statystyki gospodarzy ${homeTeam} z dotychczasowych meczów:
- Liczba rozegranych meczów: ${homeStats.playedTotal}
- Łączna liczba wygranych meczów: ${homeStats.winstotal} (U siebie: ${homeStats.winshome}, Na wyjeździe: ${homeStats.winsaway})
- Łączna liczba zremisowanych meczów: ${homeStats.drawstotal} (U siebie: ${homeStats.drawshome}, Na wyjeździe: ${homeStats.drawsaway})
- Łączna liczba przegranych meczów: ${homeStats.losestotal} (U siebie: ${homeStats.loseshome}, Na wyjeździe: ${homeStats.losesaway})
- Forma (ostatnie mecze): ${homeStats.form}
- Ostatnie 5 meczów - Forma: ${safeGet(homeStats, 'last5Form', 'N/A')} | Atak: ${safeGet(homeStats, 'last5Att', 'N/A')} | Obrona: ${safeGet(homeStats, 'last5Def', 'N/A')}
- Ostatnie 5 meczów - Gole: ${safeGet(homeStats, 'last5GoalsFor', 0)} zdobyte (śr: ${safeGet(homeStats, 'last5GoalsForAvg', '0')}), ${safeGet(homeStats, 'last5GoalsAgainst', 0)} stracone (śr: ${safeGet(homeStats, 'last5GoalsAgainstAvg', '0')})
- Średnia zdobytych goli: ${safeGet(homeStats, 'goalsForAvgTotal', '0')} łącznie (U siebie: ${safeGet(homeStats, 'goalsForAvgHome', '0')}, Na wyjeździe: ${safeGet(homeStats, 'goalsForAvgAway', '0')})
- Średnia straconych goli: ${safeGet(homeStats, 'goalsAgainstAvgTotal', '0')} łącznie (U siebie: ${safeGet(homeStats, 'goalsAgainstAvgHome', '0')}, Na wyjeździe: ${safeGet(homeStats, 'goalsAgainstAvgAway', '0')})
- Łączna ilość zdobytych goli: ${homeStats.goalsfortotal} (U siebie: ${homeStats.goalsforhome}, Na wyjeździe: ${homeStats.goalsforaway})
- Łączna ilość straconych goli: ${homeStats.goalsagatotal} (U siebie: ${homeStats.goalsagahome}, Na wyjeździe: ${homeStats.goalsagaaway})
- Mecze ze zdobytymi golami ponad 0.5: ${homeStats.goalsOver05} | Poniżej: ${homeStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${homeStats.goalsOver15} | Poniżej: ${homeStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${homeStats.goalsOver25} | Poniżej: ${homeStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${homeStats.goalsOver35} | Poniżej: ${homeStats.goalsUnder35}
- Mecze ze straconymi golami ponad 0.5: ${homeStats.goalsOver05aga} | Poniżej: ${homeStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${homeStats.goalsOver15aga} | Poniżej: ${homeStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${homeStats.goalsOver25aga} | Poniżej: ${homeStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${homeStats.goalsOver35aga} | Poniżej: ${homeStats.goalsUnder35aga}
- Łączna ilość meczy z czystym kontem: ${homeStats.cleansheettotal} (U siebie: ${homeStats.cleansheethome}, Na wyjeździe: ${homeStats.cleansheetaway})
- Łączna liczba meczy bez zdobytej bramki: ${homeStats.failedtoscoretotal} (U siebie: ${homeStats.failedtoscorehome}, Na wyjeździe: ${homeStats.failedtoscoreaway})
- Największe zwycięstwo: ${safeGet(homeStats, 'biggestWin', 'N/A')} | Największa porażka: ${safeGet(homeStats, 'biggestLoss', 'N/A')}
- Najlepsza seria: ${safeGet(homeStats, 'biggestStreakWins', 0)} wygranych, ${safeGet(homeStats, 'biggestStreakDraws', 0)} remisów, ${safeGet(homeStats, 'biggestStreakLoses', 0)} porażek
- Karne: ${safeGet(homeStats, 'penaltyScored', 0)} zdobyte, ${safeGet(homeStats, 'penaltyMissed', 0)} niezdobyte (Łącznie: ${safeGet(homeStats, 'penaltyTotal', 0)})
- Najczęściej używana formacja: ${safeGet(homeStats, 'mostUsedFormation', 'N/A')}

Statystyki gości ${awayTeam} z dotychczasowych meczów:
- Liczba rozegranych meczów: ${awayStats.playedTotal}
- Łączna liczba wygranych meczów: ${awayStats.winstotal} (U siebie: ${awayStats.winshome}, Na wyjeździe: ${awayStats.winsaway})
- Łączna liczba zremisowanych meczów: ${awayStats.drawstotal} (U siebie: ${awayStats.drawshome}, Na wyjeździe: ${awayStats.drawsaway})
- Łączna liczba przegranych meczów: ${awayStats.losestotal} (U siebie: ${awayStats.loseshome}, Na wyjeździe: ${awayStats.losesaway})
- Forma (ostatnie mecze): ${awayStats.form}
- Ostatnie 5 meczów - Forma: ${safeGet(awayStats, 'last5Form', 'N/A')} | Atak: ${safeGet(awayStats, 'last5Att', 'N/A')} | Obrona: ${safeGet(awayStats, 'last5Def', 'N/A')}
- Ostatnie 5 meczów - Gole: ${safeGet(awayStats, 'last5GoalsFor', 0)} zdobyte (śr: ${safeGet(awayStats, 'last5GoalsForAvg', '0')}), ${safeGet(awayStats, 'last5GoalsAgainst', 0)} stracone (śr: ${safeGet(awayStats, 'last5GoalsAgainstAvg', '0')})
- Średnia zdobytych goli: ${safeGet(awayStats, 'goalsForAvgTotal', '0')} łącznie (U siebie: ${safeGet(awayStats, 'goalsForAvgHome', '0')}, Na wyjeździe: ${safeGet(awayStats, 'goalsForAvgAway', '0')})
- Średnia straconych goli: ${safeGet(awayStats, 'goalsAgainstAvgTotal', '0')} łącznie (U siebie: ${safeGet(awayStats, 'goalsAgainstAvgHome', '0')}, Na wyjeździe: ${safeGet(awayStats, 'goalsAgainstAvgAway', '0')})
- Łączna ilość zdobytych goli: ${awayStats.goalsfortotal} (U siebie: ${awayStats.goalsforhome}, Na wyjeździe: ${awayStats.goalsforaway})
- Łączna ilość straconych goli: ${awayStats.goalsagatotal} (U siebie: ${awayStats.goalsagahome}, Na wyjeździe: ${awayStats.goalsagaaway})
- Mecze ze zdobytymi golami ponad 0.5: ${awayStats.goalsOver05} | Poniżej: ${awayStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${awayStats.goalsOver15} | Poniżej: ${awayStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${awayStats.goalsOver25} | Poniżej: ${awayStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${awayStats.goalsOver35} | Poniżej: ${awayStats.goalsUnder35}
- Mecze ze straconymi golami ponad 0.5: ${awayStats.goalsOver05aga} | Poniżej: ${awayStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${awayStats.goalsOver15aga} | Poniżej: ${awayStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${awayStats.goalsOver25aga} | Poniżej: ${awayStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${awayStats.goalsOver35aga} | Poniżej: ${awayStats.goalsUnder35aga}
- Łączna ilość meczy z czystym kontem: ${awayStats.cleansheettotal} (U siebie: ${awayStats.cleansheethome}, Na wyjeździe: ${awayStats.cleansheetaway})
- Łączna liczba meczy bez zdobytej bramki: ${awayStats.failedtoscoretotal} (U siebie: ${awayStats.failedtoscorehome}, Na wyjeździe: ${awayStats.failedtoscoreaway})
- Największe zwycięstwo: ${safeGet(awayStats, 'biggestWin', 'N/A')} | Największa porażka: ${safeGet(awayStats, 'biggestLoss', 'N/A')}
- Najlepsza seria: ${safeGet(awayStats, 'biggestStreakWins', 0)} wygranych, ${safeGet(awayStats, 'biggestStreakDraws', 0)} remisów, ${safeGet(awayStats, 'biggestStreakLoses', 0)} porażek
- Karne: ${safeGet(awayStats, 'penaltyScored', 0)} zdobyte, ${safeGet(awayStats, 'penaltyMissed', 0)} niezdobyte (Łącznie: ${safeGet(awayStats, 'penaltyTotal', 0)})
- Najczęściej używana formacja: ${safeGet(awayStats, 'mostUsedFormation', 'N/A')}

Porównanie drużyn:
Porównanie formy: ${homeTeam} ${safeGet(comparison, 'form.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'form.away', '0%')}
Porównanie ataku: ${homeTeam} ${safeGet(comparison, 'att.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'att.away', '0%')}
Porównanie obrony: ${homeTeam} ${safeGet(comparison, 'def.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'def.away', '0%')}
Rozkład Poissona: ${homeTeam} ${safeGet(comparison, 'poisson.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'poisson.away', '0%')}
Przewaga w bezpośrednich spotkaniach: ${homeTeam} ${safeGet(comparison, 'h2h.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'h2h.away', '0%')}
Przewaga w golach: ${homeTeam} ${safeGet(comparison, 'goals.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'goals.away', '0%')}
Ogólna przewaga: ${homeTeam} ${safeGet(comparison, 'total.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'total.away', '0%')}

Historia bezpośrednich spotkań (ostatnie 3 mecze):
${formatH2H(h2h)}

Proszę o szczegółową analizę na podstawie powyższych danych. Pisz tylko o analizie, nie pisz nic na początku np że "na podstawie przekazanych statystyk", "Na podstawie dostarczonych danych", "Analizując powyższe statystyki" itp tylko od razu pisz konkretną analizę i wniosek. 
Proszę abyś na końcu zawsze podawał swoje przewidywanie na ten mecz i niech one obejmują tylko remis lub wygraną którejś ze stron czyli tak zwana podwójna szansa. WAŻNE: Ponieważ to mecz na żywo z aktualnym wynikiem ${homeTeam} ${currentGoals.home} - ${currentGoals.away} ${awayTeam}, weź pod uwagę aktualny wynik przy formułowaniu przewidywania. Dodatkowo, na podstawie aktualnego wyniku, danych o przewidywanych golach (${predictionGoals?.home || 'N/A'} dla ${homeTeam}, ${predictionGoals?.away || 'N/A'} dla ${awayTeam}) oraz statystyk drużyn, podaj ogólne przewidywanie dotyczące pozostałych bramek w meczu lub łącznej liczby bramek (np. "ponad 2.5 gola łącznie", "poniżej 1.5 gola więcej", "gospodarze prawdopodobnie zdobędą co najmniej 1 gole więcej") lub która drużyna prawdopodobnie zdobędzie więcej bramek. NIE podawaj dokładnego wyniku meczu. Zawsze w takim formacie np: Przewidywanie: Roma wygra lub remis. Przewidywane gole: Ponad 2.5 gola łącznie w meczu.`
        : `Proszę o krótką ale konkretną analize tekstową nadchodzącego meczu piłki nożnej między ${homeTeam} a ${awayTeam}. 

Szczegóły przewidywania:
- Porada: ${prediction || 'N/A'}
- Przewidywany zwycięzca: ${predictionWinner || 'N/A'}
- Prawdopodobieństwo wygranej: ${homeTeam} ${predictionPercent?.home || '0%'}, Remis ${predictionPercent?.draw || '0%'}, ${awayTeam} ${predictionPercent?.away || '0%'}
- Przewidywane gole: ${homeTeam} ${predictionGoals?.home || 'N/A'}, ${awayTeam} ${predictionGoals?.away || 'N/A'}
- Wygrana lub remis: ${winOrDraw !== null ? (winOrDraw ? 'Tak' : 'Nie') : 'N/A'}

Statystyki gospodarzy ${homeTeam}:
- Liczba rozegranych meczów: ${homeStats.playedTotal}
- Łączna liczba wygranych meczów: ${homeStats.winstotal} (U siebie: ${homeStats.winshome}, Na wyjeździe: ${homeStats.winsaway})
- Łączna liczba zremisowanych meczów: ${homeStats.drawstotal} (U siebie: ${homeStats.drawshome}, Na wyjeździe: ${homeStats.drawsaway})
- Łączna liczba przegranych meczów: ${homeStats.losestotal} (U siebie: ${homeStats.loseshome}, Na wyjeździe: ${homeStats.losesaway})
- Forma (ostatnie mecze): ${homeStats.form}
- Ostatnie 5 meczów - Forma: ${safeGet(homeStats, 'last5Form', 'N/A')} | Atak: ${safeGet(homeStats, 'last5Att', 'N/A')} | Obrona: ${safeGet(homeStats, 'last5Def', 'N/A')}
- Ostatnie 5 meczów - Gole: ${safeGet(homeStats, 'last5GoalsFor', 0)} zdobyte (śr: ${safeGet(homeStats, 'last5GoalsForAvg', '0')}), ${safeGet(homeStats, 'last5GoalsAgainst', 0)} stracone (śr: ${safeGet(homeStats, 'last5GoalsAgainstAvg', '0')})
- Średnia zdobytych goli: ${safeGet(homeStats, 'goalsForAvgTotal', '0')} łącznie (U siebie: ${safeGet(homeStats, 'goalsForAvgHome', '0')}, Na wyjeździe: ${safeGet(homeStats, 'goalsForAvgAway', '0')})
- Średnia straconych goli: ${safeGet(homeStats, 'goalsAgainstAvgTotal', '0')} łącznie (U siebie: ${safeGet(homeStats, 'goalsAgainstAvgHome', '0')}, Na wyjeździe: ${safeGet(homeStats, 'goalsAgainstAvgAway', '0')})
- Łączna ilość zdobytych goli: ${homeStats.goalsfortotal} (U siebie: ${homeStats.goalsforhome}, Na wyjeździe: ${homeStats.goalsforaway})
- Łączna ilość straconych goli: ${homeStats.goalsagatotal} (U siebie: ${homeStats.goalsagahome}, Na wyjeździe: ${homeStats.goalsagaaway})
- Mecze ze zdobytymi golami ponad 0.5: ${homeStats.goalsOver05} | Poniżej: ${homeStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${homeStats.goalsOver15} | Poniżej: ${homeStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${homeStats.goalsOver25} | Poniżej: ${homeStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${homeStats.goalsOver35} | Poniżej: ${homeStats.goalsUnder35}
- Mecze ze straconymi golami ponad 0.5: ${homeStats.goalsOver05aga} | Poniżej: ${homeStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${homeStats.goalsOver15aga} | Poniżej: ${homeStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${homeStats.goalsOver25aga} | Poniżej: ${homeStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${homeStats.goalsOver35aga} | Poniżej: ${homeStats.goalsUnder35aga}
- Łączna ilość meczy z czystym kontem: ${homeStats.cleansheettotal} (U siebie: ${homeStats.cleansheethome}, Na wyjeździe: ${homeStats.cleansheetaway})
- Łączna liczba meczy bez zdobytej bramki: ${homeStats.failedtoscoretotal} (U siebie: ${homeStats.failedtoscorehome}, Na wyjeździe: ${homeStats.failedtoscoreaway})
- Największe zwycięstwo: ${safeGet(homeStats, 'biggestWin', 'N/A')} | Największa porażka: ${safeGet(homeStats, 'biggestLoss', 'N/A')}
- Najlepsza seria: ${safeGet(homeStats, 'biggestStreakWins', 0)} wygranych, ${safeGet(homeStats, 'biggestStreakDraws', 0)} remisów, ${safeGet(homeStats, 'biggestStreakLoses', 0)} porażek
- Karne: ${safeGet(homeStats, 'penaltyScored', 0)} zdobyte, ${safeGet(homeStats, 'penaltyMissed', 0)} niezdobyte (Łącznie: ${safeGet(homeStats, 'penaltyTotal', 0)})
- Najczęściej używana formacja: ${safeGet(homeStats, 'mostUsedFormation', 'N/A')}

Statystyki gości ${awayTeam}:
- Liczba rozegranych meczów: ${awayStats.playedTotal}
- Łączna liczba wygranych meczów: ${awayStats.winstotal} (U siebie: ${awayStats.winshome}, Na wyjeździe: ${awayStats.winsaway})
- Łączna liczba zremisowanych meczów: ${awayStats.drawstotal} (U siebie: ${awayStats.drawshome}, Na wyjeździe: ${awayStats.drawsaway})
- Łączna liczba przegranych meczów: ${awayStats.losestotal} (U siebie: ${awayStats.loseshome}, Na wyjeździe: ${awayStats.losesaway})
- Forma (ostatnie mecze): ${awayStats.form}
- Ostatnie 5 meczów - Forma: ${safeGet(awayStats, 'last5Form', 'N/A')} | Atak: ${safeGet(awayStats, 'last5Att', 'N/A')} | Obrona: ${safeGet(awayStats, 'last5Def', 'N/A')}
- Ostatnie 5 meczów - Gole: ${safeGet(awayStats, 'last5GoalsFor', 0)} zdobyte (śr: ${safeGet(awayStats, 'last5GoalsForAvg', '0')}), ${safeGet(awayStats, 'last5GoalsAgainst', 0)} stracone (śr: ${safeGet(awayStats, 'last5GoalsAgainstAvg', '0')})
- Średnia zdobytych goli: ${safeGet(awayStats, 'goalsForAvgTotal', '0')} łącznie (U siebie: ${safeGet(awayStats, 'goalsForAvgHome', '0')}, Na wyjeździe: ${safeGet(awayStats, 'goalsForAvgAway', '0')})
- Średnia straconych goli: ${safeGet(awayStats, 'goalsAgainstAvgTotal', '0')} łącznie (U siebie: ${safeGet(awayStats, 'goalsAgainstAvgHome', '0')}, Na wyjeździe: ${safeGet(awayStats, 'goalsAgainstAvgAway', '0')})
- Łączna ilość zdobytych goli: ${awayStats.goalsfortotal} (U siebie: ${awayStats.goalsforhome}, Na wyjeździe: ${awayStats.goalsforaway})
- Łączna ilość straconych goli: ${awayStats.goalsagatotal} (U siebie: ${awayStats.goalsagahome}, Na wyjeździe: ${awayStats.goalsagaaway})
- Mecze ze zdobytymi golami ponad 0.5: ${awayStats.goalsOver05} | Poniżej: ${awayStats.goalsUnder05}
- Mecze ze zdobytymi golami ponad 1.5: ${awayStats.goalsOver15} | Poniżej: ${awayStats.goalsUnder15}
- Mecze ze zdobytymi golami ponad 2.5: ${awayStats.goalsOver25} | Poniżej: ${awayStats.goalsUnder25}
- Mecze ze zdobytymi golami ponad 3.5: ${awayStats.goalsOver35} | Poniżej: ${awayStats.goalsUnder35}
- Mecze ze straconymi golami ponad 0.5: ${awayStats.goalsOver05aga} | Poniżej: ${awayStats.goalsUnder05aga}
- Mecze ze straconymi golami ponad 1.5: ${awayStats.goalsOver15aga} | Poniżej: ${awayStats.goalsUnder15aga}
- Mecze ze straconymi golami ponad 2.5: ${awayStats.goalsOver25aga} | Poniżej: ${awayStats.goalsUnder25aga}
- Mecze ze straconymi golami ponad 3.5: ${awayStats.goalsOver35aga} | Poniżej: ${awayStats.goalsUnder35aga}
- Łączna ilość meczy z czystym kontem: ${awayStats.cleansheettotal} (U siebie: ${awayStats.cleansheethome}, Na wyjeździe: ${awayStats.cleansheetaway})
- Łączna liczba meczy bez zdobytej bramki: ${awayStats.failedtoscoretotal} (U siebie: ${awayStats.failedtoscorehome}, Na wyjeździe: ${awayStats.failedtoscoreaway})
- Największe zwycięstwo: ${safeGet(awayStats, 'biggestWin', 'N/A')} | Największa porażka: ${safeGet(awayStats, 'biggestLoss', 'N/A')}
- Najlepsza seria: ${safeGet(awayStats, 'biggestStreakWins', 0)} wygranych, ${safeGet(awayStats, 'biggestStreakDraws', 0)} remisów, ${safeGet(awayStats, 'biggestStreakLoses', 0)} porażek
- Karne: ${safeGet(awayStats, 'penaltyScored', 0)} zdobyte, ${safeGet(awayStats, 'penaltyMissed', 0)} niezdobyte (Łącznie: ${safeGet(awayStats, 'penaltyTotal', 0)})
- Najczęściej używana formacja: ${safeGet(awayStats, 'mostUsedFormation', 'N/A')}

Porównanie drużyn:
Porównanie formy: ${homeTeam} ${safeGet(comparison, 'form.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'form.away', '0%')}
Porównanie ataku: ${homeTeam} ${safeGet(comparison, 'att.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'att.away', '0%')}
Porównanie obrony: ${homeTeam} ${safeGet(comparison, 'def.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'def.away', '0%')}
Rozkład Poissona: ${homeTeam} ${safeGet(comparison, 'poisson.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'poisson.away', '0%')}
Przewaga w bezpośrednich spotkaniach: ${homeTeam} ${safeGet(comparison, 'h2h.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'h2h.away', '0%')}
Przewaga w golach: ${homeTeam} ${safeGet(comparison, 'goals.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'goals.away', '0%')}
Ogólna przewaga: ${homeTeam} ${safeGet(comparison, 'total.home', '0%')} vs ${awayTeam} ${safeGet(comparison, 'total.away', '0%')}

Historia bezpośrednich spotkań (ostatnie 3 mecze):
${formatH2H(h2h)}

Proszę o szczegółową analizę na podstawie powyższych danych. Pisz tylko o analizie, nie pisz nic na początku np że "na podstawie przekazanych statystyk", "Na podstawie dostarczonych danych", "Analizując powyższe statystyki" itp tylko od razu pisz konkretną analizę i wniosek. 
Proszę abyś na końcu zawsze podawał swoje przewidywanie na ten mecz i niech one obejmują tylko remis lub wygraną którejś ze stron czyli tak zwana podwójna szansa. Dodatkowo, na podstawie danych o przewidywanych golach (${predictionGoals?.home || 'N/A'} dla ${homeTeam}, ${predictionGoals?.away || 'N/A'} dla ${awayTeam}) oraz statystyk drużyn, podaj ogólne przewidywanie dotyczące liczby bramek w meczu (np. "ponad 2.5 gola", "poniżej 1.5 gola", "gospodarze zdobędą co najmniej 2 gole") lub która drużyna prawdopodobnie zdobędzie więcej bramek. NIE podawaj dokładnego wyniku meczu. Zawsze w takim formacie np: Przewidywanie: Roma wygra lub remis. Przewidywane gole: Ponad 2.5 gola w meczu.`,
    };

    const prompt = prompts[lang2] || prompts['pl'];
    
    if (process.env.NODE_ENV === 'development') {
      console.log('Requesting OpenAI analysis for fixture:', fixtureId, 'Language:', lang2);
    }
    
    // Create a promise with timeout
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: prompt },
      ],
    });
    
    // Add timeout wrapper (55 seconds)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), 55000);
    });
    
    const completion = await Promise.race([completionPromise, timeoutPromise]);

    const analysis = completion?.choices?.[0]?.message?.content?.trim();

    if (!analysis) {
      throw new Error('AI did not generate analysis');
    }

      // Save analysis to database (only for pre-match, not for live)
      // Live matches should always generate fresh analysis with current score
      if (!isLive) {
        await MatchAnalysis.updateOne({ fixtureId, language: lang2 }, { $set: { analysis } }, { upsert: true });
      }
      
      // Increment analysis limit counter after successful generation
      await incrementAnalysisLimit(limitIdentifier, isAuthenticated);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('Resolved language:', lang2);
        console.log('=== Analysis generated successfully ===');
        console.log(`[Limit] Incremented for ${isAuthenticated ? 'user' : 'IP'}: ${limitIdentifier}`);
      }

      // Release lock AFTER everything is done, but BEFORE returning response
      await releaseAnalysisLock(userIdentifier);
      
      return Response.json({ analysis }, { status: 200 });
    } catch (innerError) {
      // Release lock on any error during generation
      await releaseAnalysisLock(userIdentifier);
      throw innerError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    // Check if error occurred before body parsing
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Invalid JSON in request body');
      }
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (process.env.NODE_ENV === 'development') {
      console.error('Error generating or saving match analysis:', error);
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error status:', error.status);
    }
    
    // Check for specific OpenAI errors
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || error.response?.status;
    
    if (errorMessage.includes('rate limit') || errorMessage.includes('ratelimiterror') || errorStatus === 429) {
      if (process.env.NODE_ENV === 'development') {
        console.error('OpenAI rate limit exceeded');
      }
      return Response.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
    }
    
    if (errorMessage.includes('insufficient_quota') || errorMessage.includes('quota') || errorStatus === 402) {
      if (process.env.NODE_ENV === 'development') {
        console.error('OpenAI quota exceeded');
      }
      return Response.json({ error: 'OpenAI quota exceeded. Please check your account and billing.' }, { status: 402 });
    }
    
    if (errorMessage.includes('timeout') || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      if (process.env.NODE_ENV === 'development') {
        console.error('Request timeout');
      }
      return Response.json({ error: 'Request timeout. The analysis is taking too long. Please try again.' }, { status: 504 });
    }
    
    if (errorMessage.includes('invalid_api_key') || errorMessage.includes('authentication')) {
      if (process.env.NODE_ENV === 'development') {
        console.error('OpenAI API key invalid');
      }
      return Response.json({ error: 'OpenAI API key is invalid. Please check your configuration.' }, { status: 401 });
    }
    
    return Response.json({ 
      error: 'Failed to generate or save analysis.',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  }
}

