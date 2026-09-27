import { OAuth2Client } from 'google-auth-library';
import connectToDb from '@/lib/db';
import {
  signAccessToken,
  signRefreshToken,
  setAuthCookiesRouteHandler,
  hashRefreshToken,
} from '@/lib/auth';
import { googleSignIn } from '@/lib/auth/googleSignIn';
import { sendWelcomeEmail } from '@/lib/onboarding/welcome';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/*
 * Kody błędów zamiast zdań — interfejs tłumaczy je sam (pl/en).
 *
 * `google_terms_required` to nie awaria: nowa osoba kliknęła Google w oknie LOGOWANIA,
 * gdzie nie ma zgody na regulamin. Interfejs przenosi ją wtedy do okna rejestracji.
 */
const STATUS = {
  google_invalid_token: 400,
  google_email_not_verified: 400,
  google_terms_required: 409,
  google_account_conflict: 409,
};

export async function POST(request) {
  try {
    await connectToDb();

    const body = await request.json().catch(() => null);
    const { credential, acceptedTerms } = body || {};

    if (!credential || typeof credential !== 'string') {
      return Response.json({ error: 'google_invalid_token' }, { status: 400 });
    }

    let p;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      p = ticket.getPayload();
    } catch {
      return Response.json({ error: 'google_invalid_token' }, { status: 400 });
    }

    const result = await googleSignIn(p, { acceptedTerms: acceptedTerms === true });
    if (result.error) {
      return Response.json({ error: result.error }, { status: STATUS[result.error] ?? 400 });
    }
    const { user, created } = result;

    // Nowe konto — jednorazowy mail powitalny. Bez `await`: logowanie nie czeka na pocztę.
    if (created) sendWelcomeEmail(user._id);

    const accessToken = signAccessToken({
      userId: user.id,
      tokenVersion: user.tokenVersion || 0,
      username: user.username,
    });
    const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });

    user.refreshTokenHash = await hashRefreshToken(refreshToken);
    await user.save();

    await setAuthCookiesRouteHandler({ accessToken, refreshToken });

    return Response.json({ ok: true, username: user.username, created }, { status: 200 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('google auth error:', err);
    }
    return Response.json({ error: 'google_failed' }, { status: 500 });
  }
}
