import Coupon from '@/models/Coupon';
import ModelForecast from '@/models/ModelForecast';
import { hintsForDate, COMPACT_LABELS } from '@/lib/model/hints';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import { HINT_TO_SELECTION } from '@/lib/model/oddsShadow';
import { fixturesByIds } from '@/lib/football/endpoints';
import { isEstablishedLeague } from '@/lib/football/leagues';
import { matchPath } from '@/lib/seo/matchPreview';
import { localDate, localMidnight } from '@/lib/time';
import { checkLegNewsShared, newsBudgetOk } from '@/lib/coupons/news';
import { attachSchedules, loadMatchSchedule, scheduleNoteBoth } from '@/lib/football/schedule';
import {
	ACTIVE_COUPON_TYPES,
	COUPON_TYPES,
	PAID_COUPON_TYPES,
	buildCoupon,
	couponStatus,
	legEligible,
	legResult,
	settledOdds,
} from '@/lib/coupons/build';

/**
 * Kupony — część z bazą i siecią. Zasady wyboru: `build.js`.
 *
 * KIEDY. Woła to przebieg kursów co 20 minut (`/api/cron/odds-snapshot`), zaraz po zdjęciu
 * kursów. Codziennie w pierwszym przebiegu po 9:30 powstają trzy kupony: dnia (mecze dziś),
 * 3-dniowy i 5-dniowy (mecze od dziś na 3 i 5 dni) — w tej kolejności, a każdy kolejny nie
 * powtarza meczów z wcześniejszych tego dnia. Gdy rano nie da się złożyć kuponu, próbujemy do
 * południa; potem zapisujemy „dziś bez kuponu" (`status: 'none'`) i to też jest odpowiedź.
 *
 * KTO WIDZI. Kupon dnia — wszyscy. 3- i 5-dniowy — plan z liczbami (Pro, VIP, okres próbny,
 * `hasFeature(user, 'model_hints')`); pozostali widzą kurs łączny, szansę i liczbę typów,
 * a mecze dopiero po rozliczeniu. Decyduje `couponDto({ unlocked })` po stronie serwera —
 * zakryte typy w ogóle nie wychodzą z trasy.
 *
 * WIADOMOŚCI (płatne kupony). Zanim 3- albo 5-dniowy kupon zostanie zapisany, AI z wyszukiwarką
 * sprawdza wiadomości o każdym typie (`lib/coupons/news.js`). Typ z poważnym sygnałem (kontuzja
 * lidera, rotacja) wypada, na jego miejsce wchodzi następny najpewniejszy — i też jest sprawdzany.
 * Odrzucone typy zapisujemy przy kuponie (`newsCheck.dropped`), żeby było widać, co odsiano.
 *
 * KURSY. Mediana bukmacherów z porannego zdjęcia w dzienniku prognoz; brakujące (mecze
 * spoza okna dziennika, czyli dni następne) dociągamy osobno — w budżecie `FETCH_BUDGET`,
 * tylko dla meczów, które mogą trafić na kupon (godziny i wyprzedzenie z `build.js`).
 *
 * NIEUDANE POBRANIE = CZEKAMY. Gdy lista plakietek albo któryś kurs nie przyszedł (dostawca
 * odrzucił zapytanie), kuponu w tym przebiegu nie składamy — inaczej powstaje z tego, co akurat
 * doszło. 17.10.2026 tak właśnie wyszedł kupon z samych nocnych meczów MLS, bo kursy
 * niedzielnych meczów z Europy nie doszły. Ponawiamy co przebieg; po `LAST_TRY_MINUTE`
 * składamy z tego, co jest, żeby jeden uparty mecz nie zablokował kuponu na zawsze.
 *
 * SPÓJNOŚĆ Z LISTĄ MECZÓW. Nogi to plakietki z `hintsForDate` — ta sama selekcja, którą widać
 * przy meczu na liście i w „Typach na dziś". Plakietka potrafi się jednak zmienić po przeliczeniu
 * modelu ligi (co 6 godzin), a kupon już nie: kupony 3- i 5-dniowe z 22.10.2026 wzięły „1X · 87%"
 * przy Huddersfield – Wigan (mecz 24.10), a od wieczora 22.10 plakietka tego meczu mówiła
 * „1 · 62%" (4 ze 113 nóg z zapisem w dzienniku prognoz). Dlatego przy meczach z kuponu lista
 * pokazuje zapis z kuponu i znacznik „W kuponie…" (`couponLegsForDate`, `lib/coupons/marks.js`).
 *
 * TERMINARZ (od 25.10.2026). Przy każdym typie, który trafia na kupon albo do sprawdzenia wiadomości,
 * liczymy terminarz obu drużyn (`lib/football/schedule.js`): wiadomości dostają go jako fakty (puchar
 * w środku tygodnia, ważny mecz za kilka dni), a typ z sygnałem dostaje przy zapisie krótką notkę
 * (`schedule`), którą karta kuponu pokazuje przy meczu. Tylko typy z kuponu — nigdy cała pula dnia.
 *
 * ROZLICZENIE. Ten sam przebieg co 20 minut sprawdza typy, których mecze skończyły się co
 * najmniej dwie godziny po pierwszym gwizdku — kupon przegrywa od pierwszego chybionego, więc
 * czytelnik widzi wynik tego samego wieczoru, a nie rano.
 */

