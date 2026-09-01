import { fixturesByDate, predictions } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { predictFixture, MODEL_VERSION } from '@/lib/model';
import { MARKET_MIN_PROBABILITY } from '@/lib/picks/policy';
import { normalizeFixture, normalizePrediction, normalizeTeamForm, normalizeH2H } from '@/lib/football/normalize';

/**
 * Selekcja meczów do raportu — deterministyczna część, bez AI.
 *
 * KURSÓW TU NIE MA I MIEĆ NIE BĘDZIE.
 *
 * Poprzednia wersja budowała pulę z meczów wycenionych przez bukmacherów i przepuszczała
 * dalej tylko te selekcje, w których nasze prawdopodobieństwo przewyższało implikowane
 * przez medianę kursów. To była mechanika „value bets" — nawet jeśli żadna liczba z rynku
 * nie trafiała do treści raportu, decydowała o tym, co użytkownik w nim zobaczy. Dwa powody,
 * dla których to znikło:
 *
 *   1. Spójność. Analiza pojedynczego meczu ocenia go wyłącznie danymi o drużynach —
 *      formą, tabelą, składami, historią. Raport, który po cichu porównywał się z rynkiem,
 *      odpowiadał na inne pytanie niż reszta serwisu.
 *   2. Charakter serwisu. Publikujemy analizy, nie okazje zakładowe; ta granica jest
 *      trzymana w promptach, na blogu i w dokumentach prawnych.
 *
 * Zasada po zmianie: bierzemy mecze z rozgrywek, które obsługujemy, liczymy własne
 * prawdopodobieństwa i zostawiamy te selekcje, które dane wspierają najmocniej. Raport ma
 * pokazywać najciekawsze i najpewniejsze typy, a nie najbardziej opłacalne.
 */

/** Okna czasowe obu typów raportu, w godzinach. */
export const REPORT_WINDOWS = { soon: 24, threeDays: 72 };

/**
 * Górny limit wywołań `predictions` na jeden raport.
 *
 * Pula z trzech dni potrafi mieć 150 meczów, a prognozy to osobne wywołanie na mecz.
 * Wstępnie porządkujemy pulę po randze rozgrywek, więc budżet zużywa się na mecze,
 * o których w ogóle warto pisać.
 */
const PREDICTIONS_BUDGET = 40;

/**
 * Progi selekcji.
 *
 * `MIN_PROBABILITY` jest wyżej niż w wersji z kursami (było 55). Wcześniej niską pewność
 * usprawiedliwiała przewaga nad rynkiem; bez tej podpórki jedynym kryterium zostaje to,
 * jak mocno dane wspierają typ — a 55% to niewiele więcej niż rzut monetą.
 */
const MIN_PROBABILITY = 62;

/**
 * Prognozy dostawcy bywają zgrubne (rozkłady w stylu 45/45/10), przez co suma
 * podwójnej szansy potrafi wyjść 90%+ seryjnie. Wartości bliskie pewności to
 * artefakt danych, nie sygnał — odrzucamy.
 */
const MAX_PROBABILITY = 92;

/**
 * PRÓG ZALEŻY OD RYNKU, BO CZĘSTOŚCI BAZOWE SIĘ RÓŻNIĄ.
 *
 * Jeden wspólny próg wygląda uczciwie, a jest pułapką: „drużyna strzeli gola" zdarza się
 * samo z siebie w 70–79% meczów, więc typ z prawdopodobieństwem 65% jest w tym rynku
 * MNIEJ prawdopodobny niż zwykła średnia ligowa. Przy progu 62% raport zapełnił się takimi
 * typami — 8 na 10 pozycji — dokładnie tak, jak wcześniej zapełniał się podwójnymi szansami.
 *
 * Same liczby i częstości bazowe, z których wynikają, mieszkają w `lib/picks/policy` — tam,
 * gdzie decyduje się o wliczaniu typu do statystyki. Dwie kopie rozjechałyby się przy
 * pierwszej zmianie i raport proponowałby typy, których pomiar i tak by nie uznał.
 */
const NAZWA_NA_TYP = {
	'Wynik meczu': 'matchWinner',
	'Podwójna szansa': 'doubleChance',
	'Gole drużyny': 'teamGoals',
};

/** Próg wejścia dla danego rynku. */
function minProbabilityFor(market) {
	return MARKET_MIN_PROBABILITY[NAZWA_NA_TYP[market]] ?? MIN_PROBABILITY;
}

