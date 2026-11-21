import { CHANNELS } from '@/lib/growth/source';
import { localDate } from '@/lib/time';

/**
 * Rejestracje według źródła i aktywacja — dane do panelu `/admin/zrodla`.
 *
 * AKTYWACJA = DWA PYTANIA, oba z dziennika zużycia (`UsageLog`), bo tylko on zapisuje, że ktoś
 * naprawdę użył AI (analiza, czat, raport, kupon z kreatora), a nie tylko otworzył stronę:
 *   - czy użył AI w ogóle (dowolny wpis),
 *   - czy WRÓCIŁ: użył AI w dniu następnym po rejestracji (D1) albo w dowolnym późniejszym.
 * Do 21.11.2026 dziewięć z dziesięciu kont użyło AI jednego dnia i nie wróciło — to ta liczba
 * ma się ruszyć, więc stoi obok liczby kont, a nie gdzieś niżej.
 *
 * D1 liczymy tylko dla kont, których następny dzień już minął — konto z dziś nie może jeszcze
 * „nie wrócić", więc nie zaniża wyniku (`d1Eligible`).
 *
 * Część czysta (`summarizeSignups`) jest osobno od zapytań (`loadSignupReport`), żeby test
 * sprawdzał rachunek bez bazy.
 */

/** Czytelna etykieta źródła: kampania z utm, inaczej host, inaczej sam kanał. */
export function sourceLabel(src) {
	if (!src) return 'legacy';
	if (src.utmSource) return [src.utmSource, src.utmMedium, src.utmCampaign].filter(Boolean).join(' / ');
	if (src.referrerHost) return src.referrerHost;
	return src.channel || 'unknown';
}

const pusty = () => ({ accounts: 0, usedAi: 0, returnedD1: 0, d1Eligible: 0, returnedLater: 0 });

function dolicz(grupa, wiersz) {
	grupa.accounts += 1;
	if (wiersz.usedAi) grupa.usedAi += 1;
	if (wiersz.d1Eligible) grupa.d1Eligible += 1;
	if (wiersz.returnedD1) grupa.returnedD1 += 1;
	if (wiersz.returnedLater) grupa.returnedLater += 1;
}

/**
 * @param {Array<{ _id: any, username?: string, createdAt: Date|string, signupSource?: object|null }>} users
 * @param {Map<string, Set<string>>} activity id konta → dni (YYYY-MM-DD, czas polski) z użyciem AI
 * @param {{ now?: Date }} [options]
 */
export function summarizeSignups(users, activity, { now = new Date() } = {}) {
	const dzis = localDate(now);
	const wiersze = users.map((u) => {
		const dzien = localDate(new Date(u.createdAt));
		const nastepny = localDate(new Date(u.createdAt), 1);
		const dni = activity.get(String(u._id)) || new Set();
		const src = u.signupSource || null;
		return {
			id: String(u._id),
			username: u.username || null,
			createdAt: new Date(u.createdAt).toISOString(),
			channel: src ? src.channel || 'unknown' : 'legacy',
			source: sourceLabel(src),
			landingPath: src?.landingPath || null,
			usedAi: dni.size > 0,
			d1Eligible: nastepny < dzis,
			returnedD1: dni.has(nastepny),
			returnedLater: [...dni].some((d) => d > dzien),
		};
	});

	const kanaly = new Map();
	const zrodla = new Map();
	const razem = pusty();
	for (const w of wiersze) {
		dolicz(razem, w);
		if (!kanaly.has(w.channel)) kanaly.set(w.channel, pusty());
		dolicz(kanaly.get(w.channel), w);
		const klucz = `${w.channel}|${w.source}`;
		if (!zrodla.has(klucz)) zrodla.set(klucz, { channel: w.channel, source: w.source, ...pusty() });
		dolicz(zrodla.get(klucz), w);
	}

	// Kolejność kanałów stała (jak w `CHANNELS`), konta sprzed zapisu źródeł na końcu.
	const kolejnosc = [...CHANNELS, 'legacy'];
	return {
		total: razem,
		byChannel: [...kanaly.entries()]
			.map(([channel, g]) => ({ channel, ...g }))
			.sort((a, b) => kolejnosc.indexOf(a.channel) - kolejnosc.indexOf(b.channel)),
		bySource: [...zrodla.values()].sort((a, b) => b.accounts - a.accounts || a.source.localeCompare(b.source)),
		recent: [...wiersze].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30),
	};
}

/**
 * Konta z ostatnich `days` dni (bez administratorów i kont testowych `@example.com`) i ich dni z AI.
 * Dwa zapytania; konta liczymy w dziesiątkach, więc bez dodatkowych indeksów.
 */
export async function loadSignupReport({ days = 90, now = new Date() } = {}) {
	const [{ default: User }, { default: UsageLog }] = await Promise.all([import('@/models/User'), import('@/models/UsageLog')]);
	const users = await User.find({
		createdAt: { $gte: new Date(now.getTime() - days * 86_400_000) },
		role: { $ne: 'admin' },
		email: { $not: /@example\.com$/i },
	})
		.select('username createdAt signupSource')
		.lean();

	const activity = new Map();
	if (users.length) {
		const rows = await UsageLog.aggregate([
			{ $match: { userId: { $in: users.map((u) => u._id) } } },
			{
				$group: {
					_id: {
						u: '$userId',
						d: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Europe/Warsaw' } },
					},
				},
			},
		]);
		for (const r of rows) {
			const id = String(r._id.u);
			if (!activity.has(id)) activity.set(id, new Set());
			activity.get(id).add(r._id.d);
		}
	}
	return { days, ...summarizeSignups(users, activity, { now }) };
}
