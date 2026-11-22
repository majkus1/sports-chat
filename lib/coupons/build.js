import { HINT_TO_SELECTION, settleSelection } from '@/lib/model/oddsShadow';
import { APP_TIMEZONE } from '@/lib/time';

/**
 * Kupony (dnia, 3-dniowy, 5-dniowy) — część czysta: wybór typów i rozliczenie.
 *
 * ZASADY OD 21.11.2026 (decyzja właściciela po bilansie od 25.10: dnia 2/14 i w 14 z 28 dni bez kuponu,
 * 3-dniowy 3/19, 5-dniowy 8/19; prośba: kurs ok. 2,0–2,5, mało meczów, kupon częściej niż co drugi dzień).
 *
 *   1. NOGA = PLAKIETKA POTWIERDZONA KURSEM (`lib/picks/chance.js`): próg przechodzi i szansa modelu,
 *      i szansa z kursu; pokazana szansa z kursu albo z modelu według `MARKET_CHANCE_KEYS`. Zastępuje
 *      dawny warunek „kurs × szansa modelu ≤ 100" — ten po potwierdzeniu nic nie wnosił.
 *   2. NOGI DO 1,60 W KUPONIE DNIA I 3-DNIOWYM (`LEG_MAX_ODDS`), do 1,40 w 5-dniowym. Plakietki według
 *      kursu (27.09–16.11, mecze 12–23, ligi sprawdzone), obiecane → trafione:
 *
 *        kurs        potwierdzone, do 19.10   od 20.10            dawne (szansa modelu), do 19.10 / od 20.10
 *        1,05–1,20    75: 84,4% → 90,7%       186: 83,8% → 86,0%   78: 82,7% → 92,3%   187: 82,7% → 79,1%
 *        1,20–1,30    55: 75,6% → 83,6%       138: 75,7% → 80,4%   70: 76,9% → 78,6%   159: 78,0% → 74,2%
 *        1,30–1,40    54: 70,0% → 83,3%       113: 70,7% → 77,9%   60: 73,6% → 76,7%   118: 74,6% → 73,7%
 *        1,40–1,50    27: 66,0% → 55,6%        51: 66,6% → 74,5%   43: 70,7% → 58,1%    99: 70,8% → 71,7%
 *        1,50–1,60    10: 63,2% → 70,0%        27: 63,6% → 55,6%   27: 70,3% → 51,9%    69: 69,9% → 63,8%
 *
 *      Do 1,40 potwierdzony typ trafia wyraźnie więcej, niż obiecuje; 1,40–1,60 — tyle, ile obiecuje
 *      (115 nóg: ~65% → ~65%, w połowach 59% i 68%). Dawniej model obiecywał tam 70% i trafiał 52–72%.
 *      Dwie nogi po ~1,45 dają kupon ~2,1 z szansą ~43%.
 *   3. KUPON DNIA I 3-DNIOWY: kurs łączny 2,0–2,5, najwyżej 3 mecze; 5-DNIOWY: 2,4–2,8, do 5 meczów,
 *      nogi do 1,40 jak dotąd — zmienia się tylko pkt 1.
 *
 * SYMULACJA na dzienniku prognoz (dni 27.09–16.11; kupon o 9:30 z plakietek z porannym kursem, każdy
 * kolejny kupon bez meczów poprzednich, kursy dni następnych z tego samego dziennika, bez sprawdzania
 * wiadomości). Sprawdzian symulatora: zasady z 25.10 od 25.10 dają 2/12 (dnia), 3/19 (3-dniowy), 6/18
 * (5-dniowy) — prawdziwe kupony 2/14, 3/19, 8/19. „Weszło" do 19.10 / od 20.10:
 *
 *   wariant                                      dni z kuponem  śr. kurs  meczów  weszło          nogi traf./obiec.
 *   dnia: zasady z 25.10 (szansa modelu)            25/49        2,45     3,6    5/9   i 4/16     80% / 74%
 *   dnia: te same + potwierdzenie kursem            31/49        2,43     3,5    6/11  i 12/20    85% / 74%
 *   dnia: dokładnie 2 mecze, nogi do 1,60           26/49        2,08     2,0    4/10  i 10/16    71% / 69%
 *   dnia: pojedynczy typ 1,40–1,80                  33/49        1,45     1,0    8/15  i 13/18    64% / 68%
 *   dnia: 2–3 mecze, nogi do 1,50                   37/49        2,07     2,5    10/16 i 13/21    82% / 72%
 *   dnia: 2–3 mecze, nogi do 1,60  [WYBRANY]        41/49        2,09     2,4    10/18 i 14/23    78% / 71%
 *   3-dn.: zasady z 25.10                           46/47        2,43     3,4    9/22  i 5/24     78% / 75%
 *   3-dn.: 2–3 mecze, nogi do 1,60 [WYBRANY]        46/47        2,06     2,1    11/22 i 16/24    78% / 72%
 *   3-dn.: dokładnie 2 mecze                        41/47        2,07     2,0    8/18  i 15/23    76% / 71%
 *   5-dn.: zasady z 25.10                           45/45        2,42     3,1    4/22  i 7/23     73% / 74%
 *   5-dn.: te same + potwierdzenie [WYBRANY]        45/45        2,41     3,1    7/22  i 13/23    81% / 74%
 *
 * Kupon dnia powstaje w 84% dni zamiast co drugiego, ma 2–3 mecze, kurs ~2,1 i szansę ~45% (weszło
 * 24/41); 3-dniowy wychodzi lepiej niż dziś w obu połowach, 5-dniowy z potwierdzeniem też (20/45
 * wobec 11/45) — więc dostaje tylko pkt 1. Pojedynczy typ odrzucony: kurs ~1,45 zamiast ok. 2,0
 * i do 19.10 trafiał 53% przy obietnicy 67%. PRÓBA JEST MAŁA (kilkadziesiąt kuponów, 3- i 5-dniowe
 * z sąsiednich dni dzielą mecze) — różnice w „weszło" mieszczą się w przypadku; pewne są: częstość
 * kuponu, liczba meczów i to, że szansa przy nodze nie obiecuje za dużo. Opublikowane kupony się nie zmieniają.
 *
 * --- Poniżej zasady z 25.10.2026 (historia; pkt 2 i 3 zastąpione wyżej). ---
 *
 * ZASADY OD 25.10.2026 (prośba właściciela: wszystkie kupony ok. 2,5 i mniej meczów na kuponie;
 * nasze kursy to mediana bukmacherów z API-Football, a u polskich bukmacherów kurs bywa niższy,
 * do tego 12% podatku od stawki — więc „2,0 u nas" to u gracza mniej). Liczby wybrane pomiarem
 * z 24.10.2026 na dzienniku prognoz (`ModelForecast`: plakietka, poranny kurs, wynik), 27 dni
 * od 27.09 do 23.10, plakietki jak na kupon (ligi sprawdzone, mecze 12:00–23:00):
 *
 *   kurs plakietki   typów   model obiecywał   trafione   rynek (1/kurs)
 *   1,05–1,20          93        82,6%            90,3%        88,6%
 *   1,20–1,30          86        77,0%            80,2%        80,5%
 *   1,30–1,40          73        73,6%            76,7%        74,6%
 *   1,40–1,50          51        70,5%            56,9%        69,7%
 *   1,50–1,60          34        70,9%            52,9%        64,9%
 *   1,60–1,80          26        66,2%            50,0%        60,2%
 *
 * 1. GÓRNA GRANICA KURSU TYPU ZOSTAJE 1,40. Poniżej model trafia tyle, ile obiecuje (albo więcej),
 *    od 1,40 — o 13–18 pkt mniej. Wyższa granica dałaby kupon ~2,5 z mniejszej liczby typów, ale
 *    w symulacji kupony z typami do 1,45 i 1,50 wchodziły wyraźnie rzadziej (niżej liczby).
 * 2. NOWE: RYNEK CO NAJMNIEJ TAK PEWNY JAK MODEL — kurs typu nie wyższy niż uczciwy kurs według
 *    modelu (100 / szansa). W przedziale 1,05–1,40 typy, przy których model był pewniejszy od
 *    bukmacherów, trafiły 73% (51/70) przy obiecanych 83%, a pozostałe 87% (158/182) przy
 *    obiecanych 76%. To odwrotność „value bettingu": nie bierzemy typów, przy których bukmacher
 *    płaci więcej, niż wynika z modelu — tam model myli się częściej, niż przyznaje (ta sama
 *    lekcja co przy kursach ≥ 1,50, `lib/model/README.md`).
 * 3. KURS ŁĄCZNY 2,4–2,8 DLA WSZYSTKICH TRZECH, JAK NAJMNIEJ TYPÓW (dnia najwyżej 4, 3- i 5-dniowy
 *    najwyżej 5), a przy tej samej liczbie — zestaw z najwyższą szansą modelu. Przy tym samym
 *    kursie łącznym mniej typów to mniej razy zapłacona marża bukmachera. Typ z kursem do 1,40
 *    oznacza co najmniej trzy typy na kupon (1,40³ ≈ 2,74).
 *
 * SYMULACJA na tych samych 27 dniach (kupon składany o 9:30 z plakietek z porannym kursem
 * i wynikiem; kolejne kupony dnia bez meczów z wcześniejszych):
 *
 *   zasady                     kupon    dni z kuponem   śr. kurs   śr. typów   weszło   typy trafione
 *   do 24.10 (2,0/2,0/3,0)     dnia        20/27          2,28        4,6       7/20     83% (obiec. 82%)
 *                              3-dn.       24/25          2,18        5,3       8/24     84% (obiec. 85%)
 *                              5-dn.       22/23          3,24        7,5       4/22     83% (obiec. 85%)
 *   od 25.10 (2,4–2,8)         dnia        13/27          2,47        3,6       7/13     87% (obiec. 74%)
 *                              3-dn.       25/25          2,44        3,6      12/25     82% (obiec. 75%)
 *                              5-dn.       23/23          2,43        3,4      10/23     81% (obiec. 74%)
 *
 * Razem nowe kupony: weszło 29/61, typy 83% przy obiecanych 74%. Te same zasady z granicą typu
 * 1,45 — 22/63 (typy 74%), z 1,50 — 19/65 (67%); bez warunku z pkt 2 — 26/65, typy 74% przy
 * obiecanych 78%; granica 1,60 bez warunku (kupon z 2–3 typów) — 13/70, typy 60%.
 * PRÓBA JEST MAŁA: kilkadziesiąt kuponów, a 3- i 5-dniowe z sąsiednich dni dzielą mecze —
 * różnice kuponów mieszczą się w przypadku; pewniejsze są liczby typów z tabeli wyżej. Cena
 * nowych zasad: kupon dnia w historii wychodził co drugi dzień (w dni z kilkoma plakietkami nie
 * ma z czego go złożyć). Od 22.10 w pełnej ofercie jest 19 lig więcej, więc pula dnia rośnie;
 * brak kuponu to i tak uczciwa odpowiedź. Kupony opublikowane wcześniej się nie zmieniają.
 *
 * O SZANSIE I TAK DECYDUJE GŁÓWNIE ŁĄCZNY KURS — kurs 2,5 bukmacher ustawia tak, żeby znaczył
 * ok. 40%. Dlatego obok kursu zawsze stoi szansa, a kupon nie obiecuje więcej, niż mówi rynek.
 */

