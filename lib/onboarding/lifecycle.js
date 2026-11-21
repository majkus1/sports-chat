import crypto from 'crypto';
import mongoose from 'mongoose';
import User from '@/models/User';
import Pick from '@/models/Pick';
import Coupon from '@/models/Coupon';
import UsageLog from '@/models/UsageLog';
import { getTransporter } from '@/lib/mailer';
import { PLANS, TRIAL } from '@/lib/billing/plans';
import { trialDaysLeft } from '@/lib/billing/entitlements';
import { MAIN_STATS_LEAGUES } from '@/lib/football/leagues';
import { SITE_URL } from '@/lib/seo/config';
import { APP_TIMEZONE, localDate, localMidnight } from '@/lib/time';

/**
 * Dwie wiadomości o okresie próbnym — w 2. dniu i w ostatnim dniu próby.
 *
 * PO CO. Stan na 21.11.2026: 10 kont z zewnątrz, dziewięć użyło AI jednego dnia i nie wróciło,
 * poranny mail włączyły dwa, nikt nie kupił. Po mailu powitalnym nie było żadnego kontaktu —
 * kto zamknął kartę, ten o serwisie zapomniał. Te dwa maile mówią: co model zrobił wczoraj,
 * czego jeszcze nie sprawdziłeś (2. dzień) i co zrobiłeś przez tydzień, co zostaje, co się kończy
 * (ostatni dzień).
 *
 * WIADOMOŚĆ O KONCIE, NIE NEWSLETTER. Dwie sztuki na całe życie konta i tylko w trakcie próby,
 * której dotyczą. Każda raz (znacznik przed wysyłką, warunkowo — jak w mailu powitalnym), każda
 * z wypisem jednym kliknięciem bez logowania (`/api/me/account-email/unsubscribe`). Mail 2. dnia
 * NIE idzie do kogoś, kto ma poranny mail (dostaje codziennie to samo i więcej) ani do kogoś, kto
 * go kiedyś wyłączył (`enabledAt` ustawione) — powiedział już, że maili nie chce.
 *
 * TYLKO POTWIERDZONE ADRESY i konta, które dostały mail powitalny (`welcomeSentAt`): bez tego
 * mail mógłby trafić na cudzy adres wpisany przy rejestracji.
 *
 * ZERO SŁÓW O ZAKŁADACH — jak w mailu powitalnym i porannym (testy pilnują słownika). Liczby
 * modelu są prawdziwe także wtedy, gdy wypadają słabo: to ta sama pula co strona skuteczności.
 */

const H = 3600 * 1000;

/** Okno wieku konta dla maila 2. dnia. Dolna granica: konto z 7:30 nie dostaje go o 8:00 tego samego dnia. */
export const DAY_TWO_WINDOW = { minAgeMs: 16 * H, maxAgeMs: 72 * H };

/** Kupony serwisu, których wynik liczymy w podsumowaniu tygodnia (własne z kreatora — nie). */
const SITE_COUPONS = ['daily', 'days3', 'days5', 'live'];

/** Wspólne warunki obu maili. Czysta. */
function base(user, now) {
	if (!user?.email || user.role === 'admin') return false;
	if (!user.isEmailVerified || !user.welcomeSentAt) return false;
	if (user.lifecycleEmail?.optOut) return false;
	return trialDaysLeft(user, now) > 0;
}

/** Czy wysłać mail 2. dnia. Czysta. */
export function dayTwoEligible(user, now = new Date()) {
	if (!base(user, now) || user.lifecycleEmail?.dayTwoSentAt) return false;
	// Ma poranny mail albo go kiedyś wyłączył — nie dokładamy nic od siebie.
	if (user.morningEmail?.enabled || user.morningEmail?.enabledAt) return false;
	const age = now.getTime() - new Date(user.createdAt).getTime();
	return age >= DAY_TWO_WINDOW.minAgeMs && age <= DAY_TWO_WINDOW.maxAgeMs;
}

/** Czy wysłać mail ostatniego dnia próby: próba kończy się w ciągu najbliższej doby. Czysta. */
export function trialEndEligible(user, now = new Date()) {
	if (!base(user, now) || user.lifecycleEmail?.trialEndSentAt) return false;
	return trialDaysLeft(user, now) === 1;
}

