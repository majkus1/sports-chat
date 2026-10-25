import { LEG_HOURS, LEG_MAX_ODDS, MIN_LEAD_MS, couponPool, kickoffMinute } from '@/lib/coupons/build';
import { LEAGUE_GROUPS, leagueGroup } from '@/lib/football/leagues';
import { localDate, localDatesBetween } from '@/lib/time';

/**
 * Kreator kuponu — część czysta: ustawienia użytkownika, widełki kursu, okno godzin, pula
 * i uczciwy powód, gdy kuponu nie da się złożyć. Sieć, baza, limity i AI: `customService.js`.
 *
 * CO TO JEST. Użytkownik planu z kreatorem (Pro, VIP, okres próbny — limit `couponGen`, dziennie)
 * o dowolnej porze składa WŁASNY kupon z meczów, które jeszcze się nie zaczęły: wybiera kurs
 * łączny, najwyżej ile meczów, kiedy mają się zaczynać i z jakich lig. Decyzja właściciela
 * z 25.10.2026.
 *
 * TE SAME ZASADY CO KUPONY SERWISU — nic tu nie jest drugim algorytmem:
 *   - typy to plakietki modelu (te same co na liście meczów) z kursem z `couponCandidates`;
 *   - typ wchodzi tylko z `legOddsFit` (kurs 1,05–1,40 i rynek co najmniej tak pewny jak model —
 *     pomiar w `build.js`) i `legEligible` (mecz najwcześniej za godzinę, pierwszy gwizdek
 *     12:00–23:00 czasu polskiego), jeden typ na mecz;
 *   - wybór robi `buildCoupon` — najmniej typów, potem najwyższa szansa modelu — tylko z widełkami
 *     użytkownika (`rules`) i jego pulą (`accept`);
 *   - przed pokazaniem AI sprawdza wiadomości o każdym typie jak w płatnych kuponach (`composeCoupon`).
 *
 * WIDEŁKI KURSU (`CUSTOM_ODDS`). „Ok. 2,5" to dokładnie przedział kuponów serwisu (2,4–2,8). „Ok. 2,0"
 * zaczyna się od 2,0 — kupon nie może zejść poniżej nazwy — i sięga 2,6: szersza górna granica
 * częściej pozwala na kupon z trzech typów zamiast czterech (mniej razy zapłacona marża), a że
 * przeszukanie bierze NAJWYŻSZĄ szansę, wynik i tak ląduje zwykle tuż nad dolną granicą. „Ok. 3,0" —
 * 2,9–3,6: przy typach do 1,40 trzy typy dają najwyżej 2,74, więc to zawsze co najmniej cztery mecze.
 *
 * NAJWYŻEJ ILE MECZÓW (2–5). Granica typu 1,40 rozstrzyga, ile meczów trzeba NAJMNIEJ: dwa typy dają
 * najwyżej 1,96, więc przy każdym celu kreator potrzebuje co najmniej trzech (przy ~3,0 — czterech).
 * Za mała liczba to od razu „nie da się" z wyjaśnieniem, bez pobierania czegokolwiek (`customPrecheck`).
 *
 * OKNO GODZIN (`CUSTOM_WINDOWS`): dziś do 23:00, dziś wieczorem 18–23, najbliższe 24 h, najbliższe
 * 3 dni (więcej nie — dalej kursy dopiero się pojawiają, a model ligi przelicza się co 6 godzin).
 * Zasada „12:00–23:00" z kuponów serwisu obowiązuje w każdym oknie: nocne mecze MLS i Ameryki
 * Południowej (17.10.2026 tak wyszedł kupon z samych nocnych meczów) zostają poza kuponem.
 * Daty i minuty liczymy w czasie polskim przez `localDate`/`kickoffMinute`, nie „północ + 23 godziny" —
 * w dzień zmiany czasu doba ma 23 albo 25 godzin.
 *
 * ILE RAZY SIĘ DA (symulacja 25.10.2026 na dzienniku prognoz, 28 dni 27.09–24.10, plakietki z porannym
 * kursem, bez sprawdzania wiadomości; „dziś" i „3 dni" złożone o 10:00, „wieczorem" o 16:00):
 *
 *   cel     okno        najwyżej   dni z kuponem   śr. typów   śr. szansa   weszło
 *   ~2,0    dziś          4           18/28          3,1          41%        10/17
 *   ~2,0    3 dni         4           28/28          3,0          45%        10/26
 *   ~2,5    dziś          4 / 5    14/28 / 16/28   3,6 / 3,8       33%      7/13 / 8/15
 *   ~2,5    wieczorem     4 / 5    11/28 / 14/28   3,8 / 4,1       31%      6/11 / 8/14
 *   ~2,5    3 dni         4           27/28          3,4          36%        10/24
 *   ~3,0    dziś          4 / 5     6/28 / 11/28   4,0 / 4,5     29 / 26%    2/6 / 6/11
 *   ~3,0    wieczorem     4 / 5     3/28 /  9/28   4,0 / 4,7     28 / 25%    1/3 / 5/9
 *   ~3,0    3 dni         5           27/28          4,2          28%         9/23
 *
 * Wniosek: „nie da się" jest częste przy ~3,0 w jednym dniu i przy wąskich godzinach — stąd podpowiedzi
 * (więcej meczów, szersze godziny). Próba jest mała, a kupony 3-dniowe z sąsiednich dni dzielą mecze.
 */