export const PUBLISH_MINUTE = 9 * 60 + 30;
export const GIVE_UP_MINUTE = 12 * 60;
export const LAST_TRY_MINUTE = 22 * 60;
/** Ile razy najwyżej składamy kupon od nowa po odrzuceniu typów przez wiadomości. */
const NEWS_ROUNDS = 4;
const NEWS_CONCURRENCY = 4;
/**
 * Ile kursów najwyżej dociągamy dla jednego kuponu — od najpewniejszych typów. Od 25.10.2026
 * kupon potrzebuje też typów z niższą szansą (kupon z trzech typów to kursy ~1,35, czyli typy
 * ~70–75%), a warunek zgody rynku z modelem część pewniejszych odrzuca — stąd większy zapas
 * dla puli 3 i 5 dni. Kursy są w pamięci podręcznej 10 minut, więc 5-dniowy nie płaci drugi raz
 * za mecze, które sprawdził już 3-dniowy.
 */
const FETCH_BUDGET = { daily: 30, days3: 60, days5: 100 };
const CONCURRENCY = 4;
const LEG_SETTLE_AFTER_MS = 2 * 3600_000;
/** Mecz bez wyniku trzy doby po terminie — liczymy jak odwołany, żeby kupon się zamknął. */
const LEG_VOID_AFTER_MS = 72 * 3600_000;
/** Strona meczu (`/typ/...`) powstaje z dziennika prognoz, który zapisuje mecze do 48 godzin przed. */
const LINK_LEAD_MS = 46 * 3600_000;

const minutaDnia = (now) => Math.floor((now.getTime() - localMidnight(localDate(now)).getTime()) / 60_000);

/** Dni (w czasie polskim), z których składamy kupon danego rodzaju, od dnia publikacji. */
export function couponDates(type, now = new Date()) {
	return Array.from({ length: COUPON_TYPES[type]?.days ?? 1 }, (_, i) => localDate(now, i));
}

const kursSelekcji = (zdjecie, key) => {
	const v = zdjecie?.[HINT_TO_SELECTION[key]];
	return Number.isFinite(v) && v > 1 ? Number(v.toFixed(2)) : null;
};

/**
 * Kandydaci na kupon z plakietek podanych dni — z kursem selekcji — i licznik tego, co się
 * nie udało pobrać (`failed`: listy dni i kursy, które rzuciły błędem; brak kursów u dostawcy
 * to nie błąd).
 *
 * @param {string[]} dates
 * @param {{ now: Date, hintsFor?: Function, fetchOdds?: Function, maxFetch?: number }} options
 *   `hintsFor` i `fetchOdds` podmieniane w testach
 * @returns {Promise<{ candidates: Array, stats: { entries: number, fetched: number, failed: number, withOdds: number } }>}
 */
