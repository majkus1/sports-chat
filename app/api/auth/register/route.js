import User from '@/models/User';
import bcrypt from 'bcrypt';
import connectToDb from '@/lib/db';
import { NextResponse } from 'next/server';
import { 
  ensureString, 
  signAccessToken, 
  signRefreshToken, 
  setAuthCookiesRouteHandler, 
  hashRefreshToken 
} from '@/lib/auth';

export async function POST(request) {
  try {
    await connectToDb();
    
    const body = await request.json();
    const { email, password, username } = body || {};
    
    // Validate all fields exist and are strings
    if (!ensureString(email) || !ensureString(password, 200) || !ensureString(username, 32)) {
      return NextResponse.json({ error: 'register_bad_data' }, { status: 400 });
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json({ error: 'register_pwd_short' }, { status: 400 });
    }

    const emailNorm = email.toLowerCase().trim();
    const usernameNorm = username.trim();

    const existingEmail = await User.findOne({ email: emailNorm });
    if (existingEmail) {
      return NextResponse.json({ error: 'register_email_taken' }, { status: 409 });
    }

    const existingUsername = await User.findOne({ username: usernameNorm });
    if (existingUsername) {
      return NextResponse.json({ error: 'register_username_taken' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: emailNorm,
      username: usernameNorm,
      password: hashedPassword,
    });

    const accessToken = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });
    const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });

    user.refreshTokenHash = await hashRefreshToken(refreshToken);
    await user.save();

    // Set cookies before creating response
    try {
      await setAuthCookiesRouteHandler({ accessToken, refreshToken });
    } catch (cookieErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error setting cookies:', cookieErr);
      }
      // Continue anyway - user is created, cookies can be set on next request
    }

    return NextResponse.json({ ok: true, username: user.username }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('register error:', err);
      console.error('Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
    });
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