/** Koniec próby jako moment. */
export function trialEndsAt(user) {
	return new Date(new Date(user.createdAt).getTime() + TRIAL.days * 24 * H);
}

function esc(s) {
	return String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

const pct = (won, total) => (total ? Math.round((100 * won) / total) : 0);

/** „dziś o 21:14" / „jutro o 7:05" — w czasie polskim, względem `now`. */
function whenLabel(at, now, locale) {
	const time = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: APP_TIMEZONE,
		hour: '2-digit',
		minute: '2-digit',
	}).format(at);
	const today = localDate(now) === localDate(at);
	if (locale === 'en') return `${today ? 'today' : 'tomorrow'} at ${time}`;
	return `${today ? 'dziś' : 'jutro'} o ${time}`;
}

/* --------------------------------- teksty --------------------------------- */

/** Funkcje do „czego jeszcze nie sprawdziłeś" — klucz zużycia, ścieżka, opis. */
const UNTRIED = {
	analysis: { path: '/pilka-nozna/przedmeczowe' },
	report: { path: '/pilka-nozna/ai-agent' },
	aiChat: { path: '/pilka-nozna/asystent' },
	custom: { path: '/typy-na-dzis#kreator-kuponu' },
};

const T = {
	pl: {
		hello: (name) => `Cześć${name ? `, ${name}` : ''}!`,
		d2Subject: (left) => `Zostało Ci ${left} dni próby — co model zrobił wczoraj`,
		d2Yesterday: (won, total) => `Wczoraj model: ${won} z ${total} typów trafionych.`,
		d2NoYesterday: 'Wczoraj model nie miał rozliczonych typów — dziś na liście meczów są nowe.',
		d2Daily: 'Typ dnia na dziś',
		usually: 'zwykle',
		d2Untried: 'Masz w próbie, a jeszcze nie sprawdziłeś:',
		untried: {
			analysis: `analiza AI meczu — czynniki, ryzyka i typ (${TRIAL.limits.analysis} dodatkowych w próbie),`,
			report: `raport AI całej kolejki ligi (${TRIAL.limits.report} w próbie, potem tylko Pro i VIP),`,
			aiChat: 'asystent — zapytaj o dowolny mecz, kupon albo formę drużyny,',
			custom: `kreator kuponu — składasz własny z typów modelu (${TRIAL.limits.couponGen} dziennie w próbie),`,
		},
		d2Mail: 'Chcesz to dostawać codziennie o 8:00? Włącz poranny mail — typy na dziś i rozliczenie wczoraj.',
		ctaToday: 'Zobacz dzisiejsze typy',
		ctaMail: 'Włącz poranny mail',
		d2Note: `To jedna z dwóch wiadomości o Twoim okresie próbnym (druga przyjdzie w jego ostatnim dniu). Nie zapisujemy Cię na żadną listę. To szacunki, nie pewniki.`,
		endSubject: (when) => `Twoja próba kończy się ${when} — podsumowanie tygodnia`,
		endIntro: (when) => `Okres próbny kończy się ${when}. Oto Twój tydzień w liczbach.`,
		endUsage: 'Ty w tym tygodniu',
		usage: {
			analysis: (n) => `${n} × analiza AI meczu`,
			aiChat: (n) => `${n} × pytanie do asystenta`,
			report: (n) => `${n} × raport AI kolejki`,
			custom: (n) => `${n} × kupon z kreatora`,
		},
		endNoUsage: 'Nie użyłeś jeszcze AI — do końca próby masz komplet analiz, pytań i raportów.',
		endModel: 'Model w tym czasie',
		endPicks: (won, total, base) => `typy modelu: ${won} z ${total} trafionych (${pct(won, total)}%, przy normie ${base}% dla tych samych zdarzeń),`,
		endCoupons: (won, total) => `kupony serwisu (dnia, 3- i 5-dniowe, live): ${won} z ${total} weszło,`,
		endNoModel: 'W tym tygodniu nie było jeszcze rozliczonych typów — pełna historia jest na stronie skuteczności.',
		endStays: 'Zostaje za darmo',
		stays: (free) => [
			'typ dnia i kupon dnia z wynikami,',
			'skuteczność modelu i wyniki wszystkich typów,',
			`${free.analysis} analiz AI i ${free.aiChat} pytań do asystenta w miesiącu.`,
		],
		endEnds: 'Kończy się',
		ends: [
			'liczby modelu przy meczach na liście,',
			'kupony 3- i 5-dniowe oraz kupon live z typami,',
			'poranny mail, raporty AI kolejki i kreator kuponu.',
		],
		endPlans: (pro) => `Pro to ${pro} zł za 30 dni dostępu — jednorazowo, bez odnawiania.`,
		ctaPlans: 'Porównaj plany',
		ctaStats: 'Skuteczność modelu',
		endNote: 'To druga i ostatnia wiadomość o Twoim okresie próbnym. To szacunki, nie pewniki.',
		optOut: 'Nie wysyłaj mi wiadomości o koncie',
	},
	en: {
		hello: (name) => `Hi${name ? `, ${name}` : ''}!`,
		d2Subject: (left) => `${left} trial days left — what the model did yesterday`,
		d2Yesterday: (won, total) => `Yesterday the model got ${won} of ${total} picks right.`,
		d2NoYesterday: 'The model had no settled picks yesterday — today’s match list has new ones.',
		d2Daily: 'Today’s pick of the day',
		usually: 'usually',
		d2Untried: 'In your trial, not tried yet:',
		untried: {
			analysis: `AI match analysis — factors, risks and a pick (${TRIAL.limits.analysis} extra in the trial),`,
			report: `AI report on a whole league round (${TRIAL.limits.report} in the trial, then Pro and VIP only),`,
			aiChat: 'the assistant — ask about any match, coupon or team form,',
			custom: `the coupon builder — build your own from the model’s picks (${TRIAL.limits.couponGen} a day in the trial),`,
		},
		d2Mail: 'Want this every day at 8:00? Turn on the morning email — today’s picks and yesterday’s results.',
		ctaToday: 'See today’s picks',
		ctaMail: 'Turn on the morning email',
		d2Note: 'This is one of two messages about your trial (the other comes on its last day). We have not added you to any list. Estimates, not sure things.',
		endSubject: (when) => `Your trial ends ${when} — your week in review`,
		endIntro: (when) => `Your trial ends ${when}. Here is your week in numbers.`,
		endUsage: 'You this week',
		usage: {
			analysis: (n) => `${n} × AI match analysis`,
			aiChat: (n) => `${n} × assistant question`,
			report: (n) => `${n} × AI round report`,
			custom: (n) => `${n} × coupon from the builder`,
		},
		endNoUsage: 'You have not used the AI yet — your analyses, questions and reports are all there until the trial ends.',
		endModel: 'The model in that time',
		endPicks: (won, total, base) => `model picks: ${won} of ${total} right (${pct(won, total)}%, against a ${base}% norm for the same events),`,
		endCoupons: (won, total) => `site coupons (daily, 3-day, 5-day, live): ${won} of ${total} landed,`,
		endNoModel: 'No picks were settled this week yet — the full history is on the accuracy page.',
		endStays: 'Stays free',
		stays: (free) => [
			'the pick of the day and the coupon of the day with results,',
			'model accuracy and the results of every pick,',
			`${free.analysis} AI analyses and ${free.aiChat} assistant questions a month.`,
		],
		endEnds: 'Ends',
		ends: [
			'model numbers next to matches on the list,',
			'the 3-day and 5-day coupons and the live coupon with picks,',
			'the morning email, AI round reports and the coupon builder.',
		],
		endPlans: (pro) => `Pro is ${pro} zł for 30 days of access — one-off, no auto-renewal.`,
		ctaPlans: 'Compare plans',
		ctaStats: 'Model accuracy',
		endNote: 'This is the second and last message about your trial. Estimates, not sure things.',
		optOut: 'Stop account messages',
	},
};