export async function couponCandidates(dates, { now, hintsFor = hintsForDate, fetchOdds = fetchOddsSnapshot, maxFetch = 30 }) {
	const stats = { entries: 0, fetched: 0, failed: 0, withOdds: 0 };
	const listy = await Promise.all(
		dates.map((d) =>
			hintsFor(d)
				.then((r) => r?.list || [])
				.catch((error) => {
					stats.failed += 1;
					console.warn(`[coupons] plakietki ${d}:`, error.message);
					return [];
				})
		)
	);
	const wpisy = listy
		.flat()
		// Ligi w okresie próbnym (poziom 3) nie idą na kupony, dopóki nie mają historii na produkcji.
		.filter((w) => w?.hint && HINT_TO_SELECTION[w.hint.key] && legEligible(w.kickoff, now) && isEstablishedLeague(w.leagueId));
	stats.entries = wpisy.length;

	const zapisane = new Map(
		(await ModelForecast.find({ fixtureId: { $in: wpisy.map((w) => String(w.fixtureId)) } })
			.select('fixtureId odds.open')
			.lean()).map((f) => [String(f.fixtureId), f.odds?.open || null])
	);

	// Bez porannego zdjęcia (np. mecze weekendu) — dociągamy, od najpewniejszych.
	const doPobrania = wpisy
		.filter((w) => !zapisane.get(String(w.fixtureId)))
		.sort((a, b) => b.hint.probability - a.hint.probability)
		.slice(0, maxFetch);
	for (let i = 0; i < doPobrania.length; i += CONCURRENCY) {
		await Promise.all(
			doPobrania.slice(i, i + CONCURRENCY).map(async (w) => {
				try {
					const zdjecie = await fetchOdds(String(w.fixtureId));
					stats.fetched += 1;
					if (zdjecie) zapisane.set(String(w.fixtureId), zdjecie);
				} catch (error) {
					stats.failed += 1;
					console.warn(`[coupons] kursy ${w.fixtureId}:`, error.message);
				}
			})
		);
	}

	const candidates = wpisy
		.map((w) => ({
			fixtureId: String(w.fixtureId),
			homeName: w.home,
			awayName: w.away,
			// Drużyny do terminarza (wiadomości i notka przy typie); do bazy nie idą — schemat ich nie zna.
			homeId: w.homeId ?? null,
			awayId: w.awayId ?? null,
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
	stats.withOdds = candidates.length;
	return { candidates, stats };
}

/** Zapis raz na klucz; wyścig dwóch przebiegów rozstrzyga unikalny indeks. */
async function zapisz(key, type, date, kupon, newsCheck = null) {
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
						newsCheck,
					}
				: { key, type, date, status: 'none', newsCheck }
		);
		return doc.toObject();
	} catch (error) {
		if (error?.code === 11000) return Coupon.findOne({ key }).lean();
		throw error;
	}
}

const idTypu = (l) => String(l.fixtureId);

/** Typ kuponu w postaci, której potrzebuje terminarz. */
const meczTypu = (l) => ({
	fixtureId: idTypu(l),
	kickoff: l.kickoff,
	leagueId: l.leagueId ?? null,
	homeId: l.homeId ?? null,
	awayId: l.awayId ?? null,
	homeName: l.homeName,
	awayName: l.awayName,
});

/**
 * Terminarz dla typów, które go jeszcze nie mają (`teamSchedule`; obiekty kandydatów są wspólne
 * między rundami sprawdzania, więc drugi raz nie pytamy). Błąd albo brak drużyn to `null`.
 */
function terminarzTypow(legs, scheduleFor) {
	const bez = (legs || []).filter((l) => l.teamSchedule === undefined);
	return attachSchedules(bez, { toMatch: meczTypu, key: 'teamSchedule', scheduleFor });
}

/** Notka terminarza do zapisu przy typie — tylko przy sygnale (inaczej `null`). */
const notkaTerminarza = (l) => scheduleNoteBoth(l.teamSchedule, { homeName: l.homeName, awayName: l.awayName });

/**
 * Składa płatny kupon ze sprawdzeniem wiadomości: typ z ryzykiem wypada, kupon składa się od
 * nowa bez niego, nowe typy też są sprawdzane — najwyżej `NEWS_ROUNDS` razy. Werdykt każdego
 * typu liczymy raz (mapa), więc ponowne złożenie nie płaci drugi raz za ten sam mecz.
 *
 * @returns {Promise<{ kupon: object|null, newsCheck: object }>}
 */