/** Minimalna próba meczowa obu drużyn w sezonie — poniżej prognozy to zgadywanie. */
const MIN_PLAYED = 4;

/** Ile meczów trafia do raportu po całej selekcji. */
const MAX_CANDIDATES = 14;

/**
 * Ile selekcji z jednego meczu pokazujemy modelowi.
 *
 * Jedna główna i najwyżej dwie zapasowe. Więcej nie ma sensu: rynki jednego meczu są
 * skorelowane, a model i tak wybiera z nich jeden typ.
 */
const MARKETS_PER_MATCH = 3;

/** Młodzieżówki, rezerwy i drugie zespoły — wyniki zbyt loteryjne na raport. */
const EXCLUDED_TEAMS = /U-?\d{2}\b|youth|junior|reserv|\bII$|\bII\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * WŁASNEGO POISSONA TU JUŻ NIE MA.
 *
 * Ten plik liczył kiedyś sam rozkład bramek ze średnich sezonowych, żeby wycenić progi
 * goli i „obie strzelą”. Backtest pokazał, że w tych rynkach nawet porządnie dopasowany
 * model jest gorszy od stałej prognozy — więc typów w nich nie wystawiamy, a rachunek
 * przestał być potrzebny. Prawdopodobieństwa pozostałych rynków przychodzą gotowe
 * z `lib/model`, z jednej macierzy wyników, więc nie ma tu już czego dublować.
 */

/**
 * Rynki jednego meczu z policzonym prawdopodobieństwem.
 *
 * ZAKRES RYNKÓW WYNIKA Z POMIARU, NIE Z WYGODY. Backtest na 3541 meczach porównał każdy
 * rynek z osobna ze stałą prognozą równą jego częstości. Wszystko, co zależy od RÓŻNICY
 * sił drużyn, wypadło lepiej; wszystko, co zależy od SUMY goli — gorzej:
 *
 *     podwójna szansa 1X   +0,0179     powyżej 1.5 gola   −0,0020
 *     podwójna szansa X2   +0,0222     powyżej 2.5 gola   −0,0030
 *     gospodarz strzeli    +0,0036     powyżej 3.5 gola   −0,0007
 *     gość strzeli         +0,0046     obie strzelą       −0,0047
 *
 * Ujemny zysk nie znaczy „trochę słabiej". Znaczy, że różnicowanie prognozy mecz po meczu
 * dokłada szum do liczby, którą i tak znamy z częstości — czyli że typ w tym rynku jest
 * gorszy niż jego brak. Potwierdza to produkcja: `totalGoals 2.5` ma tam 3 trafienia na 10.
 * Dlatego progów bramkowych i „obie strzelą” tu nie ma.
 *
 * `support` mówi, czy za selekcją stoi jeden rachunek, czy dwa niezależne — własny model
 * sił drużyn ORAZ prognoza dostawcy. Zgodność obu jest jedyną kontrolą, jaka nam została
 * po usunięciu kursów.
 */
