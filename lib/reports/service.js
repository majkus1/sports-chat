import { fixturesByDate, predictions, oddsByFixture } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { predictFixture, MODEL_VERSION } from '@/lib/model';
import { liftFor, meetsPolicy, marketProbabilityFor, MARKET_CEILING } from '@/lib/picks/policy';
import { normalizePick, sameSelection } from '@/lib/picks/markets';
import {
	normalizeFixture,
	normalizePrediction,
	normalizeTeamForm,
	normalizeH2H,
	normalizeOddsFixture,
	impliedFromOdds,
} from '@/lib/football/normalize';

/**
 * Selekcja meczów do raportu — deterministyczna część, bez AI.
 *
 * KURSY SĄ TU WYŁĄCZNIE SUFITEM, NIGDY BAZĄ.
 *
 * Pierwsza wersja budowała pulę z meczów wycenionych przez bukmacherów i przepuszczała
 * dalej tylko te selekcje, w których nasze prawdopodobieństwo przewyższało implikowane
 * przez medianę kursów. To była mechanika „value bets" — nawet jeśli żadna liczba z rynku
 * nie trafiała do treści raportu, decydowała o tym, co użytkownik w nim zobaczy. To znikło
 * i nie wraca: publikujemy analizy, nie okazje zakładowe, a ta granica jest trzymana
 * w promptach, na blogu i w dokumentach prawnych.
 *
 * Rynek wrócił w jednej, wąskiej roli: gdy uważa zdarzenie za pewne (`MARKET_CEILING`),
 * typu nie wystawiamy, choćby nasz model przechodził próg przewagi. Powód jest z praktyki:
 * „gość strzeli gola" przy 85% wobec normy 70% było prawdziwym zdaniem o parze drużyn —
 * i kursem 1,04, bo rynek widział dziurawą obronę lepiej niż my. Sufit odcina takie typy.
 * Wartość typu nadal liczy się wobec normy ligowej, nie wobec rynku; żadna liczba rynkowa
 * nie trafia do promptu, do treści ani do interfejsu.
 *
 * Zasada: bierzemy mecze z rozgrywek, które obsługujemy, liczymy własne prawdopodobieństwa
 * i zostawiamy te selekcje, które przewyższają normę najmocniej. Raport ma pokazywać typy
 * z treścią, nie najbardziej opłacalne i nie najbardziej oczywiste.
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
 * Prognozy dostawcy bywają zgrubne (rozkłady w stylu 45/45/10), przez co suma
 * podwójnej szansy potrafi wyjść 90%+ seryjnie. Wartości bliskie pewności to
 * artefakt danych, nie sygnał — odrzucamy.
 */
const MAX_PROBABILITY = 92;

/*
 * PRÓG WEJŚCIA NIE JEST TU ZDEFINIOWANY — SELEKCJA PYTA POLITYKĘ TYPÓW.
 *
 * Poprzednia wersja miała osobny próg na procent dla każdego rynku, ustawiony tuż nad jego
 * częstością bazową. Raport zapełniał się wtedy typami prawdziwymi i pustymi: „gość strzeli
 * gola" przy 85% w rynku, w którym gość strzela w 70% meczów. Teraz o wejściu decyduje
 * `meetsPolicy` z `lib/picks/policy` — ta sama funkcja, która później decyduje o wliczeniu
 * typu do statystyki. Selekcja nie może zaproponować niczego, czego pomiar by nie uznał,
 * bo to dosłownie ten sam warunek.
 */

/** Postać znormalizowana selekcji — klucz, po którym polityka i parser rozpoznają typ. */
const SELEKCJE = {
	home: { type: 'matchWinner', value: 'home' },
	away: { type: 'matchWinner', value: 'away' },
	'1X': { type: 'doubleChance', value: '1X' },
	X2: { type: 'doubleChance', value: 'X2' },
	homeScores: { type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 },
	awayScores: { type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 },
};

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
 * ZAKRES RYNKÓW WYNIKA Z POMIARU, NIE Z WYGODY. Backtest na 8715 meczach porównał każdy
 * rynek z osobna ze stałą prognozą równą jego częstości. Wszystko, co zależy od RÓŻNICY
 * sił drużyn, wypadło lepiej; wszystko, co zależy od SUMY goli — gorzej:
 *
 *     podwójna szansa 1X   +0,0158     powyżej 1.5 gola   −0,0062
 *     podwójna szansa X2   +0,0199     powyżej 2.5 gola   −0,0069
 *     gość strzeli         +0,0018     powyżej 3.5 gola   −0,0068
 *     gospodarz strzeli    −0,0008     obie strzelą       −0,0072
 *
 * Ujemny zysk nie znaczy „trochę słabiej". Znaczy, że różnicowanie prognozy mecz po meczu
 * dokłada szum do liczby, którą i tak znamy z częstości — czyli że typ w tym rynku jest
 * gorszy niż jego brak. Potwierdza to produkcja: `totalGoals 2.5` ma tam 3 trafienia na 10.
 * Gole drużyny wiszą na granicy — przy większej próbie ich przewaga stopniała do szumu.
 * Dlatego progów bramkowych i „obie strzelą” tu nie ma.
 *
 * `support` mówi, czy za selekcją stoi jeden rachunek, czy dwa niezależne — własny model
 * sił drużyn ORAZ prognoza dostawcy. Zgodność obu jest jedyną kontrolą, jaka nam została
 * po usunięciu kursów.
 */