/* --------------------------------- HTML --------------------------------- */

function przycisk(href, label, glowny) {
	return `<a href="${esc(href)}" style="display:inline-block;margin:4px 6px 4px 0;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;${
		glowny ? 'background:#1c8f5a;color:#ffffff;' : 'background:#f1f6f5;color:#173b45;'
	}">${esc(label)}</a>`;
}

function shell(lang, inner) {
	return (
		`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>` +
		`<body style="margin:0;padding:0;font-family:'Roboto Condensed',Arial,sans-serif;background-color:#f1f1f1;">` +
		`<table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f1f1f1;"><tr><td align="center" style="padding:20px 0;">` +
		`<table role="presentation" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;border-collapse:collapse;">` +
		`<tr><td style="padding:24px 30px;text-align:center;background-color:#173b45;border-radius:8px 8px 0 0;"><h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:400;">Czat Sportowy</h1></td></tr>` +
		`<tr><td style="padding:28px 30px;">${inner}</td></tr></table></td></tr></table></body></html>`
	);
}

const h2 = (s) => `<h2 style="margin:0 0 12px 0;color:#333;font-size:22px;font-weight:400;">${esc(s)}</h2>`;
const para = (s, extra = '') => `<p style="margin:0 0 12px 0;color:#333;font-size:15px;line-height:1.6;${extra}">${esc(s)}</p>`;
const label = (s) => `<div style="margin:18px 0 6px 0;color:#1c8f5a;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(s)}</div>`;
const list = (items) =>
	`<ul style="margin:0 0 12px 0;padding-left:20px;color:#333;font-size:15px;line-height:1.7;">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const note = (s, optOutUrl, optOutLabel) =>
	`<p style="margin:22px 0 0 0;color:#999;font-size:12px;line-height:1.6;">${esc(s)} <a href="${esc(optOutUrl)}" style="color:#999;">${esc(optOutLabel)}</a></p>`;

/* --------------------------------- treści --------------------------------- */

/**
 * Mail 2. dnia. Czysta.
 *
 * @param {{
 *   name?: string|null, locale?: 'pl'|'en', trialDaysLeft: number,
 *   yesterday?: { won: number, total: number, picks: Array<{home: string, away: string, selection: string, status: string}> },
 *   daily?: { fixtureId: string, home: string, away: string, selection: string, probability: number, base: number }|null,
 *   untried?: Array<'analysis'|'report'|'aiChat'|'custom'>,
 *   siteUrl?: string, optOutUrl: string,
 * }} input
 */
export function buildDayTwoEmail({ name = null, locale = 'pl', trialDaysLeft: left, yesterday = null, daily = null, untried = [], siteUrl = SITE_URL, optOutUrl }) {
	const t = T[locale] || T.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const linkDzis = `${siteUrl}/${lang}/typy-na-dzis`;
	const linkMail = `${siteUrl}/${lang}/pilka-nozna/przedmeczowe`;
	const ma = yesterday && yesterday.total > 0;
	const lines = ma ? yesterday.picks.map((p) => `${p.status === 'won' ? '✓' : '✗'} ${p.home} – ${p.away}: ${p.selection}`) : [];
	const typ = daily ? `${daily.home} – ${daily.away}: ${daily.selection} · ${daily.probability}% (${t.usually} ${daily.base}%)` : null;
	const funkcje = untried.filter((k) => UNTRIED[k]);

	const text = [
		t.hello(name),
		'',
		ma ? t.d2Yesterday(yesterday.won, yesterday.total) : t.d2NoYesterday,
		...lines.map((l) => `  ${l}`),
		'',
		...(typ ? [`${t.d2Daily}: ${typ}`, `${siteUrl}/${lang}/mecz/${daily.fixtureId}`, ''] : []),
		...(funkcje.length ? [t.d2Untried, ...funkcje.map((k) => `  • ${t.untried[k]} ${siteUrl}/${lang}${UNTRIED[k].path}`), ''] : []),
		t.d2Mail,
		`${t.ctaMail}: ${linkMail}`,
		`${t.ctaToday}: ${linkDzis}`,
		'',
		t.d2Note,
		`${t.optOut}: ${optOutUrl}`,
	].join('\n');

	const html = shell(
		lang,
		h2(t.hello(name)) +
			para(ma ? t.d2Yesterday(yesterday.won, yesterday.total) : t.d2NoYesterday, 'font-weight:700;') +
			(lines.length
				? list(yesterday.picks.map((p) => `<span style="color:${p.status === 'won' ? '#1c8f5a' : '#b3261e'};font-weight:700;">${p.status === 'won' ? '✓' : '✗'}</span> ${esc(`${p.home} – ${p.away}: ${p.selection}`)}`))
				: '') +
			(typ
				? `<div style="margin:6px 0 14px 0;padding:14px 16px;border:1px solid #1c8f5a;border-radius:8px;">` +
					`<div style="color:#1c8f5a;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(t.d2Daily)}</div>` +
					`<a href="${esc(`${siteUrl}/${lang}/mecz/${daily.fixtureId}`)}" style="display:block;margin-top:4px;color:#173b45;font-weight:700;font-size:17px;text-decoration:none;">${esc(`${daily.home} – ${daily.away}`)}</a>` +
					`<div style="margin-top:2px;color:#333;font-size:15px;">${esc(`${daily.selection} · ${daily.probability}% (${t.usually} ${daily.base}%)`)}</div></div>`
				: '') +
			(funkcje.length
				? label(t.d2Untried) +
					list(funkcje.map((k) => `<a href="${esc(`${siteUrl}/${lang}${UNTRIED[k].path}`)}" style="color:#173b45;">${esc(t.untried[k])}</a>`))
				: '') +
			para(t.d2Mail, 'margin-top:16px;') +
			`<div>${przycisk(linkMail, t.ctaMail, true)}${przycisk(linkDzis, t.ctaToday, false)}</div>` +
			note(t.d2Note, optOutUrl, t.optOut)
	);

	return { subject: t.d2Subject(left), text, html };
}

