import { fitRatings, DEFAULT_XI } from '@/lib/model/ratings';
import { leagueFixtures, leagueSeasons } from '@/lib/football/endpoints';

/**
 * PULE ŁĄCZONE — model dla rozgrywek, w których każda drużyna ma za mało meczów.
 *
 * PROBLEM. Model sił drużyn uczy się WEWNĄTRZ jednych rozgrywek. W lidze to działa: dwadzieścia
 * drużyn gra ze sobą po trzydzieści kilka razy. W Lidze Mistrzów drużyna ma osiem meczów fazy
 * ligowej z przeciwnikami z innych lig, a w Lidze Narodów reprezentacja ma sześć spotkań na dwa
 * lata. Oceny wychodziły z szumu (Liga Mistrzów: log loss 1,0859 wobec 1,0205 dla częstości),
 * więc te rozgrywki były wyłączone — akurat te, którymi interesuje się najwięcej ludzi.
 *
 * ROZWIĄZANIE. Siły drużyn szacujemy na WSZYSTKICH ich meczach naraz:
 *
 *   - `europe` — kluby: ligi krajowe Europy razem z pucharami europejskimi. Ligi łączą się
 *     ze sobą przez mecze pucharowe, więc model wie, ile jest wart trzeci zespół Eredivisie
 *     wobec piątego z Serie A. Wcześniejszy przebieg backtestu na jednej wspólnej puli
 *     dawał w Lidze Mistrzów +0,079 log lossu nad częstościami — produkcja tak po prostu
 *     nie liczyła.
 *   - `international` — reprezentacje: mundial, Euro, Liga Narodów, eliminacje, turnieje
 *     kontynentalne i mecze towarzyskie z czterech lat. Reprezentacja gra ~10 razy w roku,
 *     więc okno jest dłuższe, a wygaszanie wolniejsze niż w klubach.
 *
 * Pula SŁUŻY WYŁĄCZNIE rozgrywkom z `predicts`. Mecz ligowy nadal liczy model swojej ligi —
 * ten był zmierzony i nie ma powodu go zmieniać.
 *
 * UCZCIWOŚĆ. Drużyna z mniej niż `minTeamMatches` meczami w oknie jest dla puli „nieznana"
 * i nie dostaje prognozy. To ten sam mechanizm co beniaminek w lidze: prognoza dla drużyny
 * przeciętnej nic nie mówi o tej parze.
 */

/** Ligi krajowe Europy, na których stoi pula klubowa — te z listy rozgrywek serwisu. */
const EUROPE_DOMESTIC = [39, 140, 135, 78, 61, 106, 88, 94, 203, 144, 179, 40, 107, 113, 103, 119, 207, 218, 210, 283, 286];
/** Puchary europejskie: Liga Mistrzów, Liga Europy, Liga Konferencji, Superpuchar UEFA. */
const EUROPE_CUPS = [2, 3, 848, 531];
/** Puchary krajowe — prognoza tylko wtedy, gdy obie drużyny są w puli (czyli z lig powyżej). */
const DOMESTIC_CUPS = [45, 48, 81, 137, 143];

/**
 * Rozgrywki reprezentacji (identyfikatory sprawdzone u dostawcy we wrześniu 2026).
 * Turnieje finałowe są rozgrywane na neutralnym terenie; resztę gra się u siebie i na wyjeździe.
 */
const NATIONAL_TOURNAMENTS = [1, 4, 6, 7, 9, 22]; // mundial, Euro, Puchar Narodów Afryki, Puchar Azji, Copa América, Gold Cup
const NATIONAL_OTHER = [5, 10, 29, 30, 31, 32, 34, 960]; // Liga Narodów, towarzyskie, eliminacje MŚ (5 kontynentów), eliminacje Euro
const FRIENDLIES = 10;