export const COUPON_TYPES = {
	/** Mecze z dnia publikacji. Za darmo dla wszystkich. Od 21.11.2026 2,0–2,5 z 2–3 meczów (nagłówek). */
	daily: { target: 2.0, max: 2.5, maxLegs: 3, days: 1 },
	/** Z 3 dni od publikacji — Pro, VIP i okres próbny. Od 21.11.2026 jak kupon dnia. */
	days3: { target: 2.0, max: 2.5, maxLegs: 3, days: 3 },
	/**
	 * Z 5 dni — szersza pula częściej pozwala na kupon z trzech mocnych typów. Pro, VIP, okres próbny.
	 * Jedyny z dodatnim bilansem po 25.10 (8/19), więc zostaje przy 2,4–2,8 i nogach do 1,40.
	 */
	days5: { target: 2.4, max: 2.8, maxLegs: 5, days: 5, legMaxOdds: 1.4 },
	/** Piątek–niedziela, do 18.10.2026; zastąpiony przez 3-dniowy. Zostaje dla historii. */
	weekend: { target: 3.0, max: 3.9, maxLegs: 8, days: 3 },
};

/** Kupony w planie z liczbami (Pro, VIP, okres próbny) — przed rozliczeniem za kłódką. */
export const PAID_COUPON_TYPES = new Set(['days3', 'days5', 'live']);
/** Kolejność tworzenia i wyświetlania; kupon dalej na liście nie powtarza meczów z wcześniejszych. */
export const ACTIVE_COUPON_TYPES = ['daily', 'days3', 'days5'];
/**
 * Kupony serwisu — jedyne, które wchodzą do publicznej skuteczności, bilansów i znaczników przy
 * meczach. Własne kupony użytkowników (`custom`, kreator — `lib/coupons/custom.js`) NIGDY: każdy
 * może składać je do skutku i chwalić się tymi, które weszły, więc liczone w publicznym bilansie
 * zamieniłyby go w „wybieranie udanych". Rozlicza je ten sam przebieg, bilans widzi tylko właściciel.
 */
