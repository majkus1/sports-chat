import { PLANS, PLAN_PASS_DAYS, PRO_WEEK, getPlanPass } from '@/lib/billing/plans';

/**
 * Karty cennika: plan darmowy i trzy bilety — przepustka Pro 7 dni, Pro 30 dni, VIP 30 dni.
 *
 * DLACZEGO OSOBNO OD `PUBLIC_PLANS`. Plany to „co konto potrafi" (limity, cechy) i z nich korzysta
 * strona główna, `llms.txt` i dane strukturalne; karty cennika to „co da się kupić". Przepustka
 * jest tym samym planem Pro, tylko krótszym biletem z mniejszą pulą, więc w planach jej nie ma,
 * a w cenniku musi stać obok Pro na 30 dni — inaczej nie da się porównać ceny za dzień.
 *
 * `perDayGrosze` liczone z ceny i dni, nie wpisane ręcznie: zdanie „Pro 30 wychodzi o 40% taniej
 * za dzień" ma wynikać z cennika, a nie z pamięci autora tekstu.
 */
const oferta = (passId, extra) => {
	const pass = getPlanPass(passId);
	const plan = PLANS[pass.planId];
	return {
		id: pass.id,
		planId: pass.planId,
		passId: pass.id,
		priceGrosze: pass.priceGrosze,
		days: pass.days,
		limits: pass.id === PRO_WEEK.id ? PRO_WEEK.limits : plan.limits,
		features: plan.features,
		perDayGrosze: Math.round(pass.priceGrosze / pass.days),
		...extra,
	};
};

export const PRICING_OFFERS = [
	{
		id: 'free',
		planId: 'free',
		passId: null,
		priceGrosze: 0,
		days: null,
		limits: PLANS.free.limits,
		features: PLANS.free.features,
		perDayGrosze: 0,
		titleKey: 'plan_free',
	},
	oferta(PRO_WEEK.id, { titleKey: 'card_week_title', badgeKey: 'card_week_badge', recommendedForNew: true }),
	oferta('pro', { titleKey: 'card_month_title', badgeKey: 'card_month_badge' }),
	oferta('vip', { titleKey: 'card_vip_title' }),
];

/** O ile procent Pro 30 jest tańszy za dzień niż przepustka — do zdania porównania pod kartami. */
export function monthVsWeekSaving() {
	const tydzien = PRO_WEEK.priceGrosze / PRO_WEEK.days;
	const miesiac = (PLANS.pro.priceMonthlyPln * 100) / PLAN_PASS_DAYS;
	return Math.round((1 - miesiac / tydzien) * 100);
}

/**
 * Wartości do zdania porównania pod kartami (`billing2.compare`): oszczędność i ceny za dzień.
 *
 * DLACZEGO OSOBNE NAZWY. Do 22.11.2026 cennik podawał cenę za dzień jako `month` i `week` —
 * te same nazwy, pod którymi `useB2` podstawia LICZBĘ DNI biletu. Wartość z wywołania wygrywała
 * z domyślną i na stronie stało „Pro na 1,63 dni wychodzi o 40% taniej”. Ceny mają więc własne
 * miejsca (`monthPerDay`, `weekPerDay`), a test pilnuje, że nie nadpisują dni.
 */
export function compareParams(locale = 'pl') {
	const tydzien = PRICING_OFFERS.find((o) => o.id === PRO_WEEK.id);
	const miesiac = PRICING_OFFERS.find((o) => o.id === 'pro');
	return {
		saving: monthVsWeekSaving(),
		monthPerDay: formatZl(miesiac.perDayGrosze, locale),
		weekPerDay: formatZl(tydzien.perDayGrosze, locale),
	};
}

/** Kwota w złotych do wyświetlenia: „19", „2,71" (pl) / „2.71" (en). */
export function formatZl(grosze, locale = 'pl') {
	const zl = grosze / 100;
	const calkowite = Number.isInteger(zl);
	return zl.toLocaleString(locale === 'en' ? 'en-GB' : 'pl-PL', {
		minimumFractionDigits: calkowite ? 0 : 2,
		maximumFractionDigits: 2,
	});
}
