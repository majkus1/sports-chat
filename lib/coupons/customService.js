import Coupon from '@/models/Coupon';
import User from '@/models/User';
import { searchWeb } from '@/lib/ai';
import { MODEL_CHAT } from '@/lib/ai/config';
import { getRedisClient } from '@/lib/redis';
import { checkQuota, consumeQuota, recordUsage } from '@/lib/billing/entitlements';
import { TRIAL } from '@/lib/billing/plans';
import { checkSpendCap } from '@/lib/billing/spendGuard';
import { checkLegNews, checkLegNewsShared, newsBudgetOk } from '@/lib/coupons/news';
import { loadMatchSchedule } from '@/lib/football/schedule';
import { activeCouponFixtureIds, composeCoupon, couponCandidates, couponDto } from '@/lib/coupons/service';
import {
	CUSTOM_FETCH_BUDGET,
	customAccept,
	customDiagnosis,
	customKey,
	customPrecheck,
	customRules,
	customSummary,
	parseCustomParams,
	sameLegs,
	windowDates,
} from '@/lib/coupons/custom';
import { localDate } from '@/lib/time';

/**
 * Kreator kuponu — część z bazą, siecią, limitem i AI. Zasady i widełki: `custom.js`.
 *
 * PRZEBIEG JEDNEGO ZŁOŻENIA:
 *   1. ustawienia (`parseCustomParams`), konto i limit `couponGen` — dziennie, sprawdzany tu, po
 *      stronie serwera; bez planu odpowiedź „plan_required" z zapowiedzią, nie liczenie;
 *   2. blokada na użytkownika (podwójne kliknięcie, druga karta) — jak przy analizach;
 *   3. „nie da się" bez pobierania czegokolwiek: za mało meczów na ten kurs, okno już puste;
 *   4. kandydaci z `couponCandidates` (plakietki z kursami z dziennika prognoz, brakujące kursy
 *      dociągane w budżecie `CUSTOM_FETCH_BUDGET`) — od razu zawężeni do okna i lig użytkownika;
 *   5. `composeCoupon` — ten sam wybór, sprawdzenie wiadomości i terminarz co płatne kupony
 *      serwisu; typ z RYZYKIEM wypada, wchodzi następny;
 *   6. zapis jako kupon `custom` na koncie i DOPIERO WTEDY zużycie limitu (jak `consumeQuota`
 *      w asystencie) — „nie da się" i błąd nie kosztują użytkownika nic.
 *
 * KOSZT. AI płacimy tylko za wyszukania wiadomości o typach (werdykt wspólny dla całego serwisu przez
 * 12 godzin — typ sprawdzony rano przez kupon 3-dniowy albo przez kogoś innego nie kosztuje drugi
 * raz). Liczymy je przy złożeniu (`koszt`) i zapisujemy w dzienniku użycia (`UsageLog`, rodzaj
 * `couponGen`) — także przy „nie da się", jeśli coś już zapłaciliśmy. Po przekroczeniu 70% dziennego
 * progu wydatków (`spendGuard`, `CUSTOM_NEWS_CAP_SHARE`) kupon wychodzi bez sprawdzenia i tak jest oznaczony.
 *
 * POWTÓRKA NIE KOSZTUJE. Te same ustawienia minutę później dają ten sam kupon (przeszukanie jest
 * deterministyczne) — zamiast drugiego zapisu i drugiego kuponu z limitu oddajemy poprzedni.
 *
 * Zależności (`deps`) podmieniane w testach — tak jak `ensureCoupons({ hintsFor })`: bez tego
 * test wołałby API piłkarskie, wyszukiwarkę AI i liczniki w Redisie.
 */

/** Tyle najwyżej trwa złożenie z wiadomościami (4 rundy po kilka wyszukań) — potem blokada wygasa sama. */
const BLOKADA_S = 150;
/** Ten sam kupon złożony ponownie w tym czasie nie zużywa limitu. */
const POWTORKA_MS = 30 * 60_000;
/** „Moje kupony" — ostatnie tyle kuponów z rozliczeniem. */
export const MY_COUPONS_LIMIT = 30;

