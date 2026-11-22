import crypto from 'crypto';
import { getTransporter } from '@/lib/mailer';

/**
 * Mail z linkiem potwierdzającym adres — wspólny dla rejestracji i „wyślij ponownie".
 *
 * OD 22.11.2026 POTWIERDZENIE NIE BLOKUJE KONTA. Do tej pory logowanie odrzucało konto bez
 * potwierdzonego adresu, więc nowa osoba musiała wyjść do skrzynki, zanim zobaczyła cokolwiek —
 * a po drodze odpadała (9 z 10 kont z zewnątrz użyło AI jednego dnia albo wcale). Teraz konto
 * działa od razu, próba biegnie od rejestracji, a potwierdzony adres jest potrzebny tylko do
 * tego, co idzie NA ten adres: poranny mail, wiadomości o próbie, mail powitalny
 * (`sendMorningEmails`, `lib/onboarding/*` biorą wyłącznie `isEmailVerified`). Dzięki temu
 * cudzy adres wpisany przy rejestracji nie dostanie od nas nic poza tym jednym linkiem.
 */

const DOBA = 24 * 60 * 60 * 1000;

/** Nowy token: jawny idzie w linku, do bazy trafia tylko skrót. Ważny dobę. */
export function newVerificationToken(now = new Date()) {
	const plain = crypto.randomBytes(32).toString('hex');
	return {
		plain,
		hash: crypto.createHash('sha256').update(plain).digest('hex'),
		exp: new Date(now.getTime() + DOBA),
	};
}

/** Adres serwisu do linku — `APP_URL`, a bez niego z nagłówków żądania. */
export function appBaseUrl(request) {
	if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
	const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
	if (!host) return 'https://czatsportowy.pl';
	const protocol = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
	return `${protocol}://${host}`;
}

function esc(s) {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const TEKSTY = {
	pl: {
		subject: 'Potwierdź adres — Czat Sportowy',
		hello: (name) => `Cześć ${name}!`,
		body: 'Konto już działa, próba trwa. Potwierdź adres jednym kliknięciem — wtedy dostaniesz poranne typy na maila i odzyskasz hasło, gdy go zapomnisz.',
		button: 'Potwierdzam adres',
		footer: 'Link działa 24 godziny. Nie zakładałeś konta? Zignoruj tę wiadomość.',
	},
	en: {
		subject: 'Confirm your address — Czat Sportowy',
		hello: (name) => `Hi ${name}!`,
		body: 'Your account already works and the trial is on. Confirm your address in one click — then you get morning picks by email and can recover your password.',
		button: 'Confirm my address',
		footer: 'The link works for 24 hours. Didn’t sign up? Ignore this message.',
	},
};

/** Treść maila. Czysta. */
export function buildVerificationEmail({ username, locale = 'pl', link }) {
	const t = TEKSTY[locale] || TEKSTY.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const text = [t.hello(username), '', t.body, '', `${t.button}: ${link}`, '', t.footer].join('\n');
	const html =
		`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>` +
		`<body style="margin:0;padding:0;font-family:'Roboto Condensed',Arial,sans-serif;background-color:#f1f1f1;">` +
		`<table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f1f1f1;"><tr><td align="center" style="padding:20px 0;">` +
		`<table role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border-collapse:collapse;">` +
		`<tr><td style="padding:24px 30px;text-align:center;background-color:#173b45;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;">Czat Sportowy</h1></td></tr>` +
		`<tr><td style="padding:28px 30px;">` +
		`<h2 style="margin:0 0 12px 0;color:#333;font-size:22px;font-weight:400;">${esc(t.hello(username))}</h2>` +
		`<p style="margin:0 0 20px 0;color:#333;font-size:15px;line-height:1.6;">${esc(t.body)}</p>` +
		`<a href="${esc(link)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#1c8f5a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">${esc(t.button)}</a>` +
		`<p style="margin:18px 0 0 0;color:#888;font-size:13px;word-break:break-all;"><a href="${esc(link)}" style="color:#173b45;">${esc(link)}</a></p>` +
		`<p style="margin:22px 0 0 0;color:#999;font-size:12px;line-height:1.6;">${esc(t.footer)}</p>` +
		`</td></tr></table></td></tr></table></body></html>`;
	return { subject: t.subject, text, html };
}

/** Wysyła mail z linkiem. Rzuca przy błędzie poczty — wywołujący decyduje, co dalej. */
export async function sendVerificationEmail({ to, username, locale = 'pl', baseUrl, token }) {
	const lang = locale === 'en' ? 'en' : 'pl';
	const link = `${baseUrl}/${lang}/verify-email?token=${token}`;
	const mail = buildVerificationEmail({ username, locale: lang, link });
	await getTransporter().sendMail({
		from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`,
		to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html,
	});
}
