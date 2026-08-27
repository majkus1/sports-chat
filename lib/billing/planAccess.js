import User from '@/models/User';
import { getPlanPass } from '@/lib/billing/plans';
import { recordCreditChange } from '@/lib/billing/credits';

/**
 * Przyznanie płatnego planu na czas określony.
 *
 * Plan kupuje się jak bilet: opłacasz 30 dni i po tym czasie konto samo wraca do darmowego.
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
 * Nadaje plan po potwierdzonej płatności.
 *
 * @returns {Promise<{granted: boolean, plan?: string, validUntil?: Date}>}
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
	 */
	const pierwsze = await recordCreditChange({
		userId,
		amount: 0,
		reason: `purchase:plan_${pass.id}`,
		idempotencyKey,
		details: { ...details, planId: pass.id, days: pass.days },
	});
	if (!pierwsze) return { granted: false };

	const user = await User.findById(userId).select('planValidUntil').lean();
	const validUntil = accessEndsAt(user?.planValidUntil, pass.days);

	await User.updateOne(
		{ _id: userId },
		{ $set: { plan: pass.id, planStatus: 'active', planValidUntil: validUntil } }
	);

	return { granted: true, plan: pass.id, validUntil };
}

/**
 * Cofnięcie dostępu przy zwrocie płatności.
 *
 * Odejmujemy dokładnie tyle dni, ile dodał zwracany zakup, zamiast kasować dostęp do zera —
 * użytkownik mógł mieć wcześniej opłacony okres, którego zwrot nie dotyczy. Gdy po odjęciu
 * termin wypada w przeszłości, `resolvePlan` sam sprowadzi konto do planu darmowego.
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