export function evaluateMarkets({ prediction, formHome, formAway, modelPrediction = null }) {
	const out = [];
	const consider = (market, selection, pModel, { support = 1 } = {}) => {
		if (!Number.isFinite(pModel)) return;
		if (pModel > MAX_PROBABILITY) return;
		if (pModel < minProbabilityFor(market)) return;
		out.push({ market, selection, pModel: Math.round(pModel), support });
	};

	const pct = prediction?.percent || {};

	/*
	 * Prawdopodobieństwa bierzemy z własnego modelu, gdy jest dostępny.
	 *
	 * Prognoza dostawcy schodzi do roli drugiego zdania: nie decyduje o wartości, tylko
	 * potwierdza albo nie. Model bije ją tam, gdzie da się to zmierzyć (log loss 1,0218
	 * wobec 1,0756 dla samych częstości), więc odwrotna kolejność byłaby cofnięciem się.
	 */
	const m = modelPrediction;
	const pModelu = m
		? {
				home: 100 * m.matchWinner.home,
				away: 100 * m.matchWinner.away,
				dc1X: 100 * m.doubleChance['1X'],
				dcX2: 100 * m.doubleChance.X2,
				homeScores: 100 * m.teamGoals.home.over,
				awayScores: 100 * m.teamGoals.away.over,
			}
		: null;

	/** Zgodność modelu z prognozą dostawcy w granicach 10 punktów procentowych. */
	const zgodne = (wlasne, dostawcy) =>
		Number.isFinite(wlasne) && Number.isFinite(dostawcy) && Math.abs(wlasne - dostawcy) <= 10
			? 2
			: 1;

	if (pModelu) {
		consider('Wynik meczu', 'home', pModelu.home, { support: zgodne(pModelu.home, pct.home) });
		consider('Wynik meczu', 'away', pModelu.away, { support: zgodne(pModelu.away, pct.away) });

		const dostawcaDC1X = Number.isFinite(pct.home) && Number.isFinite(pct.draw) ? pct.home + pct.draw : null;
		const dostawcaDCX2 = Number.isFinite(pct.away) && Number.isFinite(pct.draw) ? pct.away + pct.draw : null;
		consider('Podwójna szansa', '1X', pModelu.dc1X, { support: zgodne(pModelu.dc1X, dostawcaDC1X) });
		consider('Podwójna szansa', 'X2', pModelu.dcX2, { support: zgodne(pModelu.dcX2, dostawcaDCX2) });

		// Jedyny rynek bramkowy z potwierdzoną przewagą: czy dana drużyna w ogóle strzeli.
		consider('Gole drużyny', 'Gospodarz powyżej 0.5', pModelu.homeScores);
		consider('Gole drużyny', 'Gość powyżej 0.5', pModelu.awayScores);

		return out;
	}

	/*
	 * Zjazd awaryjny: liga spoza obsługiwanej listy albo za mało rozegranych meczów,
	 * żeby dopasować model. Zostają procenty dostawcy i wyłącznie te dwa rynki, które
	 * z nich wynikają — bez progów bramkowych, bo tych nie umiemy prognozować żadną metodą.
	 */
	consider('Wynik meczu', 'home', pct.home);
	consider('Wynik meczu', 'away', pct.away);
	if (Number.isFinite(pct.home) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', '1X', pct.home + pct.draw);
	}
	if (Number.isFinite(pct.away) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', 'X2', pct.away + pct.draw);
	}

	return out;
}

/**
 * Siła selekcji — czym sortujemy, skoro nie ma już przewagi nad rynkiem.
 *
 * Samo prawdopodobieństwo dałoby raport złożony wyłącznie z podwójnych szans przy 90%,
 * czyli z typów prawdziwych i zupełnie nieciekawych. Dlatego liczy się też, ile
 * niezależnych rachunków wspiera selekcję i jak dużą próbą meczową dysponujemy.
 */
export function selectionScore(entry, { tier, played }) {
	const wsparcie = entry.support >= 2 ? 8 : 0;
	const ranga = tier === 1 ? 5 : 0;
	// Próba powyżej dziesięciu meczów nie dokłada już pewności — stąd sufit.
	const proba = Math.min(played, 12) / 2;
	return entry.pModel + wsparcie + ranga + proba;
}

/** Daty (UTC) pokrywające okno od teraz do `hours` godzin w przód. */
function datesInWindow(hours, now = Date.now()) {
	const out = new Set();
	for (let t = now; t <= now + hours * 3600_000; t += 24 * 3600_000) {
		out.add(new Date(t).toISOString().slice(0, 10));
	}
	out.add(new Date(now + hours * 3600_000).toISOString().slice(0, 10));
	return [...out];
}

/**
 * Buduje listę kandydatów do raportu.
 *
 * @param {{ type: 'soon'|'threeDays' }} options
 * @returns {Promise<{ candidates: Array, poolSize: number, examined: number }>}
 */
