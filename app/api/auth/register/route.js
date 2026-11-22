import User from '@/models/User';
import bcrypt from 'bcrypt';
import connectToDb from '@/lib/db';
import { NextResponse } from 'next/server';
import {
  ensureString,
  signAccessToken,
  signRefreshToken,
  setAuthCookiesRouteHandler,
  hashRefreshToken,
} from '@/lib/auth';
import { appBaseUrl, newVerificationToken, sendVerificationEmail } from '@/lib/auth/verificationEmail';
import { limitByIp, tooManyRequests } from '@/lib/rateLimit';
import { TERMS_VERSION } from '@/lib/legal/operator';
import { morningConsentSet } from '@/lib/morning/consent';
import { signupSourceFromRequest } from '@/lib/growth/signupSource';

export async function POST(request) {
  try {
    // Rejestracja wysyła maila weryfikacyjnego — bez limitu to gotowy kanał do spamu.
    const rate = await limitByIp(request, {
      scope: 'auth-register',
      limit: 5,
      windowSeconds: 3600,
    });
    if (!rate.allowed) return tooManyRequests(rate.retryAfter);

    await connectToDb();

    const body = await request.json();
    const { email, password, username, locale = 'pl', acceptedTerms, morningEmail, signupSource } = body || {};
    
    // Validate all fields exist and are strings
    /*
     * Akceptację sprawdzamy po stronie serwera, nie tylko atrybutem `required` w formularzu.
     * Pole `required` da się obejść w narzędziach deweloperskich, a wtedy zostałby ślad
     * akceptacji, której nikt nie udzielił — czyli dowód gorszy niż jego brak.
     */
    if (acceptedTerms !== true) {
      return NextResponse.json({ error: 'register_terms_required' }, { status: 400 });
    }

    if (!ensureString(email) || !ensureString(password, 200) || !ensureString(username, 32)) {
      return NextResponse.json({ error: 'register_bad_data' }, { status: 400 });
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json({ error: 'register_pwd_short' }, { status: 400 });
    }

    const emailNorm = email.toLowerCase().trim();
    const usernameNorm = username.trim();
    const validLocale = (locale === 'en' || locale === 'pl') ? locale : 'pl';

    const existingEmail = await User.findOne({ email: emailNorm });
    if (existingEmail) {
      return NextResponse.json({ error: 'register_email_taken' }, { status: 409 });
    }

    const existingUsername = await User.findOne({ username: usernameNorm });
    if (existingUsername) {
      return NextResponse.json({ error: 'register_username_taken' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const weryfikacja = newVerificationToken();

    const user = await User.create({
      email: emailNorm,
      username: usernameNorm,
      password: hashedPassword,
      isEmailVerified: false,
      emailVerificationTokenHash: weryfikacja.hash,
      emailVerificationTokenExp: weryfikacja.exp,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      // Skąd ktoś przyszedł (host, utm, pierwsza strona) — każde pole walidowane po stronie serwera.
      signupSource: signupSourceFromRequest(signupSource, request),
    });

    /*
     * Poranny mail z rejestracji — osobne, NIEzaznaczone pole w formularzu, więc to zgoda wprost.
     * Tylko `=== true`: brak pola albo cokolwiek innego znaczy „nie". Wysyłka czeka na
     * potwierdzenie adresu (`sendMorningEmails` bierze tylko `isEmailVerified`) — inaczej ktoś
     * mógłby wpisać cudzy adres, zaznaczyć pole i zasypać obcą skrzynkę porannymi mailami.
     */
    if (morningEmail === true) {
      await User.updateOne({ _id: user._id }, { $set: morningConsentSet({ locale: validLocale }) });
    }

    // Mail z linkiem potwierdzającym — konto działa i bez niego (`lib/auth/verificationEmail.js`).
    try {
      await sendVerificationEmail({
        to: user.email,
        username: usernameNorm,
        locale: validLocale,
        baseUrl: appBaseUrl(request),
        token: weryfikacja.plain,
      });
    } catch (emailErr) {
      /*
       * Wysyłka maila jest częścią rejestracji, nie dodatkiem do niej.
       *
       * Od 22.11.2026 konto działa bez potwierdzenia, ale odrzucony mail to zwykle literówka
       * w adresie — a na zły adres nie dojdzie ani poranny mail, ani reset hasła. Dlatego
       * świeże konto znika razem z nieudaną wysyłką: rejestracja udaje się w całości albo
       * wcale, a adres wraca do puli i można spróbować ponownie z poprawnym.
       */
      console.error(
        '[register] wysyłka maila weryfikacyjnego nie powiodła się:',
        emailErr?.code || '',
        emailErr?.message
      );
      await User.deleteOne({ _id: user._id });
      return NextResponse.json({ error: 'register_email_failed' }, { status: 502 });
    }

    /*
     * PRÓBA OD RAZU (decyzja właściciela z 22.11.2026): sesja powstaje przy rejestracji, bez czekania
     * na kliknięcie w link. Wcześniej trzeba było iść do skrzynki, wrócić i zalogować się — a po drodze
     * ludzie odpadali. Potwierdzenie adresu odblokowuje tylko maile (patrz `lib/auth/verificationEmail.js`).
     */
    const accessToken = signAccessToken({ userId: user.id, tokenVersion: user.tokenVersion || 0, username: user.username });
    const refreshToken = signRefreshToken({ userId: user.id, tokenVersion: user.tokenVersion || 0 });
    await User.updateOne({ _id: user._id }, { $set: { refreshTokenHash: await hashRefreshToken(refreshToken) } });
    await setAuthCookiesRouteHandler({ accessToken, refreshToken });

    return NextResponse.json({ ok: true, username: user.username, loggedIn: true, emailSent: true }, { status: 201 });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('register error:', err);
      console.error('Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });
    }
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

