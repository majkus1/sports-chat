import { leagueFixtures } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { fitRatings, expectedGoals } from '@/lib/model/ratings';
import { predictMarkets } from '@/lib/model/dixonColes';

/**
 * Model prognoz w czasie żądania: dopasowanie per liga, z pamięcią podręczną.
 *
 * ZWERYFIKOWANY NA TYM, CO FAKTYCZNIE WDRAŻAMY. Backtest dopasowuje model osobno dla
 * każdych rozgrywek i tymi samymi progami co ten plik, więc jego liczby przenoszą się
 * na produkcję. Na 8069 meczach objętych modelem (80,5% puli testowej):
 *
 *     log loss 1X2   1,0301  wobec 1,0730 dla częstości    t = 8,27
 *     trafienia 1X2   49,4%  wobec  43,9%
 *
 * Pozostałe 19,5% to rozgrywki odcięte progami — tam prognozy w ogóle nie wystawiamy,
 * a nie wystawiamy ich gorszych. Rozbicie: 23 rozgrywki z przewagą (6135 meczów, 1,0025
 * wobec 1,0714) i 7 ze stratą (1856 meczów, 1,1035 wobec 1,0793), z czego największa
 * pochodziła z Ligi Mistrzów — stąd wykluczenie pucharów europejskich.
 *
 * Rynek bukmacherski jest lepszy od nas i to jest normalne: na 3692 meczach z kursami
 * zamknięcia log loss modelu 1,0191 wobec 1,0774 dla częstości i 0,9842 dla rynku.
 * Luka do rynku (0,0349, t = −8,15) mierzy, ile informacji modelowi brakuje.
 *
 * ALE NIE WE WSZYSTKICH RYNKACH. Pomiar rynek po rynku pokazał ostry podział: wszystko,
 * co zależy od RÓŻNICY oczekiwanych goli, model prognozuje lepiej od częstości; wszystko,
 * co zależy od ich SUMY — gorzej. Progi bramkowe i „obie strzelą” mają ujemny zysk, więc
 * ich tu nie ma i mieć nie będzie, dopóki pomiar nie pokaże czegoś innego.
 */

/**
 * Podpis wersji zapisywany przy typie — pozwala porównać ją z poprzednimi.
 *
 * Sam rachunek nie zmienił się od `/1`; zmienił się ZAKRES, w którym go stosujemy.
 * `/2` odciął rozgrywki bez pokrycia w danych (`MIN_MATCHES_PER_TEAM`), `/3` puchary
 * europejskie (`EXCLUDED_COMPETITIONS`). Typy z każdej wersji muszą dać się rozdzielić
 * w pomiarze, bo powstawały przy innym zakresie.
 */
export const MODEL_VERSION = 'dixon-coles/3';

/*
 * Rynki, w których model bije stałą prognozę. Liczby to zysk na mierze Brier ze zbioru
 * testowego — zostają w kodzie, żeby następna osoba nie musiała wierzyć na słowo.
 *
 * Policzone na czystej puli: 8069 meczów objętych modelem, bez pucharów, przy dopasowaniu
 * per rozgrywki. Poprzednia wersja tych liczb pochodziła z puli zawierającej Puchar Anglii
 * i pokazywała „gole drużyny" na minusie — ten minus był artefaktem pucharów, nie rynków.
 * Po oczyszczeniu wszystkie cztery dopuszczone rynki wychodzą na plus, a wszystkie zależne
 * od SUMY goli nadal na minus. Podział jest ostry i powtarza się w każdym przebiegu.
 */
export const USABLE_MARKETS = {
	matchWinner: true, //           log loss 1,0301 wobec 1,0730, t = 8,27
	doubleChance: true, //          +0,0156 (1X) i +0,0195 (X2)
	teamGoalsOver05: true, //       +0,0006 (gospodarz) i +0,0039 (gość) — dodatnie, ale cienko
	totalGoals: false, //           −0,0008 / −0,0026 / −0,0026 — gorzej niż stała
	btts: false, //                 −0,0027 — gorzej niż stała
};

/**
 * Ile rozegranych meczów musi mieć liga, żeby dopasowanie miało sens.
 *
 * Eksportowane razem z progiem na drużynę i listą wykluczeń, bo backtest musi odtwarzać
 * DOKŁADNIE te same warunki. Druga kopia tych liczb w narzędziu pomiarowym znaczyłaby,
 * że mierzymy model, którego nie wdrażamy.
 */
export const MIN_MATCHES = 80;

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
export const MIN_MATCHES_PER_TEAM = 6;

/**
 * PUCHARY EUROPEJSKIE — Liga Mistrzów, Liga Europy, Liga Konferencji.
 *
 * Powód jest strukturalny i dotyczy wszystkich trzech tak samo: grają w nich drużyny
 * z różnych lig krajowych, a model dopasowuje się WEWNĄTRZ rozgrywek. Osiem meczów fazy
 * ligowej wystarcza, żeby przejść próg `MIN_MATCHES_PER_TEAM`, ale nie wystarcza, żeby
 * porównać siły zespołów, które przez resztę sezonu grają w zupełnie innych stawkach.
 *
 * Potwierdza to pomiar. Liga Mistrzów: 1,0859 wobec 1,0205 dla częstości na 127 meczach,
 * czyli strata 0,065 — największa wśród rozgrywek, które przeszły progi. Liga Konferencji
 * 1,1471 wobec 1,0456. Liga Europy i Konferencji i tak wypadają zwykle na progu meczów
 * na drużynę; ta lista domyka sprawę niezależnie od tego, ile faza ligowa akurat da.
 *
 * Ostrzeżenie na przyszłość: „+0,079 w Lidze Mistrzów" z wcześniejszych przebiegów było
 * artefaktem. Backtest uczył wtedy JEDEN model na wszystkich ligach naraz, więc uczestnik
 * Ligi Mistrzów miał ocenę ze swoich meczów ligowych. Produkcja tak nie działa i nigdy
 * nie działała.
 *
 * Lista pochodzi z pomiaru i ma być weryfikowana przy każdym backteście — nie zgadujemy,
 * które rozgrywki „wyglądają trudno".
 */
export const EXCLUDED_COMPETITIONS = new Set([2, 3, 848]);

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