/**
 * Mail ostatniego dnia próby. Czysta.
 *
 * @param {{
 *   name?: string|null, locale?: 'pl'|'en', endsAt: Date, now?: Date,
 *   usage?: { analysis?: number, aiChat?: number, report?: number, custom?: number },
 *   model?: { won: number, total: number, base: number }|null,
 *   coupons?: { won: number, total: number }|null,
 *   siteUrl?: string, optOutUrl: string,
 * }} input
 */
export function buildTrialEndEmail({ name = null, locale = 'pl', endsAt, now = new Date(), usage = {}, model = null, coupons = null, siteUrl = SITE_URL, optOutUrl }) {
	const t = T[locale] || T.pl;
	const lang = locale === 'en' ? 'en' : 'pl';
	const when = whenLabel(endsAt, now, lang);
	const free = PLANS.free.limits;
	const linkPlans = `${siteUrl}/${lang}/cennik`;
	const linkStats = `${siteUrl}/${lang}/pilka-nozna/skutecznosc`;

	const uzyte = ['analysis', 'aiChat', 'report', 'custom'].filter((k) => usage[k] > 0).map((k) => t.usage[k](usage[k]));
	const modelLines = [
		...(model?.total ? [t.endPicks(model.won, model.total, model.base)] : []),
		...(coupons?.total ? [t.endCoupons(coupons.won, coupons.total)] : []),
	];
	const stays = t.stays(free);

	const text = [
		t.hello(name),
		'',
		t.endIntro(when),
		'',
		`${t.endUsage}:`,
		...(uzyte.length ? uzyte.map((u) => `  • ${u}`) : [`  ${t.endNoUsage}`]),
		'',
		`${t.endModel}:`,
		...(modelLines.length ? modelLines.map((l) => `  • ${l}`) : [`  ${t.endNoModel}`]),
		`${t.ctaStats}: ${linkStats}`,
		'',
		`${t.endStays}:`,
		...stays.map((s) => `  • ${s}`),
		'',
		`${t.endEnds}:`,
		...t.ends.map((s) => `  • ${s}`),
		'',
		t.endPlans(PLANS.pro.priceMonthlyPln),
		`${t.ctaPlans}: ${linkPlans}`,
		'',
		t.endNote,
		`${t.optOut}: ${optOutUrl}`,
	].join('\n');

	const html = shell(
		lang,
		h2(t.hello(name)) +
			para(t.endIntro(when)) +
			label(t.endUsage) +
			(uzyte.length ? list(uzyte.map(esc)) : para(t.endNoUsage)) +
			label(t.endModel) +
			(modelLines.length ? list(modelLines.map(esc)) : para(t.endNoModel)) +
			`<p style="margin:0 0 12px 0;font-size:14px;"><a href="${esc(linkStats)}" style="color:#173b45;font-weight:700;">${esc(t.ctaStats)}</a></p>` +
			label(t.endStays) +
			list(stays.map(esc)) +
			label(t.endEnds) +
			list(t.ends.map(esc)) +
			para(t.endPlans(PLANS.pro.priceMonthlyPln), 'margin-top:16px;font-weight:700;') +
			`<div>${przycisk(linkPlans, t.ctaPlans, true)}</div>` +
			note(t.endNote, optOutUrl, t.optOut)
	);

	return { subject: t.endSubject(when), text, html };
}

