import { inPlayMarkets, predictMarkets } from '@/lib/model/dixonColes';

/**
 * KUPON LIVE — część czysta: kursy na żywo, szanse modelu w trakcie meczu, wybór typów.
 *
 * TE SAME ZASADY CO KUPONY PRZEDMECZOWE (`lib/coupons/build.js`), bo tylko one mają pokrycie
 * w danych: na kupon idą typy, przy których rynek zgadza się z modelem (kurs 1,05–1,40), od
 * najpewniejszego, aż kurs łączny dojdzie do ~2,0 (najwyżej 3,0). Gdy kuponu nie da się złożyć
 * — najlepszy pojedynczy typ (kurs 1,30–2,10). Gdy i tego nie ma — lista przyjętych typów
 * (`top`) albo uczciwe „teraz nic wartego uwagi".
 *
 * ZGODA Z RYNKIEM: RYNEK CO NAJMNIEJ TAK PEWNY JAK MY (`LIVE_AGREEMENT`, od 24.10.2026). Pierwsza
 * wersja przyjmowała typ, gdy nasze wyliczenie było najwyżej 3 pkt PONIŻEJ rynku, a dowolnie
 * powyżej — czyli wybierała mecze, w których bukmacherzy są mniej pewni niż my. Na żywo to
 * odwrotność rozsądku: rynek widzi przebieg gry (naciski, strzały, kontuzje), model tylko wynik
 * i minutę. Pomiar 24.10.2026 (292 trwające mecze, 191 z kursami): typy w ligach modelu
 * z kursem 1,05–2,10 — zgodne ±3/6 pkt: 40, rynek pewniejszy o 4–19 pkt: 54, o 20+: 13, model
 * pewniejszy o 7+: 12 — odrzucano głównie te, przy których przebieg meczu wspiera typ. Na
 * kuponach przedmeczowych to samo zmierzyliśmy na wynikach: typy z rynkiem pewniejszym od
 * modelu trafiały 87% (obiecane 76%), z modelem pewniejszym — 73% (obiecane 83%). Szansa
 * pokazywana przy typie to nasze wyliczenie — przy tej zasadzie nie wyższe niż rynek + 3 pkt.
 *
 * MODEL W TRAKCIE MECZU. `inPlayMarkets` bierze siły drużyn sprzed meczu i doliczony stan:
 * wynik i minutę. NIE WIE O CZERWONYCH KARTKACH — dlatego typ na drużynę, która gra w
 * osłabieniu, zawsze odpada (`legVeto`), a statystyki meczu ocenia jeszcze AI (`service.js`).
 *
 * LIGI POZA MODELEM. Model zna tylko ligi z `LEAGUE_TIERS`, a o danej porze na żywo częściej grają inne (wieczorem
 * 3 z 35 trwających meczów były „nasze"). Dla pozostałych siły drużyn bierzemy z kursów SPRZED
 * meczu (`lambdasFromOdds`) i dokładamy wynik oraz minutę — źródło `market`. To słabszy punkt
 * odniesienia niż model; zgoda ta sama co dla modelu (`LIVE_AGREEMENT`).
 * Mecze młodzieżowe, kobiece, rezerw i towarzyskie odpadają (słabe kursy, mało statystyk).
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
/** Ile przyjętych typów oddaje generator obok kuponu — lista dla asystenta („3 mecze z live"). */
export const LIVE_TOP = 6;
/** Regulaminowy czas gry — tylko w nim model w trakcie meczu (wynik + minuta) ma sens. */
export const STATUSY_GRY = new Set(['1H', 'HT', '2H']);

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

/**
 * Zgoda z rynkiem live (oba źródła): nasze wyliczenie najwyżej `above` pkt powyżej szansy z kursu
 * live i najwyżej `below` pkt poniżej. Większa luka w dół to sygnał, że dzieje się coś, czego nie
 * widzimy wcale (np. świeża kontuzja) — wtedy typu nie bierzemy, mimo że rynek go lubi.
 */
export const LIVE_AGREEMENT = { above: 3, below: 15 };

/** Rozgrywki, których nie typujemy na żywo nawet z kursów sprzed meczu. */
const POMIJANE_ROZGRYWKI = /\bU-?\d{2}\b|women|femin|youth|junior|reserve|friendl/i;

export function liveLeagueOk(leagueName) {
	return Boolean(leagueName) && !POMIJANE_ROZGRYWKI.test(leagueName);
}

/**
 * Oczekiwane gole obu drużyn odczytane z kursów sprzed meczu (1X2, a gdy jest — powyżej 2,5).
 * Marżę zdejmujemy proporcjonalnie, potem siatka (zgrubna i dokładna) po tej samej macierzy
 * Dixona–Colesa co model. `null`, gdy brak 1X2.
 *
 * @param {{ home?: number, draw?: number, away?: number, over25?: number }} odds
 * @returns {{ lambdaHome: number, lambdaAway: number } | null}
 */