async function zWiadomosciami(candidates, { type, now, exclude, checkNews, newsBudget, scheduleFor }) {
	const pierwszy = buildCoupon(candidates, { type, now, exclude });
	if (!pierwszy) return { kupon: null, newsCheck: null };
	if (!(await newsBudget())) {
		return { kupon: pierwszy, newsCheck: { checked: 0, dropped: [], skipped: 'spend_cap', at: now } };
	}

	const werdykty = new Map();
	const odrzucone = [];
	const wyklucz = [...exclude];
	let kupon = pierwszy;
	for (let runda = 0; runda < NEWS_ROUNDS && kupon; runda++) {
		const nowe = kupon.legs.filter((l) => !werdykty.has(idTypu(l)));
		// Terminarz przed wiadomościami — polecenie dla AI dostaje go jako fakty (`newsPrompt`).
		await terminarzTypow(nowe, scheduleFor);
		for (let i = 0; i < nowe.length; i += NEWS_CONCURRENCY) {
			await Promise.all(
				nowe.slice(i, i + NEWS_CONCURRENCY).map(async (l) => werdykty.set(idTypu(l), await checkNews(l)))
			);
		}
		const zle = kupon.legs.filter((l) => werdykty.get(idTypu(l))?.verdict === 'risk');
		if (!zle.length) break;
		for (const l of zle) {
			odrzucone.push({
				fixtureId: idTypu(l),
				homeName: l.homeName,
				awayName: l.awayName,
				selection: l.selection,
				reason: werdykty.get(idTypu(l)).reason,
			});
			wyklucz.push(idTypu(l));
		}
		kupon = buildCoupon(candidates, { type, now, exclude: wyklucz });
	}

	const newsCheck = { checked: werdykty.size, dropped: odrzucone, skipped: null, at: now };
	if (!kupon) return { kupon: null, newsCheck };
	return {
		kupon: {
			...kupon,
			legs: kupon.legs.map((l) => {
				const w = werdykty.get(idTypu(l));
				// Typ, który wszedł w ostatniej rundzie, nie zdążył być sprawdzony — oznaczamy uczciwie.
				return { ...l, news: { verdict: w?.verdict === 'ok' ? 'ok' : 'unknown', sources: w?.sources || [] } };
			}),
		},
		newsCheck,
	};
}

/** Jeden przebieg naraz w procesie: sprawdzanie wiadomości trwa, a harmonogram woła co 20 minut. */
let trwa = false;

/**
 * Tworzy brakujące kupony, jeśli przyszła ich pora. Bezpieczne do wołania co przebieg —
 * istniejący kupon się nie zmienia.
 *
 * @returns {Promise<{ created: string[], none: string[], postponed: string[], details: object }>}
 *   `details` — liczby z `couponCandidates` dla każdego kuponu, który próbowaliśmy złożyć (do logu)
 */
export async function ensureCoupons(options = {}) {
	if (trwa) return { created: [], none: [], postponed: [], details: {}, busy: true };
	trwa = true;
	try {
		return await utworzKupony(options);
	} finally {
		trwa = false;
	}
}

