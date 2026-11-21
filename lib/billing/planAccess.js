import User from '@/models/User';
import { PRO_WEEK, getPlanPass } from '@/lib/billing/plans';
import { recordCreditChange } from '@/lib/billing/credits';
import { currentPass, paidWindow } from '@/lib/billing/entitlements';

/**
 * Przyznanie płatnego planu na czas określony.
 *
 * Plan kupuje się jak bilet: opłacasz 7 albo 30 dni i po tym czasie konto samo wraca do darmowego.
 * Nic nie pobiera się automatycznie, więc nie ma odnowień, wypowiedzeń ani mandatów
 * płatniczych — a BLIK i Przelewy24, które nie obsługują płatności cyklicznych, działają
 * tu tak samo jak karta.
 *
 * Wygaśnięciem nie zajmuje się żadne zadanie cykliczne: `resolvePlan` sprawdza
 * `planValidUntil` przy każdym żądaniu i po terminie zwraca plan darmowy.
 */

const DZIEN_MS = 24 * 3600 * 1000;

/**
 * Data końca dostępu po zakupie.
 *
 * Liczymy od późniejszej z dwóch dat: teraz albo dotychczasowego końca dostępu. Dzięki temu
 * zakup przed wygaśnięciem poprzedniego okresu DOKŁADA dni zamiast je kasować — inaczej
 * ktoś, kto przedłuża z wyprzedzeniem, traciłby to, co już opłacił.
 *
 * Zasada obowiązuje też przy zmianie planu: przechodząc z Pro na VIP zachowujesz pozostałe
 * dni. To rozwiązanie hojne, ale różnica jest niewielka, a alternatywa wymagałaby liczenia
 * proporcji i tłumaczenia jej w regulaminie.
 */
export function accessEndsAt(currentValidUntil, days, now = new Date()) {
	const podstawa =
		currentValidUntil && new Date(currentValidUntil) > now ? new Date(currentValidUntil) : now;
	return new Date(podstawa.getTime() + days * DZIEN_MS);
}

/**
 * Czy ten bilet można teraz kupić — sprawdzane w trasie checkout, ZANIM powstanie płatność.
 *
 * Jedyny zakaz: przepustka 7-dniowa przy aktywnym planie na 30 dni (Pro albo VIP). Taki zakup
 * nic by nie dał — limity planu 30-dniowego są wyższe, a dni dokłada się taniej, kupując kolejne
 * 30 — więc zamiast przyjąć 19 zł za nic, mówimy to przed płatnością.
 *
 * @returns {{ ok: true } | { ok: false, reason: 'pass_downgrade' }}
 */
export function canBuyPass(user, passId, now = new Date()) {
	const aktywny = currentPass(user, now);
	if (passId === PRO_WEEK.id && aktywny && aktywny !== PRO_WEEK.id) return { ok: false, reason: 'pass_downgrade' };
	return { ok: true };
}

/**
 * Stan konta po opłaconym bilecie — czysta funkcja, bez bazy (testy: `test/billing/planAccess`).
 *
 * Cztery przypadki, wszystkie „bez utraty dni i bez podwójnych limitów":
 *
 * 1. Brak aktywnego planu → bilet rusza teraz: koniec = teraz + dni, kotwica okien = teraz.
 *
 * 2. Przepustka → przepustka (albo Pro → Pro, Pro → VIP) → dni dokładają się na końcu, kotwica
 *    zostaje. Okna liczą się od kotwicy do przodu (`paidWindow`), więc bieżące okno i jego licznik
 *    się nie zmieniają, a dokupione dni dostają własne okno z własną pulą — dokładnie tyle pul,
 *    ile opłaconych biletów.
 *
 * 3. Przepustka → Pro 30 albo VIP w trakcie → nowy plan działa OD RAZU: kotwica przeskakuje na
 *    chwilę zakupu, koniec = dotychczasowy koniec + 30 dni. Pozostałe dni przepustki (≤ 7) doklejają
 *    się do pierwszego okna nowego planu — np. 34 dni z jedną pulą Pro. Dni nie przepadają, a na te
 *    kilka dni nie powstaje druga, pełna pula Pro (bez tej reguły 4 dni reszty miałyby własne
 *    100 analiz — koszt do ~20 zł ponad cenę). Niewykorzystana część tygodniowej puli przepada,
 *    ale w jej miejsce od razu jest większa pula nowego planu.
 *
 * 4. Plan 30-dniowy → przepustka (wyścig: zakup w dwóch kartach; trasa checkout tego nie wpuszcza)
 *    → płatność już jest, więc dokładamy 7 dni do bieżącego planu, bez zmiany planu i limitów.
 *    Reszta krótsza niż okno dokleja się do ostatniego okna, więc i tu nie powstaje nowa pula.
 *
 * Konta bez kotwicy (zakupy sprzed 21.11.2026) dostają ją przy pierwszym dokupieniu: początek
 * bieżącego okna liczonego po staremu. Od tej chwili okna do przodu pokrywają się z dotychczasowymi.
 *
 * @returns {{ plan: string, planValidUntil: Date, planPeriod: { pass: string, from: Date } }}
 */
