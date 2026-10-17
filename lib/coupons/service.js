import Coupon from '@/models/Coupon';
import ModelForecast from '@/models/ModelForecast';
import { hintsForDate, COMPACT_LABELS } from '@/lib/model/hints';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import { HINT_TO_SELECTION } from '@/lib/model/oddsShadow';
import { fixturesByIds } from '@/lib/football/endpoints';
import { matchPath } from '@/lib/seo/matchPreview';
import { localDate, localMidnight } from '@/lib/time';
import { buildCoupon, couponStatus, legResult, settledOdds } from '@/lib/coupons/build';

/**
 * Kupon dnia i kupon weekendowy — część z bazą i siecią. Zasady wyboru: `build.js`.
 *
 * KIEDY. Woła to przebieg kursów co 20 minut (`/api/cron/odds-snapshot`), zaraz po zdjęciu
 * kursów. Kupon dnia powstaje w pierwszym przebiegu po 9:30 — wtedy dziennik prognoz ma już
 * poranne kursy całego dnia. Weekendowy w piątek (albo w sobotę, gdy piątkowy przebieg nie
 * doszedł do skutku), z meczów do niedzieli. Gdy rano nie da się złożyć kuponu, próbujemy do
 * południa; potem zapisujemy „dziś bez kuponu" (`status: 'none'`) i to też jest odpowiedź.
 *
 * KURSY. Mediana bukmacherów z porannego zdjęcia w dzienniku prognoz; brakujące (mecze
 * spoza okna dziennika, czyli weekend) dociągamy osobno — najwyżej `MAX_DOCIAGNIEC` zapytań.
 *
 * ROZLICZENIE. Ten sam przebieg co 20 minut sprawdza typy, których mecze skończyły się co
 * najmniej dwie godziny po pierwszym gwizdku — kupon przegrywa od pierwszego chybionego, więc
 * czytelnik widzi wynik tego samego wieczoru, a nie rano.
 */

export const PUBLISH_MINUTE = 9 * 60 + 30;
export const GIVE_UP_MINUTE = 12 * 60;
const MAX_DOCIAGNIEC = 30;
const CONCURRENCY = 4;
const LEG_SETTLE_AFTER_MS = 2 * 3600_000;
/** Mecz bez wyniku trzy doby po terminie — liczymy jak odwołany, żeby kupon się zamknął. */
const LEG_VOID_AFTER_MS = 72 * 3600_000;
/** Strona meczu (`/typ/...`) powstaje z dziennika prognoz, który zapisuje mecze do 48 godzin przed. */
const LINK_LEAD_MS = 46 * 3600_000;

const minutaDnia = (now) => Math.floor((now.getTime() - localMidnight(localDate(now)).getTime()) / 60_000);
/** Dzień tygodnia daty `YYYY-MM-DD` (0 = niedziela). */
const dzienTygodnia = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Daty weekendu dla dnia publikacji i klucz kuponu (data piątku). `null` poza piątkiem i sobotą. */
export function weekendWindow(now = new Date()) {
	const dzis = localDate(now);
	const dt = dzienTygodnia(dzis);
	if (dt === 5) return { friday: dzis, dates: [dzis, localDate(now, 1), localDate(now, 2)] };
	if (dt === 6) return { friday: localDate(now, -1), dates: [dzis, localDate(now, 1)] };
	return null;
}

const kursSelekcji = (zdjecie, key) => {
	const v = zdjecie?.[HINT_TO_SELECTION[key]];
	return Number.isFinite(v) && v > 1 ? Number(v.toFixed(2)) : null;
};

/**
 * Kandydaci na kupon z plakietek podanych dni — z kursem selekcji.
 *
 * @param {string[]} dates
 * @param {{ now: Date, hintsFor?: Function, fetchOdds?: Function }} options podmieniane w testach
 */
export async function couponCandidates(dates, { now, hintsFor = hintsForDate, fetchOdds = fetchOddsSnapshot }) {
	const listy = await Promise.all(dates.map((d) => hintsFor(d).then((r) => r?.list || []).catch(() => [])));
	const wpisy = listy
		.flat()
		.filter((w) => w?.hint && HINT_TO_SELECTION[w.hint.key] && Date.parse(w.kickoff) > now.getTime());

	const zapisane = new Map(
		(await ModelForecast.find({ fixtureId: { $in: wpisy.map((w) => String(w.fixtureId)) } })
			.select('fixtureId odds.open')
			.lean()).map((f) => [String(f.fixtureId), f.odds?.open || null])
	);

	// Bez porannego zdjęcia (np. mecze weekendu) — dociągamy, od najpewniejszych.
	const doPobrania = wpisy
		.filter((w) => !zapisane.get(String(w.fixtureId)))
		.sort((a, b) => b.hint.probability - a.hint.probability)
		.slice(0, MAX_DOCIAGNIEC);
	for (let i = 0; i < doPobrania.length; i += CONCURRENCY) {
		await Promise.all(
			doPobrania.slice(i, i + CONCURRENCY).map(async (w) => {
				try {
					const zdjecie = await fetchOdds(String(w.fixtureId));
					if (zdjecie) zapisane.set(String(w.fixtureId), zdjecie);
				} catch (error) {
					console.warn(`[coupons] kursy ${w.fixtureId}:`, error.message);
				}
			})
		);
	}

	return wpisy
		.map((w) => ({
			fixtureId: String(w.fixtureId),
			homeName: w.home,
			awayName: w.away,
			leagueId: w.leagueId ?? null,
			league: w.league || null,
			kickoff: new Date(w.kickoff),
			key: w.hint.key,
			selection: w.hint.selection,
			probability: w.hint.probability,
			base: Number.isFinite(w.hint.base) ? Math.round(w.hint.base) : null,
			odds: kursSelekcji(zapisane.get(String(w.fixtureId)), w.hint.key),
		}))
		.filter((c) => c.odds !== null);
}