export function evaluateMarkets({ prediction, formHome, formAway, modelPrediction = null }) {
	const out = [];
	/*
	 * `klucz` wskazuje selekcję w SELEKCJE. Wpis niesie normę rynku i przewagę nad nią —
	 * to po nich sortujemy i to pokazujemy czytelnikowi, nie sam procent.
	 */
	const consider = (market, selection, klucz, pModel, { support = 1 } = {}) => {
		if (!Number.isFinite(pModel)) return;
		if (pModel > MAX_PROBABILITY) return;
		// Zaokrąglone od razu: ten sam procent trafia do promptu, do zapisu i do progu.
		const p = Math.round(pModel);
		const normalized = SELEKCJE[klucz];
		if (!meetsPolicy(normalized, p).ok) return;
		const { base, lift } = liftFor(normalized, p);
		out.push({ market, selection, normalized, pModel: p, base, lift, support });
	};

	const pct = prediction?.percent || {};

	/*
	 * Prawdopodobieństwa bierzemy z własnego modelu, gdy jest dostępny.
	 *
	 * Prognoza dostawcy schodzi do roli drugiego zdania: nie decyduje o wartości, tylko
	 * potwierdza albo nie. Model bije ją tam, gdzie da się to zmierzyć (log loss 1,0348
	 * wobec 1,0717 dla samych częstości), więc odwrotna kolejność byłaby cofnięciem się.
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
		consider('Wynik meczu', 'home', 'home', pModelu.home, { support: zgodne(pModelu.home, pct.home) });
		consider('Wynik meczu', 'away', 'away', pModelu.away, { support: zgodne(pModelu.away, pct.away) });

		const dostawcaDC1X = Number.isFinite(pct.home) && Number.isFinite(pct.draw) ? pct.home + pct.draw : null;
		const dostawcaDCX2 = Number.isFinite(pct.away) && Number.isFinite(pct.draw) ? pct.away + pct.draw : null;
		consider('Podwójna szansa', '1X', '1X', pModelu.dc1X, { support: zgodne(pModelu.dc1X, dostawcaDC1X) });
		consider('Podwójna szansa', 'X2', 'X2', pModelu.dcX2, { support: zgodne(pModelu.dcX2, dostawcaDCX2) });

		// Jedyny rynek bramkowy z potwierdzoną przewagą: czy dana drużyna w ogóle strzeli.
		consider('Gole drużyny', 'Gospodarz powyżej 0.5', 'homeScores', pModelu.homeScores);
		consider('Gole drużyny', 'Gość powyżej 0.5', 'awayScores', pModelu.awayScores);

		return out;
	}

	/*
	 * Zjazd awaryjny: liga spoza obsługiwanej listy albo za mało rozegranych meczów,
	 * żeby dopasować model. Zostają procenty dostawcy i wyłącznie te dwa rynki, które
	 * z nich wynikają — bez progów bramkowych, bo tych nie umiemy prognozować żadną metodą.
	 */
	consider('Wynik meczu', 'home', 'home', pct.home);
	consider('Wynik meczu', 'away', 'away', pct.away);
	if (Number.isFinite(pct.home) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', '1X', '1X', pct.home + pct.draw);
	}
	if (Number.isFinite(pct.away) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', 'X2', 'X2', pct.away + pct.draw);
	}

	return out;
}

