import User from '@/models/User';
import bcrypt from 'bcrypt';
import connectToDb from '@/lib/db';
import {
  ensureString,
  signAccessToken,
  signRefreshToken,
  setAuthCookiesRouteHandler,
  hashRefreshToken,
} from '@/lib/auth';

export async function POST(request) {
  try {
    await connectToDb();
    
    const body = await request.json();
    const { username, password } = body || {};
    
    if (!ensureString(username, 32) || !ensureString(password, 200)) {
      return Response.json({ error: 'login_bad_data' }, { status: 400 });
    }

    const user = await User.findOne({ username: username.trim() });
    if (!user || !user.password) {
      return Response.json({ error: 'login_invalid' }, { status: 401 });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return Response.json({ error: 'login_invalid' }, { status: 401 });
    }

    const accessToken = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });
    const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });

    user.refreshTokenHash = await hashRefreshToken(refreshToken);
    await user.save();

    await setAuthCookiesRouteHandler({ accessToken, refreshToken });

    return Response.json({ ok: true, username: user.username }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('login error:', err);
    }
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}

