import { getRedisClient } from '@/lib/redis';
import { ADMIN_PLAN, CREDIT_COSTS, DEFAULT_PLAN_ID, QUOTA_PERIODS, TRIAL, getPlan } from '@/lib/billing/plans';
import UsageLog from '@/models/UsageLog';
import { recordCreditChange } from '@/lib/billing/credits';
import User from '@/models/User';

/**
 * Uprawnienia i liczniki zużycia.
 *
 * Wcześniej każda trasa miała własny limit i własną parę funkcji w `lib/redis.js`.
 * Tutaj jest jeden licznik dzienny i jedno miejsce, które rozstrzyga, co komu wolno.
 */

/** Liczniki resetują się o północy — klucz zawiera datę, a TTL sięga jej końca. */
function todayKey() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
		now.getDate()
	).padStart(2, '0')}`;
}

function secondsUntilMidnight() {
	const now = new Date();
	const midnight = new Date(now);
	midnight.setHours(24, 0, 0, 0);
	return Math.max(60, Math.ceil((midnight.getTime() - now.getTime()) / 1000));
}

/**
 * Tydzień ISO-8601 w postaci `2026-W34` — licznik tygodniowy odnawia się w poniedziałek.
 *
 * Algorytm: czwartek tego samego tygodnia zawsze leży w roku, do którego tydzień należy
 * (to definicja ISO), więc numer liczymy względem 1 stycznia roku czwartku.
 */
function weekKey() {
	const date = new Date();
	date.setHours(0, 0, 0, 0);
	// Przesunięcie na czwartek bieżącego tygodnia (poniedziałek = początek tygodnia).
	date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
	const yearStart = new Date(date.getFullYear(), 0, 1);
	const week = Math.round(((date - yearStart) / 86400000 + 1) / 7) + 1;
	return `${date.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function secondsUntilNextMonday() {
	const now = new Date();
	const monday = new Date(now);
	monday.setHours(24, 0, 0, 0);
	// getDay(): niedziela=0 … sobota=6; dni pozostałe do poniedziałku po dzisiejszej północy.
	monday.setDate(monday.getDate() + ((7 - monday.getDay() + 1) % 7));
	return Math.max(60, Math.ceil((monday.getTime() - now.getTime()) / 1000));
}

/** Miesiąc kalendarzowy `2026-08` — licznik miesięczny odnawia się pierwszego dnia. */
function monthKey() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function secondsUntilNextMonth() {
	const now = new Date();
	const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
	return Math.max(60, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

/** Okres rozliczania danego rodzaju: klucz okresu + TTL do jego końca. */
function period(kind) {
	if (QUOTA_PERIODS[kind] === 'month') {
		return { key: monthKey(), ttlSeconds: secondsUntilNextMonth() };
	}
	if (QUOTA_PERIODS[kind] === 'week') {
		return { key: weekKey(), ttlSeconds: secondsUntilNextMonday() };
	}
	return { key: todayKey(), ttlSeconds: secondsUntilMidnight() };
}

function quotaKey(kind, identity) {
	return `quota:${kind}:${identity.type}:${identity.id}:${period(kind).key}`;
}

/**
 * Plan obowiązujący dla konta.
 *
 * Wygasły plan płatny cofa się do darmowego — bez tego sprawdzenia konto po nieopłaconej
 * fakturze zachowałoby podniesione limity w nieskończoność.
 */
export function resolvePlan(user) {
	if (!user) return getPlan(DEFAULT_PLAN_ID);
	if (user.role === 'admin') return ADMIN_PLAN;

	const expired = user.planValidUntil && new Date(user.planValidUntil) < new Date();
	const inactive = user.planStatus && !['active', 'trialing'].includes(user.planStatus);
	if (expired || inactive) return getPlan(DEFAULT_PLAN_ID);

	return getPlan(user.plan);
}

/**
 * Komplet uprawnień do pokazania w interfejsie.
 * @param {object|null} user dokument użytkownika (lub null dla niezalogowanego)
 */
export function getEntitlements(user) {
	const plan = resolvePlan(user);
	return {
		plan: plan.id,
		nameKey: plan.nameKey,
		limits: plan.limits,
		features: [...new Set([...plan.features, ...(user?.grantedFeatures || [])])],
		credits: user?.credits ?? 0,
		validUntil: user?.planValidUntil || null,
	};
}

export function hasFeature(user, feature) {
	return getEntitlements(user).features.includes(feature);
}

/** Zalogowanych liczymy po koncie, resztę po adresie IP. */
export function identityFor({ userId, ip }) {
	return userId ? { type: 'user', id: String(userId) } : { type: 'ip', id: ip || 'unknown' };
}

/**
 * Dodatkowa pula dla świeżo założonego konta.
 *
 * Darmowy plan jest skromny, więc bez tego nowy użytkownik nie zobaczyłby, co produkt
 * naprawdę potrafi, zanim zdecyduje o zakupie. Pula jest jednorazowa: liczymy ją od daty
 * założenia konta, a nie osobnym licznikiem, więc nie da się jej odnowić.
 *
 * Dotyczy wyłącznie planu darmowego — płatny ma już swoje limity.
 */
export function trialAllowance(user, kind) {
	if (!user?.createdAt || user.role === 'admin') return 0;
	if (user.plan && user.plan !== DEFAULT_PLAN_ID) return 0;

	const ageMs = Date.now() - new Date(user.createdAt).getTime();
	if (!Number.isFinite(ageMs) || ageMs > TRIAL.days * 24 * 3600 * 1000) return 0;

	return TRIAL.limits[kind] ?? 0;
}

/**
 * Ile z limitu zostało.
 *
 * Przy niedostępnym Redisie zalogowanych przepuszczamy (konto i tak jest identyfikowalne,
 * a nadużycie da się później wychwycić w UsageLog), a niezalogowanych blokujemy —
 * inaczej awaria cache'u otwiera nielimitowane wywołania modelu z dowolnego adresu.
 */
export async function checkQuota({ kind, user, userId, ip }) {
	const plan = resolvePlan(user);
	const limit = plan.limits[kind];

	if (limit === null || limit === undefined) {
		return { allowed: true, limit: null, used: 0, remaining: null, plan: plan.id };
	}

	const identity = identityFor({ userId: userId ?? user?._id, ip });
	const trialBonus = trialAllowance(user, kind);
	const planLimit = limit + trialBonus;

	const creditCost = CREDIT_COSTS[kind] ?? 0;
	const credits = user?.credits ?? 0;

	/*
	 * Awaria Redisa: nie wiemy, ile zużyto, więc zalogowanych przepuszczamy — konto jest
	 * identyfikowalne, a nadużycie wyjdzie potem w UsageLog. Niezalogowanych blokujemy,
	 * bo inaczej awaria cache'u otwiera darmowe wywołania modelu z dowolnego adresu.
	 *
	 * WYJĄTEK dotyczy planów, w których danego rodzaju nie ma wcale (`planLimit === 0`,
	 * np. raporty w planie darmowym). Tu licznik nie jest do niczego potrzebny: puli nie
	 * ma, więc jedyną drogą są kredyty. Bez tego wyjątku wyłączony Redis oznaczałby, że
	 * operacje, za które ludzie płacą, stają się darmowe.
	 */
	const client = await getRedisClient();

	if (!client) {
		if (planLimit === 0) {
			const canPay = creditCost > 0 && credits >= creditCost;
			return {
				allowed: canPay,
				limit: 0,
				used: 0,
				remaining: 0,
				plan: plan.id,
				trialBonus,
				credits,
				creditCost,
				usingCredit: canPay,
				degraded: true,
			};
		}
		const allowed = identity.type === 'user';
		return {
			allowed,
			limit: planLimit,
			used: allowed ? 0 : planLimit,
			remaining: 0,
			plan: plan.id,
			credits,
			creditCost,
			usingCredit: false,
			degraded: true,
		};
	}

	let used = 0;
	try {
		used = Number(await client.get(quotaKey(kind, identity))) || 0;
	} catch {
		return {
			allowed: identity.type === 'user',
			limit: planLimit,
			used: 0,
			remaining: 0,
			plan: plan.id,
			credits,
			creditCost,
			usingCredit: false,
			degraded: true,
		};
	}

	const withinPlan = used < planLimit;

	/*
	 * Kredyty wchodzą dopiero po wyczerpaniu puli planu i mają własną cenę za operację
	 * (raport kosztuje trzy, analiza jeden). Wcześniej dodawaliśmy je wprost do limitu,
	 * co działało tylko przy cenie 1:1 i wyłącznie dla analiz — przy raporcie za trzy
	 * kredyty ta arytmetyka daje zły wynik.
	 *
	 * `limit` i `remaining` opisują WYŁĄCZNIE plan. Stan kredytów jest osobno, bo to osobna
	 * kieszeń: interfejs ma pokazać „wykorzystałeś 5 z 5, masz 12 kredytów", a nie zlepek
	 * obu liczb, z którego nie wiadomo, co się właśnie zużywa.
	 */
	const canPayWithCredits = !withinPlan && creditCost > 0 && credits >= creditCost;

	return {
		allowed: withinPlan || canPayWithCredits,
		limit: planLimit,
		used,
		remaining: Math.max(0, planLimit - used),
		plan: plan.id,
		trialBonus,
		credits,
		creditCost,
		// Kolejne użycie wyjdzie poza pulę planu — `consumeQuota` musi odjąć kredyty,
		// a nie tylko podbić licznik.
		usingCredit: canPayWithCredits,
		inTrial: trialBonus > 0,
	};
}

/**
 * Odsłona cudzej analizy — sprawdzenie i zaliczenie w jednym kroku.
 *
 * Zbiór, a nie licznik: trzymamy identyfikatory obejrzanych meczów, więc ponowne otwarcie
 * tej samej analizy nie zużywa kolejnej odsłony. Bez tego odświeżenie strony albo powrót
 * z zakładki „Statystyki" spalałyby limit i funkcja byłaby nie do zniesienia.
 *
 * Własna analiza nie kosztuje odsłony — o to dba wywołujący, przekazując `isOwn`.
 *
 * @returns {Promise<{allowed: boolean, used: number, limit: number|null, plan: string}>}
 */
export async function checkAnalysisView({ user, userId, ip, fixtureId, isOwn = false }) {
	const plan = resolvePlan(user);
	const limit = plan.limits.analysisView;

	if (isOwn || limit === null || limit === undefined) {
		return { allowed: true, used: 0, limit: null, plan: plan.id };
	}

	const identity = identityFor({ userId: userId ?? user?._id, ip });
	const client = await getRedisClient();

	// Bez Redisa nie ma jak liczyć odsłon. Przepuszczamy — zablokowanie czytania przy
	// awarii cache'u byłoby dotkliwsze niż kilka darmowych odsłon.
	if (!client) {
		return { allowed: true, used: 0, limit, plan: plan.id, degraded: true };
	}

	const key = `views:analysis:${identity.type}:${identity.id}:${todayKey()}`;

	try {
		const already = await client.sIsMember(key, String(fixtureId));
		if (already) {
			const used = await client.sCard(key);
			return { allowed: true, used, limit, plan: plan.id };
		}

		const used = await client.sCard(key);
		if (used >= limit) {
			return { allowed: false, used, limit, plan: plan.id };
		}

		await client.sAdd(key, String(fixtureId));
		if (used === 0) await client.expire(key, secondsUntilMidnight());

		return { allowed: true, used: used + 1, limit, plan: plan.id };
	} catch {
		return { allowed: true, used: 0, limit, plan: plan.id, degraded: true };
	}
}

/**
 * Zamyka rozliczenie po UDANYM wywołaniu. Nigdy przed — nieudana generacja nie może kosztować.
 *
 * Płacimy albo pulą planu (licznik w Redisie), albo kredytami — nie jednym i drugim naraz.
 * Gdy operacja idzie z kredytów, licznik zostaje nietknięty: pula planu jest już wyczerpana,
 * a dalsze jej podbijanie tylko zaciemniałoby to, co widzi użytkownik.
 *
 * @param {{ usingCredit?: boolean }} [options] wynik `checkQuota`
 */
export async function consumeQuota({ kind, user, userId, ip, usingCredit = false }) {
	const plan = resolvePlan(user);
	if (plan.limits[kind] === null || plan.limits[kind] === undefined) return;

	const id = userId ?? user?._id;

	if (usingCredit && id) {
		const cost = CREDIT_COSTS[kind] ?? 0;
		if (cost > 0) {
			try {
				// Warunek `$gte: cost` w samym zapytaniu chroni przed zejściem poniżej zera
				// przy dwóch równoległych żądaniach — sprawdzenie po odczycie by nie wystarczyło.
				const result = await User.updateOne(
					{ _id: id, credits: { $gte: cost } },
					{ $inc: { credits: -cost } }
				);
				if (result.modifiedCount) {
					await recordCreditChange({
						userId: id,
						amount: -cost,
						reason: `spend:${kind}`,
						// Wydatek nie ma zewnętrznego identyfikatora zdarzenia, więc klucz
						// idempotencji budujemy z czasu — chodzi wyłącznie o ślad w księdze.
						idempotencyKey: `spend:${id}:${kind}:${Date.now()}`,
					});
					return;
				}
				// Kredytów zabrakło między sprawdzeniem a zapisem — operacja i tak się udała,
				// więc nie odbieramy jej użytkownikowi, ale odnotowujemy to w liczniku planu.
				console.warn('[billing] brak kredytów przy rozliczeniu, spadam na licznik planu');
			} catch (error) {
				console.warn('[billing] nie udało się odjąć kredytów:', error.message);
			}
		}
	}

	const client = await getRedisClient();
	if (!client) return;

	try {
		const key = quotaKey(kind, identityFor({ userId: id, ip }));
		const count = await client.incr(key);
		if (count === 1) await client.expire(key, period(kind).ttlSeconds);
	} catch {
		/* licznik to nie źródło prawdy — nieudany zapis nie może wywrócić żądania */
	}
}

/**
 * Zapis do dziennika zużycia. Świadomie nie rzuca wyjątkiem: brak wpisu w statystykach
 * jest mniej dotkliwy niż utrata wygenerowanej właśnie analizy.
 */
export async function recordUsage(entry) {
	try {
		await UsageLog.create(entry);
	} catch (error) {
		console.warn('[billing] nie udało się zapisać zużycia:', error.message);
	}
}