/** Zapis raz na klucz; wyścig dwóch przebiegów rozstrzyga unikalny indeks. */
async function zapisz(key, type, date, kupon) {
	try {
		const doc = await Coupon.create(
			kupon
				? {
						key,
						type,
						date,
						legs: kupon.legs.map((l) => ({ ...l, status: 'pending', score: null })),
						totalOdds: kupon.totalOdds,
						chance: kupon.chance,
						status: 'pending',
					}
				: { key, type, date, status: 'none' }
		);
		return doc.toObject();
	} catch (error) {
		if (error?.code === 11000) return Coupon.findOne({ key }).lean();
		throw error;
	}
}

/**
 * Tworzy brakujące kupony, jeśli przyszła ich pora. Bezpieczne do wołania co przebieg —
 * istniejący kupon się nie zmienia.
 *
 * @returns {Promise<{ created: string[], none: string[] }>}
 */
export async function ensureCoupons({ now = new Date(), hintsFor, fetchOdds } = {}) {
	const out = { created: [], none: [] };
	const minuta = minutaDnia(now);
	if (minuta < PUBLISH_MINUTE) return out;
	const dzis = localDate(now);
	const opcje = { now, hintsFor, fetchOdds };

	const zadania = [{ key: `daily:${dzis}`, type: 'daily', date: dzis, dates: [dzis] }];
	const weekend = weekendWindow(now);
	if (weekend) zadania.push({ key: `weekend:${weekend.friday}`, type: 'weekend', date: weekend.friday, dates: weekend.dates });

	for (const z of zadania) {
		if (await Coupon.exists({ key: z.key })) continue;
		// Weekendowy bez meczów z dzisiejszego kuponu dnia — dwa kupony, nie ten sam dwa razy.
		const dzienny = z.type === 'weekend' ? await Coupon.findOne({ key: `daily:${dzis}` }).select('legs.fixtureId').lean() : null;
		const kupon = buildCoupon(await couponCandidates(z.dates, opcje), {
			type: z.type,
			now,
			exclude: (dzienny?.legs || []).map((l) => l.fixtureId),
		});
		if (kupon) {
			await zapisz(z.key, z.type, z.date, kupon);
			out.created.push(z.key);
		} else if (minuta >= GIVE_UP_MINUTE) {
			await zapisz(z.key, z.type, z.date, null);
			out.none.push(z.key);
		}
	}
	return out;
}

/**
 * Rozlicza typy kuponów, których mecze już się skończyły. Paczki po 20 meczów — jedno zapytanie.
 *
 * @param {{ now?: Date, fetchRows?: Function, query?: object }} [options] `fetchRows` i `query`
 *   (zawężenie do własnych kuponów) dla testów na wspólnej bazie
 * @returns {Promise<{ examined: number, updated: number, settled: number, apiCalls: number }>}
 */
export async function settleCoupons({ now = new Date(), fetchRows = fixturesByIds, query = {} } = {}) {
	const kupony = await Coupon.find({ ...query, 'legs.status': 'pending' }).lean();
	const prog = now.getTime() - LEG_SETTLE_AFTER_MS;
	const ids = [
		...new Set(
			kupony.flatMap((c) =>
				c.legs.filter((l) => l.status === 'pending' && new Date(l.kickoff).getTime() <= prog).map((l) => String(l.fixtureId))
			)
		),
	];
	const summary = { examined: kupony.length, updated: 0, settled: 0, apiCalls: 0 };
	if (!ids.length) return summary;

	const wiersze = new Map();
	for (let i = 0; i < ids.length; i += 20) {
		try {
			const rows = await fetchRows(ids.slice(i, i + 20));
			summary.apiCalls += 1;
			for (const row of rows || []) wiersze.set(String(row.fixture?.id), row);
		} catch (error) {
			console.warn('[coupons] nie udało się pobrać wyników paczki:', error.message);
		}
	}

	for (const c of kupony) {
		let zmiana = false;
		const legs = c.legs.map((l) => {
			if (l.status !== 'pending' || new Date(l.kickoff).getTime() > prog) return l;
			const wynik =
				legResult(l, wiersze.get(String(l.fixtureId))) ||
				(now.getTime() - new Date(l.kickoff).getTime() > LEG_VOID_AFTER_MS ? { status: 'void', score: null } : null);
			if (!wynik) return l;
			zmiana = true;
			return { ...l, ...wynik };
		});
		if (!zmiana) continue;
		const status = couponStatus(legs);
		const $set = { legs, status };
		if (status !== 'pending' && !c.settledAt) $set.settledAt = now;
		await Coupon.updateOne({ _id: c._id }, { $set });
		summary.updated += 1;
		if (status !== 'pending' && c.status === 'pending') summary.settled += 1;
	}
	return summary;
}

