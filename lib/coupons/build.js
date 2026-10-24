import { HINT_TO_SELECTION, settleSelection } from '@/lib/model/oddsShadow';
import { APP_TIMEZONE } from '@/lib/time';

/**
 * Kupony (dnia, 3-dniowy, 5-dniowy) — część czysta: wybór typów i rozliczenie.
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
	/** Mecze z dnia publikacji. Za darmo dla wszystkich. */
	daily: { target: 2.4, max: 2.8, maxLegs: 4, days: 1 },
	/** Z 3 dni od publikacji — Pro, VIP i okres próbny. */
	days3: { target: 2.4, max: 2.8, maxLegs: 5, days: 3 },
	/** Z 5 dni — szersza pula częściej pozwala na kupon z trzech mocnych typów. Pro, VIP, okres próbny. */
	days5: { target: 2.4, max: 2.8, maxLegs: 5, days: 5 },
	/** Piątek–niedziela, do 18.10.2026; zastąpiony przez 3-dniowy. Zostaje dla historii. */
	weekend: { target: 3.0, max: 3.9, maxLegs: 8, days: 3 },
};

/** Kupony w planie z liczbami (Pro, VIP, okres próbny) — przed rozliczeniem za kłódką. */
export const PAID_COUPON_TYPES = new Set(['days3', 'days5', 'live']);
/** Kolejność tworzenia i wyświetlania; kupon dalej na liście nie powtarza meczów z wcześniejszych. */
export const ACTIVE_COUPON_TYPES = ['daily', 'days3', 'days5'];

/**
 * Typ na kupon: kurs coś wnosi (≥ 1,05) i jest poniżej 1,40 — tam model trafia tyle, ile obiecuje.
 * Do tego `marketAgrees` (niżej). Granica 1,40 sprawdzona ponownie 24.10.2026 — tabela na górze.
 */
export const LEG_MIN_ODDS = 1.05;
export const LEG_MAX_ODDS = 1.4;
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
 * Czy bukmacherzy są co najmniej tak pewni typu jak model: kurs nie wyższy niż uczciwy kurs
 * według modelu (100 / szansa). Model 80% → uczciwie 1,25; kurs 1,22 przechodzi, 1,30 — nie.
 * Dlaczego to warunek, a nie zachęta: komentarz na górze pliku (pkt 2).
 */
export function marketAgrees(probability, odds) {
	return Number.isFinite(probability) && Number.isFinite(odds) && odds * probability <= 100 + 1e-9;
}

/** Czy sam typ (bez godziny meczu) nadaje się na kupon: kurs 1,05–1,40 i rynek zgodny z modelem. */
export function legOddsFit(c) {
	return (
		Number.isFinite(c?.odds) && c.odds >= LEG_MIN_ODDS && c.odds < LEG_MAX_ODDS && marketAgrees(c.probability, c.odds)
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
 * Składa kupon z kandydatów — albo `null`, gdy nie da się dojść do celu w ramach zasad.
 *
 * Kandydaci to plakietki modelu (ta sama selekcja, którą widać przy meczu na liście) z kursem
 * selekcji. Na kupon idą tylko te z `legOddsFit` i `legEligible`, jeden typ na mecz (przy dwóch
 * typach jednego meczu zostaje pewniejszy), a z nich zestaw z `najlepszyZestaw`.
 *
 * @param {Array<{ fixtureId: string, kickoff: string|Date, probability: number, odds: number }>} candidates
 *   plakietki z kursem selekcji (mediana bukmacherów)
 * @param {{ type: keyof COUPON_TYPES, now?: Date, exclude?: Iterable<string> }} options
 *   `exclude` — mecze, których kupon nie może użyć (np. 3-dniowy bez meczów z kuponu dnia)
 * @returns {null | { legs: Array, totalOdds: number, chance: number }}
 */
export function buildCoupon(candidates, { type, now = new Date(), exclude = [] }) {
	const zasady = COUPON_TYPES[type];
	if (!zasady) return null;
	const pomin = new Set([...exclude].map(String));
	const posortowane = (candidates || [])
		.filter((c) => c && !pomin.has(String(c.fixtureId)) && legOddsFit(c) && legEligible(c.kickoff, now))
		// Najpewniejsze najpierw; przy remisie niższy kurs (rynek pewniejszy), potem stała kolejność.
		.sort(
			(a, b) =>
				b.probability - a.probability ||
				a.odds - b.odds ||
				new Date(a.kickoff) - new Date(b.kickoff) ||
				String(a.fixtureId).localeCompare(String(b.fixtureId))
		);
	const mecze = new Set();
	const pula = posortowane.filter((c) => !mecze.has(String(c.fixtureId)) && mecze.add(String(c.fixtureId)));

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

/** Łączny kurs po rozliczeniu — odwołane mecze wypadają (kurs 1,00). */
export function settledOdds(legs) {
	return Number(prod(legs.filter((l) => l.status !== 'void').map((l) => l.odds)).toFixed(2));
}