export function lambdasFromOdds(odds) {
	const { home, draw, away, over25 } = odds || {};
	if (![home, draw, away].every((v) => Number.isFinite(v) && v > 1)) return null;
	const suma = 1 / home + 1 / draw + 1 / away;
	const cel = { home: 1 / home / suma, away: 1 / away / suma };
	// Bez kursu na „poniżej" zdejmujemy z „powyżej" marżę 1X2 — przybliżenie, ale lepsze niż nic.
	const over = Number.isFinite(over25) && over25 > 1 ? Math.min(0.97, 1 / over25 / suma) : null;

	const blad = (lh, la) => {
		const m = predictMarkets(lh, la);
		const e = (m.matchWinner.home - cel.home) ** 2 + (m.matchWinner.away - cel.away) ** 2;
		return over === null ? e : e + 0.5 * (m.totalGoals[2.5].over - over) ** 2;
	};
	let best = { lh: 1.4, la: 1.1, e: Infinity };
	const szukaj = (od, krok, ile) => {
		const [lh0, la0] = od;
		for (let i = -ile; i <= ile; i += 1) {
			for (let j = -ile; j <= ile; j += 1) {
				const lh = lh0 + i * krok;
				const la = la0 + j * krok;
				if (lh < 0.1 || la < 0.1 || lh > 5 || la > 5) continue;
				const e = blad(lh, la);
				if (e < best.e) best = { lh, la, e };
			}
		}
	};
	szukaj([2.5, 2.5], 0.2, 12);
	szukaj([best.lh, best.la], 0.04, 5);
	szukaj([best.lh, best.la], 0.01, 4);
	return { lambdaHome: Number(best.lh.toFixed(2)), lambdaAway: Number(best.la.toFixed(2)) };
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
 * kuponu i pojedynczy typ. Zgoda z rynkiem: `LIVE_AGREEMENT` (rynek co najmniej tak pewny jak my).
 */
export function liveSelections({ odds, model, redCards, source = 'model' }) {
	const out = [];
	for (const key of LIVE_KEYS) {
		const o = odds?.[key];
		const p = model?.[key];
		if (!Number.isFinite(o) || !Number.isFinite(p)) continue;
		const rynek = 100 / o;
		const mod = 100 * p;
		if (mod > rynek + LIVE_AGREEMENT.above || mod < rynek - LIVE_AGREEMENT.below) continue;
		if (legVeto(key, redCards)) continue;
		out.push({ key, odds: o, market: Math.round(rynek), model: Math.round(mod), source });
	}
	return out;
}

/**
 * Pełna tabela jednego meczu — każda selekcja live z kursem, szansą rynku i wyliczenia, także te,
 * które zasad nie przechodzą (`agrees: false`). Dla asystenta, który pytany o jeden mecz ma pokazać
 * całość, a nie tylko kandydatów na kupon; zgoda liczona tą samą funkcją co kupon (`liveSelections`),
 * więc „zgodne z rynkiem" znaczy tu dokładnie to samo co w generatorze.
 *
 * @returns {Array<{ key: string, odds: number|null, market: number|null, model: number|null, source: string, agrees: boolean, veto: boolean }>}
 */
export function liveMarketsTable({ odds, model, redCards, source = 'model' }) {
	const zgodne = new Set(liveSelections({ odds, model, redCards, source }).map((s) => s.key));
	return LIVE_KEYS.filter((key) => Number.isFinite(odds?.[key]) || Number.isFinite(model?.[key])).map((key) => ({
		key,
		odds: Number.isFinite(odds?.[key]) ? odds[key] : null,
		market: Number.isFinite(odds?.[key]) ? Math.round(100 / odds[key]) : null,
		model: Number.isFinite(model?.[key]) ? Math.round(100 * model[key]) : null,
		source,
		agrees: zgodne.has(key),
		veto: legVeto(key, redCards),
	}));
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

/**
 * Najlepszy pojedynczy typ, gdy kuponu nie ma: kurs 1,30–2,10, najwyższa szansa według nas.
 * Zgodę z rynkiem kandydaci przeszli już w `liveSelections` (bez warunku „model ≥ rynek", który
 * wybierał typy, w które rynek wierzył mniej niż my — patrz nagłówek).
 */
export function bestLiveSingle(candidates) {
	const [najlepszy] = (candidates || [])
		.filter((c) => c.odds >= LIVE_SINGLE.minOdds && c.odds <= LIVE_SINGLE.maxOdds)
		.sort((a, b) => b.model - a.model || a.odds - b.odds);
	return najlepszy || null;
}
