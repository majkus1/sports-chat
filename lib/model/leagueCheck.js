import { fitRatings, expectedGoals } from '@/lib/model/ratings';
import { predictMarkets } from '@/lib/model/dixonColes';
import { EXCLUDED_COMPETITIONS, MIN_MATCHES, MIN_MATCHES_PER_TEAM, medianMatchesPerTeam } from '@/lib/model';
import { entryThresholdFor } from '@/lib/picks/policy';
import { SELECTION_SHAPES } from '@/lib/picks/markets';

/**
 * SPRAWDZIAN NOWEJ LIGI — czy model wolno w niej włączyć. Część czysta (bez sieci i bazy);
 * pobieranie terminarzy i zapis wyniku: `leagueCheck.mjs`.
 *
 * PO CO OSOBNO OD `backtest.mjs`. Backtest odpowiada na pytanie „czy model jako całość bije
 * częstości", z jedną linią bazową dla wszystkich lig naraz. Przy dopisywaniu lig pytanie jest
 * inne: czy w TEJ lidze model coś wnosi i czy jego procenty znaczą to, co obiecują. Stąd:
 *
 *   - linia bazowa liczona dla każdej ligi z JEJ danych uczących (Serie B ma inny odsetek
 *     remisów niż Premier League — wspólna częstość karałaby albo nagradzała ligę za styl);
 *   - istotność (t) per liga, nie dla sumy;
 *   - typy po tej samej polityce co produkcja (`entryThresholdFor`) i ich kalibracja:
 *     obiecane wobec trafionych.
 *
 * TAK JAK PRODUKCJA. Model dopasowywany osobno dla ligi, wyłącznie na meczach rozegranych
 * wcześniej (podział po dacie, nigdy losowy), z oknem ~2 sezonów (`getLeagueModel` bierze
 * bieżący i poprzedni sezon), z tymi samymi progami wejścia (`MIN_MATCHES`,
 * `MIN_MATCHES_PER_TEAM`) i przeliczany co `refitDays` — jak model, który co noc dostaje wyniki.
 *
 * PROGI DECYZJI (`GATE`) USTALONE PRZED URUCHOMIENIEM, nie dopasowane do wyniku:
 *   1. co najmniej 150 meczów testowych z prognozą i pokrycie ≥ 60% — inaczej to szum;
 *   2. model lepszy od częstości tej ligi (log loss) z t ≥ 1,5;
 *   3. przy ≥ 40 typach po polityce trafione najwyżej 6 pkt poniżej obiecanych — na
 *      produkcji typy obiecują średnio 77%, a trafiają 75%; liga, w której model przesadza
 *      bardziej, psułaby wiarygodność liczby na stronie.
 */

export const GATE = { minMatches: 150, minCoverage: 0.6, minT: 1.5, minPicksForCalibration: 40, maxCalibrationGap: 6 };

/** Okno danych do nauki — jak `getLeagueModel` (bieżący i poprzedni sezon). */
export const TRAIN_WINDOW_DAYS = 730;

const SELEKCJE = [
	{ key: 'home', p: (r) => r.matchWinner.home, won: (h, a) => h > a },
	{ key: 'away', p: (r) => r.matchWinner.away, won: (h, a) => a > h },
	{ key: '1X', p: (r) => r.doubleChance['1X'], won: (h, a) => h >= a },
	{ key: 'X2', p: (r) => r.doubleChance.X2, won: (h, a) => a >= h },
	{ key: 'homeScores', p: (r) => r.teamGoals.home[0.5].over, won: (h) => h > 0 },
	{ key: 'awayScores', p: (r) => r.teamGoals.away[0.5].over, won: (h, a) => a > 0 },
];

const wynik = (m) => (m.homeGoals > m.awayGoals ? 'home' : m.homeGoals < m.awayGoals ? 'away' : 'draw');
const logLoss = (p, w) => -Math.log(Math.max(1e-12, Math.min(1, p[w])));
const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Próg polityki dla selekcji (w procentach) — ten sam co na produkcji, liczony raz. */
const PROGI = new Map(SELEKCJE.map((s) => [s.key, entryThresholdFor(SELECTION_SHAPES[s.key].normalized)]));

/**
 * Ocena jednej ligi.
 *
 * @param {Array<{ date: string, homeId: number, awayId: number, homeGoals: number, awayGoals: number }>} matches
 *   wszystkie zakończone mecze ligi (dowolna kolejność)
 * @param {{ leagueId: number, split: Date, refitDays?: number }} options
 */