/**
 * Siła selekcji — czym sortujemy, skoro nie ma już przewagi nad rynkiem.
 *
 * PRZEWAGA NAD NORMĄ, NIE PROCENT. Sortowanie po prawdopodobieństwie dawało raport złożony
 * z typów najbardziej oczywistych — bo najwyższy procent mają zdarzenia, które i tak
 * zachodzą prawie zawsze. Przewaga mierzy, o ile ten mecz różni się od przeciętnego,
 * i to jest jedyna rzecz, dla której warto ten typ czytać. Dokładamy do niej, ile
 * niezależnych rachunków wspiera selekcję i jak dużą próbą meczową dysponujemy.
 */
export function selectionScore(entry, { tier, played }) {
	const wsparcie = entry.support >= 2 ? 8 : 0;
	const ranga = tier === 1 ? 5 : 0;
	// Próba powyżej dziesięciu meczów nie dokłada już pewności — stąd sufit.
	const proba = Math.min(played, 12) / 2;
	return entry.lift + wsparcie + ranga + proba;
}

/**
 * Sufit rynkowy nałożony na selekcje jednego meczu.
 *
 * Każdy wpis dostaje prawdopodobieństwo rynkowe swojej selekcji (do zapisu przy typie),
 * a wpisy, które rynek uważa za pewne, wypadają. Bez kursów nic nie wypada — brak danych
 * to brak sufitu, nie odrzucenie. Osobno od `evaluateMarkets`, żeby tamta funkcja została
 * czysta: sama selekcja nie wie, że rynek istnieje.
 *
 * @param {Array} markets wynik `evaluateMarkets`
 * @param {object|null} implied wynik `impliedFromOdds`
 */
export function applyMarketCeiling(markets, implied) {
	return (markets || [])
		.map((m) => ({ ...m, marketProbability: marketProbabilityFor(m.normalized, implied) }))
		.filter((m) => !(Number.isFinite(m.marketProbability) && m.marketProbability >= MARKET_CEILING));
}

/**
 * Wiąże typy napisane przez model językowy z selekcją, z której powstały.
 *
 * LICZBY LICZY MODEL, NIE AI. Prompt pozwalał modelowi językowemu „korygować" procent
 * selekcji, a ten zjeżdżał pod próg: typ pokazywał się czytelnikowi z 84%, choć wszedł
 * z 85%, i przy zapisie wypadał ze statystyki — widoczny jak każdy inny, liczony jak żaden.
 * Tu prawdopodobieństwo wraca do wartości z selekcji, a przy typie ląduje norma rynku
 * i przewaga nad nią, bo to one mówią czytelnikowi, ile ten typ jest wart.
 *
 * Dopasowanie idzie po postaci znormalizowanej, nie po tekście: model pisze
 * „1X — Machida lub remis", selekcja zna „1X". Typ spoza selekcji (model nie posłuchał)
 * zostaje z własnym procentem, ale normę dostaje z tej samej tabeli — czytelnik ma
 * widzieć, że jest poniżej progu.
 *
 * @param {Array} picks typy z odpowiedzi modelu
 * @param {Array} candidates wynik buildReportCandidates().candidates
 * @returns {Array} te same typy z polami `probability`, `baseRate`, `lift`
 */
export function bindPicksToSelection(picks, candidates) {
	return (picks || []).map((pick) => {
		const kandydat = candidates.find((c) => String(c.fixtureId) === String(pick.fixtureId));
		const normalized = normalizePick({
			market: pick.market,
			selection: pick.selection,
			homeName: kandydat?.home ?? null,
			awayName: kandydat?.away ?? null,
		});

		const wpis = kandydat
			? [kandydat.best, ...(kandydat.otherMarkets || [])].find((m) =>
					sameSelection(m.normalized, normalized)
				)
			: null;

		if (wpis) return { ...pick, probability: wpis.pModel, baseRate: wpis.base, lift: wpis.lift };

		const { base, lift } = liftFor(normalized, pick.probability);
		return { ...pick, baseRate: base, lift };
	});
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

			const wstepne = evaluateMarkets({ prediction, formHome, formAway, modelPrediction });
			if (!wstepne.length) continue;

			/*
			 * Sufit rynkowy — dopiero teraz, bo kursy to osobne wywołanie na mecz i nie ma sensu
			 * pytać o spotkania, które i tak nie mają żadnej selekcji nad normą. Błąd pobrania
			 * nie wywraca meczu: bez kursów sufitu po prostu nie ma.
			 */
			let implied = null;
			try {
				const kursy = (await oddsByFixture(fixture.id))?.[0] ?? null;
				implied = impliedFromOdds(normalizeOddsFixture(kursy)?.markets);
			} catch {
				implied = null;
			}
			const markets = applyMarketCeiling(wstepne, implied);
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