export const POOLS = {
	europe: {
		id: 'europe',
		fit: [...EUROPE_DOMESTIC, ...EUROPE_CUPS],
		predicts: new Set([...EUROPE_CUPS, ...DOMESTIC_CUPS]),
		neutral: new Set(),
		weight: {},
		xi: DEFAULT_XI,
		/** Ile lat danych: bieżący i poprzedni sezon, jak model ligi. */
		windowDays: 730,
		minTeamMatches: 8,
	},
	international: {
		id: 'international',
		fit: [...NATIONAL_TOURNAMENTS, ...NATIONAL_OTHER],
		predicts: new Set([...NATIONAL_TOURNAMENTS, ...NATIONAL_OTHER]),
		neutral: new Set(NATIONAL_TOURNAMENTS),
		/*
		 * Mecz towarzyski waży połowę: reprezentacje rotują w nich składem i grają o nic.
		 * Wciąż niosą informację (to często jedyne mecze między kontynentami), więc nie
		 * wyrzucamy ich, tylko nie pozwalamy im przeważyć eliminacji.
		 */
		weight: { [FRIENDLIES]: 0.5 },
		/*
		 * Połowiczny zanik po ~460 dniach zamiast ~154 w klubach. Reprezentacja gra dziesięć
		 * razy w roku — przy klubowym tempie zapominania mecz z zeszłego lata ważyłby prawie
		 * nic, a to jeden z ostatnich, jakie w ogóle rozegrała.
		 */
		xi: 0.0015,
		windowDays: 1461,
		minTeamMatches: 6,
	},
};

const POOL_BY_LEAGUE = new Map();
for (const pool of Object.values(POOLS)) for (const id of pool.predicts) POOL_BY_LEAGUE.set(id, pool);

/** Pula, która liczy dane rozgrywki, albo `null` — wtedy liczy model samej ligi. */
export function poolFor(leagueId) {
	return POOL_BY_LEAGUE.get(Number(leagueId)) ?? null;
}

const ROZEGRANE = new Set(['FT', 'AET', 'PEN']);

/**
 * Wiersze terminarza jednej ligi → mecze puli (zakończone, z wynikiem). Czyste.
 *
 * `fixtureId` zostaje, bo te same mecze służą potem kontekstowi rynku „powyżej 2,5"
 * (`goals.js`), który szuka po nim strzałów.
 */
export function rowsToPoolMatches(pool, leagueId, rows) {
	const neutral = pool.neutral.has(leagueId);
	const weight = pool.weight[leagueId] ?? 1;
	const out = [];
	for (const r of rows || []) {
		if (!ROZEGRANE.has(r?.fixture?.status?.short)) continue;
		const hg = r.goals?.home;
		const ag = r.goals?.away;
		const homeId = r.teams?.home?.id;
		const awayId = r.teams?.away?.id;
		const t = Date.parse(r.fixture?.date);
		if (!Number.isFinite(hg) || !Number.isFinite(ag) || !homeId || !awayId || !Number.isFinite(t)) continue;
		out.push({
			fixtureId: String(r.fixture.id),
			leagueId,
			date: r.fixture.date,
			t,
			homeId,
			awayId,
			homeGoals: hg,
			awayGoals: ag,
			neutral,
			weight,
		});
	}
	return out;
}

/**
 * Dopasowanie puli na meczach sprzed `referenceDate`. Czyste — to samo w produkcji i backteście.
 *
 * Zwraca model w kształcie `fitRatings`, z dwiema różnicami: w `teams` zostają tylko drużyny
 * z co najmniej `minTeamMatches` meczami w oknie (reszta jest dla `expectedGoals` nieznana),
 * a `teamMatches` mówi, ile meczów w ostatnim roku ma każda z nich — to jest „rozegrane"
 * dla progu `MIN_PLAYED`, bo o pokryciu oceny decyduje pula, nie same rozgrywki.
 */
export function fitPoolModel(pool, matches, { referenceDate = new Date() } = {}) {
	const koniec = new Date(referenceDate).getTime();
	const odKiedy = koniec - pool.windowDays * 86_400_000;
	const rok = koniec - 365 * 86_400_000;
	const wOknie = (matches || []).filter((m) => m.t < koniec && m.t >= odKiedy);
	if (wOknie.length < 200) return null;

	const wszystkie = new Map();
	const wRoku = new Map();
	for (const m of wOknie) {
		for (const id of [m.homeId, m.awayId]) {
			wszystkie.set(id, (wszystkie.get(id) || 0) + 1);
			if (m.t >= rok) wRoku.set(id, (wRoku.get(id) || 0) + 1);
		}
	}

	const model = fitRatings(wOknie, { referenceDate: new Date(koniec), xi: pool.xi });
	if (!model) return null;

	const teams = new Map();
	for (const [id, oceny] of model.teams) {
		if ((wszystkie.get(id) || 0) >= pool.minTeamMatches) teams.set(id, oceny);
	}
	return { ...model, teams, teamMatches: wRoku, pool: pool.id };
}

