import { OAuth2Client } from 'google-auth-library';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookiesRouteHandler,
  hashRefreshToken,
} from '@/lib/auth';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export async function POST(request) {
  try {
    await connectToDb();
    
    const body = await request.json();
    const { credential } = body || {};
    
    if (!credential) {
      return Response.json({ error: 'Missing credential' }, { status: 400 });
    }

    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();

    if (!p?.email || !p?.sub) {
      return Response.json({ error: 'Invalid Google token' }, { status: 400 });
    }
    if (p.email_verified === false) {
      return Response.json({ error: 'Email not verified by Google' }, { status: 400 });
    }

    let user = await User.findOne({ $or: [{ googleId: p.sub }, { email: p.email.toLowerCase() }] });

    if (!user) {
      const base = (p.name || p.email.split('@')[0]).replace(/\s+/g, '').slice(0, 20) || `user${p.sub.slice(-6)}`;
      let candidate = base;
      let i = 0;

      while (await User.findOne({ username: candidate })) {
        i += 1;
        candidate = `${base}${i}`;
      }

      user = await User.create({
        email: p.email.toLowerCase(),
        username: candidate,
        password: null,
        googleId: p.sub,
        image: p.picture || null,
      });
    } else {
      const update = {};
      if (!user.googleId) update.googleId = p.sub;
      if (!user.image && p.picture) update.image = p.picture;
      if (Object.keys(update).length) {
        await User.updateOne({ _id: user._id }, { $set: update });
      }
    }

    const accessToken = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });
    const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });

    user.refreshTokenHash = await hashRefreshToken(refreshToken);
    await user.save();

    await setAuthCookiesRouteHandler({ accessToken, refreshToken });

    return Response.json({ ok: true, username: user.username }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('google auth error:', err);
    }
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

