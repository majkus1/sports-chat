/**
 * Backtest modelu na historycznych meczach.
 *
 * PO CO. Bez tego „model jest lepszy" jest opinią. Sprawdzamy go na meczach, których nie
 * widział w czasie uczenia, i porównujemy z liniami odniesienia — bo model, który nie bije
 * prostego licznika częstości, nie jest wart wywołania.
 *
 * PODZIAŁ DANYCH JEST PO DACIE, NIGDY LOSOWY. Losowy podział pozwoliłby modelowi uczyć się
 * z kolejek rozegranych PO tych, które ocenia, i wynik byłby zawyżony. Uczymy się na
 * przeszłości, sprawdzamy na przyszłości — tak jak działa produkcja.
 *
 * MIARY. Log loss i Brier score, nie odsetek trafień. Odsetek nagradza pewne siebie
 * zgadywanie: model mówiący zawsze „gospodarz" ma około 45% trafień i zero wartości.
 * Log loss karze pewność bez pokrycia i nagradza uczciwe rozłożenie prawdopodobieństwa.
 *
 * URUCHOMIENIE:
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/backtest.mjs
 *   node ... lib/model/backtest.mjs --seasons=2024,2025 --split=2025-07-01
 */

import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { LEAGUE_TIERS } = await import('@/lib/football/leagues');
const { leagueFixtures } = await import('@/lib/football/endpoints');
const { fitRatings, fitRho, expectedGoals, logLikelihood } = await import('@/lib/model/ratings');
const { predictMarkets } = await import('@/lib/model/dixonColes');

/** Odczyt `--klucz=wartość` z wiersza poleceń. */
function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}

const SEASONS = String(arg('seasons', '2024,2025'))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const SPLIT_DATE = new Date(arg('split', '2025-07-01'));
const LEAGUES = String(arg('leagues', ''))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);

const ligi = LEAGUES.length ? LEAGUES : [...LEAGUE_TIERS.keys()];

/** Mecze zakończone, sprowadzone do tego, czego potrzebuje model. */
function toResults(rows) {
	return (rows || [])
		.filter((r) => ['FT', 'AET', 'PEN'].includes(r?.fixture?.status?.short))
		.filter((r) => Number.isFinite(r?.goals?.home) && Number.isFinite(r?.goals?.away))
		.map((r) => ({
			fixtureId: r.fixture.id,
			date: r.fixture.date,
			leagueId: r.league?.id ?? null,
			homeId: r.teams?.home?.id,
			awayId: r.teams?.away?.id,
			homeGoals: r.goals.home,
			awayGoals: r.goals.away,
		}));
}

/** Log loss dla prognozy trójwynikowej. */
function logLoss(p, wynik) {
	const trafiony = Math.max(1e-12, Math.min(1, p[wynik]));
	return -Math.log(trafiony);
}

/** Brier dla trzech wykluczających się wyników. */
function brier3(p, wynik) {
	return ['home', 'draw', 'away'].reduce((acc, k) => acc + (p[k] - (k === wynik ? 1 : 0)) ** 2, 0);
}

/** Brier dla zdarzenia dwustanowego (np. powyżej 2.5 gola). */
function brier2(p, zaszlo) {
	return (p - (zaszlo ? 1 : 0)) ** 2;
}

function outcome(m) {
	if (m.homeGoals > m.awayGoals) return 'home';
	if (m.homeGoals < m.awayGoals) return 'away';
	return 'draw';
}

const srednia = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const f = (x, n = 4) => (x === null || x === undefined ? '   —  ' : x.toFixed(n));

console.log(`Ligi: ${ligi.length} | sezony: ${SEASONS.join(', ')} | podział: ${SPLIT_DATE.toISOString().slice(0, 10)}`);
console.log('Pobieram terminarze (jedno wywołanie na ligę i sezon)...');

const wszystkie = [];
let zapytania = 0;
for (const leagueId of ligi) {
	for (const season of SEASONS) {
		try {
			const rows = await leagueFixtures({ leagueId, season });
			zapytania += 1;
			wszystkie.push(...toResults(rows));
		} catch (error) {
			console.warn(`  liga ${leagueId} / ${season}: ${error.message}`);
		}
	}
}

wszystkie.sort((a, b) => new Date(a.date) - new Date(b.date));

const uczace = wszystkie.filter((m) => new Date(m.date) < SPLIT_DATE);
const testowe = wszystkie.filter((m) => new Date(m.date) >= SPLIT_DATE);

console.log(
	`Zapytań: ${zapytania} | meczów: ${wszystkie.length} (uczące ${uczace.length}, testowe ${testowe.length})`
);

if (uczace.length < 200 || testowe.length < 100) {
	console.log('\nZa mało danych na wiarygodny backtest. Poszerz zakres sezonów albo lig.');
	process.exit(1);
}

console.log('\nUczę model na danych sprzed daty podziału...');
let model = fitRatings(uczace, { referenceDate: SPLIT_DATE });
model = { ...model, rho: fitRho(uczace, model) };

console.log(
	`  drużyn: ${model.teams.size} | przewaga boiska: ${model.homeAdvantage.toFixed(3)} | rho: ${model.rho} | log-wiarogodność (uczące): ${f(logLikelihood(model, uczace))}`
);