export const PUBLIC_COUPON_TYPES = ['daily', 'days3', 'days5', 'weekend', 'live'];

/**
 * Typ na kupon: kurs coś wnosi (≥ 1,05) i jest poniżej `LEG_MAX_ODDS`. Od 21.11.2026 granica 1,60
 * (kupon dnia, 3-dniowy, kreator) — z szansą z kursu nogi 1,40–1,60 trafiają tyle, ile obiecują
 * (tabela na górze); 5-dniowy ma własną granicę 1,40 (`COUPON_TYPES.days5.legMaxOdds`).
 */
export const LEG_MIN_ODDS = 1.05;
export const LEG_MAX_ODDS = 1.6;
/** Najwcześniejszy mecz kuponu startuje najwcześniej godzinę po publikacji. */
export const MIN_LEAD_MS = 60 * 60 * 1000;
/**
 * Tylko mecze, które w Polsce da się obejrzeć: pierwszy gwizdek od 12:00 do 23:00 czasu
 * polskiego (minuty od północy). Bez tego najpewniejsze typy to często nocne mecze MLS
 * i Ameryki Południowej — kupon „na weekend" z meczami o 2:30 w nocy nikogo nie interesuje.
 */
export const LEG_HOURS = { from: 12 * 60, to: 23 * 60 };