export async function buildReportCandidates({ type }) {
	const hours = REPORT_WINDOWS[type] ?? REPORT_WINDOWS.soon;
	const now = Date.now();
	const windowEnd = now + hours * 3600_000;

	// 1. Pula: terminarz dni z okna. Jedno wywołanie na dzień zamiast pięciu stron kursów.
	const pool = [];
	for (const date of datesInWindow(hours, now)) {
		const rows = await fixturesByDate(date);
		pool.push(...rows.map(normalizeFixture).filter(Boolean));
	}

	/*
	 * 2. Filtr okna i rozgrywek; porządek po randze, a przy równej randze po godzinie.
	 *
	 * Ranga zastąpiła liczbę bukmacherów. Jedno i drugie odpowiadało na pytanie „czy to
	 * mecz, o którym warto pisać", tylko poprzednia miara brała odpowiedź z rynku zakładów,
	 * a ta bierze ją z listy rozgrywek, którą prowadzimy sami — tej samej, na której stoi
	 * kolejka tygodniowa.
	 */
	const seen = new Set();
	const eligible = pool
		.filter((f) => {
			if (!f?.id || seen.has(f.id)) return false;
			const tier = LEAGUE_TIERS.get(f.league?.id);
			if (!tier) return false;
			const kickoff = Date.parse(f.date);
			if (!Number.isFinite(kickoff) || kickoff <= now || kickoff > windowEnd) return false;
			if (EXCLUDED_TEAMS.test(`${f.teams?.home?.name || ''} ${f.teams?.away?.name || ''}`)) {
				return false;
			}
			seen.add(f.id);
			return true;
		})
		.sort(
			(a, b) =>
				LEAGUE_TIERS.get(a.league.id) - LEAGUE_TIERS.get(b.league.id) ||
				Date.parse(a.date) - Date.parse(b.date)
		)
		.slice(0, PREDICTIONS_BUDGET);

	// 3. Prognozy w porcjach — pojedynczy błąd nie wywraca całości.
	const candidates = [];
	for (let i = 0; i < eligible.length; i += 10) {
		const chunk = eligible.slice(i, i + 10);
		const results = await Promise.all(
			chunk.map(async (fixture) => {
				try {
					const raw = (await predictions(fixture.id))?.[0] ?? null;
					return { fixture, raw };
				} catch {
					return { fixture, raw: null };
				}
			})
		);

		for (const { fixture, raw } of results) {
			if (!raw) continue;

			const prediction = normalizePrediction(raw);
			const formHome = normalizeTeamForm(raw.teams?.home);
			const formAway = normalizeTeamForm(raw.teams?.away);

			// Zbyt krótka próba meczowa = prognoza dostawcy zgaduje. Takich meczów
			// nie chcemy w raporcie, nawet przy pozornie wysokiej pewności.
			const playedHome = formHome?.played?.total ?? 0;
			const playedAway = formAway?.played?.total ?? 0;
			if (playedHome < MIN_PLAYED || playedAway < MIN_PLAYED) continue;

			/*
			 * Model dopasowany na całej lidze, nie na tym jednym meczu — dlatego wywołanie
			 * jest tanie mimo pętli: pierwsze żądanie w lidze dopasowuje, kolejne biorą
			 * z pamięci procesu.
			 */
			const modelPrediction = await predictFixture({
				leagueId: fixture.league?.id,
				season: fixture.league?.season,
				homeId: fixture.teams?.home?.id,
				awayId: fixture.teams?.away?.id,
			});

			const markets = evaluateMarkets({ prediction, formHome, formAway, modelPrediction });
			if (!markets.length) continue;

			const tier = LEAGUE_TIERS.get(fixture.league?.id) ?? 2;
			const played = Math.min(playedHome, playedAway);
			markets.sort(
				(a, b) => selectionScore(b, { tier, played }) - selectionScore(a, { tier, played })
			);

			candidates.push({
				fixtureId: fixture.id,
				home: fixture.teams?.home?.name ?? '?',
				away: fixture.teams?.away?.name ?? '?',
				league: [fixture.league?.name, fixture.league?.country].filter(Boolean).join(', '),
				// Identyfikator osobno od nazwy: po nim zapisujemy poziom rozgrywek przy typie.
				leagueId: fixture.league?.id ?? null,
				kickoff: fixture.date,
				best: markets[0],
				otherMarkets: markets.slice(1, MARKETS_PER_MATCH),
				score: Number(selectionScore(markets[0], { tier, played }).toFixed(1)),
				modelVersion: modelPrediction ? MODEL_VERSION : null,
				modelKnewTeams: modelPrediction ? modelPrediction.known : null,
				prediction,
				formHome,
				formAway,
				h2h: normalizeH2H(raw.h2h, { limit: 5 }),
			});
		}

		if (i + 10 < eligible.length) await sleep(150);
	}

	// 4. Ranking i przycięcie.
	candidates.sort((a, b) => b.score - a.score);
	return {
		candidates: candidates.slice(0, MAX_CANDIDATES),
		poolSize: seen.size,
		examined: eligible.length,
	};
}