export function evaluateLeague(matches, { leagueId, split, refitDays = 14 }) {
	const mecze = [...(matches || [])].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
	const granica = split.getTime();
	const uczace = mecze.filter((m) => Date.parse(m.date) < granica);
	const testowe = mecze.filter((m) => Date.parse(m.date) >= granica);

	// Linia bazowa: częstości TEJ ligi z danych uczących (z ostatnich dwóch lat przed podziałem).
	const bazaUcz = uczace.filter((m) => Date.parse(m.date) >= granica - TRAIN_WINDOW_DAYS * 86_400_000);
	const czest = { home: 1, draw: 1, away: 1 }; // wygładzenie Laplace'a: liga z 0 remisów nie da log(0)
	for (const m of bazaUcz) czest[wynik(m)] += 1;
	const suma = czest.home + czest.draw + czest.away;
	const bazowa = { home: czest.home / suma, draw: czest.draw / suma, away: czest.away / suma };

	let model = null;
	let waznyDo = -Infinity;
	const roznice = [];
	const ll = { model: [], base: [] };
	const typy = [];
	let nieznane = 0;

	for (const m of testowe) {
		const kiedy = Date.parse(m.date);
		if (kiedy >= waznyDo) {
			const nauka = mecze.filter((x) => {
				const t = Date.parse(x.date);
				return t < kiedy && t >= kiedy - TRAIN_WINDOW_DAYS * 86_400_000;
			});
			const dopuszczona =
				!EXCLUDED_COMPETITIONS.has(leagueId) &&
				nauka.length >= MIN_MATCHES &&
				medianMatchesPerTeam(nauka) >= MIN_MATCHES_PER_TEAM;
			model = dopuszczona ? fitRatings(nauka, { referenceDate: new Date(kiedy) }) : null;
			waznyDo = kiedy + Math.max(1, refitDays) * 86_400_000;
		}
		if (!model) continue;

		const eg = expectedGoals(model, m.homeId, m.awayId);
		const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);
		const w = wynik(m);
		const lm = logLoss(rynki.matchWinner, w);
		const lb = logLoss(bazowa, w);
		ll.model.push(lm);
		ll.base.push(lb);
		roznice.push(lb - lm);

		// Typy tylko przy znanych drużynach — produkcja nie wystawia plakietki dla nieznanej.
		if (!eg.known) {
			nieznane += 1;
			continue;
		}
		for (const s of SELEKCJE) {
			const p = 100 * s.p(rynki);
			if (p >= PROGI.get(s.key)) typy.push({ key: s.key, p, won: s.won(m.homeGoals, m.awayGoals) });
		}
	}

	const n = ll.model.length;
	const gain = n ? srednia(roznice) : null;
	const sd = n > 1 ? Math.sqrt(roznice.reduce((a, r) => a + (r - gain) ** 2, 0) / (n - 1)) : 0;
	const t = n > 1 && sd > 0 ? gain / (sd / Math.sqrt(n)) : 0;
	const promised = typy.length ? srednia(typy.map((x) => x.p)) : null;
	const hit = typy.length ? (100 * typy.filter((x) => x.won).length) / typy.length : null;

	const wynikLigi = {
		leagueId,
		trainMatches: bazaUcz.length,
		testMatches: testowe.length,
		n,
		coverage: testowe.length ? n / testowe.length : 0,
		unknownShare: n ? nieznane / n : 0,
		logLossModel: n ? srednia(ll.model) : null,
		logLossBase: n ? srednia(ll.base) : null,
		gain,
		t,
		picks: typy.length,
		picksPerMatch: n ? typy.length / n : 0,
		promised,
		hit,
		byKey: Object.fromEntries(
			SELEKCJE.map((s) => {
				const z = typy.filter((x) => x.key === s.key);
				return [s.key, { n: z.length, hit: z.length ? (100 * z.filter((x) => x.won).length) / z.length : null }];
			})
		),
	};
	return { ...wynikLigi, ...verdict(wynikLigi) };
}

/** Werdykt według `GATE` — z powodem, gdy liga odpada. */
export function verdict(r) {
	if (r.n < GATE.minMatches) return { pass: false, reason: `za mało meczów z prognozą (${r.n} < ${GATE.minMatches})` };
	if (r.coverage < GATE.minCoverage) return { pass: false, reason: `pokrycie ${Math.round(100 * r.coverage)}% < ${100 * GATE.minCoverage}%` };
	if (!(r.gain > 0)) return { pass: false, reason: 'model nie bije częstości tej ligi' };
	if (r.t < GATE.minT) return { pass: false, reason: `przewaga w szumie (t = ${r.t.toFixed(2)} < ${GATE.minT})` };
	if (r.picks >= GATE.minPicksForCalibration && r.hit < r.promised - GATE.maxCalibrationGap) {
		return { pass: false, reason: `typy przesadzają: obiecane ${r.promised.toFixed(0)}%, trafione ${r.hit.toFixed(0)}%` };
	}
	return { pass: true, reason: r.picks < GATE.minPicksForCalibration ? `mało typów (${r.picks}) — kalibracja niesprawdzona` : null };
}