/** Postać dla interfejsu — z linkiem do strony meczu, gdy ta już istnieje. */
export function couponDto(c, now = new Date()) {
	if (!c) return null;
	const baza = { key: c.key, type: c.type, date: c.date, status: c.status };
	if (c.status === 'none') return { ...baza, legs: [] };
	return {
		...baza,
		totalOdds: c.totalOdds,
		chance: c.chance,
		// Po odwołanych meczach kurs maleje (odwołany = 1,00) — pokazujemy ten, który się liczy.
		settledOdds: c.status === 'won' ? settledOdds(c.legs) : null,
		legs: c.legs.map((l) => ({
			fixtureId: l.fixtureId,
			home: l.homeName,
			away: l.awayName,
			league: l.league,
			leagueId: l.leagueId ?? null,
			kickoff: new Date(l.kickoff).toISOString(),
			key: l.key,
			label: COMPACT_LABELS[l.key] || l.key,
			selection: l.selection,
			probability: l.probability,
			odds: l.odds,
			status: l.status,
			score: l.score,
			href:
				new Date(l.kickoff).getTime() - now.getTime() <= LINK_LEAD_MS
					? matchPath({ fixtureId: l.fixtureId, homeName: l.homeName, awayName: l.awayName })
					: null,
		})),
	};
}

/** Bilans kuponów jednego rodzaju — z zakresem dni albo całość. */
export async function couponStats({ type, days = null, now = new Date(), recent = 15 } = {}) {
	const filtr = { type };
	if (days) filtr.date = { $gte: localDate(now, -Number(days)) };
	const rows = await Coupon.find(filtr).sort({ date: -1 }).lean();
	const rozliczone = rows.filter((r) => r.status === 'won' || r.status === 'lost');
	const won = rozliczone.filter((r) => r.status === 'won').length;
	const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const sredniKurs = srednia(rozliczone.map((r) => r.totalOdds));
	const sredniaSzansa = srednia(rozliczone.map((r) => r.chance));
	return {
		summary: {
			won,
			lost: rozliczone.length - won,
			settled: rozliczone.length,
			pending: rows.filter((r) => r.status === 'pending').length,
			void: rows.filter((r) => r.status === 'void').length,
			none: rows.filter((r) => r.status === 'none').length,
			hitRate: rozliczone.length ? Math.round((100 * won) / rozliczone.length) : null,
			avgOdds: sredniKurs === null ? null : Number(sredniKurs.toFixed(2)),
			avgChance: sredniaSzansa === null ? null : Math.round(sredniaSzansa),
		},
		recent: rows
			.filter((r) => r.status !== 'none')
			.slice(0, recent)
			.map((r) => couponDto(r, now)),
	};
}

/** Krótki dorobek do nagłówka sekcji: ile kuponów weszło. */
export async function couponRecord() {
	const rows = await Coupon.find({ status: { $in: ['won', 'lost'] } }).select('type status').lean();
	const rekord = (type) => {
		const r = rows.filter((x) => x.type === type);
		return { won: r.filter((x) => x.status === 'won').length, total: r.length };
	};
	return { daily: rekord('daily'), weekend: rekord('weekend') };
}

/**
 * Komplet dla strony i API: dzisiejszy kupon dnia (albo informacja, kiedy będzie), wczorajszy
 * z wynikiem, kupon weekendowy z ostatnich siedmiu dni i dorobek.
 */
export async function couponsOverview({ now = new Date() } = {}) {
	const dzis = localDate(now);
	const [today, yesterday, weekend, record] = await Promise.all([
		Coupon.findOne({ key: `daily:${dzis}` }).lean(),
		Coupon.findOne({ key: `daily:${localDate(now, -1)}` }).lean(),
		Coupon.findOne({ type: 'weekend', date: { $gte: localDate(now, -6) } }).sort({ date: -1 }).lean(),
		couponRecord(),
	]);
	return {
		date: dzis,
		today: couponDto(today, now),
		yesterday: couponDto(yesterday, now),
		weekend: couponDto(weekend, now),
		// Przed 9:30 kuponu dnia jeszcze nie ma — strona mówi, kiedy będzie, zamiast „brak".
		todayLater: !today && minutaDnia(now) < GIVE_UP_MINUTE,
		weekendLater: !weekend && [4, 5].includes(dzienTygodnia(dzis)),
		record,
	};
}
