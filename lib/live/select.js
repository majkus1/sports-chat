import { inPlayMarkets } from '@/lib/model/dixonColes';

/**
 * KUPON LIVE — część czysta: kursy na żywo, szanse modelu w trakcie meczu, wybór typów.
 *
 * TE SAME ZASADY CO KUPONY PRZEDMECZOWE (`lib/coupons/build.js`), bo tylko one mają pokrycie
 * w danych: na kupon idą typy, przy których rynek zgadza się z modelem (kurs 1,05–1,40), od
 * najpewniejszego, aż kurs łączny dojdzie do ~2,0 (najwyżej 3,0). Gdy kuponu nie da się złożyć
 * — najlepszy pojedynczy typ (kurs 1,30–2,10, model co najmniej tyle co rynek). Gdy i tego nie
 * ma — uczciwe „teraz nic wartego uwagi".
 *
 * MODEL W TRAKCIE MECZU. `inPlayMarkets` bierze siły drużyn sprzed meczu i doliczony stan:
 * wynik i minutę. NIE WIE O CZERWONYCH KARTKACH — dlatego typ na drużynę, która gra w
 * osłabieniu, zawsze odpada (`legVeto`), a statystyki meczu ocenia jeszcze AI (`service.js`).
 *
 * BRAK HISTORII. Przed startem (21.10.2026) nie było danych o kuponach live — każdy wygenerowany
 * kupon zapisujemy i rozliczamy publicznie (zakładka „Kupon live"), żeby to sprawdzić.
 */

export const LIVE_LEG_MIN_ODDS = 1.05;
export const LIVE_LEG_MAX_ODDS = 1.4;
export const LIVE_COUPON = { target: 2.0, max: 3.0, maxLegs: 6 };
export const LIVE_SINGLE = { minOdds: 1.3, maxOdds: 2.1 };
/** Minuty, w których typujemy: po 10. (model ma już stan meczu), przed 80. (zostaje gra). */
export const LIVE_MINUTES = { from: 10, to: 80 };
const STATUSY_GRY = new Set(['1H', 'HT', '2H']);

/** Klucze selekcji live — te same co plakietki i kupony, więc rozliczenie jest wspólne. */
export const LIVE_KEYS = ['home', 'away', '1X', 'X2', 'homeScores', 'awayScores', 'over25'];

const kurs = (v) => {
	const n = Number(v);
	return Number.isFinite(n) && n > 1 ? Number(n.toFixed(2)) : null;
};

/**
 * Kursy na żywo jednego meczu z wiersza `odds/live` dostawcy — tylko rynki, które model liczy
 * i które umiemy rozliczyć; zawieszone (`suspended`) pomijamy.
 */
export function liveOddsFromRow(row) {
	const out = {};
	const wartosc = (rynek, nazwa, handicap = null) => {
		const v = (rynek?.values || []).find(
			(x) => x.value === nazwa && !x.suspended && (handicap === null || String(x.handicap) === String(handicap))
		);
		return v ? kurs(v.odd) : null;
	};
	const rynek = (re) => (row?.odds || []).find((o) => re.test(o.name || ''));
	const wynik = rynek(/^Fulltime Result$/i);
	out.home = wartosc(wynik, 'Home');
	out.away = wartosc(wynik, 'Away');
	const podwojna = rynek(/^Double Chance$/i);
	out['1X'] = wartosc(podwojna, 'Home or Draw');
	out.X2 = wartosc(podwojna, 'Away or Draw');
	const gole = rynek(/^(Match Goals|Over\/Under Line)$/i);
	out.over25 = wartosc(gole, 'Over', '2.5');
	const goleGosp = rynek(/^Home Team Goals$/i);
	out.homeScores = wartosc(goleGosp, 'Over', '0.5');
	const goleGosci = rynek(/^Away Team Goals$/i);
	out.awayScores = wartosc(goleGosci, 'Over', '0.5');
	return out;
}