/**
 * Blokada na użytkownika: Redis (`SET NX EX`, wspólny dla procesów) plus zbiór w procesie. Bez Redisa
 * zostaje sam zbiór — frontend chodzi w jednym procesie, więc podwójne kliknięcie i tak się nie
 * prześlizgnie; najgorsze, co grozi, to jedno złożenie dwa razy (limit i tak liczy oba).
 */
const wToku = new Set();
const kluczBlokady = (id) => `coupon_gen_lock:${id}`;

async function zablokuj(userId) {
	const id = String(userId);
	if (wToku.has(id)) return false;
	wToku.add(id);
	try {
		const client = await getRedisClient();
		if (client && (await client.set(kluczBlokady(id), '1', { EX: BLOKADA_S, NX: true })) !== 'OK') {
			wToku.delete(id);
			return false;
		}
	} catch {
		/* błąd Redisa — zostaje blokada procesu */
	}
	return true;
}

async function odblokuj(userId) {
	const id = String(userId);
	wToku.delete(id);
	try {
		const client = await getRedisClient();
		if (client) await client.del(kluczBlokady(id));
	} catch {
		/* klucz i tak wygaśnie po `BLOKADA_S` */
	}
}

/**
 * Część dziennego progu wydatków na AI (`spendGuard`), do której kreator sprawdza wiadomości. Reszta
 * zostaje dla kuponów serwisu (9:30), typu dnia, analiz i asystenta: bez tej rezerwy kilkadziesiąt
 * nocnych złożeń mogłoby wyczerpać próg, zanim rano powstaną płatne kupony — i wyszłyby niesprawdzone.
 * Po przekroczeniu kupon z kreatora wychodzi bez sprawdzenia i jest tak oznaczony (`newsSkipped`).
 */
export const CUSTOM_NEWS_CAP_SHARE = 0.7;

async function budzetWiadomosci() {
	try {
		const s = await checkSpendCap();
		return s.allowed && (s.degraded || s.spent < s.cap * CUSTOM_NEWS_CAP_SHARE);
	} catch {
		return newsBudgetOk();
	}
}

/** Sprawdzenie wiadomości z licznikiem nowych wyszukań i ich kosztu (wspólny werdykt 12 h jak w kuponach). */
function liczoneWiadomosci(koszt) {
	const search = async (args) => {
		const wynik = await searchWeb(args);
		koszt.searches += 1;
		koszt.costUsd += Number(wynik?.meta?.costUsd) || 0;
		return wynik;
	};
	return (leg) => checkLegNewsShared(leg, { check: (l) => checkLegNews(l, { search }) });
}

const ZRODLA = {
	loadUser: (userId) =>
		User.findById(userId).select('plan planStatus planValidUntil role credits createdAt grantedFeatures').lean(),
	checkQuota,
	consumeQuota,
	recordUsage,
	lock: { acquire: zablokuj, release: odblokuj },
	// `undefined` — `couponCandidates` bierze prawdziwe plakietki i kursy.
	hintsFor: undefined,
	fetchOdds: undefined,
	// `null` — wiadomości z licznikiem kosztu (`liczoneWiadomosci`).
	checkNews: null,
	newsBudget: budzetWiadomosci,
	scheduleFor: loadMatchSchedule,
	publishedFixtureIds: activeCouponFixtureIds,
};

/** Limit do interfejsu: `remaining` po tym złożeniu, `null` — bez limitu (administrator). */
function stanLimitu(q, zuzyte = 0) {
	if (!q || q.limit === null || q.limit === undefined) return { limit: null, used: 0, remaining: null };
	const used = (Number(q.used) || 0) + zuzyte;
	return { limit: q.limit, used, remaining: Math.max(0, q.limit - used), ...(q.inTrial ? { inTrial: true } : {}) };
}