async function utworzKupony({
	now = new Date(),
	hintsFor,
	fetchOdds,
	checkNews = checkLegNewsShared,
	newsBudget = newsBudgetOk,
	scheduleFor = loadMatchSchedule,
} = {}) {
	const out = { created: [], none: [], postponed: [], details: {} };
	const minuta = minutaDnia(now);
	if (minuta < PUBLISH_MINUTE) return out;
	const dzis = localDate(now);

	for (const [i, type] of ACTIVE_COUPON_TYPES.entries()) {
		const key = `${type}:${dzis}`;
		if (await Coupon.exists({ key })) continue;
		// Bez meczów z dzisiejszych kuponów wcześniej na liście — trzy kupony, nie ten sam trzy razy.
		const wczesniejsze = await Coupon.find({ key: { $in: ACTIVE_COUPON_TYPES.slice(0, i).map((t) => `${t}:${dzis}`) } })
			.select('legs.fixtureId')
			.lean();
		const { candidates, stats } = await couponCandidates(couponDates(type, now), {
			now,
			hintsFor,
			fetchOdds,
			maxFetch: FETCH_BUDGET[type],
		});
		out.details[key] = stats;
		if (stats.failed > 0 && minuta < LAST_TRY_MINUTE) {
			out.postponed.push(key);
			continue;
		}
		const z = { key, type, date: dzis };
		const exclude = wczesniejsze.flatMap((c) => c.legs.map((l) => l.fixtureId));
		const { kupon, newsCheck } = PAID_COUPON_TYPES.has(type)
			? await zWiadomosciami(candidates, { type, now, exclude, checkNews, newsBudget, scheduleFor })
			: { kupon: buildCoupon(candidates, { type, now, exclude }), newsCheck: null };
		if (newsCheck) out.details[key] = { ...stats, news: { checked: newsCheck.checked, dropped: newsCheck.dropped.length, skipped: newsCheck.skipped } };
		if (kupon) {
			// Kupon dnia (bez sprawdzania wiadomości) i typy z ostatniej rundy liczą terminarz dopiero tu.
			await terminarzTypow(kupon.legs, scheduleFor);
			for (const l of kupon.legs) l.schedule = notkaTerminarza(l);
			await zapisz(z.key, z.type, z.date, kupon, newsCheck);
			out.created.push(z.key);
		} else if (minuta >= GIVE_UP_MINUTE) {
			await zapisz(z.key, z.type, z.date, null, newsCheck);
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

/**
 * Postać dla interfejsu — z linkiem do strony meczu, gdy ta już istnieje.
 *
 * `unlocked: false` przy kuponie płatnym przed rozliczeniem: kurs łączny, szansa, liczba typów
 * i ich zakres dat — bez meczów. Rozliczony kupon jest jawny dla wszystkich (skuteczność).
 */
export function couponDto(c, now = new Date(), { unlocked = true } = {}) {
	if (!c) return null;
	const baza = { key: c.key, type: c.type, date: c.date, status: c.status };
	if (c.status === 'none') return { ...baza, legs: [] };
	if (!unlocked && PAID_COUPON_TYPES.has(c.type) && c.status === 'pending') {
		const czasy = c.legs.map((l) => new Date(l.kickoff).getTime());
		return {
			...baza,
			locked: true,
			totalOdds: c.totalOdds,
			chance: c.chance,
			newsChecked: Boolean(c.newsCheck?.checked),
			legsCount: c.legs.length,
			firstKickoff: new Date(Math.min(...czasy)).toISOString(),
			lastKickoff: new Date(Math.max(...czasy)).toISOString(),
			legs: [],
		};
	}
	return {
		...baza,
		totalOdds: c.totalOdds,
		chance: c.chance,
		// Po odwołanych meczach kurs maleje (odwołany = 1,00) — pokazujemy ten, który się liczy.
		settledOdds: c.status === 'won' ? settledOdds(c.legs) : null,
		newsCheck: c.newsCheck?.checked
			? {
					checked: c.newsCheck.checked,
					dropped: (c.newsCheck.dropped || []).map((d) => ({
						match: `${d.homeName} – ${d.awayName}`,
						selection: d.selection,
						reason: d.reason,
					})),
				}
			: null,
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
			base: l.base ?? null,
			odds: l.odds,
			status: l.status,
			score: l.score,
			newsOk: l.news?.verdict === 'ok',
			minute: l.minute ?? null,
			liveScore: l.liveScore ?? null,
			why: l.why ?? null,
			// Notka terminarza zapisana przy typie tylko przy sygnale (puchar w środku tygodnia, ważny mecz za kilka dni).
			schedule: l.schedule?.pl ? { pl: l.schedule.pl, en: l.schedule.en || l.schedule.pl } : null,
			href:
				new Date(l.kickoff).getTime() - now.getTime() <= LINK_LEAD_MS
					? matchPath({ fixtureId: l.fixtureId, homeName: l.homeName, awayName: l.awayName })
					: null,
		})),
	};
}

/** Bilans kuponów jednego rodzaju — z zakresem dni albo całość. */
export async function couponStats({ type, days = null, now = new Date(), recent = 15, unlocked = true } = {}) {
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
			.map((r) => couponDto(r, now, { unlocked })),
	};
}

