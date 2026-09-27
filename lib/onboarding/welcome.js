import User from '@/models/User';
import { getTransporter } from '@/lib/mailer';
import { TRIAL } from '@/lib/billing/plans';
import { SITE_URL } from '@/lib/seo/config';
import { localDate } from '@/lib/time';

/**
 * Mail powitalny — JEDEN, zaraz po założeniu konta (Google) albo potwierdzeniu adresu.
 *
 * PO CO. Pierwszy użytkownik z zewnątrz założył konto, wygenerował raport i nie wrócił —
 * nic mu nie powiedziało, co ma przez tydzień ani po co przyjść jutro. Ten mail mówi to
 * w pięciu linijkach i daje dwa przyciski: typy na dziś i włączenie porannego maila.
 *
 * TYLKO RAZ I BEZ ZAPISU NA LISTĘ. To wiadomość o założonym koncie, nie newsletter: nie
 * wysyłamy nic cyklicznie bez zgody. Poranny mail użytkownik włącza sam (przycisk w aplikacji);
 * tutaj jest tylko odnośnik. Znacznik `welcomeSentAt` ustawiany atomowo przed wysyłką —
 * drugi klik w link weryfikacyjny nie wyśle drugiego maila.
 *
 * ZERO SŁÓW O ZAKŁADACH — jak w porannym mailu.
 */

const TEKSTY = {
	pl: {
		subject: `Konto gotowe — przez ${TRIAL.days} dni widzisz wszystkie typy modelu`,
		hello: (name) => `Cześć${name ? `, ${name}` : ''}!`,
		intro: `Konto jest gotowe. Przez ${TRIAL.days} dni masz:`,
		items: [
			'typy modelu z liczbami przy każdym meczu na liście,',
			'poranny mail z typami na dziś (włączasz jednym kliknięciem),',
			`${TRIAL.limits.analysis} analiz AI, ${TRIAL.limits.aiChat} pytań do asystenta i ${TRIAL.limits.report} raporty.`,
		],
		daily: 'Typ dnia na dziś',
		usually: 'zwykle',
		ctaToday: 'Zobacz dzisiejsze typy',
		ctaMail: 'Włącz poranny mail',
		note: 'To jednorazowa wiadomość po założeniu konta — nie zapisujemy Cię na żadną listę. To szacunki, nie pewniaki.',
	},
	en: {
		subject: `Your account is ready — all model picks visible for ${TRIAL.days} days`,
		hello: (name) => `Hi${name ? `, ${name}` : ''}!`,
		intro: `Your account is ready. For ${TRIAL.days} days you get:`,
		items: [
			'model picks with numbers next to every match on the list,',
			'a morning email with today’s picks (one click to turn on),',
			`${TRIAL.limits.analysis} AI analyses, ${TRIAL.limits.aiChat} assistant questions and ${TRIAL.limits.report} reports.`,
		],
		daily: 'Today’s pick of the day',
		usually: 'usually',
		ctaToday: 'See today’s picks',
		ctaMail: 'Turn on the morning email',
		note: 'This is a one-off message after sign-up — we have not added you to any list. Estimates, not sure things.',
	},
};