/** Postać dla interfejsu i asystenta: karta jak każdy kupon + ustawienia i chwila złożenia. */
export function customCouponDto(c, now = new Date()) {
	const dto = couponDto(c, now);
	if (!dto) return null;
	const p = c.params || null;
	return {
		...dto,
		createdAt: new Date(c.createdAt || now).toISOString(),
		params: p
			? { odds: p.odds, legs: p.legs, window: p.window, leagues: [...(p.leagues || [])], skipPublished: Boolean(p.skipPublished) }
			: null,
		// Wiadomości nie sprawdzono (dzienny próg wydatków na AI) — karta mówi to wprost.
		newsSkipped: c.newsCheck?.skipped || null,
	};
}

async function zapiszWlasny({ userId, params, kupon, newsCheck, now }) {
	const doc = await Coupon.create({
		key: customKey(userId, now),
		type: 'custom',
		userId,
		date: localDate(now),
		params,
		legs: kupon.legs.map((l) => ({ ...l, status: 'pending', score: null })),
		totalOdds: kupon.totalOdds,
		chance: kupon.chance,
		status: 'pending',
		newsCheck,
		// Chwila złożenia z `now`, nie z zegara bazy — powtórka i kolejność „Moich kuponów" liczą się od niej.
		createdAt: now,
	});
	return doc.toObject();
}

/**
 * Składa własny kupon użytkownika. Woła to trasa `POST /api/coupons/generate` i asystent
 * (`zloz_kupon`) — ten sam limit, ta sama blokada, te same zasady.
 *
 * @param {{ userId: string|null, user: object|null, params: object, now?: Date, deps?: object }} input
 * @returns {Promise<{ status: 'ok'|'impossible'|'invalid'|'login_required'|'plan_required'|'limit'|'busy', ... }>}
 *   `ok` — `coupon`, `quota` (po zużyciu), `repeated` (powtórka bez zużycia); `impossible` — `reason`,
 *   `counts`, `suggest`, `dropped`, `quota` (nietknięty)
 */
export async function generateCustomCoupon({ userId, user, params: surowe, now = new Date(), deps = {} }) {
	const d = { ...ZRODLA, ...deps };
	if (!userId) return { status: 'login_required' };
	const wejscie = parseCustomParams(surowe);
	if (!wejscie.ok) return { status: 'invalid', errors: wejscie.errors };
	const params = wejscie.params;

	const quota = await d.checkQuota({ kind: 'couponGen', user, userId });
	// Plan bez kreatora (darmowy po okresie próbnym) — zapowiedź, nie liczenie.
	if (quota.limit === 0) return { status: 'plan_required', quota: stanLimitu(quota), trialDays: TRIAL.days };
	if (!quota.allowed) return { status: 'limit', quota: stanLimitu(quota) };

	if (!(await d.lock.acquire(userId))) return { status: 'busy', quota: stanLimitu(quota) };
	try {
		const przed = customPrecheck(params, now);
		if (przed) return { status: 'impossible', params, ...przed, quota: stanLimitu(quota) };

		const accept = customAccept(params, now);
		const exclude = params.skipPublished ? await d.publishedFixtureIds(now) : [];
		const { candidates, stats } = await couponCandidates(windowDates(params.window, now), {
			now,
			hintsFor: d.hintsFor,
			fetchOdds: d.fetchOdds,
			maxFetch: CUSTOM_FETCH_BUDGET[params.window],
			filter: accept,
		});

		const koszt = { searches: 0, costUsd: 0 };
		const { kupon, newsCheck } = await composeCoupon(candidates, {
			type: 'custom',
			rules: customRules(params),
			accept,
			now,
			exclude,
			withNews: true,
			checkNews: d.checkNews || liczoneWiadomosci(koszt),
			newsBudget: d.newsBudget,
			scheduleFor: d.scheduleFor,
		});
		const wpisUzycia = () => ({
			userId,
			kind: 'couponGen',
			plan: quota.plan ?? null,
			model: koszt.searches ? MODEL_CHAT : null,
			costUsd: Number(koszt.costUsd.toFixed(4)),
		});

		if (!kupon) {
			// Limit nietknięty; w dzienniku tylko to, co AI już kosztowało (odrzucone typy).
			if (koszt.searches) await d.recordUsage(wpisUzycia());
			return {
				status: 'impossible',
				params,
				...customDiagnosis({ params, stats, candidates, now, exclude, newsCheck }),
				quota: stanLimitu(quota),
			};
		}

		const ostatni = await Coupon.findOne({ type: 'custom', userId, createdAt: { $gte: new Date(now.getTime() - POWTORKA_MS) } })
			.sort({ createdAt: -1 })
			.lean();
		if (ostatni && ostatni.status === 'pending' && sameLegs(ostatni.legs, kupon.legs)) {
			if (koszt.searches) await d.recordUsage(wpisUzycia());
			return { status: 'ok', repeated: true, coupon: customCouponDto(ostatni, now), quota: stanLimitu(quota) };
		}

		const zapis = await zapiszWlasny({ userId, params, kupon, newsCheck, now });
		await d.consumeQuota({ kind: 'couponGen', user, userId, usingCredit: false });
		await d.recordUsage(wpisUzycia());
		return { status: 'ok', repeated: false, coupon: customCouponDto(zapis, now), quota: stanLimitu(quota, 1) };
	} finally {
		await d.lock.release(userId);
	}
}

