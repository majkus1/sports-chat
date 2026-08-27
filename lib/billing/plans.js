/**
 * Definicje planów.
 *
 * Jedno miejsce z limitami zamiast liczb rozsianych po trasach. `null` w limicie znaczy
 * „bez ograniczeń" — celowo nie `Infinity`, bo to nie przechodzi przez JSON.
 *
 * LICZBY NIE SĄ UZNANIOWE. Zmierzony koszt jednej operacji (dane z UsageLog, kurs 3,65 zł/$):
 *   analiza meczu, gpt-5.5   $0,0219  (0,080 zł)
 *   analiza meczu, gpt-4o    $0,0024  (0,009 zł)   ← dziewięciokrotnie taniej
 *   raport AI, gpt-5.5       $0,0607  (0,222 zł)
 *   pytanie asystenta, 4o    $0,0041  (0,015 zł)
 * Do tego koszt stały: API-Football Pro $19/mies. (~69 zł).
 *
 * Limity każdego planu dobrano tak, żeby koszt AI przy PEŁNYM wykorzystaniu nie przekroczył
 * ~35% ceny. Zmieniając limity, przelicz ten stosunek — inaczej aktywny abonent zaczyna
 * kosztować więcej, niż płaci (tak było wcześniej: Pro za 29 zł mógł wygenerować koszt 218 zł).
 */

export const QUOTA_KINDS = ['analysis', 'analysisView', 'aiChat', 'report'];

/**
 * Okres rozliczania limitu. Rodzaj bez wpisu rozlicza się dziennie.
 *
 * Wszystko, co kosztuje pieniądze, rozliczamy MIESIĘCZNIE — bo miesięczna jest cena.
 * Limit dzienny przy cenie miesięcznej to pułapka: „30 analiz dziennie" znaczy 900 na
 * miesiąc, czego nikt nie wycenia. Miesięczna pula jest też uczciwsza wobec kibica,
 * który ogląda w weekend, a nie po trochu codziennie.
 *
 * Odsłony cudzych analiz zostają dzienne — to zabezpieczenie przed czytaniem cudzej
 * pracy hurtem, a nie pozycja kosztowa (odsłona nie generuje nic).
 */
export const QUOTA_PERIODS = {
	analysis: 'month',
	aiChat: 'month',
	report: 'month',
	analysisView: 'day',
};

/**
 * Pula powitalna nowego konta.
 *
 * Darmowy plan jest celowo skromny, więc bez tego nowy użytkownik nie poznałby wartości
 * produktu przed decyzją o zakupie. Pula jest JEDNORAZOWA i wygasa po tygodniu —
 * kosztuje ~2,6 zł na konto, czyli tyle, ile warto zapłacić za pełny pokaz możliwości.
 */
export const TRIAL = {
	days: 7,
	limits: { analysis: 10, aiChat: 30, report: 2 },
};

export const PLANS = {
	free: {
		id: 'free',
		nameKey: 'plan_free',
		priceMonthlyPln: 0,
		/*
		 * Po trialu zostaje próbka, nie substytut.
		 *
		 * Wcześniej było tu 30 analiz miesięcznie i to był błąd na dwóch poziomach naraz:
		 * kosztowało 2,40 zł na konto przy pełnym wykorzystaniu, a jednocześnie w zupełności
		 * wystarczało przeciętnemu kibicowi, więc nikt nie miał powodu kupić czegokolwiek.
		 * Pięć analiz pozwala wrócić po trialu i sprawdzić najważniejszy mecz kolejki.
		 *
		 * Pytania do asystenta zostają hojne, bo kosztują półtora grosza, a to one wciągają
		 * do rozmowy w pokoju meczowym. Raporty są tylko w płatnych planach — jako jedyne
		 * powstają osobno dla każdego odbiorcy, więc kosztu nie da się rozłożyć.
		 */
		limits: { analysis: 5, analysisView: 10, aiChat: 20, report: 0 },
		features: [],
	},
	pro: {
		id: 'pro',
		nameKey: 'plan_pro',
		priceMonthlyPln: 49,
		// Maks. koszt AI: 100×0,084 + 150×0,045 + 12×0,22 ≈ 17,4 zł (35% ceny).
		limits: { analysis: 100, analysisView: null, aiChat: 150, report: 12 },
		features: ['live_analysis', 'analysis_history'],
	},
	vip: {
		id: 'vip',
		nameKey: 'plan_vip',
		priceMonthlyPln: 99,
		/*
		 * Świadomie BEZ `null` — „bez ograniczeń" przy cenie stałej znaczy nieograniczony
		 * koszt. Limity są tak wysokie, że normalny użytkownik ich nie dotknie, ale sufit
		 * istnieje. Maks. koszt AI: 200×0,084 + 250×0,045 + 30×0,22 ≈ 34,6 zł (35% ceny).
		 */
		limits: { analysis: 200, analysisView: null, aiChat: 250, report: 30 },
		features: ['live_analysis', 'analysis_history', 'priority_generation'],
	},
};