function esc(s) {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Treść maila powitalnego. Czysta.
 *
 * @param {{ name?: string|null, locale?: 'pl'|'en', daily?: object|null, siteUrl?: string }} input
 *   `daily` — typ dnia (`toDto`) albo `null`
 */
export function buildWelcomeEmail({ name = null, locale = 'pl', daily = null, siteUrl = SITE_URL }) {
	const t = TEKSTY[locale] || TEKSTY.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const linkDzis = `${siteUrl}/${lang}/typy-na-dzis`;
	const linkMail = `${siteUrl}/${lang}/pilka-nozna/przedmeczowe`;
	const typ = daily ? `${daily.home} – ${daily.away}: ${daily.selection} · ${daily.probability}% (${t.usually} ${daily.base}%)` : null;

	const text = [
		t.hello(name),
		'',
		t.intro,
		...t.items.map((i) => `  • ${i}`),
		'',
		...(typ ? [`${t.daily}: ${typ}`, `${siteUrl}/${lang}/mecz/${daily.fixtureId}`, ''] : []),
		`${t.ctaToday}: ${linkDzis}`,
		`${t.ctaMail}: ${linkMail}`,
		'',
		t.note,
	].join('\n');

	const przycisk = (href, label, glowny) =>
		`<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;${
			glowny ? 'background:#1c8f5a;color:#ffffff;' : 'background:#f1f6f5;color:#173b45;'
		}">${esc(label)}</a>`;

	const html =
		`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>` +
		`<body style="margin:0;padding:0;font-family:'Roboto Condensed',Arial,sans-serif;background-color:#f1f1f1;">` +
		`<table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f1f1f1;"><tr><td align="center" style="padding:20px 0;">` +
		`<table role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border-collapse:collapse;">` +
		`<tr><td style="padding:24px 30px;text-align:center;background-color:#173b45;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;">Czat Sportowy</h1></td></tr>` +
		`<tr><td style="padding:28px 30px;">` +
		`<h2 style="margin:0 0 12px 0;color:#333;font-size:22px;font-weight:400;">${esc(t.hello(name))}</h2>` +
		`<p style="margin:0 0 8px 0;color:#333;font-size:15px;">${esc(t.intro)}</p>` +
		`<ul style="margin:0 0 18px 0;padding-left:20px;color:#333;font-size:15px;line-height:1.7;">${t.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` +
		(typ
			? `<div style="margin:0 0 18px 0;padding:14px 16px;border:1px solid #1c8f5a;border-radius:8px;">` +
				`<div style="color:#1c8f5a;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(t.daily)}</div>` +
				`<a href="${esc(`${siteUrl}/${lang}/mecz/${daily.fixtureId}`)}" style="display:block;margin-top:4px;color:#173b45;font-weight:700;font-size:17px;text-decoration:none;">${esc(`${daily.home} – ${daily.away}`)}</a>` +
				`<div style="margin-top:2px;color:#333;font-size:15px;">${esc(`${daily.selection} · ${daily.probability}% (${t.usually} ${daily.base}%)`)}</div></div>`
			: '') +
		`<div>${przycisk(linkDzis, t.ctaToday, true)}${przycisk(linkMail, t.ctaMail, false)}</div>` +
		`<p style="margin:22px 0 0 0;color:#999;font-size:12px;line-height:1.6;">${esc(t.note)}</p>` +
		`</td></tr></table></td></tr></table></body></html>`;

	return { subject: t.subject, text, html };
}

/**
 * Wysyła mail powitalny raz na konto. Nigdy nie rzuca — rejestracja nie może paść przez maila.
 *
 * @param {string} userId
 * @param {{ locale?: 'pl'|'en' }} [options]
 */
export async function sendWelcomeEmail(userId, { locale = 'pl' } = {}) {
	try {
		// Znacznik przed wysyłką i warunkowo — drugi klik w link weryfikacyjny nic nie wyśle.
		const zaznaczony = await User.findOneAndUpdate(
			{ _id: userId, welcomeSentAt: null, email: { $ne: null } },
			{ $set: { welcomeSentAt: new Date() } },
			{ new: true, projection: { email: 1, username: 1 } }
		).lean();
		if (!zaznaczony) return false;

		let daily = null;
		try {
			// Import w funkcji: typ dnia ciągnie model i terminarz, a rejestracja nie musi ich ładować.
			const { getDailyPick, toDto } = await import('@/lib/daily/service');
			const dzis = await getDailyPick(localDate());
			daily = dzis && new Date(dzis.kickoff) > new Date() ? await toDto(dzis) : null;
		} catch {
			daily = null;
		}

		const mail = buildWelcomeEmail({ name: zaznaczony.username || null, locale, daily });
		try {
			await getTransporter().sendMail({
				from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`,
				to: zaznaczony.email,
				subject: mail.subject,
				text: mail.text,
				html: mail.html,
			});
		} catch (error) {
			// Nie doszło — zdejmujemy znacznik, żeby kolejna okazja (np. ponowne logowanie) mogła spróbować.
			await User.updateOne({ _id: userId }, { $set: { welcomeSentAt: null } });
			throw error;
		}
		return true;
	} catch (error) {
		console.warn('[welcome] mail powitalny nie wyszedł:', error.message);
		return false;
	}
}