/** Cel kursu łącznego → widełki `[target, max]` dla `buildCoupon`. Kolejność jak w kreatorze. */
export const CUSTOM_ODDS = [
	{ id: '2.0', nominal: 2.0, target: 2.0, max: 2.6 },
	{ id: '2.5', nominal: 2.5, target: 2.4, max: 2.8 },
	{ id: '3.0', nominal: 3.0, target: 2.9, max: 3.6 },
];

/** Najwyżej ile meczów może prosić użytkownik. */
export const CUSTOM_LEGS = { min: 2, max: 5 };

/** Okna pierwszego gwizdka, w kolejności kreatora. */
export const CUSTOM_WINDOWS = ['today', 'evening', 'h24', 'days3'];

/** „Dziś wieczorem" — od 18:00 (minuta dnia, czas polski) do końca okna kuponów (23:00). */
export const EVENING_FROM = 18 * 60;

const GODZINY_OKNA = { h24: 24, days3: 72 };

export const CUSTOM_DEFAULTS = { odds: '2.5', legs: 4, window: 'today', leagues: [], skipPublished: false };

/**
 * Ile kursów najwyżej dociągamy z API-Football na jedno złożenie — tylko dla meczów z okna i lig,
 * od najpewniejszych (`couponCandidates`). Mecze najbliższej doby mają zwykle kurs z porannego zdjęcia
 * w dzienniku prognoz, więc budżet idzie głównie na dalsze dni; kursy są w pamięci 10 minut.
 */
export const CUSTOM_FETCH_BUDGET = { today: 30, evening: 20, h24: 40, days3: 60 };

const EPS = 1e-9;

export function customOdds(id) {
	return CUSTOM_ODDS.find((o) => o.id === id) || null;
}

/** Najmniej ilu typów do 1,40 potrzeba, żeby kurs łączny sięgnął `target` (1,40² = 1,96 < 2,0). */
export function minLegsFor(target) {
	let m = 1;
	while (LEG_MAX_ODDS ** m < target - EPS) m += 1;
	return m;
}

const pusty = (v) => v === undefined || v === null || v === '';

/**
 * Ustawienia z formularza, trasy albo asystenta → postać kanoniczna. Brak pola — wartość domyślna;
 * zła wartość — błąd z nazwą pola (bez zgadywania, co autor miał na myśli).
 *
 * @returns {{ ok: true, params: { odds: string, legs: number, window: string, leagues: string[], skipPublished: boolean } }
 *   | { ok: false, errors: string[] }}
 */