const zegar = new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** Minuta dnia (czas polski) pierwszego gwizdka. */
export function kickoffMinute(kickoff) {
	const [h, m] = zegar.format(new Date(kickoff)).split(':').map(Number);
	return h * 60 + m;
}

/** Czy mecz może trafić na kupon — godzina i wyprzedzenie (bez kursu, który sprawdza `buildCoupon`). */
export function legEligible(kickoff, now = new Date()) {
	const minuta = kickoffMinute(kickoff);
	return (
		new Date(kickoff).getTime() - now.getTime() >= MIN_LEAD_MS && minuta >= LEG_HOURS.from && minuta <= LEG_HOURS.to
	);
}

const prod = (xs) => xs.reduce((a, b) => a * b, 1);

/**
 * Czy sam typ (bez godziny meczu) nadaje się na kupon: kurs w widełkach nogi i typ POTWIERDZONY kursem
 * (`chanceConfirmed` z `lib/picks/chance.js` — obie szanse przechodzą próg, przy „gospodarze strzelą"
 * sam sufit). Kandydaci z `couponCandidates` są potwierdzani przed wejściem do puli; tu jest drugi
 * bezpiecznik, bo kreator i testy podają kandydatów same. Pokazana szansa bywa z kursu albo z modelu
 * (`MARKET_CHANCE_KEYS`) — o nogę pyta potwierdzenie, nie źródło liczby. Dawny warunek „kurs × szansa
 * modelu ≤ 100" zniknął 21.11.2026 — nagłówek, pkt 1.
 *
 * @param {{ odds: number, probability: number, chanceConfirmed?: boolean }} c
 * @param {{ maxOdds?: number }} [options] górna granica kursu nogi (5-dniowy: 1,40)
 */
export function legOddsFit(c, { maxOdds = LEG_MAX_ODDS } = {}) {
	return (
		Number.isFinite(c?.odds) &&
		Number.isFinite(c?.probability) &&
		c.chanceConfirmed === true &&
		c.odds >= LEG_MIN_ODDS &&
		c.odds < maxOdds
	);
}

/**
 * Ile węzłów przeszukania najwyżej na jedną liczbę typów. Z odcięciami niżej pula 5 dni
 * (kilkadziesiąt typów) mieści się w ułamku tego; limit jest bezpiecznikiem, nie zasadą.
 */
const MAX_WEZLOW = 200_000;
const EPS = 1e-9;

/**
 * Najlepszy zestaw z puli: NAJMNIEJ TYPÓW, a przy tej samej liczbie — najwyższa szansa modelu
 * (iloczyn), z kursem łącznym w [cel, max]. Przeszukanie dokładne, nie zachłanne: zachłanny
 * wybór „od najpewniejszego" zawsze zaczynał od kursów 1,05–1,15 i do 2,4 potrzebował 6–8 typów.
 *
 * Odcięcia: pula idzie od najpewniejszego, więc gdy kolejny typ nie może już przebić najlepszej
 * szansy, dalsze tym bardziej (koniec pętli); gałąź, której nawet najwyższe kursy z reszty puli
 * nie dociągną do celu, nie jest rozwijana.
 *
 * @param {Array<{ odds: number, probability: number }>} pula posortowana od najpewniejszego, jeden typ na mecz
 * @returns {Array|null}
 */
