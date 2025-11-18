import User from '@/models/User';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import connectToDb from '@/lib/db';
import { NextResponse } from 'next/server';
import { 
  ensureString
} from '@/lib/auth';
import { getTransporter } from '@/lib/mailer';

export async function POST(request) {
  try {
    await connectToDb();
    
    const body = await request.json();
    const { email, password, username, locale = 'pl' } = body || {};
    
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

    // Generate email verification token
    const verificationTokenPlain = crypto.randomBytes(32).toString('hex');
    const verificationTokenHash = crypto.createHash('sha256').update(verificationTokenPlain).digest('hex');
    
    // Token expires in 24 hours
    const verificationTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.create({
      email: emailNorm,
      username: usernameNorm,
      password: hashedPassword,
      isEmailVerified: false,
      emailVerificationTokenHash: verificationTokenHash,
      emailVerificationTokenExp: verificationTokenExp,
    });

    // Send verification email
    try {
      const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
      const protocol = request.headers.get('x-forwarded-proto') || 
                       (host && host.includes('localhost') ? 'http' : 'https');
      const base = process.env.APP_URL || (host ? `${protocol}://${host}` : 'https://czatsportowy.pl');
      const verificationLink = `${base}/${validLocale}/verify-email?token=${verificationTokenPlain}`;

      const emailContent = {
        pl: {
          subject: 'Potwierdź swój adres email — Czat Sportowy',
          greeting: `Witaj ${usernameNorm}!`,
          message: 'Dziękujemy za rejestrację w Czat Sportowy. Aby aktywować swoje konto i korzystać z wszystkich funkcji, kliknij w poniższy przycisk:',
          buttonText: 'Potwierdź adres email',
          linkText: 'Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:',
          footer: 'Ten link jest ważny przez 24 godziny. Jeśli to nie Ty rejestrowałeś się, zignoruj tę wiadomość.',
          copyright: `© ${new Date().getFullYear()} Czat Sportowy. Wszelkie prawa zastrzeżone.`
        },
        en: {
          subject: 'Verify your email address — Sports Chat',
          greeting: `Hello ${usernameNorm}!`,
          message: 'Thank you for registering with Sports Chat. To activate your account and use all features, click the button below:',
          buttonText: 'Verify email address',
          linkText: 'If the button doesn\'t work, copy and paste the following link into your browser:',
          footer: 'This link is valid for 24 hours. If you didn\'t register, please ignore this message.',
          copyright: `© ${new Date().getFullYear()} Sports Chat. All rights reserved.`
        }
      };

      const content = emailContent[validLocale];

      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: content.subject,
        html: `
          <!DOCTYPE html>
          <html lang="${validLocale}">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: 'Roboto Condensed', Arial, sans-serif; background-color: #f1f1f1;">
            <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f1f1f1; padding: 20px;">
              <tr>
                <td align="center" style="padding: 20px 0;">
                  <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-collapse: collapse;">
                    <tr>
                      <td style="padding: 40px 30px; text-align: center; background-color: #173b45; border-radius: 8px 8px 0 0;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 400;">Czat Sportowy</h1>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 30px;">
                        <h2 style="margin: 0 0 20px 0; color: #333; font-size: 22px; font-weight: 400;">${content.subject}</h2>
                        <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">${content.greeting}</p>
                        <p style="margin: 0 0 20px 0; color: #555; font-size: 16px; line-height: 1.6;">${content.message}</p>
                        <table role="presentation" style="width: 100%; margin: 25px 0;">
                          <tr>
                            <td align="center">
                              <a href="${verificationLink}" style="display: inline-block; padding: 12px 30px; background-color: #173b45; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: 400; transition: background-color 0.2s ease;">${content.buttonText}</a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin: 20px 0 0 0; color: #888; font-size: 14px; line-height: 1.6;">${content.linkText}</p>
                        <p style="margin: 10px 0 0 0; color: #173b45; font-size: 14px; word-break: break-all; line-height: 1.6;"><a href="${verificationLink}" style="color: #173b45; text-decoration: underline;">${verificationLink}</a></p>
                        <p style="margin: 30px 0 0 0; color: #888; font-size: 14px; line-height: 1.6; border-top: 1px solid #e0e0e0; padding-top: 20px;">${content.footer}</p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 20px 30px; text-align: center; background-color: #f9f9f9; border-radius: 0 0 8px 8px; border-top: 1px solid #e0e0e0;">
                        <p style="margin: 0; color: #888; font-size: 12px;">${content.copyright}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      });
    } catch (emailErr) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error sending verification email:', emailErr);
      }
      // Continue anyway - user is created, they can request resend later
    }

    return NextResponse.json({ 
      ok: true, 
      username: user.username,
      emailSent: true,
      message: validLocale === 'pl' 
        ? 'Rejestracja pomyślna! Sprawdź email i kliknij w link weryfikacyjny, aby aktywować konto.'
        : 'Registration successful! Check your email and click the verification link to activate your account.'
    }, { status: 201 });
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