/* --------------------------------- dane --------------------------------- */

/** Typy modelu w oknie — ta sama pula co strona skuteczności (wliczane, rozliczone, bez duplikatów). */
async function modelInWindow(from, to) {
	const rows = await Pick.find({
		author: 'ai',
		countsToStats: true,
		...MAIN_STATS_LEAGUES,
		duplicateOf: null,
		status: { $in: ['won', 'lost'] },
		kickoff: { $gte: from, $lt: to },
	})
		.select('status baseRate')
		.lean();
	if (!rows.length) return null;
	const normy = rows.map((r) => r.baseRate).filter((v) => Number.isFinite(v));
	return {
		won: rows.filter((r) => r.status === 'won').length,
		total: rows.length,
		base: normy.length ? Math.round(normy.reduce((a, b) => a + b, 0) / normy.length) : 0,
	};
}

/** Kupony serwisu rozliczone w oknie dat (YYYY-MM-DD, czas polski). */
async function couponsInWindow(fromDate, toDate) {
	const rows = await Coupon.find({ type: { $in: SITE_COUPONS }, status: { $in: ['won', 'lost'] }, date: { $gte: fromDate, $lte: toDate } })
		.select('status')
		.lean();
	if (!rows.length) return null;
	return { won: rows.filter((r) => r.status === 'won').length, total: rows.length };
}