/**
 * „Moje kupony": ostatnie kupony użytkownika z rozliczeniem, bilans ze wszystkich i stan limitu
 * (także dla planu bez kreatora — wtedy `access: false` i interfejs pokazuje zapowiedź).
 *
 * @param {{ userId: string|null, user: object|null, limit?: number, now?: Date, deps?: object }} input
 */
export async function myCustomCoupons({ userId, user, limit = MY_COUPONS_LIMIT, now = new Date(), deps = {} }) {
	const d = { ...ZRODLA, ...deps };
	if (!userId) return { status: 'login_required' };
	const ile = Math.max(0, Math.min(MY_COUPONS_LIMIT, Number.isInteger(limit) ? limit : MY_COUPONS_LIMIT));
	const [quota, ostatnie, wszystkie] = await Promise.all([
		d.checkQuota({ kind: 'couponGen', user, userId }),
		ile ? Coupon.find({ type: 'custom', userId }).sort({ createdAt: -1 }).limit(ile).lean() : [],
		Coupon.find({ type: 'custom', userId }).select('status totalOdds chance').lean(),
	]);
	return {
		status: 'ok',
		access: quota.limit !== 0,
		quota: stanLimitu(quota),
		trialDays: TRIAL.days,
		coupons: ostatnie.map((c) => customCouponDto(c, now)),
		summary: customSummary(wszystkie),
	};
}

const HTTP = { ok: 200, impossible: 200, invalid: 400, login_required: 401, plan_required: 403, limit: 429, busy: 409 };

/** Wynik serwisu → kod HTTP i treść odpowiedzi (`ok` — czy jest kupon; „nie da się" to też 200). */
export function customHttp(wynik) {
	const { status, ...reszta } = wynik;
	const kod = HTTP[status] ?? 500;
	if (status === 'ok') return { status: kod, body: { ok: true, ...reszta } };
	if (status === 'impossible') return { status: kod, body: { ok: false, ...reszta } };
	return { status: kod, body: { ok: false, error: status, ...reszta } };
}

/** `POST /api/coupons/generate` bez warstwy Next.js (sesja przychodzi z trasy) — testowalne wprost. */
export async function customGenerateHttp({ userId, body, now = new Date(), deps = {} }) {
	if (!userId) return customHttp({ status: 'login_required' });
	const d = { ...ZRODLA, ...deps };
	const user = await d.loadUser(userId);
	return customHttp(await generateCustomCoupon({ userId, user, params: body?.params, now, deps }));
}

/** `GET /api/coupons/mine` bez warstwy Next.js. */
export async function customMineHttp({ userId, limit, now = new Date(), deps = {} }) {
	if (!userId) return customHttp({ status: 'login_required' });
	const d = { ...ZRODLA, ...deps };
	const user = await d.loadUser(userId);
	return customHttp(await myCustomCoupons({ userId, user, limit, now, deps }));
}
