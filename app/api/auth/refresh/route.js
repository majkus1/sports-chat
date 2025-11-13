import connectToDb from '@/lib/db';
import User from '@/models/User';
import {
  getCookieRouteHandler,
  verifyJwt,
  signAccessToken,
  signRefreshToken,
  setAuthCookiesRouteHandler,
  clearAuthCookiesRouteHandler,
  compareRefreshToken,
  hashRefreshToken,
} from '@/lib/auth';

export async function POST(request) {
  try {
    await connectToDb();

    const rt = await getCookieRouteHandler('refreshToken');
    if (!rt) {
      return Response.json({ error: 'Brak refresh tokena' }, { status: 401 });
    }

    let decoded;
    try {
      decoded = verifyJwt(rt, process.env.REFRESH_TOKEN_SECRET);
      if (decoded.typ !== 'refresh') throw new Error('Invalid type');
    } catch (e) {
      await clearAuthCookiesRouteHandler();
      return Response.json({ error: 'Nieprawidłowy refresh token' }, { status: 401 });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      await clearAuthCookiesRouteHandler();
      return Response.json({ error: 'Użytkownik nie istnieje' }, { status: 401 });
    }

    if ((user.tokenVersion || 0) !== (decoded.tv || 0)) {
      await clearAuthCookiesRouteHandler();
      return Response.json({ error: 'Sesja unieważniona' }, { status: 401 });
    }

    const match = await compareRefreshToken(rt, user.refreshTokenHash);
    if (!match) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.refreshTokenHash = null;
      await user.save();
      await clearAuthCookiesRouteHandler();
      return Response.json({ error: 'Wykryto nadużycie refresh tokena' }, { status: 401 });
    }

    const newAccess = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });
    const newRefresh = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });

    user.refreshTokenHash = await hashRefreshToken(newRefresh);
    await user.save();

    await setAuthCookiesRouteHandler({ accessToken: newAccess, refreshToken: newRefresh });

    return Response.json({ ok: true }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('refresh error:', err);
    }
    return Response.json({ error: 'Nie udało się odświeżyć' }, { status: 401 });
  }
}

