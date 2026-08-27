import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { cookies } from 'next/headers';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { ACCESS_TTL_MIN, REFRESH_TTL_DAYS } from '@/lib/authConstants';

export { ACCESS_TTL_MIN, REFRESH_TTL_DAYS };

/** `un` = username for Socket.IO (no DB lookup). Keep payload small. */
export function signAccessToken({ userId, tokenVersion = 0, username = '' }) {
  const un =
    typeof username === 'string' ? username.trim().slice(0, 32) : '';
  return jwt.sign({ userId, tv: tokenVersion, un }, process.env.JWT_SECRET, {
    expiresIn: `${ACCESS_TTL_MIN}m`,
  });
}

export function signRefreshToken({ userId, tokenVersion = 0 }) {
  return jwt.sign({ userId, tv: tokenVersion, typ: 'refresh' }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: `${REFRESH_TTL_DAYS}d`,
  });
}

export function verifyJwt(token, secret = process.env.JWT_SECRET) {
  return jwt.verify(token, secret);
}

// For Route Handlers (App Router)
export async function setAuthCookiesRouteHandler({ accessToken, refreshToken }) {
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === 'production';
  
  // 'lax' zamiast 'strict': przy 'strict' przeglądarka nie wysyła ciasteczek przy wejściu
  // z linku w mailu (weryfikacja adresu, reset hasła) — użytkownik lądował wylogowany.
  // Wszystkie operacje zmieniające stan idą POST-em, których 'lax' i tak nie przepuszcza
  // z obcej domeny, więc ochrona przed CSRF zostaje.
  cookieStore.set('accessToken', accessToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    maxAge: ACCESS_TTL_MIN * 60,
  });

  cookieStore.set('refreshToken', refreshToken, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProd,
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearAuthCookiesRouteHandler() {
  const cookieStore = await cookies();
  
  cookieStore.delete('accessToken');
  cookieStore.delete('refreshToken');
}

export async function getCookieRouteHandler(name) {
  const cookieStore = await cookies();
  return cookieStore.get(name)?.value || null;
}

/**
 * Verified session from httpOnly access cookie (DB checks tokenVersion).
 * Use for API routes — never trust client-supplied username.
 */
export async function getAuthenticatedUser() {
  try {
    const accessToken = await getCookieRouteHandler('accessToken');
    if (!accessToken) return null;
    const decoded = verifyJwt(accessToken, process.env.JWT_SECRET);
    await connectToDb();
    const user = await User.findById(decoded.userId).select('username tokenVersion');
    if (!user) return null;
    if ((user.tokenVersion || 0) !== (decoded.tv ?? 0)) return null;
    return { userId: user.id, username: user.username };
  } catch {
    return null;
  }
}

// For Pages Router (backward compatibility)
export function setAuthCookies(res, { accessToken, refreshToken }) {
  const isProd = process.env.NODE_ENV === 'production';
  const common = `HttpOnly; Path=/; SameSite=Lax; ${isProd ? 'Secure; ' : ''}`;

  res.setHeader('Set-Cookie', [
    `accessToken=${accessToken}; ${common}Max-Age=${ACCESS_TTL_MIN * 60}`,
    `refreshToken=${refreshToken}; ${common}Max-Age=${REFRESH_TTL_DAYS * 24 * 60 * 60}`,
  ]);
}

export function clearAuthCookies(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const common = `HttpOnly; Path=/; SameSite=Lax; ${isProd ? 'Secure; ' : ''}`;

  res.setHeader('Set-Cookie', [
    `accessToken=; ${common}Max-Age=0`,
    `refreshToken=; ${common}Max-Age=0`,
  ]);
}

export function readCookie(req, name) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function ensureString(v, max = 100) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

export async function hashRefreshToken(token) {
  return bcrypt.hash(token, 12);
}

export async function compareRefreshToken(token, hash) {
  if (!token || !hash) return false;
  return bcrypt.compare(token, hash);
}