export function parseCustomParams(raw) {
	const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	const errors = [];
	const params = { ...CUSTOM_DEFAULTS, leagues: [] };

	if (!pusty(r.odds)) {
		const n = Number(String(r.odds).replace(',', '.'));
		const cel = CUSTOM_ODDS.find((o) => Math.abs(o.nominal - n) < EPS);
		if (cel) params.odds = cel.id;
		else errors.push('odds');
	}
	if (!pusty(r.legs)) {
		const n = Number(r.legs);
		if (Number.isInteger(n) && n >= CUSTOM_LEGS.min && n <= CUSTOM_LEGS.max) params.legs = n;
		else errors.push('legs');
	}
	if (!pusty(r.window)) {
		if (CUSTOM_WINDOWS.includes(r.window)) params.window = r.window;
		else errors.push('window');
	}
	if (!pusty(r.leagues)) {
		const znane = LEAGUE_GROUPS.map((g) => g.id);
		if (!Array.isArray(r.leagues) || r.leagues.length > znane.length || r.leagues.some((x) => !znane.includes(x))) {
			errors.push('leagues');
		} else {
			// Stała kolejność i bez powtórzeń; wszystkie grupy naraz to to samo co „wszystkie ligi".
			const wybrane = znane.filter((id) => r.leagues.includes(id));
			params.leagues = wybrane.length === znane.length ? [] : wybrane;
		}
	}
	if (!pusty(r.skipPublished)) {
		if (typeof r.skipPublished === 'boolean') params.skipPublished = r.skipPublished;
		else errors.push('skipPublished');
	}
	return errors.length ? { ok: false, errors } : { ok: true, params };
}

/** Widełki dla `buildCoupon`: cel i górna granica z `CUSTOM_ODDS`, najwyżej `legs` typów. */
export function customRules(params) {
	const cel = customOdds(params.odds);
	return { target: cel.target, max: cel.max, maxLegs: params.legs };
}

/**
 * Czy mecz z pierwszym gwizdkiem `kickoff` mieści się w oknie (bez wyprzedzenia i godzin 12–23,
 * które dokłada `legEligible` w puli). „Dziś" i „wieczorem" — ten sam dzień w czasie polskim.
 */
export function windowAccepts(okno, kickoff, now = new Date()) {
	const k = new Date(kickoff);
	const t = k.getTime();
	if (!Number.isFinite(t) || t < now.getTime()) return false;
	if (okno === 'today' || okno === 'evening') {
		if (localDate(k) !== localDate(now)) return false;
		const minuta = kickoffMinute(k);
		return minuta <= LEG_HOURS.to && (okno === 'today' || minuta >= EVENING_FROM);
	}
	const godzin = GODZINY_OKNA[okno];
	return Boolean(godzin) && t <= now.getTime() + godzin * 3600_000;
}

/** Dni (czas polski), z których trzeba pobrać plakietki dla okna. */
export function windowDates(okno, now = new Date()) {
	if (okno === 'today' || okno === 'evening') return [localDate(now)];
	return localDatesBetween(now, new Date(now.getTime() + (GODZINY_OKNA[okno] || 24) * 3600_000));
}

/**
 * Czy w oknie zostało jeszcze miejsce na mecz z godziną wyprzedzenia. „Dziś" i „wieczorem" po 22:00
 * są puste (ostatni dopuszczony gwizdek to 23:00); 24 godziny i 3 dni zawsze obejmują jakieś 12–23.
 */
export function windowOpen(okno, now = new Date()) {
	if (GODZINY_OKNA[okno]) return true;
	const start = new Date(now.getTime() + MIN_LEAD_MS);
	return localDate(start) === localDate(now) && kickoffMinute(start) <= LEG_HOURS.to;
}

/** Warunek na typ (i na plakietkę przed dociąganiem kursów): okno godzin i wybrane grupy lig. */
export function customAccept(params, now = new Date()) {
	const ligi = new Set(params.leagues || []);
	return (c) => windowAccepts(params.window, c.kickoff, now) && (!ligi.size || ligi.has(leagueGroup(c.leagueId)));
}

/** Podpowiedzi przy „nie da się" — klucze do tekstów w `couponBuilderContent().suggest`. */
function podpowiedzi(params, reason) {
	if (reason === 'too_few_legs') return ['legs'];
	if (reason === 'window_closed') return ['window'];
	if (reason === 'unavailable') return ['retry'];
	const s = [];
	if (params.window !== 'days3') s.push('window');
	if (params.leagues?.length) s.push('leagues');
	if (params.skipPublished) s.push('published');
	if (reason === 'no_combo' || reason === 'news_dropped') {
		if (params.legs < CUSTOM_LEGS.max) s.push('legs');
		s.push('odds');
	}
	return s;
}

