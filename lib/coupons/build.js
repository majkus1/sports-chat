import { HINT_TO_SELECTION, settleSelection } from '@/lib/model/oddsShadow';
import { APP_TIMEZONE } from '@/lib/time';

/**
 * Kupony (dnia, 3-dniowy, 5-dniowy) — część czysta: wybór typów i rozliczenie.
 *
 * SKĄD TE ZASADY (pomiar na żywych danych od 27.09.2026, `ModelForecast` + poranne kursy):
 * plakietki z kursem poniżej 1,40 trafiają tyle, ile obiecuje model (poniżej 1,20 — 92%,
 * 1,20–1,35 — 82%), a powyżej 1,50 model przesadza (47% przy obiecanych ~67%). Kupon składamy
 * więc wyłącznie z typów, przy których rynek zgadza się z modelem, od najpewniejszego, aż
 * łączny kurs dojdzie do celu. Wtedy szansa całego kuponu jest uczciwa: kupony ~2,0 weszły
 * w 53–57% dni przy zapowiadanych ~45%, kupony ~3,0 w ~35% przy zapowiadanych ~30%.
 *
 * O SZANSIE DECYDUJE GŁÓWNIE ŁĄCZNY KURS — bukmacher ustawia kurs 3,0 tak, żeby znaczył ~30%.
 * Szersza pula pomaga dopiero przy wyższym kursie (symulacja 18.10.2026, 20 dni): przy ~2,0
 * pula 1 dnia i 3 dni dały po 44%, przy ~3,0 jeden dzień — 10%, trzy dni — 22%, pięć — 25%;
 * od ~4,0 kupony prawie nie wchodziły. Stąd 3-dniowy celuje w 2,0 (najpewniejsze typy z trzech
 * dni), a 5-dniowy w 3,0 (tam szeroka pula robi różnicę). Obok kursu zawsze stoi szansa.
 */

export const COUPON_TYPES = {
	/** Mecze z dnia publikacji. Za darmo dla wszystkich. */
	daily: { target: 2.0, max: 2.6, maxLegs: 6, days: 1 },
	/** Najpewniejsze typy z 3 dni od publikacji — Pro, VIP i okres próbny. */
	days3: { target: 2.0, max: 2.6, maxLegs: 8, days: 3 },
	/** Z 5 dni — szersza pula pozwala dojść do ~3,0 samymi pewnymi typami. Pro, VIP, okres próbny. */
	days5: { target: 3.0, max: 3.9, maxLegs: 10, days: 5 },
	/** Piątek–niedziela, do 18.10.2026; zastąpiony przez 3-dniowy. Zostaje dla historii. */
	weekend: { target: 3.0, max: 3.9, maxLegs: 8, days: 3 },
};

/** Kupony w planie z liczbami (Pro, VIP, okres próbny) — przed rozliczeniem za kłódką. */
export const PAID_COUPON_TYPES = new Set(['days3', 'days5', 'live']);
/** Kolejność tworzenia i wyświetlania; kupon dalej na liście nie powtarza meczów z wcześniejszych. */
export const ACTIVE_COUPON_TYPES = ['daily', 'days3', 'days5'];

/** Typ na kupon: rynek musi zgadzać się z modelem (kurs < 1,40), a kurs coś wnosić (≥ 1,05). */
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
 * Składa kupon z kandydatów — albo `null`, gdy nie da się dojść do celu w ramach zasad.
 *
 * @param {Array<{ fixtureId: string, kickoff: string|Date, probability: number, odds: number }>} candidates
 *   plakietki z kursem selekcji (mediana bukmacherów)
 * @param {{ type: 'daily'|'weekend', now?: Date, exclude?: Iterable<string> }} options
 *   `exclude` — mecze, których kupon nie może użyć (np. weekendowy bez meczów z kuponu dnia)
 * @returns {null | { legs: Array, totalOdds: number, chance: number }}
 */
export function buildCoupon(candidates, { type, now = new Date(), exclude = [] }) {
	const zasady = COUPON_TYPES[type];
	if (!zasady) return null;
	const pomin = new Set([...exclude].map(String));
	const pula = (candidates || [])
		.filter(
			(c) =>
				c &&
				!pomin.has(String(c.fixtureId)) &&
				Number.isFinite(c.odds) &&
				c.odds >= LEG_MIN_ODDS &&
				c.odds < LEG_MAX_ODDS &&
				Number.isFinite(c.probability) &&
				legEligible(c.kickoff, now)
		)
		// Najpewniejsze najpierw; przy remisie niższy kurs (rynek pewniejszy).
		.sort((a, b) => b.probability - a.probability || a.odds - b.odds);

	const legs = [];
	const mecze = new Set();
	let kurs = 1;
	for (const c of pula) {
		if (mecze.has(String(c.fixtureId))) continue;
		// Typ przebijający górną granicę pomijamy, gdy kupon jest już blisko celu — szukamy mniejszego.
		if (kurs * c.odds > zasady.max && kurs >= zasady.target * 0.9) continue;
		legs.push(c);
		mecze.add(String(c.fixtureId));
		kurs *= c.odds;
		if (kurs >= zasady.target || legs.length >= zasady.maxLegs) break;
	}
	if (kurs < zasady.target) return null;

	// Na kuponie w kolejności meczów — tak się go czyta i tak rozlicza.
	legs.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
	return {
		legs,
		totalOdds: Number(kurs.toFixed(2)),
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