/** Szanse modelu na KOŃCOWY wynik przy obecnym stanie (ułamki). */
export function liveModelMarkets({ lambdaHome, lambdaAway, homeGoals, awayGoals, minute }) {
	const m = inPlayMarkets({ lambdaHome, lambdaAway, homeGoals, awayGoals, minute });
	return {
		home: m.matchWinner.home,
		away: m.matchWinner.away,
		'1X': m.doubleChance['1X'],
		X2: m.doubleChance.X2,
		homeScores: m.teamGoals.home[0.5].over,
		awayScores: m.teamGoals.away[0.5].over,
		over25: m.totalGoals[2.5].over,
	};
}

/** Czy mecz nadaje się do typowania na żywo: gra trwa, minuta 10–80. */
export function liveMinuteOk(status, minute) {
	return STATUSY_GRY.has(status) && Number.isFinite(minute) && minute >= LIVE_MINUTES.from && minute <= LIVE_MINUTES.to;
}

/** Strona, na którą idzie typ — do weta za czerwoną kartkę. `null` przy goli w meczu. */
export function legSide(key) {
	if (key === 'home' || key === '1X' || key === 'homeScores') return 'home';
	if (key === 'away' || key === 'X2' || key === 'awayScores') return 'away';
	return null;
}

/** Weto: drużyna, na którą idzie typ, gra w osłabieniu (model tego nie widzi). */
export function legVeto(key, redCards = { home: 0, away: 0 }) {
	const strona = legSide(key);
	return strona !== null && (redCards[strona] || 0) > 0;
}

/**
 * Wszystkie selekcje meczu z kursem i szansą modelu (procenty) — przed podziałem na nogi
 * kuponu i pojedynczy typ. Zgoda modelu z rynkiem: model nie mniej niż rynek − 3 pkt.
 */
export function liveSelections({ odds, model, redCards }) {
	const out = [];
	for (const key of LIVE_KEYS) {
		const o = odds?.[key];
		const p = model?.[key];
		if (!Number.isFinite(o) || !Number.isFinite(p)) continue;
		const rynek = 100 / o;
		const mod = 100 * p;
		if (mod < rynek - 3) continue;
		if (legVeto(key, redCards)) continue;
		out.push({ key, odds: o, market: Math.round(rynek), model: Math.round(mod) });
	}
	return out;
}

const naKupon = (s) => s.odds >= LIVE_LEG_MIN_ODDS && s.odds < LIVE_LEG_MAX_ODDS;

/**
 * Kupon z kandydatów (jeden typ na mecz, od najpewniejszego według modelu) — albo `null`.
 *
 * @param {Array<{ fixtureId: string, key: string, odds: number, model: number }>} candidates
 */
export function buildLiveCoupon(candidates) {
	const pula = (candidates || []).filter(naKupon).sort((a, b) => b.model - a.model || a.odds - b.odds);
	const legs = [];
	const mecze = new Set();
	let kursLaczny = 1;
	for (const c of pula) {
		if (mecze.has(c.fixtureId)) continue;
		if (kursLaczny * c.odds > LIVE_COUPON.max && kursLaczny >= LIVE_COUPON.target * 0.9) continue;
		legs.push(c);
		mecze.add(c.fixtureId);
		kursLaczny *= c.odds;
		if (kursLaczny >= LIVE_COUPON.target || legs.length >= LIVE_COUPON.maxLegs) break;
	}
	if (kursLaczny < LIVE_COUPON.target) return null;
	return {
		legs,
		totalOdds: Number(kursLaczny.toFixed(2)),
		chance: Math.round(100 * legs.reduce((a, l) => a * (l.model / 100), 1)),
	};
}

/** Najlepszy pojedynczy typ, gdy kuponu nie ma: kurs 1,30–2,10, model ≥ rynek, najwyższa szansa modelu. */
export function bestLiveSingle(candidates) {
	const [najlepszy] = (candidates || [])
		.filter((c) => c.odds >= LIVE_SINGLE.minOdds && c.odds <= LIVE_SINGLE.maxOdds && c.model >= c.market)
		.sort((a, b) => b.model - a.model || a.odds - b.odds);
	return najlepszy || null;
}