/**
 * Nogi kuponów z meczami danego dnia — do znaczników „W kuponie…" przy meczach na liście
 * i w panelu „Model widzi" (`lib/coupons/marks.js`, trasa `/api/football/model-hints`).
 *
 * Kupon dnia jest za darmo, więc jego nogi idą do każdego. Płatne (3- i 5-dniowy) tylko przy
 * `unlocked` — bez planu w ogóle o nie nie pytamy, żeby nic z nich nie mogło wyciec na listę
 * meczów (ta sama zasada co `couponDto({ unlocked })`). Jedno zapytanie po indeksach `type`
 * i `date`: kupony opublikowane w dniach, których pula sięga do `date`.
 *
 * @param {string} date `YYYY-MM-DD` w czasie polskim
 * @returns {Promise<Array<{ type: string, fixtureId: string, key: string, selection: string, probability: number, base: number|null, kickoff: Date }>>}
 */
export async function couponLegsForDate(date, { unlocked = false } = {}) {
	const poludnie = new Date(localMidnight(date).getTime() + 12 * 3600_000);
	const typy = ACTIVE_COUPON_TYPES.filter((t) => unlocked || !PAID_COUPON_TYPES.has(t));
	const kupony = await Coupon.find({
		status: { $ne: 'none' },
		$or: typy.map((type) => ({ type, date: { $gte: localDate(poludnie, -(COUPON_TYPES[type].days - 1)), $lte: date } })),
	})
		.select('type legs.fixtureId legs.key legs.selection legs.probability legs.base legs.kickoff')
		.lean();
	return kupony.flatMap((c) =>
		(c.legs || [])
			.filter((l) => localDate(new Date(l.kickoff)) === date)
			.map((l) => ({
				type: c.type,
				fixtureId: String(l.fixtureId),
				key: l.key,
				selection: l.selection,
				probability: l.probability,
				base: l.base ?? null,
				kickoff: l.kickoff,
			}))
	);
}

/** Krótki dorobek do nagłówka sekcji: ile kuponów weszło. */
export async function couponRecord() {
	const rows = await Coupon.find({ status: { $in: ['won', 'lost'] } }).select('type status').lean();
	const rekord = (type) => {
		const r = rows.filter((x) => x.type === type);
		return { won: r.filter((x) => x.status === 'won').length, total: r.length };
	};
	return { daily: rekord('daily'), days3: rekord('days3'), days5: rekord('days5'), weekend: rekord('weekend'), live: rekord('live') };
}

/**
 * Komplet dla strony i API: dzisiejszy kupon dnia (albo informacja, kiedy będzie), wczorajszy
 * z wynikiem, najnowszy 3- i 5-dniowy (przed 9:30 — wczorajszy, wciąż w grze) i dorobek.
 *
 * @param {{ now?: Date, unlocked?: boolean }} [options] `unlocked` — plan z liczbami; bez niego
 *   płatne kupony przed rozliczeniem przychodzą bez meczów
 */
export async function couponsOverview({ now = new Date(), unlocked = false } = {}) {
	const dzis = localDate(now);
	const najnowszy = (type) =>
		Coupon.findOne({ type, date: { $gte: localDate(now, -(COUPON_TYPES[type].days - 1)) } })
			.sort({ date: -1 })
			.lean();
	const [today, yesterday, days3, days5, record] = await Promise.all([
		Coupon.findOne({ key: `daily:${dzis}` }).lean(),
		Coupon.findOne({ key: `daily:${localDate(now, -1)}` }).lean(),
		najnowszy('days3'),
		najnowszy('days5'),
		couponRecord(),
	]);
	const dto = (c) => couponDto(c, now, { unlocked });
	// Przed 9:30 (i do południa, gdy kupon jeszcze się składa) strona mówi, kiedy będzie, zamiast „brak".
	const pozniej = minutaDnia(now) < GIVE_UP_MINUTE;
	return {
		date: dzis,
		unlocked,
		today: dto(today),
		yesterday: dto(yesterday),
		days3: dto(days3),
		days5: dto(days5),
		todayLater: !today && pozniej,
		paidLater: (!days3 || days3.date !== dzis) && pozniej,
		record,
	};
}