export function planAfterPurchase(user, pass, now = new Date()) {
	const aktywny = currentPass(user, now);
	const koniec = accessEndsAt(user?.planValidUntil, pass.days, now);

	if (!aktywny) {
		return { plan: pass.planId, planValidUntil: koniec, planPeriod: { pass: pass.id, from: now } };
	}

	const kotwica = user?.planPeriod?.from ? new Date(user.planPeriod.from) : paidWindow(user, now)?.startsAt || now;

	if (pass.id === PRO_WEEK.id) {
		if (aktywny === PRO_WEEK.id) {
			return { plan: PRO_WEEK.planId, planValidUntil: koniec, planPeriod: { pass: PRO_WEEK.id, from: kotwica } };
		}
		// Przypadek 4: zostaje plan 30-dniowy z jego limitami, dochodzi 7 dni.
		return { plan: user.plan, planValidUntil: koniec, planPeriod: { pass: aktywny, from: kotwica } };
	}

	if (aktywny === PRO_WEEK.id) {
		// Przypadek 3: nowy plan od teraz, reszta przepustki dokleja się do pierwszego okna.
		return { plan: pass.planId, planValidUntil: koniec, planPeriod: { pass: pass.id, from: now } };
	}

	return { plan: pass.planId, planValidUntil: koniec, planPeriod: { pass: pass.id, from: kotwica } };
}

/**
 * Nadaje plan po potwierdzonej płatności.
 *
 * @returns {Promise<{granted: boolean, plan?: string, pass?: string, validUntil?: Date}>}
 *   `granted:false`, gdy to zdarzenie było już rozliczone
 */
export async function grantPlanAccess({ userId, planId, idempotencyKey, details = {} }) {
	const pass = getPlanPass(planId);
	if (!pass) throw new Error(`grantPlanAccess: nieznany plan ${planId}`);

	/*
	 * Wpis w księdze POWSTAJE PIERWSZY i pełni tu rolę zamka.
	 *
	 * Unikalny indeks na `idempotencyKey` sprawia, że powtórzone zdarzenie od Stripe'a
	 * odpada właśnie tutaj — zanim ktokolwiek dostanie dodatkowe dni. Kwota jest zerowa,
	 * bo zakup planu nie zmienia salda kredytów; liczy się sam ślad i jego jednoznaczność.
	 * `planId` w szczegółach to identyfikator BILETU (`pro_week`, `pro`, `vip`) — po nim zwrot
	 * wie, ile dni odjąć.
	 */
	const pierwsze = await recordCreditChange({
		userId,
		amount: 0,
		reason: `purchase:plan_${pass.id}`,
		idempotencyKey,
		details: { ...details, planId: pass.id, days: pass.days },
	});
	if (!pierwsze) return { granted: false };

	const user = await User.findById(userId).select('plan planStatus planValidUntil planPeriod role').lean();
	const stan = planAfterPurchase(user, pass);

	await User.updateOne(
		{ _id: userId },
		{
			$set: {
				plan: stan.plan,
				planStatus: 'active',
				planValidUntil: stan.planValidUntil,
				'planPeriod.pass': stan.planPeriod.pass,
				'planPeriod.from': stan.planPeriod.from,
			},
		}
	);

	return { granted: true, plan: stan.plan, pass: stan.planPeriod.pass, validUntil: stan.planValidUntil };
}

/**
 * Cofnięcie dostępu przy zwrocie płatności.
 *
 * Odejmujemy dokładnie tyle dni, ile dodał zwracany zakup (7 albo 30), zamiast kasować dostęp
 * do zera — użytkownik mógł mieć wcześniej opłacony okres, którego zwrot nie dotyczy. Gdy po
 * odjęciu termin wypada w przeszłości, `resolvePlan` sam sprowadzi konto do planu darmowego.
 * Kotwica okien zostaje: skrócenie końca nie przesuwa początku bieżącego okna.
 */
export async function revokePlanAccess({ userId, planId, idempotencyKey, details = {} }) {
	const pass = getPlanPass(planId);
	if (!pass) return { revoked: false };

	const pierwsze = await recordCreditChange({
		userId,
		amount: 0,
		reason: `refund:plan_${pass.id}`,
		idempotencyKey,
		details: { ...details, planId: pass.id, days: -pass.days },
	});
	if (!pierwsze) return { revoked: false };

	const user = await User.findById(userId).select('planValidUntil').lean();
	if (!user?.planValidUntil) return { revoked: true };

	const skrocony = new Date(new Date(user.planValidUntil).getTime() - pass.days * DZIEN_MS);
	await User.updateOne({ _id: userId }, { $set: { planValidUntil: skrocony } });

	return { revoked: true, validUntil: skrocony };
}