/** Zużycie AI użytkownika od założenia konta (UsageLog) i własne kupony z kreatora (zapisane, nie próby). */
async function usageSince(userId, since) {
	const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
	const [rows, custom] = await Promise.all([
		UsageLog.aggregate([
			{ $match: { userId: id, createdAt: { $gte: since }, kind: { $in: ['analysis', 'aiChat', 'report'] } } },
			{ $group: { _id: '$kind', n: { $sum: 1 } } },
		]),
		Coupon.countDocuments({ type: 'custom', userId: id, createdAt: { $gte: since } }),
	]);
	const out = { analysis: 0, aiChat: 0, report: 0, custom };
	for (const r of rows) out[r._id] = r.n;
	return out;
}

/** Token wypisu — losowy; istniejący zostaje, żeby odnośnik z pierwszego maila działał też po drugim. */
export function newOptOutToken() {
	return crypto.randomBytes(24).toString('hex');
}

/**
 * Wysyła maile 2. dnia i ostatniego dnia próby. Woła je poranny przebieg (`/api/cron/morning-email`).
 * Nigdy nie rzuca dla pojedynczego konta — błąd jednego nie zatrzymuje reszty.
 *
 * @param {{ now?: Date, dryRun?: boolean }} [options] `dryRun` buduje treść, nic nie wysyła i nie zapisuje
 */
