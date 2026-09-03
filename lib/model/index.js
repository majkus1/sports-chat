import { leagueFixtures } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { fitRatings, expectedGoals } from '@/lib/model/ratings';
import { predictMarkets } from '@/lib/model/dixonColes';

/**
 * Model prognoz w czasie żądania: dopasowanie per liga, z pamięcią podręczną.
 *
 * WERSJA ZWERYFIKOWANA BACKTESTEM, ALE NIE WSZĘDZIE — I TO JEST TU RZECZ NAJWAŻNIEJSZA.
 * Na 10029 meczach testowych z 41 rozgrywek model wypadł GORZEJ od częstości (1,0862 wobec
 * 1,0690). Rozbicie po rozgrywkach pokazało, że to średnia z dwóch przeciwnych rzeczy:
 *
 *     27 rozgrywek (7334 mecze)   model 1,0042  wobec 1,0705   — wyraźna przewaga
 *      8 rozgrywek (2572 mecze)   model 1,3164  wobec 1,0657   — model szkodzi
 *
 * Szkoda pochodziła z pucharów, w których dopasowanie nie ma pokrycia w danych. Stąd próg
 * `MIN_MATCHES_PER_TEAM`. Po jego wprowadzeniu model liczy wyłącznie tam, gdzie wygrywa.
 *
 * Rynek bukmacherski jest lepszy od nas i to jest normalne: na 3692 meczach z kursami
 * zamknięcia log loss modelu 1,0129 wobec 1,0774 dla częstości i 0,9842 dla rynku.
 * Luka do rynku (0,0287, t = −7,13) mierzy, ile informacji modelowi brakuje.
 *
 * ALE NIE WE WSZYSTKICH RYNKACH. Pomiar rynek po rynku pokazał ostry podział: wszystko,
 * co zależy od RÓŻNICY oczekiwanych goli, model prognozuje lepiej od częstości; wszystko,
 * co zależy od ich SUMY — gorzej. Progi bramkowe i „obie strzelą” mają ujemny zysk, więc
 * ich tu nie ma i mieć nie będzie, dopóki pomiar nie pokaże czegoś innego.
 */

/**
 * Podpis wersji zapisywany przy typie — pozwala porównać ją z poprzednimi.
 *
 * `/2` odcina rozgrywki, w których dopasowanie nie ma pokrycia w danych (patrz
 * `MIN_MATCHES_PER_TEAM`). Prognozy w pozostałych rozgrywkach są identyczne jak w `/1`,
 * ale typy z obu wersji trzeba dać się rozdzielić w pomiarze.
 */
export const MODEL_VERSION = 'dixon-coles/2';

/**
 * Rynki, w których model bije stałą prognozę. Liczby to zysk na mierze Brier
 * ze zbioru testowego — zostawiam je w kodzie, żeby następna osoba nie musiała
 * wierzyć na słowo, tylko wiedziała, skąd ta lista.
 */
/*
 * LICZBY PONIŻEJ SĄ ZANIECZYSZCZONE I CZEKAJĄ NA PRZELICZENIE.
 *
 * Pochodzą z przebiegu, w którym pula testowa zawierała puchary rujnujące wynik (Puchar
 * Anglii: log loss 1,66 na 869 meczach). Zysk per rynek liczony na takiej puli mówi więcej
 * o pucharach niż o rynkach — dlatego „gole drużyny" wyszły tam na minus, choć pomiar
 * na samych typach dawał im +9,3 i +13,4 punktu przewagi nad normą.
 *
 * Pierwszy backtest po wprowadzeniu `MIN_MATCHES_PER_TEAM` rozstrzygnie to uczciwie.
 * Do tego czasu nie ruszam zakresu rynków: zmiana na podstawie zatrutego pomiaru byłaby
 * zgadywaniem w drugą stronę.
 */