/**
 * „Nie da się" zanim cokolwiek pobierzemy: za mało meczów na ten kurs albo okno już puste.
 * @returns {null | { reason: string, needed?: number, suggest: string[] }}
 */
export function customPrecheck(params, now = new Date()) {
	const potrzeba = minLegsFor(customOdds(params.odds).target);
	if (params.legs < potrzeba) return { reason: 'too_few_legs', needed: potrzeba, suggest: podpowiedzi(params, 'too_few_legs') };
	if (!windowOpen(params.window, now)) return { reason: 'window_closed', suggest: podpowiedzi(params, 'window_closed') };
	return null;
}

/**
 * Dlaczego z dostępnych meczów nie wyszedł kupon — z liczb, które już mamy (bez nowych zapytań).
 *
 * @param {{ params: object, stats: object, candidates: Array, now: Date, exclude?: string[], newsCheck?: object|null }} input
 *   `stats` z `couponCandidates` (`entries` — plakietki w oknie i ligach, `withOdds`, `failed`),
 *   `exclude` — mecze wyłączone PRZED sprawdzaniem wiadomości (kupony serwisu)
 * @returns {{ reason: 'unavailable'|'no_matches'|'few_picks'|'news_dropped'|'no_combo', counts: object,
 *   partial: boolean, dropped: Array, suggest: string[] }}
 */
export function customDiagnosis({ params, stats, candidates, now = new Date(), exclude = [], newsCheck = null }) {
	const potrzeba = minLegsFor(customOdds(params.odds).target);
	const pula = couponPool(candidates, { now, exclude, accept: customAccept(params, now) });
	const counts = { matches: stats?.entries ?? 0, withOdds: stats?.withOdds ?? 0, picks: pula.length, needed: potrzeba };
	const dropped = newsCheck?.dropped || [];
	const reason = !counts.matches
		? stats?.failed
			? 'unavailable'
			: 'no_matches'
		: dropped.length
			? 'news_dropped'
			: pula.length < potrzeba
				? 'few_picks'
				: 'no_combo';
	return {
		reason,
		counts,
		// Część kursów nie przyszła — „nie da się" może być chwilowe; mówimy to wprost.
		partial: Boolean(stats?.failed) && reason !== 'unavailable',
		dropped,
		suggest: podpowiedzi(params, reason),
	};
}

/** Klucz zapisu: jeden kupon na użytkownika i chwilę złożenia (blokada nie dopuszcza dwóch naraz). */
export function customKey(userId, now = new Date()) {
	return `custom:${userId}:${now.getTime()}`;
}

/** Czy dwa kupony mają te same typy (mecz i selekcja) — powtórzone złożenie nie zużywa limitu. */
export function sameLegs(a, b) {
	const podpis = (legs) =>
		(legs || [])
			.map((l) => `${l.fixtureId}:${l.key}`)
			.sort()
			.join('|');
	return Boolean(a?.length) && podpis(a) === podpis(b);
}

/**
 * Bilans własnych kuponów: ile weszło z ilu rozliczonych, ile w grze, średni kurs i średnia szansa,
 * którą zapowiadał model — obok siebie, żeby „weszło 2 z 10" dało się porównać z obietnicą.
 */
export function customSummary(rows) {
	const lista = rows || [];
	const rozliczone = lista.filter((r) => r.status === 'won' || r.status === 'lost');
	const won = rozliczone.filter((r) => r.status === 'won').length;
	const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
	const kurs = srednia(rozliczone.map((r) => r.totalOdds).filter(Number.isFinite));
	const szansa = srednia(rozliczone.map((r) => r.chance).filter(Number.isFinite));
	return {
		total: lista.length,
		won,
		lost: rozliczone.length - won,
		settled: rozliczone.length,
		pending: lista.filter((r) => r.status === 'pending').length,
		void: lista.filter((r) => r.status === 'void').length,
		hitRate: rozliczone.length ? Math.round((100 * won) / rozliczone.length) : null,
		avgOdds: kurs === null ? null : Number(kurs.toFixed(2)),
		avgChance: szansa === null ? null : Math.round(szansa),
	};
}
