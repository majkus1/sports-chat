import Pick from '@/models/Pick';
import User from '@/models/User';
import UsageLog from '@/models/UsageLog';
import Coupon from '@/models/Coupon';
import { dailyOverviewCached } from '@/lib/daily/service';
import { couponsOverview } from '@/lib/coupons/service';
import { checkSpendCap } from '@/lib/billing/spendGuard';
import { MAIN_STATS_LEAGUES } from '@/lib/football/leagues';
import { SITE_URL } from '@/lib/seo/config';
import { localDate, localMidnight } from '@/lib/time';

/**
 * Dzienny skrót dla automatyzacji zewnętrznych (n8n — `integrations/n8n/`).
 *
 * JEDNO ŹRÓDŁO LICZB. Workflow nie liczy niczego sam i nie czyta bazy: dostaje gotowe liczby
 * z tych samych funkcji, z których korzysta strona (typ dnia, kupony, skuteczność). Dzięki
 * temu post w kanale i strona nie mogą powiedzieć czegoś innego.
 *
 * DWIE CZĘŚCI. `public` — to, co i tak jest jawne na stronie (typ dnia, darmowy kupon dnia,
 * wyniki, dorobek); tylko to wolno publikować. `ops` — dla właściciela: wydatki na AI,
 * użycie, rejestracje, stan płatnych kuponów (bez meczów). Workflow publikujący bierze
 * wyłącznie `public`.
 *
 * Tylko odczyt — trasa niczego nie tworzy (typ dnia bez `create`, kupony z bazy).
 */

const kurs = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : null);

function typDnia(d) {
	if (!d) return null;
	return {
		match: `${d.home} – ${d.away}`,
		league: d.league,
		kickoff: d.kickoff,
		selection: d.selection,
		probability: d.probability,
		usually: Number.isFinite(d.base) ? Math.round(d.base) : null,
		status: d.status,
		score: d.score,
		url: `${SITE_URL}/pl/mecz/${d.fixtureId}`,
	};
}

function kupon(c) {
	if (!c || c.status === 'none' || c.locked) return c?.status === 'none' ? { status: 'none' } : null;
	return {
		status: c.status,
		totalOdds: c.totalOdds,
		totalOddsText: kurs(c.totalOdds),
		chance: c.chance,
		legs: (c.legs || []).map((l) => ({
			match: `${l.home} – ${l.away}`,
			selection: l.selection,
			odds: l.odds,
			oddsText: kurs(l.odds),
			kickoff: l.kickoff,
			status: l.status,
			score: l.score ?? null,
		})),
	};
}

/** Skuteczność głównej puli z ostatnich `dni` — ta sama definicja co panel skuteczności. */
async function skutecznosc(now, dni = 30) {
	const rows = await Pick.find({
		author: 'ai',
		countsToStats: true,
		duplicateOf: null,
		...MAIN_STATS_LEAGUES,
		status: { $in: ['won', 'lost'] },
		kickoff: { $gte: new Date(now.getTime() - dni * 86_400_000), $lt: now },
	})
		.select('status baseRate')
		.lean();
	const won = rows.filter((r) => r.status === 'won').length;
	const zNorma = rows.filter((r) => Number.isFinite(r.baseRate));
	return {
		days: dni,
		settled: rows.length,
		won,
		hitRate: rows.length ? Math.round((100 * won) / rows.length) : null,
		usually: zNorma.length ? Math.round(zNorma.reduce((a, r) => a + r.baseRate, 0) / zNorma.length) : null,
	};
}

/**
 * Część dla właściciela: koszty AI, użycie, rejestracje, płatne kupony bez meczów i ile kuponów
 * złożono dziś w kreatorze (tylko liczby — własne kupony użytkowników nigdy nie idą do `public`;
 * kupony w `public` pochodzą z `couponsOverview`, które zna wyłącznie kupony serwisu).
 */
async function operacje(now) {
	const doba = new Date(now.getTime() - 86_400_000);
	const [wydatki, uzycie, noweKonta, kontaRazem, platne, wlasne] = await Promise.all([
		checkSpendCap().catch(() => null),
		UsageLog.aggregate([
			{ $match: { createdAt: { $gte: doba } } },
			{ $group: { _id: '$kind', calls: { $sum: 1 }, costUsd: { $sum: { $ifNull: ['$costUsd', 0] } }, users: { $addToSet: '$userId' } } },
		]),
		User.countDocuments({ createdAt: { $gte: doba } }),
		User.estimatedDocumentCount(),
		Coupon.find({ date: localDate(now), type: { $in: ['days3', 'days5'] } })
			.select('type status totalOdds chance legs.status newsCheck.dropped')
			.lean(),
		Coupon.aggregate([
			{ $match: { type: 'custom', date: localDate(now) } },
			{ $group: { _id: null, coupons: { $sum: 1 }, users: { $addToSet: '$userId' } } },
		]),
	]);
	return {
		// Bez Redisa (`degraded`) licznik nie istnieje — `null` zamiast mylącego zera.
		aiSpendTodayUsd: wydatki && !wydatki.degraded ? Number(wydatki.spent.toFixed(3)) : null,
		aiSpendCapUsd: wydatki?.cap ?? null,
		usage24h: uzycie.map((u) => ({
			kind: u._id,
			calls: u.calls,
			costUsd: Number(u.costUsd.toFixed(3)),
			users: u.users.filter(Boolean).length,
		})),
		newUsers24h: noweKonta,
		usersTotal: kontaRazem,
		paidCouponsToday: platne.map((c) => ({
			type: c.type,
			status: c.status,
			totalOdds: c.totalOdds,
			chance: c.chance,
			legs: c.legs?.length ?? 0,
			droppedByNewsCheck: c.newsCheck?.dropped?.length ?? 0,
		})),
		// Kreator kuponu: ile kuponów i ilu użytkowników dziś — koszt jest w `usage24h` (`couponGen`).
		builderCouponsToday: { coupons: wlasne[0]?.coupons ?? 0, users: wlasne[0]?.users?.filter(Boolean).length ?? 0 },
	};
}

export async function dailyBrief({ now = new Date() } = {}) {
	const [daily, kupony, wynik30, ops] = await Promise.all([
		dailyOverviewCached({ now }),
		couponsOverview({ now, unlocked: false }),
		skutecznosc(now),
		operacje(now),
	]);
	return {
		date: localDate(now),
		generatedAt: now.toISOString(),
		dayStart: localMidnight(localDate(now)).toISOString(),
		public: {
			siteUrl: SITE_URL,
			dailyPick: typDnia(daily.today),
			dailyPickTomorrow: typDnia(daily.tomorrow),
			dailyPickYesterday: typDnia(daily.yesterday),
			dailyPickRecord: daily.record,
			coupon: kupon(kupony.today),
			couponYesterday: kupon(kupony.yesterday),
			couponRecord: kupony.record,
			accuracy30: wynik30,
		},
		ops,
	};
}