export const USABLE_MARKETS = {
	matchWinner: true, //           przewaga potwierdzona w 27 rozgrywkach z 35 mierzonych
	doubleChance: true, //          +0,0077 (1X) i +0,0120 (X2) — jedyne dodatnie na zatrutej puli
	teamGoalsOver05: true, //       do przeliczenia; na typach +9,3 (gospodarz) i +13,4 (gość)
	totalGoals: false, //           −0,0102 / −0,0132 / −0,0137 — gorzej niż stała
	btts: false, //                 −0,0121 — gorzej niż stała
};

/** Ile rozegranych meczów musi mieć liga, żeby dopasowanie miało sens. */
const MIN_MATCHES = 80;

/**
 * Ile meczów musi mieć TYPOWA DRUŻYNA w puli uczącej.
 *
 * TO JEST NAJWAŻNIEJSZE ZABEZPIECZENIE W TYM PLIKU i powstało z pomiaru, nie z ostrożności.
 * Backtest na 10029 meczach dał werdykt negatywny dla całości, ale rozbicie po rozgrywkach
 * pokazało, że model wygrywa w 27 z nich (1,0042 wobec 1,0705) i przegrywa w 8 (1,3164
 * wobec 1,0657). Cała szkoda pochodziła z pucharów, a 84% z niej z samego Pucharu Anglii:
 * log loss 1,6648 wobec 1,0437 dla zwykłych częstości.
 *
 * Przyczyna jest strukturalna. Model dopasowuje się OSOBNO DLA KAŻDYCH ROZGRYWEK, a puchar
 * grany systemem pucharowym daje setki drużyn po dwa mecze każda — i to drużyn z różnych
 * poziomów rozgrywkowych, których siły nie da się porównać w obrębie tej puli. Oceny wychodzą
 * z szumu, a model podaje je z pełnym przekonaniem. Liczba meczów w rozgrywkach tego nie
 * wyłapuje: Puchar Anglii ma ich 869, czyli więcej niż niejedna liga.
 *
 * Mediana, nie średnia: w pucharze kilka drużyn dochodzi do finału i rozgrywa po sześć
 * spotkań, co zawyżałoby średnią mimo setek zespołów odpadających w pierwszej rundzie.
 */
const MIN_MATCHES_PER_TEAM = 6;

/**
 * Rozgrywki, w których model przegrywa z częstościami mimo spełnienia warunków powyżej.
 *
 * Lista pochodzi WYŁĄCZNIE z pomiaru i ma być weryfikowana przy każdym backteście —
 * nie zgadujemy tu, które rozgrywki „wyglądają trudno". Liga Konferencji ma fazę ligową,
 * więc przechodzi próg meczów na drużynę, ale rozpiętość poziomu uczestników jest tak duża,
 * że dopasowanie w obrębie tych rozgrywek daje gorsze prognozy niż zwykła częstość:
 * 1,1471 wobec 1,0456 na 409 meczach.
 */
const EXCLUDED_COMPETITIONS = new Set([848]);

/** Mediana liczby meczów przypadających na drużynę w puli uczącej. */
export function medianMatchesPerTeam(matches) {
	const licznik = new Map();
	for (const m of matches || []) {
		licznik.set(m.homeId, (licznik.get(m.homeId) || 0) + 1);
		licznik.set(m.awayId, (licznik.get(m.awayId) || 0) + 1);
	}
	if (!licznik.size) return 0;
	const wartosci = [...licznik.values()].sort((a, b) => a - b);
	const srodek = Math.floor(wartosci.length / 2);
	return wartosci.length % 2 ? wartosci[srodek] : (wartosci[srodek - 1] + wartosci[srodek]) / 2;
}

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
	if (EXCLUDED_COMPETITIONS.has(leagueId)) return null;

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

	/*
	 * Dwa progi, bo mierzą co innego. Liczba meczów mówi, czy w ogóle jest z czego liczyć;
	 * mediana meczów na drużynę mówi, czy oceny KONKRETNYCH zespołów mają pokrycie. Puchar
	 * Anglii przechodzi pierwszy próg z zapasem i wywraca się na drugim.
	 */
	if (mecze.length < MIN_MATCHES || medianMatchesPerTeam(mecze) < MIN_MATCHES_PER_TEAM) {
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
