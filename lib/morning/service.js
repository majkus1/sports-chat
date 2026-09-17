import crypto from 'crypto';
import User from '@/models/User';
import Pick from '@/models/Pick';
import Round from '@/models/Round';
import FavoriteMatch from '@/models/FavoriteMatch';
import { getTransporter } from '@/lib/mailer';
import { hasFeature } from '@/lib/billing/entitlements';
import { hintsForDate } from '@/lib/model/hints';
import { roundKeyFor } from '@/lib/rounds/service';
import { SITE_URL } from '@/lib/seo/config';
import { buildMorningEmail } from '@/lib/morning/build';
import { localDate, localMidnight, localTime } from '@/lib/time';

/**
 * Poranny mail — zebranie danych i wysyłka do wszystkich, którzy go włączyli.
 *
 * CZAS POLSKI, NIE SERWERA. „Wczoraj" i „dziś" liczymy w Europe/Warsaw, bo tak liczy je
 * odbiorca; serwer stoi w UTC. Mecz o 21:00 w Warszawie to 19:00 UTC — ta sama data, ale
 * mecz o 00:30 to poprzedni dzień UTC, i bez tej korekty lądowałby w złym dniu.
 *
 * DANE WSPÓLNE RAZ, PER UŻYTKOWNIK TYLKO TO, CO JEGO. Typy modelu z wczoraj i podpowiedzi
 * na dziś są dla wszystkich takie same — liczymy je przed pętlą. Na użytkownika zostaje:
 * jego typy z wczoraj, jego ulubione mecze, jego stan w kolejce.
 *
 * IDEMPOTENTNE. `lastSentOn` zapisujemy PRZED wysyłką; jeśli zadanie uruchomi się drugi raz
 * tego dnia (restart procesu, ręczne wywołanie), nikt nie dostanie dwóch maili. Odwrotny
 * porządek — najpierw wysłać, potem zapisać — gubiłby to zabezpieczenie przy awarii
 * między jednym a drugim.
 *
 * PLAN SPRAWDZANY PRZY WYSYŁCE. Ktoś, komu dostęp wygasł po włączeniu maila, nie dostaje
 * go dalej — ale zgoda zostaje, więc po przedłużeniu mail wraca sam.
 */

const kickoffLocal = localTime;

/** Dzień wcześniej w czasie polskim — przez południe, żeby zmiana czasu nie przesunęła daty. */
function dayBefore(dateStr) {
	return localDate(new Date(localMidnight(dateStr).getTime() + 12 * 3600_000), -1);
}

/** Token do wypisania — losowy, zapisywany raz przy włączeniu. */
export function newUnsubscribeToken() {
	return crypto.randomBytes(24).toString('hex');
}

/**
 * Typy modelu z wczoraj — rozliczone, wliczane, bez duplikatów raport/analiza.
 *
 * Ten sam mecz i ta sama selekcja potrafią istnieć dwa razy (raport i analiza), więc
 * odfiltrowujemy po meczu i selekcji; do maila idzie najwyżej pięć, po przewadze.
 */
