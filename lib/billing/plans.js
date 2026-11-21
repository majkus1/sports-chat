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

export const QUOTA_KINDS = ['analysis', 'analysisView', 'aiChat', 'report', 'aiNews', 'couponGen'];

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
	/*
	 * Wyszukiwanie wiadomości przez asystenta — osobna, mniejsza pula niż zwykłe pytania.
	 * Jedno wyszukanie to model z narzędziem internetowym plus opłata za samo wyszukanie:
	 * ~0,10 zł, czyli 5–10 razy więcej niż pytanie bez sieci. Gdyby liczyło się do puli
	 * pytań, 150 wyszukań w Pro dałoby ~15 zł kosztu przy cenie 49 zł — poza regułą 35%.
	 */
	aiNews: 'month',
	/*
	 * Kreator kuponu (`lib/coupons/custom.js`) — WYJĄTKOWO dziennie, decyzja właściciela z 25.10.2026.
	 * Kupon składa się „na dziś wieczór" albo „na najbliższe dni", więc pula ma sens w dniu, a nie
	 * w miesiącu: miesięczne 90 sztuk dałoby się wyczerpać jednego wieczoru, składając kupon do skutku.
	 * Koszt jednego złożenia: sprawdzenie wiadomości o typach (jedno wyszukanie AI na typ, ~0,01–0,025 $),
	 * wspólne z kuponami serwisu przez 12 godzin (`lib/coupons/news.js`) — typ sprawdzony rano przez
	 * kupon 3-dniowy albo przez innego użytkownika nie kosztuje drugi raz. Typowo 0–3 nowe wyszukania,
	 * najgorzej ~8 (5 typów i odrzucenia) ≈ 0,2 $. Do tego kursy brakujących meczów z API-Football
	 * (najwyżej `CUSTOM_FETCH_BUDGET`, z pamięcią 10 minut). Nieudane złożenie limitu nie zużywa.
	 */
	couponGen: 'day',
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
	/*
	 * `couponGen` — kreator kuponu: 2 dziennie przez cały okres próbny (limit dzienny, więc pula
	 * powitalna działa tu jak dzienny limit tygodniowej próby). Plan darmowy ma 0, więc po próbie
	 * kreator zostaje zapowiedzią z cennikiem.
	 */
	limits: { analysis: 10, aiChat: 30, report: 2, couponGen: 2 },
	/*
	 * Funkcje, które nic nie kosztują, a są dokładnie tym, za co się płaci: liczby przy typach
	 * na liście meczów i poranny mail. Bez nich nowe konto widziało wszystko za kłódką i nie
	 * miało powodu wrócić następnego dnia — tak odszedł pierwszy użytkownik z zewnątrz, który
	 * wygenerował jeden raport i więcej się nie pojawił. Tydzień porannych maili buduje nawyk,
	 * a ostatni dzień próby mówi wprost, co zniknie.
	 */
	features: ['model_hints', 'morning_email'],
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
		limits: { analysis: 5, analysisView: 10, aiChat: 20, report: 0, aiNews: 0, couponGen: 0 },
		/*
		 * `model_hints` — liczby przy plakietce modelu na liście meczów. Darmowy plan widzi
		 * samą plakietkę („model ma tu typ"), płatne widzą selekcję i przewagę. Sam rachunek
		 * nic nie kosztuje, ale to jest dokładnie ta wartość, za którą się płaci: skanowanie
		 * całej oferty bez wydawania limitu na pojedyncze analizy.
		 */
		features: [],
	},
	pro: {
		id: 'pro',
		nameKey: 'plan_pro',
		priceMonthlyPln: 49,
		// Maks. koszt AI: 100×0,084 + 150×0,045 + 12×0,22 + 30×0,10 ≈ 20,4 zł (42% ceny — wiadomości
		// rzadko wykorzystywane do końca; przy pełnym zużyciu wszystkiego nadal w granicach).
		// Kreator kuponu (3 dziennie, ~90 w okresie): przy typowych 0–3 nowych wyszukaniach na kupon
		// (werdykty wspólne 12 h) ~0,03 $ za kupon ≈ 10 zł; najgorzej (same nowe mecze) ~0,2 $ ≈ 66 zł —
		// wtedy wydatki dnia zatrzymuje `spendGuard`, a kupon wychodzi oznaczony jako niesprawdzony.
		limits: { analysis: 100, analysisView: null, aiChat: 150, report: 12, aiNews: 30, couponGen: 3 },
		/*
		 * Tylko cechy, które coś sprawdza (`hasFeature`) i które pokazuje cennik (`FEATURE_ROWS`
		 * w lib/billing/planTexts.js). Do 24.10.2026 stały tu jeszcze `analysis_history`
		 * i `priority_generation` — nic ich nie czytało, a regulamin i cennik ich nie opisywały.
		 */
		features: ['live_analysis', 'model_hints', 'morning_email'],
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
		// Kreator kuponu: 10 dziennie (~300 w okresie) — typowo ~9 $ ≈ 33 zł przy pełnym zużyciu.
		limits: { analysis: 200, analysisView: null, aiChat: 250, report: 30, aiNews: 60, couponGen: 10 },
		features: ['live_analysis', 'model_hints', 'morning_email'],
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

/**
 * Przepustka Pro na 7 dni za 19 zł — tańsze wejście (decyzja z 21.11.2026).
 *
 * DLACZEGO. Do 21.11.2026: 10 kont z zewnątrz, zero zakupów. Najtańszą rzeczą był pakiet
 * 5 kredytów za 19 zł (5 analiz), a pierwszym planem Pro za 49 zł — za dużo „na próbę" dla
 * kogoś, kto zna serwis od tygodnia. Te same 19 zł kupują teraz tydzień pełnego Pro: typy
 * z liczbami, kupony 3- i 5-dniowe, kupon live, analizy w trakcie gry, raporty.
 *
 * To NIE jest osobny plan, tylko krótszy bilet na Pro: konto ma `plan: 'pro'` (wszystkie
 * sprawdzenia „czy Pro" działają bez zmian), a przepustkę rozpoznaje `planPeriod.pass`
 * (`resolvePlan` podmienia wtedy limity, `paidWindow` liczy okno 7-dniowe).
 *
 * LIMITY — proporcja 7/30 z Pro (23 analizy, 35 pytań, 2,8 raportu, 7 wyszukiwań) przycięta
 * tak, żeby zmieścić regułę kosztu ≤ ~35% ceny RAZEM z kreatorem kuponu, który zostaje jak w Pro
 * (3 dziennie). Kreator w tygodniu waży relatywnie więcej niż w Pro: 21 kuponów przy cenie
 * równej 39% ceny Pro. Rachunek przy PEŁNYM zużyciu (koszty z nagłówka pliku):
 *   20 analiz × 0,084 zł        = 1,68 zł
 *   30 pytań  × 0,045 zł        = 1,35 zł
 *    3 raporty × 0,222 zł       = 0,67 zł
 *    5 wyszukiwań × 0,10 zł     = 0,50 zł
 *   21 kuponów z kreatora × ~0,03 $ × 3,65 ≈ 2,30 zł (typowo; najgorszy dzień trzyma `spendGuard`)
 *   razem ≈ 6,50 zł = 34% z 19 zł.
 * Na dzień to ~86% dziennej puli Pro przy 166% dziennej ceny Pro (2,71 zł wobec 1,63 zł) —
 * celowo: przepustka jest wejściem, a Pro na 30 dni ma pozostać wyraźnie lepszą ceną.
 */
export const PRO_WEEK = {
	id: 'pro_week',
	planId: 'pro',
	days: 7,
	priceGrosze: 1900,
	limits: { analysis: 20, analysisView: null, aiChat: 30, report: 3, aiNews: 5, couponGen: 3 },
};

/**
 * Bilety w sprzedaży: przepustka 7-dniowa i plany na 30 dni.
 *
 * `id` to identyfikator zakupu (przychodzi z przeglądarki, trafia do metadanych Stripe'a
 * i do oświadczenia), `planId` — plan nadawany kontu. Dla planów 30-dniowych oba są równe,
 * więc stare wpisy w księdze (`purchase:plan_pro`) i zdarzenia od Stripe'a działają jak dotąd.
 */
export const PLAN_PASSES = [
	{
		id: PRO_WEEK.id,
		planId: PRO_WEEK.planId,
		nameKey: PLANS.pro.nameKey,
		priceGrosze: PRO_WEEK.priceGrosze,
		days: PRO_WEEK.days,
	},
	...Object.values(PLANS)
		.filter((plan) => plan.priceMonthlyPln > 0)
		.map((plan) => ({
			id: plan.id,
			planId: plan.id,
			nameKey: plan.nameKey,
			priceGrosze: plan.priceMonthlyPln * 100,
			days: PLAN_PASS_DAYS,
		})),
];

export function getPlanPass(passId) {
	return PLAN_PASSES.find((pass) => pass.id === passId) || null;
}

/** Długość okna limitów biletu (7 albo 30 dni); nieznany bilet — 30, jak przed przepustką. */
export function passDays(passId) {
	return getPlanPass(passId)?.days ?? PLAN_PASS_DAYS;
}

export const DEFAULT_PLAN_ID = 'free';

/** Konta z rolą administratora omijają limity — zastępuje porównanie nicku w kodzie. */
export const ADMIN_PLAN = {
	id: 'admin',
	nameKey: 'plan_vip',
	priceMonthlyPln: 0,
	limits: { analysis: null, analysisView: null, aiChat: null, report: null, aiNews: null, couponGen: null },
	features: ['live_analysis', 'model_hints', 'morning_email'],
};

export function getPlan(planId) {
	return PLANS[planId] || PLANS[DEFAULT_PLAN_ID];
}

/** Kolejność wyświetlania na stronie z cennikiem. */
export const PUBLIC_PLANS = [PLANS.free, PLANS.pro, PLANS.vip];