export async function sendLifecycleEmails({ now = new Date(), dryRun = false } = {}) {
	const summary = { dayTwo: 0, trialEnd: 0, errors: 0 };
	const previews = [];

	// Kandydaci: konta w wieku próby (najstarsze kończą ją w ciągu doby), potwierdzone, bez wypisu.
	const users = await User.find({
		createdAt: { $gte: new Date(now.getTime() - TRIAL.days * 24 * H), $lte: new Date(now.getTime() - DAY_TWO_WINDOW.minAgeMs) },
		email: { $ne: null },
		isEmailVerified: true,
		welcomeSentAt: { $ne: null },
		role: { $ne: 'admin' },
		'lifecycleEmail.optOut': { $ne: true },
	})
		.select('email username role plan planStatus planValidUntil createdAt isEmailVerified welcomeSentAt morningEmail lifecycleEmail')
		.lean();

	const dayTwo = users.filter((u) => dayTwoEligible(u, now));
	const trialEnd = users.filter((u) => trialEndEligible(u, now));
	if (!dayTwo.length && !trialEnd.length) return dryRun ? { ...summary, previews } : summary;

	// Dane wspólne — raz na przebieg.
	let yesterday = null;
	let daily = null;
	if (dayTwo.length) {
		try {
			const { modelYesterday } = await import('@/lib/morning/service');
			const dzis = localDate(now);
			const start = localMidnight(localDate(new Date(localMidnight(dzis).getTime() + 12 * H), -1));
			const picks = await modelYesterday(start, localMidnight(dzis));
			yesterday = { won: picks.filter((p) => p.status === 'won').length, total: picks.length, picks };
		} catch (error) {
			console.warn('[lifecycle] wczorajsze typy niedostępne:', error.message);
		}
		try {
			const { getDailyPick, toDto } = await import('@/lib/daily/service');
			const d = await getDailyPick(localDate(now), { create: false });
			daily = d && new Date(d.kickoff) > now ? await toDto(d) : null;
		} catch {
			daily = null;
		}
	}

	const transporter = dryRun ? null : getTransporter();

	const wyslij = async (user, field, build) => {
		const token = user.lifecycleEmail?.unsubscribeToken || newOptOutToken();
		const optOutUrl = `${SITE_URL}/api/me/account-email/unsubscribe?token=${encodeURIComponent(token)}`;
		const locale = user.morningEmail?.locale === 'en' ? 'en' : 'pl';
		const mail = await build({ locale, optOutUrl });

		if (dryRun) {
			previews.push({ to: user.email, kind: field, subject: mail.subject, text: mail.text });
			return true;
		}

		// Znacznik przed wysyłką i warunkowo — drugi przebieg tego dnia nic nie wyśle.
		const zaznaczony = await User.findOneAndUpdate(
			{ _id: user._id, [`lifecycleEmail.${field}`]: null, 'lifecycleEmail.optOut': { $ne: true } },
			{ $set: { [`lifecycleEmail.${field}`]: now, 'lifecycleEmail.unsubscribeToken': token } },
			{ projection: { _id: 1 } }
		).lean();
		if (!zaznaczony) return false;
		try {
			await transporter.sendMail({
				from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`,
				to: user.email,
				subject: mail.subject,
				text: mail.text,
				html: mail.html,
				headers: { 'List-Unsubscribe': `<${optOutUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
			});
		} catch (error) {
			// Nie doszło — zdejmujemy znacznik, jutrzejszy przebieg spróbuje ponownie (jeśli konto nadal w oknie).
			await User.updateOne({ _id: user._id }, { $set: { [`lifecycleEmail.${field}`]: null } });
			throw error;
		}
		return true;
	};

	for (const user of dayTwo) {
		try {
			const usage = await usageSince(user._id, new Date(user.createdAt));
			const untried = ['analysis', 'report', 'aiChat', 'custom'].filter((k) => !usage[k]);
			const ok = await wyslij(user, 'dayTwoSentAt', ({ locale, optOutUrl }) =>
				buildDayTwoEmail({ name: user.username || null, locale, trialDaysLeft: trialDaysLeft(user, now), yesterday, daily, untried, optOutUrl })
			);
			if (ok) summary.dayTwo += 1;
		} catch (error) {
			summary.errors += 1;
			console.error('[lifecycle] mail 2. dnia nie wyszedł dla', user.email, '—', error.message);
		}
	}

	for (const user of trialEnd) {
		try {
			const since = new Date(user.createdAt);
			const [usage, model, coupons] = await Promise.all([
				usageSince(user._id, since),
				modelInWindow(since, now),
				couponsInWindow(localDate(since), localDate(now)),
			]);
			const ok = await wyslij(user, 'trialEndSentAt', ({ locale, optOutUrl }) =>
				buildTrialEndEmail({ name: user.username || null, locale, endsAt: trialEndsAt(user), now, usage, model, coupons, optOutUrl })
			);
			if (ok) summary.trialEnd += 1;
		} catch (error) {
			summary.errors += 1;
			console.error('[lifecycle] mail końca próby nie wyszedł dla', user.email, '—', error.message);
		}
	}

	return dryRun ? { ...summary, previews } : summary;
}
