import { leagueFixtures } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { fitRatings, expectedGoals } from '@/lib/model/ratings';
import { predictMarkets } from '@/lib/model/dixonColes';

/**
 * Model prognoz w czasie żądania: dopasowanie per liga, z pamięcią podręczną.
 *
 * WERSJA ZWERYFIKOWANA BACKTESTEM. Na 8715 meczach testowych z 41 rozgrywek (podział
 * po dacie, model przeliczany co 14 dni, wyłącznie na spotkaniach rozegranych wcześniej):
 *
 *     log loss 1X2   1,0348  wobec 1,0717 dla częstości    t = 6,60
 *     trafienia 1X2   49,7%  wobec  43,8%
 *
 * Rynek bukmacherski jest lepszy od nas i to jest normalne: na 3692 meczach z kursami
 * zamknięcia log loss modelu 1,0137 wobec 1,0776 dla częstości i 0,9842 dla rynku.
 * Luka do rynku (0,0295, t = −7,39) mierzy, ile informacji modelowi brakuje.
 *
 * ALE NIE WE WSZYSTKICH RYNKACH. Pomiar rynek po rynku pokazał ostry podział: wszystko,
 * co zależy od RÓŻNICY oczekiwanych goli, model prognozuje lepiej od częstości; wszystko,
 * co zależy od ich SUMY — gorzej. Progi bramkowe i „obie strzelą” mają ujemny zysk, więc
 * ich tu nie ma i mieć nie będzie, dopóki pomiar nie pokaże czegoś innego.
 */

/** Podpis wersji zapisywany przy typie — pozwala porównać ją z poprzednimi. */
export const MODEL_VERSION = 'dixon-coles/1';

/**
 * Rynki, w których model bije stałą prognozę. Liczby to zysk na mierze Brier
 * ze zbioru testowego — zostawiam je w kodzie, żeby następna osoba nie musiała
 * wierzyć na słowo, tylko wiedziała, skąd ta lista.
 */
export const USABLE_MARKETS = {
	matchWinner: true, //           log loss 1,0348 wobec 1,0717, t = 6,60
	doubleChance: true, //          +0,0158 (1X) i +0,0199 (X2) — jedyna wyraźna przewaga
	/*
	 * Gole drużyny: przewaga stopniała do zera przy próbie zwiększonej z 3541 do 8715 meczów.
	 * Gospodarz −0,0008 (był +0,0036), gość +0,0018 (był +0,0046). Wartości tego rzędu są
	 * nieodróżnialne od szumu, więc „model jest tu lepszy" przestało być twierdzeniem
	 * popartym pomiarem. Zostawiam włączone, bo próg wejścia (91% i 82%) i tak dopuszcza
	 * garstkę przypadków — ale to kandydat do wyłączenia przy następnym przebiegu.
	 */
	teamGoalsOver05: true, //        −0,0008 (gospodarz) i +0,0018 (gość) — w granicach szumu
	totalGoals: false, //           −0,0062 / −0,0069 / −0,0068 — gorzej niż stała
	btts: false, //                 −0,0072 — gorzej niż stała
};

/** Ile rozegranych meczów musi mieć liga, żeby dopasowanie miało sens. */
const MIN_MATCHES = 80;

/**
 * Jak długo trzymamy dopasowany model.
 *
 * Sześć godzin to kompromis: wyniki dochodzą wieczorami, więc model przeliczy się przed
 * porannym ruchem, a w ciągu dnia nie płacimy za dopasowanie przy każdej analizie.
 */
const CACHE_TTL_MS = 6 * 3600 * 1000;

/** Pamięć procesu, nie Redis — obiekt z mapą drużyn nie serializuje się tanio. */
const cache = new Map();

/** Mecze zakończone, sprowadzone do tego, czego potrzebuje dopasowanie. */
function toResults(rows) {
	return (rows || [])
		.filter((r) => ['FT', 'AET', 'PEN'].includes(r?.fixture?.status?.short))
		.filter((r) => Number.isFinite(r?.goals?.home) && Number.isFinite(r?.goals?.away))
		.map((r) => ({
			date: r.fixture.date,
			homeId: r.teams?.home?.id,
			awayId: r.teams?.away?.id,
			homeGoals: r.goals.home,
			awayGoals: r.goals.away,
		}));
}

/**
 * Dopasowany model dla ligi; `null`, gdy nie ma z czego liczyć.
 *
 * Bierzemy bieżący sezon i poprzedni. Sam bieżący na starcie rozgrywek to kilka kolejek —
 * za mało, żeby odróżnić drużynę dobrą od takiej, która miała łatwy terminarz. Poprzedni
 * sezon waży mniej dzięki wygaszaniu po dacie, więc nie zakłamuje obrazu po transferach.
 */
export async function getLeagueModel({ leagueId, season }) {
	if (!leagueId || !season) return null;
	if (!LEAGUE_TIERS.has(leagueId)) return null;

	const key = `${leagueId}:${season}`;
	const cached = cache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.model;

	const mecze = [];
	for (const s of [season, season - 1]) {
		try {
			mecze.push(...toResults(await leagueFixtures({ leagueId, season: s })));
		} catch {
			// Brak jednego sezonu nie przekreśla dopasowania — liczymy z tego, co jest.
		}
	}

	if (mecze.length < MIN_MATCHES) {
		cache.set(key, { model: null, expiresAt: Date.now() + CACHE_TTL_MS });
		return null;
	}

	const model = fitRatings(mecze, { referenceDate: new Date() });
	cache.set(key, { model, expiresAt: Date.now() + CACHE_TTL_MS });
	return model;
}

/**
 * Prognoza dla jednego meczu, ograniczona do rynków potwierdzonych backtestem.
 *
 * @returns {Promise<null | { matchWinner, doubleChance, teamGoals, likeliestScore,
 *   lambdaHome: number, lambdaAway: number, known: boolean, matchesUsed: number }>}
 */
export async function predictFixture({ leagueId, season, homeId, awayId }) {
	const model = await getLeagueModel({ leagueId, season });
	if (!model || !homeId || !awayId) return null;

	const eg = expectedGoals(model, homeId, awayId);
	if (!eg) return null;

	const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);

	return {
		matchWinner: rynki.matchWinner,
		doubleChance: rynki.doubleChance,
		// Wyłącznie próg 0.5 — wyższe progi drużynowe nie były sprawdzane backtestem.
		teamGoals: {
			home: rynki.teamGoals.home[0.5],
			away: rynki.teamGoals.away[0.5],
		},
		likeliestScore: rynki.likeliestScore,
		lambdaHome: eg.lambdaHome,
		lambdaAway: eg.lambdaAway,
		/*
		 * `known: false` znaczy, że przynajmniej jedna drużyna nie wystąpiła w danych
		 * uczących i dostała oceny przeciętne. Prognoza wtedy powstaje, ale nie niesie
		 * informacji o tej konkretnej parze — wywołujący ma prawo ją odrzucić.
		 */
		known: eg.known,
		matchesUsed: model.matchesUsed,
		modelVersion: MODEL_VERSION,
	};
}

/** Czyści pamięć podręczną — do testów i do ręcznego przeliczenia po zmianie parametrów. */
export function clearModelCache() {
	cache.clear();
}