/*
 * Linie odniesienia liczone WYŁĄCZNIE z danych uczących.
 *
 * Częstości wzięte ze zbioru testowego byłyby zaglądaniem w przyszłość — linia bazowa
 * znałaby wtedy odpowiedź, którą model dopiero ma zgadnąć.
 */
const czestosci = uczace.reduce(
	(acc, m) => {
		acc[outcome(m)] += 1;
		return acc;
	},
	{ home: 0, draw: 0, away: 0 }
);
const bazowa = {
	home: czestosci.home / uczace.length,
	draw: czestosci.draw / uczace.length,
	away: czestosci.away / uczace.length,
};
const over25Bazowe = uczace.filter((m) => m.homeGoals + m.awayGoals > 2.5).length / uczace.length;

console.log(
	`  częstości w danych uczących: gospodarz ${(100 * bazowa.home).toFixed(1)}%, remis ${(100 * bazowa.draw).toFixed(1)}%, gość ${(100 * bazowa.away).toFixed(1)}%, powyżej 2.5 ${(100 * over25Bazowe).toFixed(1)}%`
);

console.log('\nSprawdzam na meczach po dacie podziału...');

const wyniki = {
	model: { logLoss: [], brier: [], trafienia: 0, over: [] },
	bazowa: { logLoss: [], brier: [], trafienia: 0, over: [] },
	gospodarz: { logLoss: [], brier: [], trafienia: 0 },
};
let nieznane = 0;

for (const m of testowe) {
	const eg = expectedGoals(model, m.homeId, m.awayId);
	if (!eg.known) nieznane += 1;

	const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho);
	const p = rynki.matchWinner;
	const wynik = outcome(m);
	const over = m.homeGoals + m.awayGoals > 2.5;

	wyniki.model.logLoss.push(logLoss(p, wynik));
	wyniki.model.brier.push(brier3(p, wynik));
	wyniki.model.over.push(brier2(rynki.totalGoals[2.5].over, over));
	if (['home', 'draw', 'away'].reduce((a, b) => (p[a] > p[b] ? a : b)) === wynik) {
		wyniki.model.trafienia += 1;
	}

	wyniki.bazowa.logLoss.push(logLoss(bazowa, wynik));
	wyniki.bazowa.brier.push(brier3(bazowa, wynik));
	wyniki.bazowa.over.push(brier2(over25Bazowe, over));
	if (wynik === 'home') wyniki.bazowa.trafienia += 1;

	// „Zawsze gospodarz" z prawdopodobieństwem 1 dałoby nieskończony log loss przy
	// pierwszej pomyłce, więc linia dostaje ostrożne 60/20/20.
	const zawszeDom = { home: 0.6, draw: 0.2, away: 0.2 };
	wyniki.gospodarz.logLoss.push(logLoss(zawszeDom, wynik));
	wyniki.gospodarz.brier.push(brier3(zawszeDom, wynik));
	if (wynik === 'home') wyniki.gospodarz.trafienia += 1;
}

const n = testowe.length;
console.log(`  meczów testowych: ${n} | z nieznaną drużyną: ${nieznane}`);
console.log('');
console.log('  ' + 'miara'.padEnd(26) + 'MODEL'.padStart(10) + 'CZĘSTOŚCI'.padStart(12) + 'ZAWSZE DOM'.padStart(12));
console.log('  ' + '-'.repeat(60));
console.log(
	'  ' +
		'log loss 1X2 (mniej=lepiej)'.padEnd(26) +
		f(srednia(wyniki.model.logLoss)).padStart(10) +
		f(srednia(wyniki.bazowa.logLoss)).padStart(12) +
		f(srednia(wyniki.gospodarz.logLoss)).padStart(12)
);
console.log(
	'  ' +
		'Brier 1X2 (mniej=lepiej)'.padEnd(26) +
		f(srednia(wyniki.model.brier)).padStart(10) +
		f(srednia(wyniki.bazowa.brier)).padStart(12) +
		f(srednia(wyniki.gospodarz.brier)).padStart(12)
);
console.log(
	'  ' +
		'Brier powyżej 2.5'.padEnd(26) +
		f(srednia(wyniki.model.over)).padStart(10) +
		f(srednia(wyniki.bazowa.over)).padStart(12) +
		'          —'
);
console.log(
	'  ' +
		'trafienia 1X2'.padEnd(26) +
		`${((100 * wyniki.model.trafienia) / n).toFixed(1)}%`.padStart(10) +
		`${((100 * wyniki.bazowa.trafienia) / n).toFixed(1)}%`.padStart(12) +
		`${((100 * wyniki.gospodarz.trafienia) / n).toFixed(1)}%`.padStart(12)
);

const lepszy =
	srednia(wyniki.model.logLoss) < srednia(wyniki.bazowa.logLoss) &&
	srednia(wyniki.model.brier) < srednia(wyniki.bazowa.brier);

console.log('');
console.log(
	lepszy
		? '  WERDYKT: model bije linie odniesienia na obu miarach — można go wpuścić do produkcji.'
		: '  WERDYKT: model NIE bije linii odniesienia. Nie wolno go włączyć; to też jest wynik.'
);
process.exit(lepszy ? 0 : 2);