function najlepszyZestaw(pula, { target, max, maxLegs }) {
	const n = pula.length;
	// iloczynNajwyzszych[i][s] — iloczyn s najwyższych kursów w pula[i..] (górna granica dla s kolejnych typów).
	const iloczynNajwyzszych = new Array(n + 1);
	let najwyzsze = [];
	iloczynNajwyzszych[n] = [1];
	for (let i = n - 1; i >= 0; i--) {
		najwyzsze = [...najwyzsze, pula[i].odds].sort((a, b) => b - a).slice(0, maxLegs);
		const iloczyny = [1];
		for (const o of najwyzsze) iloczyny.push(iloczyny.at(-1) * o);
		iloczynNajwyzszych[i] = iloczyny;
	}
	const sufit = (i, s) => (s === 0 ? 1 : (iloczynNajwyzszych[i]?.[s] ?? 0));

	for (let m = 1; m <= maxLegs; m++) {
		let najlepszy = null;
		let najlepszaSzansa = 0;
		let wezly = 0;
		const wybrane = [];
		const szukaj = (od, kurs, szansa) => {
			if (wybrane.length === m) {
				if (kurs >= target - EPS && szansa > najlepszaSzansa) {
					najlepszy = [...wybrane];
					najlepszaSzansa = szansa;
				}
				return;
			}
			const brakuje = m - wybrane.length;
			for (let j = od; j <= n - brakuje; j++) {
				if (++wezly > MAX_WEZLOW) return;
				const c = pula[j];
				const p = c.probability / 100;
				if (szansa * p <= najlepszaSzansa) break;
				const k = kurs * c.odds;
				if (k > max + EPS) continue;
				if (k * sufit(j + 1, brakuje - 1) < target - EPS) continue;
				wybrane.push(c);
				szukaj(j + 1, k, szansa * p);
				wybrane.pop();
			}
		};
		szukaj(0, 1, 1);
		if (najlepszy) return najlepszy;
	}
	return null;
}

/**
 * Pula typów, z której składa się kupon: tylko z `legOddsFit` i `legEligible` (oraz `accept`, gdy
 * podany), bez meczów z `exclude`, jeden typ na mecz (przy dwóch typach jednego meczu zostaje
 * pewniejszy), od najpewniejszego. Osobno od `buildCoupon`, bo kreator kuponu mówi przy „nie da
 * się", ile typów przeszło zasady — z tej samej puli, a nie z drugiego, podobnego filtra.
 *
 * @param {{ now?: Date, exclude?: Iterable<string>, accept?: (c: object) => boolean, maxOdds?: number }} [options]
 */
export function couponPool(candidates, { now = new Date(), exclude = [], accept = null, maxOdds = LEG_MAX_ODDS } = {}) {
	const pomin = new Set([...exclude].map(String));
	const posortowane = (candidates || [])
		.filter(
			(c) =>
				c &&
				!pomin.has(String(c.fixtureId)) &&
				legOddsFit(c, { maxOdds }) &&
				legEligible(c.kickoff, now) &&
				(!accept || accept(c))
		)
		// Najpewniejsze najpierw; przy remisie niższy kurs (rynek pewniejszy), potem stała kolejność.
		.sort(
			(a, b) =>
				b.probability - a.probability ||
				a.odds - b.odds ||
				new Date(a.kickoff) - new Date(b.kickoff) ||
				String(a.fixtureId).localeCompare(String(b.fixtureId))
		);
	const mecze = new Set();
	return posortowane.filter((c) => !mecze.has(String(c.fixtureId)) && mecze.add(String(c.fixtureId)));
}

