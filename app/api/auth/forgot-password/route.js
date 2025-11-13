import crypto from 'crypto';
import connectToDb from '@/lib/db';
import User from '@/models/User';
import { getTransporter } from '@/lib/mailer';

export async function POST(request) {
  const body = await request.json();
  const { email, locale = 'pl' } = body || {};
  
  if (!email || typeof email !== 'string') {
    return Response.json({ ok: true }, { status: 200 });
  }

  // Validate locale
  const validLocale = (locale === 'en' || locale === 'pl') ? locale : 'pl';

  try {
    await connectToDb();
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });

    if (!user) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const tokenPlain = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');

    const ttlH = Number(process.env.RESET_TOKEN_TTL_HOURS || 12);
    const exp = new Date(Date.now() + ttlH * 60 * 60 * 1000);

    user.resetPasswordTokenHash = tokenHash;
    user.resetPasswordTokenExp = exp;
    await user.save();

    // Determine base URL from request headers (production-safe)
    const host = request.headers.get('host') || request.headers.get('x-forwarded-host');
    const protocol = request.headers.get('x-forwarded-proto') || 
                     (host && host.includes('localhost') ? 'http' : 'https');
    const base = process.env.APP_URL || (host ? `${protocol}://${host}` : 'https://czatsportowy.pl');
    const resetLink = `${base}/${validLocale}/reset-password?token=${tokenPlain}`;

    // Email content based on locale
    const emailContent = {
      pl: {
        subject: 'Reset hasła — Czat Sportowy',
        greeting: 'Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta.',
        usernameInfo: `Twoja nazwa użytkownika (login): <strong>${user.username}</strong>`,
        instruction: `Kliknij w poniższy przycisk, aby ustawić nowe hasło (ważny ${ttlH}h):`,
        buttonText: 'Zresetuj hasło',
        linkText: 'Jeśli przycisk nie działa, skopiuj i wklej poniższy link do przeglądarki:',
        footer: 'Jeśli to nie Ty prosiłeś o reset hasła, zignoruj tę wiadomość. Twoje hasło pozostanie bez zmian.',
        copyright: `© ${new Date().getFullYear()} Czat Sportowy. Wszelkie prawa zastrzeżone.`
      },
      en: {
        subject: 'Password Reset — Sports Chat',
        greeting: 'We received a request to reset the password for your account.',
        usernameInfo: `Your username (login): <strong>${user.username}</strong>`,
        instruction: `Click the button below to set a new password (valid for ${ttlH}h):`,
        buttonText: 'Reset Password',
        linkText: 'If the button doesn\'t work, copy and paste the following link into your browser:',
        footer: 'If you didn\'t request a password reset, please ignore this message. Your password will remain unchanged.',
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
                      <h2 style="margin: 0 0 20px 0; color: #333; font-size: 22px; font-weight: 400;">${validLocale === 'pl' ? 'Reset hasła' : 'Password Reset'}</h2>
                      <p style="margin: 0 0 15px 0; color: #555; font-size: 16px; line-height: 1.6;">${content.greeting}</p>
                      <p style="margin: 0 0 20px 0; color: #555; font-size: 16px; line-height: 1.6;">${content.usernameInfo}</p>
                      <p style="margin: 0 0 20px 0; color: #555; font-size: 16px; line-height: 1.6;">${content.instruction}</p>
                      <table role="presentation" style="width: 100%; margin: 25px 0;">
                        <tr>
                          <td align="center">
                            <a href="${resetLink}" style="display: inline-block; padding: 12px 30px; background-color: #173b45; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: 400; transition: background-color 0.2s ease;">${content.buttonText}</a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 20px 0 0 0; color: #888; font-size: 14px; line-height: 1.6;">${content.linkText}</p>
                      <p style="margin: 10px 0 0 0; color: #173b45; font-size: 14px; word-break: break-all; line-height: 1.6;"><a href="${resetLink}" style="color: #173b45; text-decoration: underline;">${resetLink}</a></p>
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

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.error('forgot-password error:', e);
    }
    return Response.json({ ok: true }, { status: 200 });
  }
}

