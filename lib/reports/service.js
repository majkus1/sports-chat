import { fixturesByDate, predictions } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
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
 * Podwójna szansa ma własny, wyższy próg.
 *
 * Suma dwóch zgrubnych procentów (45+45) systematycznie zawyża pewność, więc przy progu
 * wspólnym raport zapełniał się wyłącznie podwójnymi szansami — problem znany jeszcze
 * z wersji kursowej, tylko wtedy tłumił go osobny próg przewagi.
 */
const MIN_PROBABILITY_DOUBLE_CHANCE = 74;

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

/** P(X = k) dla rozkładu Poissona. */
function poissonPmf(k, lambda) {
	let factorial = 1;
	for (let i = 2; i <= k; i += 1) factorial *= i;
	return (Math.exp(-lambda) * lambda ** k) / factorial;
}

/** Szacunek P(suma goli > 2.5) z sumarycznej średniej bramek. */
function probOver25(lambdaTotal) {
	const under = poissonPmf(0, lambdaTotal) + poissonPmf(1, lambdaTotal) + poissonPmf(2, lambdaTotal);
	return (1 - under) * 100;
}

/** Szacunek P(obie strzelą) z oczekiwanych bramek każdej strony. */
function probBtts(lambdaHome, lambdaAway) {
	return (1 - Math.exp(-lambdaHome)) * (1 - Math.exp(-lambdaAway)) * 100;
}

/** Oczekiwane gole drużyny: średnia z jej ataku i defensywy rywala. */
function expectedGoals(attackAvg, opponentConcededAvg) {
	const attack = Number(attackAvg);
	const conceded = Number(opponentConcededAvg);
	if (!Number.isFinite(attack) || !Number.isFinite(conceded)) return null;
	const lambda = (attack + conceded) / 2;
	// Zera z początku sezonu dają lambdę ~0 i absurdalne „pewne under" — odrzucamy.
	return lambda >= 0.3 ? lambda : null;
}

/**
 * Rynki jednego meczu z policzonym prawdopodobieństwem modelu.
 *
 * Zwycięzcę i podwójne szanse liczymy z procentów prognozy dostawcy; progi bramkowe
 * i BTTS z Poissona na średnich goli. Te same dwa źródła, z których korzysta analiza
 * pojedynczego meczu — różnica polega tylko na tym, że tam interpretuje je model,
 * a tu odsiewamy nimi mecze przed wysłaniem czegokolwiek do modelu.
 *
 * `support` mówi, ile NIEZALEŻNYCH sygnałów stoi za selekcją. Prognoza dostawcy i własny
 * rozkład Poissona to dwa różne rachunki; gdy oba wskazują to samo, typ jest wart więcej
 * niż taki sam procent z jednego źródła. Bez kursów to jedyna dostępna kontrola.
 */
export function evaluateMarkets({ prediction, formHome, formAway }) {
	const out = [];
	const consider = (market, selection, pModel, { support = 1 } = {}) => {
		if (!Number.isFinite(pModel)) return;
		if (pModel > MAX_PROBABILITY) return;
		const minProb = market === 'Podwójna szansa' ? MIN_PROBABILITY_DOUBLE_CHANCE : MIN_PROBABILITY;
		if (pModel < minProb) return;
		out.push({ market, selection, pModel: Math.round(pModel), support });
	};

	const pct = prediction?.percent || {};

	const lambdaHome = expectedGoals(
		formHome?.goals?.for?.average?.total,
		formAway?.goals?.against?.average?.total
	);
	const lambdaAway = expectedGoals(
		formAway?.goals?.for?.average?.total,
		formHome?.goals?.against?.average?.total
	);
	const total = lambdaHome !== null && lambdaAway !== null ? lambdaHome + lambdaAway : null;

	/*
	 * Zwycięzca meczu. Wsparcie podnosi zgodność z bilansem bramkowym: jeżeli prognoza
	 * wskazuje gospodarzy, a z Poissona wychodzi im wyraźnie więcej goli niż rywalowi,
	 * są to dwa niezależne rachunki mówiące to samo.
	 */
	const przewagaGoli =
		lambdaHome !== null && lambdaAway !== null ? lambdaHome - lambdaAway : null;
	consider('Wynik meczu', 'home', pct.home, {
		support: przewagaGoli !== null && przewagaGoli > 0.25 ? 2 : 1,
	});
	consider('Wynik meczu', 'away', pct.away, {
		support: przewagaGoli !== null && przewagaGoli < -0.25 ? 2 : 1,
	});

	if (Number.isFinite(pct.home) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', '1X', pct.home + pct.draw, {
			support: przewagaGoli !== null && przewagaGoli > 0 ? 2 : 1,
		});
	}
	if (Number.isFinite(pct.away) && Number.isFinite(pct.draw)) {
		consider('Podwójna szansa', 'X2', pct.away + pct.draw, {
			support: przewagaGoli !== null && przewagaGoli < 0 ? 2 : 1,
		});
	}

	if (total !== null) {
		const over = probOver25(total);
		const btts = probBtts(lambdaHome, lambdaAway);

		/*
		 * Te same bezpieczniki, które obowiązują model w analizie meczu (punkty 8 i 9
		 * instrukcji): nie proponujemy Under przy wysokiej sumie średnich ani przy wysokim
		 * BTTS, i nie proponujemy Over przy niskiej sumie. Trzymanie tego w jednym miejscu
		 * jest bez sensu, skoro obie ścieżki produkują typy do tej samej statystyki.
		 */
		if (total >= 2.3) consider('Suma goli', 'Over 2.5', over, { support: 2 });
		if (total <= 2.6 && btts < 60) consider('Suma goli', 'Under 2.5', 100 - over, { support: 2 });

		consider('Obie strzelą', 'Tak', btts, { support: 2 });
		consider('Obie strzelą', 'Nie', 100 - btts, { support: 2 });
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

			const markets = evaluateMarkets({ prediction, formHome, formAway });
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
				kickoff: fixture.date,
				best: markets[0],
				otherMarkets: markets.slice(1, MARKETS_PER_MATCH),
				score: Number(selectionScore(markets[0], { tier, played }).toFixed(1)),
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