async function modelYesterday(start, end) {
	const rows = await Pick.find({
		author: 'ai',
		countsToStats: true,
		status: { $in: ['won', 'lost'] },
		kickoff: { $gte: start, $lt: end },
	})
		.select('fixtureId homeName awayName selection status lift normalized')
		.sort({ lift: -1 })
		.lean();

	const seen = new Set();
	const out = [];
	for (const p of rows) {
		const key = `${p.fixtureId}:${JSON.stringify(p.normalized)}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ home: p.homeName, away: p.awayName, selection: p.selection, status: p.status });
		if (out.length >= 5) break;
	}
	return out;
}

async function mineYesterday(userId, start, end) {
	const rows = await Pick.find({
		author: 'user',
		userId,
		status: { $in: ['won', 'lost'] },
		kickoff: { $gte: start, $lt: end },
	})
		.select('homeName awayName selection status')
		.lean();
	return rows.map((p) => ({ home: p.homeName, away: p.awayName, selection: p.selection, status: p.status }));
}

async function favoritesToday(userId, start, end, hintsById) {
	const rows = await FavoriteMatch.find({ userId, kickoff: { $gte: start, $lt: end } })
		.select('fixtureId homeName awayName kickoff')
		.sort({ kickoff: 1 })
		.lean();
	return rows.map((f) => {
		const h = hintsById.get(String(f.fixtureId));
		return {
			fixtureId: String(f.fixtureId),
			home: f.homeName,
			away: f.awayName,
			kickoffLocal: kickoffLocal(f.kickoff),
			...(h ? { selection: h.selection, probability: h.probability, base: h.base } : {}),
		};
	});
}

/** Kolejka do przypomnienia: otwarta, zamyka się DZIŚ, a użytkownik nie wytypował wszystkiego. */
async function roundReminder(userId, start, end) {
	const round = await Round.findOne({ key: roundKeyFor() }).select('status closesAt fixtures').lean();
	if (!round || round.status !== 'open') return null;
	const closes = new Date(round.closesAt);
	if (closes < start || closes >= end) return null;
	const picked = await Pick.countDocuments({ roundKey: roundKeyFor(), author: 'user', userId });
	return { closesLocal: kickoffLocal(closes), picked, total: round.fixtures.length };
}

/**
 * Wysyła poranne maile. Zwraca podsumowanie do dziennika.
 *
 * @param {{ now?: Date, dryRun?: boolean }} [options] `dryRun` buduje treść, nic nie wysyła i nie zapisuje
 */
export async function sendMorningEmails({ now = new Date(), dryRun = false } = {}) {
	const today = localDate(now);
	const yesterday = dayBefore(today);
	const todayStart = localMidnight(today);
	const tomorrowStart = localMidnight(localDate(new Date(todayStart.getTime() + 36 * 3600_000)));
	const yesterdayStart = localMidnight(yesterday);

	const summary = { date: today, candidates: 0, sent: 0, skippedPlan: 0, skippedEmpty: 0, skippedSent: 0, errors: 0 };

	const users = await User.find({ 'morningEmail.enabled': true, email: { $ne: null } })
		.select('email username plan planStatus planValidUntil role grantedFeatures morningEmail')
		.lean();
	summary.candidates = users.length;
	if (!users.length) return summary;

	// Dane wspólne — raz na przebieg.
	const [{ byId: hintsById, list: hintsList }, modelPicks] = await Promise.all([
		hintsForDate(today),
		modelYesterday(yesterdayStart, todayStart),
	]);
	const todayPicks = hintsList.slice(0, 5).map((w) => ({
		fixtureId: w.fixtureId,
		home: w.home,
		away: w.away,
		selection: w.hint.selection,
		probability: w.hint.probability,
		base: w.hint.base,
		kickoffLocal: kickoffLocal(w.kickoff),
	}));

	const transporter = dryRun ? null : getTransporter();
	const previews = [];

	for (const user of users) {
		try {
			if (user.morningEmail?.lastSentOn === today) {
				summary.skippedSent += 1;
				continue;
			}
			// `hasFeature`, nie `resolvePlan().features` — ta sama droga co przełącznik w panelu,
			// z cechami nadanymi ręcznie (`grantedFeatures`) włącznie.
			if (!hasFeature(user, 'morning_email')) {
				summary.skippedPlan += 1;
				continue;
			}

			const locale = user.morningEmail?.locale === 'en' ? 'en' : 'pl';
			const token = user.morningEmail?.unsubscribeToken;
			const unsubscribeUrl = `${SITE_URL}/api/me/morning-email/unsubscribe?token=${encodeURIComponent(token || '')}`;

			const [mine, favorites, round] = await Promise.all([
				mineYesterday(user._id, yesterdayStart, todayStart),
				favoritesToday(user._id, todayStart, tomorrowStart, hintsById),
				roundReminder(user._id, todayStart, tomorrowStart),
			]);

			const mail = buildMorningEmail({
				name: user.username || null,
				locale,
				date: today,
				yesterday: { model: modelPicks, mine },
				today: todayPicks,
				favorites,
				round,
				siteUrl: SITE_URL,
				unsubscribeUrl,
			});
			if (!mail) {
				summary.skippedEmpty += 1;
				continue;
			}

			if (dryRun) {
				previews.push({ to: user.email, subject: mail.subject, text: mail.text });
				summary.sent += 1;
				continue;
			}

			// Najpierw znacznik, potem wysyłka — patrz komentarz na górze.
			await User.updateOne({ _id: user._id }, { $set: { 'morningEmail.lastSentOn': today } });
			await transporter.sendMail({
				from: `"Czat Sportowy" <${process.env.EMAIL_USER}>`,
				to: user.email,
				subject: mail.subject,
				text: mail.text,
				html: mail.html,
				// Klienci poczty pokazują przy tym nagłówku własny przycisk „wypisz się".
				headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
			});
			summary.sent += 1;
		} catch (error) {
			summary.errors += 1;
			console.error('[morning] wysyłka nie powiodła się dla', user.email, '—', error.message);
		}
	}

	return dryRun ? { ...summary, previews } : summary;
}