/**
 * Ile kredytów kosztuje jedna operacja.
 *
 * Proporcje odbijają koszt: raport na gpt-5.5 to 0,22 zł wobec 0,08 zł za analizę, czyli
 * niecałe trzy razy tyle. Pytania do asystenta są poza tabelą celowo — kosztują półtora
 * grosza, więc rozliczanie ich kredytami byłoby księgowaniem groszy, a przy okazji
 * zniechęcałoby do dopytywania, które jest najlepszą częścią produktu.
 *
 * Rodzaj bez wpisu nie da się kupić kredytami — działa wyłącznie w ramach limitu planu.
 */
export const CREDIT_COSTS = {
	analysis: 1,
	report: 3,
};

/**
 * Pakiety doładowań.
 *
 * Powód istnienia: między planem darmowym a Pro za 49 zł jest przepaść, której nikt nie
 * przeskoczy dla jednego meczu w sobotę. Kredyt kupuje się bez zobowiązania i bez konta
 * na stałe.
 *
 * Cena za sztukę jest ŚWIADOMIE gorsza niż w abonamencie (Pro: 0,49 zł za analizę wobec
 * 1,98–3,80 zł tutaj). Gdyby było odwrotnie, kredyty zjadłyby abonament; przy tej różnicy
 * to abonament wygląda na okazję, a kredyty pozostają wygodą dla okazjonalnych.
 *
 * `priceGrosze` — Stripe przyjmuje kwoty w najmniejszej jednostce waluty, liczbą całkowitą.
 * Kwota NIGDY nie przychodzi z przeglądarki; backend bierze ją stąd.
 */
export const CREDIT_PACKS = [
	{ id: 'pack_5', credits: 5, priceGrosze: 1900 },
	{ id: 'pack_15', credits: 15, priceGrosze: 3900, highlight: true },
	{ id: 'pack_40', credits: 40, priceGrosze: 7900 },
];

export function getCreditPack(packId) {
	return CREDIT_PACKS.find((pack) => pack.id === packId) || null;
}

/**
 * Płatne plany sprzedawane jako DOSTĘP NA CZAS, nie jako subskrypcja.
 *
 * Powód jest praktyczny, nie ideologiczny: płatności cykliczne w Stripe nie obsługują
 * Przelewy24 w ogóle, a BLIK-a tylko w prywatnej wersji zapoznawczej. Abonament odnawialny
 * byłby więc dostępny wyłącznie na kartę — czyli odcinałby dwie metody, których w Polsce
 * używa się najczęściej. Jednorazowy dostęp na 30 dni działa ze wszystkimi trzema.
 *
 * Cena jest ta sama co miesięczna, bo okres też jest miesięczny. Różnica polega wyłącznie
 * na tym, że nic nie pobiera się automatycznie — po 30 dniach konto wraca do planu darmowego,
 * a użytkownik decyduje, czy kupuje kolejny okres. Wygaśnięciem zajmuje się `resolvePlan`,
 * które i tak sprawdzało `planValidUntil`.
 */
export const PLAN_PASS_DAYS = 30;

export const PLAN_PASSES = Object.values(PLANS)
	.filter((plan) => plan.priceMonthlyPln > 0)
	.map((plan) => ({
		id: plan.id,
		nameKey: plan.nameKey,
		priceGrosze: plan.priceMonthlyPln * 100,
		days: PLAN_PASS_DAYS,
	}));

export function getPlanPass(planId) {
	return PLAN_PASSES.find((pass) => pass.id === planId) || null;
}

export const DEFAULT_PLAN_ID = 'free';

/** Konta z rolą administratora omijają limity — zastępuje porównanie nicku w kodzie. */
export const ADMIN_PLAN = {
	id: 'admin',
	nameKey: 'plan_vip',
	priceMonthlyPln: 0,
	limits: { analysis: null, analysisView: null, aiChat: null, report: null },
	features: ['live_analysis', 'analysis_history', 'priority_generation'],
};

export function getPlan(planId) {
	return PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
}

/** Kolejność wyświetlania na stronie z cennikiem. */
export const PUBLIC_PLANS = [PLANS.free, PLANS.pro, PLANS.vip];
