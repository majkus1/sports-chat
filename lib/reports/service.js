import { oddsByDate, predictions } from '@/lib/football/endpoints';
import { normalizeOddsFixture, normalizePrediction, normalizeTeamForm, normalizeH2H } from '@/lib/football/normalize';

/**
 * Selekcja meczów do raportu — deterministyczna część, bez AI.
 *
 * Zasada: typ trafia do raportu tylko wtedy, gdy nasze szacowane prawdopodobieństwo jest
 * wysokie ORAZ wyższe od prawdopodobieństwa implikowanego przez rynek (mediana kursów).
 * Sam wysoki procent nie wystarcza — faworyt wyceniony po 1.10 jest „pewny", ale nieopłacalny.
 * Kursy służą wyłącznie tej selekcji; do treści raportu nigdy nie trafiają.
 */

/** Okna czasowe obu typów raportu, w godzinach. */
export const REPORT_WINDOWS = { soon: 24, threeDays: 72 };

/** Ile stron kursów pobieramy na dzień (10 meczów/strona). */
const MAX_ODDS_PAGES_PER_DAY = 5;

/**
 * Górny limit wywołań `predictions` na jeden raport.
 *
 * Pula z trzech dni potrafi mieć 150 meczów, a prognozy to osobne wywołanie na mecz.
 * Wstępnie porządkujemy pulę po liczbie bukmacherów — płynnie wyceniany mecz to mecz
 * znaczącej ligi — i prognozy pobieramy tylko dla czołówki.
 */
const PREDICTIONS_BUDGET = 40;

/** Mecze wyceniane przez mniej niż tylu bukmacherów odpadają — zbyt niska płynność. */
const MIN_BOOKMAKERS = 4;

/*
 * Progi selekcji.
 *
 * `edge` liczymy od surowego 1/kurs, które ZAWIERA marżę bukmachera (suma implikowanych
 * przekracza 100%) — czyli zawyża rynkowe prawdopodobieństwo. Dzięki temu próg działa
 * konserwatywnie: prawdziwa przewaga jest większa niż zmierzona.
 */
const MIN_PROBABILITY = 55;
const MIN_EDGE_PP = 3;
const MAX_CANDIDATES = 14;

/**
 * Dolny próg kursu — definicja „opłacalności".
 *
 * Typ po 1.15 może być pewny, ale nie jest wart raportu: zysk nie pokrywa ryzyka
 * pojedynczej wpadki. Odcinamy wszystko poniżej.
 */
const MIN_ODD = 1.3;

/**
 * Prognozy dostawcy bywają zgrubne (rozkłady w stylu 45/45/10), przez co suma
 * podwójnej szansy potrafi wyjść 90%+ seryjnie. Wartości bliskie pewności to
 * artefakt danych, nie sygnał — odrzucamy.
 */
const MAX_PROBABILITY = 92;

/** Minimalna próba meczowa obu drużyn w sezonie — poniżej prognozy to zgadywanie. */
const MIN_PLAYED = 4;

/**
 * Sufit przewagi. Gdy nasza prognoza różni się od rynku o 25+ punktów procentowych,
 * to prawie na pewno błąd danych, a nie okazja — rynek myli się rzadko, dane często.
 */
const MAX_EDGE_PP = 25;

/**
 * Podwójna szansa wymaga wyższej przewagi niż rynki pojedyncze.
 *
 * Suma dwóch zgrubnych procentów (np. 45+45) systematycznie zawyża pewność, więc
 * przy progu wspólnym raport zapełniał się wyłącznie podwójnymi szansami.
 */
const MIN_EDGE_DOUBLE_CHANCE_PP = 8;

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

/** Prawdopodobieństwo implikowane w punktach procentowych. */
const implied = (odd) => (Number.isFinite(odd) && odd > 1 ? 100 / odd : null);

/**
 * Rynki jednego meczu z policzonym prawdopodobieństwem modelu i przewagą.
 *
 * Zwycięzcę i podwójne szanse liczymy z procentów prognozy dostawcy; progi bramkowe
 * i BTTS z Poissona na średnich goli. Kurs podwójnej szansy wyprowadzamy z 1X2
 * (1/kDC = 1/k1 + 1/kX) — to standardowa tożsamość, marża zostaje w środku.
 */