/**
 * Składa kupon z kandydatów — albo `null`, gdy nie da się dojść do celu w ramach zasad.
 *
 * Kandydaci to plakietki modelu (ta sama selekcja, którą widać przy meczu na liście) z kursem
 * selekcji. Na kupon idą tylko typy z puli `couponPool`, a z nich zestaw z `najlepszyZestaw`.
 *
 * Kreator kuponu (`lib/coupons/custom.js`) woła TĘ SAMĄ funkcję z widełkami użytkownika (`rules`)
 * i jego oknem godzin oraz ligami (`accept`) — zasady typu i przeszukanie są wspólne, różni się
 * tylko cel i pula.
 *
 * @param {Array<{ fixtureId: string, kickoff: string|Date, probability: number, odds: number }>} candidates
 *   plakietki z kursem selekcji (mediana bukmacherów)
 * @param {{ type: string, rules?: { target: number, max: number, maxLegs: number }, now?: Date,
 *   exclude?: Iterable<string>, accept?: (c: object) => boolean }} options
 *   `rules` — widełki zamiast `COUPON_TYPES[type]` (kreator); `exclude` — mecze, których kupon nie
 *   może użyć (np. 3-dniowy bez meczów z kuponu dnia); `accept` — dodatkowy warunek na typ
 * @returns {null | { legs: Array, totalOdds: number, chance: number }}
 */
export function buildCoupon(candidates, { type, rules = null, now = new Date(), exclude = [], accept = null }) {
	const zasady = rules || COUPON_TYPES[type];
	if (!zasady) return null;
	const pula = couponPool(candidates, { now, exclude, accept, maxOdds: zasady.legMaxOdds ?? LEG_MAX_ODDS });

	const legs = najlepszyZestaw(pula, zasady);
	if (!legs) return null;

	// Na kuponie w kolejności meczów — tak się go czyta i tak rozlicza.
	legs.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
	return {
		legs,
		totalOdds: Number(prod(legs.map((l) => l.odds)).toFixed(2)),
		chance: Math.round(100 * prod(legs.map((l) => l.probability / 100))),
	};
}

/** Statusy dostawcy: mecz się nie odbył — typ liczony jak kurs 1,00 (jak u bukmachera). */
const NIE_ODBYL = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO']);
const ROZEGRANY = new Set(['FT', 'AET', 'PEN']);

/**
 * Wynik jednego typu z wiersza `fixtures?ids=` dostawcy. Rozliczenie po 90 minutach: przy
 * dogrywce i karnych bierzemy wynik z regulaminowego czasu (`score.fulltime`).
 *
 * @returns {{ status: 'won'|'lost'|'void', score: string|null } | null} `null` — jeszcze nie wiadomo
 */
export function legResult(leg, row) {
	const status = row?.fixture?.status?.short;
	if (!status) return null;
	if (NIE_ODBYL.has(status)) return { status: 'void', score: null };
	if (!ROZEGRANY.has(status)) return null;
	const pelny = status === 'FT' ? row.goals : row.score?.fulltime || row.goals;
	const h = pelny?.home;
	const a = pelny?.away;
	const weszlo = settleSelection(HINT_TO_SELECTION[leg.key], h, a);
	if (weszlo === null) return { status: 'void', score: null };
	return { status: weszlo ? 'won' : 'lost', score: `${h}:${a}` };
}

/**
 * Stan całego kuponu z typów: przegrany od pierwszego chybionego, wygrany, gdy wszystkie
 * rozegrane weszły (odwołane liczą się jak 1,00), anulowany, gdy nic się nie odbyło.
 */
export function couponStatus(legs) {
	if (!legs?.length) return 'pending';
	if (legs.some((l) => l.status === 'lost')) return 'lost';
	if (legs.some((l) => l.status === 'pending')) return 'pending';
	if (legs.every((l) => l.status === 'void')) return 'void';
	return 'won';
}

/**
 * Dorobek z rozliczonych kuponów (`{ type, status }`) — tylko rodzaje z publicznego bilansu
 * (`PUBLIC_COUPON_TYPES`). Kupony z kreatora (`custom`) nie mają tu swojego klucza i nie doliczają
 * się do żadnego innego, nawet gdyby zapytanie do bazy je przepuściło.
 */
export function couponRecordFrom(rows) {
	const rekord = (type) => {
		const r = (rows || []).filter((x) => x.type === type && (x.status === 'won' || x.status === 'lost'));
		return { won: r.filter((x) => x.status === 'won').length, total: r.length };
	};
	return Object.fromEntries(PUBLIC_COUPON_TYPES.map((type) => [type, rekord(type)]));
}

/** Łączny kurs po rozliczeniu — odwołane mecze wypadają (kurs 1,00). */
export function settledOdds(legs) {
	return Number(prod(legs.filter((l) => l.status !== 'void').map((l) => l.odds)).toFixed(2));
}