/**
 * Widok modelu puli dla konkretnych rozgrywek: w turnieju na neutralnym terenie bez przewagi
 * gospodarza. Kopia płytka — oceny drużyn wspólne, zmienia się jeden parametr.
 */
export function poolModelView(pool, leagueId, model) {
	if (!model) return null;
	return pool.neutral.has(Number(leagueId)) ? { ...model, homeAdvantage: 0 } : model;
}

/* ------------------------------------------------------------------ pobieranie */

/**
 * Sezony, które trzeba pobrać dla rozgrywek puli.
 *
 * Kluby: bieżący i poprzedni, jak model ligi (dla Ligi Mistrzów 2026 to Premier League 2026
 * i 2025). Reprezentacje: numeracja sezonów jest nieregularna (eliminacje MŚ 2026 to u dostawcy
 * „2024" albo „2023", Liga Narodów co dwa lata), więc pytamy dostawcę o listę sezonów danych
 * rozgrywek i bierzemy te z okna — zamiast strzelać w lata i płacić za puste odpowiedzi.
 */
async function sezonyDoPobrania(pool, leagueId, season, now) {
	if (pool.id === 'europe') return [season, season - 1];
	const rok = now.getUTCFullYear();
	const najstarszy = rok - Math.ceil(pool.windowDays / 365) - 1;
	try {
		const opis = (await leagueSeasons(leagueId))?.[0];
		const lata = (opis?.seasons || []).map((s) => Number(s.year)).filter((y) => y >= najstarszy && y <= rok + 1);
		return lata;
	} catch {
		return [];
	}
}

/** Wszystkie mecze puli — jedno wywołanie terminarza na rozgrywki i sezon (cache dobowy). */
export async function loadPoolMatches(pool, { season, now = new Date() }) {
	const out = [];
	for (const leagueId of pool.fit) {
		for (const s of await sezonyDoPobrania(pool, leagueId, season, now)) {
			try {
				out.push(...rowsToPoolMatches(pool, leagueId, await leagueFixtures({ leagueId, season: s })));
			} catch {
				// Brak jednych rozgrywek nie przekreśla puli — liczymy z tego, co jest.
			}
		}
	}
	// Ten sam mecz nie może wejść dwa razy (np. sezon zachodzący na dwa lata).
	const seen = new Set();
	return out
		.filter((m) => (seen.has(m.fixtureId) ? false : (seen.add(m.fixtureId), true)))
		.sort((a, b) => a.t - b.t);
}

const CACHE_TTL_MS = 6 * 3600 * 1000;
const cache = new Map();

/**
 * Model puli z pamięci procesu (6 h, jak model ligi) razem z jej meczami — te drugie
 * potrzebne są kontekstowi „powyżej 2,5". Klucz: pula i sezon klubowy albo rok kalendarzowy.
 *
 * @returns {Promise<null | { model: object, matches: Array }>}
 */
export async function getPool(pool, { season, now = new Date() }) {
	const key = pool.id === 'europe' ? `${pool.id}:${season}` : `${pool.id}:${now.getUTCFullYear()}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	// Współbieżne żądania czekają na to samo liczenie zamiast pobierać wszystko po kilka razy.
	const promise = (async () => {
		const matches = await loadPoolMatches(pool, { season, now });
		const model = fitPoolModel(pool, matches, { referenceDate: now });
		return model ? { model, matches } : null;
	})();
	cache.set(key, { value: promise, expiresAt: Date.now() + CACHE_TTL_MS });
	try {
		const value = await promise;
		cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
		return value;
	} catch (error) {
		cache.delete(key);
		throw error;
	}
}

/** Czyści pamięć podręczną — do testów. */
export function clearPoolCache() {
	cache.clear();
}