function evaluateMarkets({ odds, prediction, formHome, formAway }) {
	const out = [];
	const consider = (market, selection, pModel, odd) => {
		const pImplied = implied(odd);
		if (pModel === null || pImplied === null) return;
		if (odd < MIN_ODD || pModel > MAX_PROBABILITY) return;
		const edge = pModel - pImplied;
		if (edge > MAX_EDGE_PP) return;
		const minEdge = market === 'Podwójna szansa' ? MIN_EDGE_DOUBLE_CHANCE_PP : MIN_EDGE_PP;
		if (pModel >= MIN_PROBABILITY && edge >= minEdge) {
			out.push({
				market,
				selection,
				pModel: Math.round(pModel),
				edge: Number(edge.toFixed(1)),
			});
		}
	};

	const pct = prediction?.percent || {};
	const mw = odds.markets.matchWinner;

	consider('Wynik meczu', 'home', pct.home, mw.home);
	consider('Wynik meczu', 'away', pct.away, mw.away);

	if (Number.isFinite(pct.home) && Number.isFinite(pct.draw) && mw.home && mw.draw) {
		consider('Podwójna szansa', '1X', pct.home + pct.draw, 1 / (1 / mw.home + 1 / mw.draw));
	}
	if (Number.isFinite(pct.away) && Number.isFinite(pct.draw) && mw.away && mw.draw) {
		consider('Podwójna szansa', 'X2', pct.away + pct.draw, 1 / (1 / mw.away + 1 / mw.draw));
	}

	const lambdaHome = expectedGoals(
		formHome?.goals?.for?.average?.total,
		formAway?.goals?.against?.average?.total
	);
	const lambdaAway = expectedGoals(
		formAway?.goals?.for?.average?.total,
		formHome?.goals?.against?.average?.total
	);

	if (lambdaHome !== null && lambdaAway !== null) {
		const total = lambdaHome + lambdaAway;
		consider('Suma goli', 'Over 2.5', probOver25(total), odds.markets.goals25.over);
		consider('Suma goli', 'Under 2.5', 100 - probOver25(total), odds.markets.goals25.under);
		consider('Obie strzelą', 'Tak', probBtts(lambdaHome, lambdaAway), odds.markets.btts.yes);
		consider('Obie strzelą', 'Nie', 100 - probBtts(lambdaHome, lambdaAway), odds.markets.btts.no);
	}

	return out;
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

	// 1. Pula: wszystkie wycenione mecze z dni okna.
	const pool = [];
	for (const date of datesInWindow(hours, now)) {
		for (let page = 1; page <= MAX_ODDS_PAGES_PER_DAY; page += 1) {
			const rows = await oddsByDate(date, page);
			pool.push(...rows.map(normalizeOddsFixture).filter(Boolean));
			if (rows.length < 10) break; // ostatnia strona
		}
	}

	// 2. Filtr okna czasowego i płynności; porządek po liczbie bukmacherów.
	const seen = new Set();
	const eligible = pool
		.filter((o) => {
			if (seen.has(o.fixtureId)) return false;
			seen.add(o.fixtureId);
			const kickoff = Date.parse(o.kickoff);
			return (
				Number.isFinite(kickoff) &&
				kickoff > now &&
				kickoff <= windowEnd &&
				o.bookmakerCount >= MIN_BOOKMAKERS &&
				o.markets.matchWinner.home !== null
			);
		})
		.sort((a, b) => b.bookmakerCount - a.bookmakerCount)
		.slice(0, PREDICTIONS_BUDGET);

	// 3. Prognozy w porcjach — pojedynczy błąd nie wywraca całości.
	const candidates = [];
	for (let i = 0; i < eligible.length; i += 10) {
		const chunk = eligible.slice(i, i + 10);
		const results = await Promise.all(
			chunk.map(async (odds) => {
				try {
					const raw = (await predictions(odds.fixtureId))?.[0] ?? null;
					return { odds, raw };
				} catch {
					return { odds, raw: null };
				}
			})
		);

		for (const { odds, raw } of results) {
			if (!raw) continue;
			const teamNames = `${raw.teams?.home?.name || ''} ${raw.teams?.away?.name || ''} ${odds.leagueName || ''}`;
			if (EXCLUDED_TEAMS.test(teamNames)) continue;

			const prediction = normalizePrediction(raw);
			const formHome = normalizeTeamForm(raw.teams?.home);
			const formAway = normalizeTeamForm(raw.teams?.away);

			// Zbyt krótka próba meczowa = prognoza dostawcy zgaduje. Takich meczów
			// nie chcemy w raporcie, nawet z pozornie dużą przewagą.
			if ((formHome?.played?.total ?? 0) < MIN_PLAYED || (formAway?.played?.total ?? 0) < MIN_PLAYED) {
				continue;
			}

			const markets = evaluateMarkets({ odds, prediction, formHome, formAway });
			if (!markets.length) continue;

			// Najlepszy rynek meczu — jeden typ na mecz, resztę zostawiamy.
			const best = markets.sort((a, b) => b.edge * b.pModel - a.edge * a.pModel)[0];

			candidates.push({
				fixtureId: odds.fixtureId,
				home: raw.teams?.home?.name ?? '?',
				away: raw.teams?.away?.name ?? '?',
				league: [odds.leagueName, odds.country].filter(Boolean).join(', '),
				kickoff: odds.kickoff,
				best,
				otherMarkets: markets.slice(1, 3),
				prediction,
				formHome,
				formAway,
				h2h: normalizeH2H(raw.h2h, { limit: 5 }),
			});
		}

		if (i + 10 < eligible.length) await sleep(150);
	}

	// 4. Ranking i przycięcie.
	candidates.sort((a, b) => b.best.edge * b.best.pModel - a.best.edge * a.best.pModel);
	return {
		candidates: candidates.slice(0, MAX_CANDIDATES),
		poolSize: seen.size,
		examined: eligible.length,
	};
}
