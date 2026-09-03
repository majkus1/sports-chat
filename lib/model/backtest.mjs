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
const { entryThresholdFor, MARKET_CEILING, MIN_PROBABILITY, MIN_LIFT, BASE_RATES } = await import(
	'@/lib/picks/policy'
);
const { loadMarketData, matchFixture, marketProbabilities, FOOTBALL_DATA_CODES } = await import(
	'./marketData.mjs'
);

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
			leagueName: r.league?.name ?? null,
			homeId: r.teams?.home?.id,
			awayId: r.teams?.away?.id,
			// Nazwy tylko do dopasowania z archiwum kursów — model ich nie używa.
			homeName: r.teams?.home?.name ?? null,
			awayName: r.teams?.away?.name ?? null,
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

/*
 * KURSY ZAMKNIĘCIA — linia odniesienia, której model raczej nie pobije, i o to chodzi.
 *
 * Nikt nie bije zamknięcia Pinnacle na dłuższą metę; pytanie brzmi, JAK DALEKO model jest
 * od rynku i w których meczach rozjeżdża się systematycznie. To jedyna droga, żeby sprawdzić,
 * czy próg przewagi w `lib/picks/policy` jest dobrze ustawiony, zamiast zgadywać go drugi raz.
 * `--market=off` wyłącza pobieranie.
 */
const MARKET = arg('market', 'on') !== 'off';
let rynekDane = new Map();
if (MARKET) {
	const ligiZKursami = ligi.filter((id) => FOOTBALL_DATA_CODES.has(id));
	console.log(
		`\nPobieram kursy zamknięcia z football-data.co.uk (${ligiZKursami.length} lig × ${SEASONS.length} sezonów)...`
	);
	const archiwum = await loadMarketData(ligiZKursami, SEASONS);
	rynekDane = archiwum.byLeague;
	console.log(
		`  wierszy z kursami: ${archiwum.rows}${archiwum.errors.length ? ` | błędy: ${archiwum.errors.join('; ')}` : ''}`
	);
}

console.log('\nUczę model na danych sprzed daty podziału...');
let model = fitRatings(uczace, { referenceDate: SPLIT_DATE });
model = { ...model, rho: fitRho(uczace, model) };

console.log(
	`  drużyn: ${model.teams.size} | przewaga boiska: ${model.homeAdvantage.toFixed(3)} | rho: ${model.rho} | log-wiarogodność (uczące): ${f(logLikelihood(model, uczace))}`
);

/**
 * Odstęp między przeliczeniami modelu w dniach; `0` wyłącza aktualizowanie.
 *
 * Model uczony raz i puszczony na cały sezon to NIE jest to, co robiłaby produkcja —
 * tam każdy nowy wynik trafia do danych następnego dnia. Pierwsza wersja backtestu mierzyła
 * więc model gorszy od tego, który faktycznie by działał, i dodatkowo karała go za
 * beniaminków, o których nie mógł nic wiedzieć przez dwanaście miesięcy.
 *
 * Przeliczenie startuje z poprzednich parametrów, więc kolejne dopasowania są tanie.
 */
const REFIT_DAYS = Number(arg('refit-days', '14'));

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

/*
 * Rynki dwustanowe oceniane osobno.
 *
 * Jeden zbiorczy wynik ukrywa to, co najważniejsze: model wyprowadzony z tej samej macierzy
 * potrafi być dobry w jednym rynku i bezużyteczny w drugim. Wynik meczu zależy od RÓŻNICY
 * oczekiwanych goli, a progi bramkowe od ich SUMY — to dwie różne wielkości i nie ma powodu,
 * żeby model radził sobie z nimi jednakowo. Bez tego rozbicia oddalibyśmy mu rynki, w których
 * szkodzi.
 */
const RYNKI_DWUSTANOWE = [
	{ nazwa: 'powyżej 1.5 gola', p: (r) => r.totalGoals[1.5].over, zaszlo: (m) => m.homeGoals + m.awayGoals > 1.5 },
	{ nazwa: 'powyżej 2.5 gola', p: (r) => r.totalGoals[2.5].over, zaszlo: (m) => m.homeGoals + m.awayGoals > 2.5 },
	{ nazwa: 'powyżej 3.5 gola', p: (r) => r.totalGoals[3.5].over, zaszlo: (m) => m.homeGoals + m.awayGoals > 3.5 },
	{ nazwa: 'obie strzelą', p: (r) => r.btts.yes, zaszlo: (m) => m.homeGoals > 0 && m.awayGoals > 0 },
	{ nazwa: 'podwójna szansa 1X', p: (r) => r.doubleChance['1X'], zaszlo: (m) => m.homeGoals >= m.awayGoals },
	{ nazwa: 'podwójna szansa X2', p: (r) => r.doubleChance.X2, zaszlo: (m) => m.awayGoals >= m.homeGoals },
	{ nazwa: 'gospodarz strzeli', p: (r) => r.teamGoals.home[0.5].over, zaszlo: (m) => m.homeGoals > 0 },
	{ nazwa: 'gość strzeli', p: (r) => r.teamGoals.away[0.5].over, zaszlo: (m) => m.awayGoals > 0 },
];

/** Częstość każdego zdarzenia w danych UCZĄCYCH — linia odniesienia dla tego rynku. */
const bazoweRynki = RYNKI_DWUSTANOWE.map(
	(r) => uczace.filter((m) => r.zaszlo(m)).length / uczace.length
);
const wynikiRynkow = RYNKI_DWUSTANOWE.map(() => ({ model: [], bazowa: [], sredniaPrognoza: [] }));
let nieznane = 0;
/** Różnice log lossu mecz po meczu — z nich liczymy istotność, nie z samych średnich. */
const roznice = [];
/** Osobno mecze, w których model znał obie drużyny — reszta to prognoza z niczego. */
const znane = { model: [], bazowa: [] };

/*
 * Pomiar wobec rynku — na TYCH SAMYCH meczach dla modelu, rynku i częstości, bo tylko
 * sparowane porównanie coś znaczy. Do tego kalibracja: w kubełkach prawdopodobieństwa
 * modelu dla gospodarzy zestawiamy średnią modelu, średnią rynku i faktyczną częstość.
 * Jeśli w kubełku 80–89% rynek mówi średnio 94%, a gospodarze wygrywają w 93%, to model
 * jest tam systematycznie niedoszacowany — dokładnie ten przypadek, z którego wziął się
 * sufit rynkowy.
 */
const rynek = {
	n: 0,
	model: [],
	modelBrier: [],
	rynek: [],
	rynekBrier: [],
	bazowa: [],
	roznice: [],
	overModel: [],
	overRynek: [],
	pewniaki: 0,
	pewniakiDC: 0,
	typyPewne: 0,
	typyPewneDC: 0,
	typy: 0,
	typyDC: 0,
};
const kalibracja = Array.from({ length: 10 }, () => ({ n: 0, model: 0, rynek: 0, zaszlo: 0 }));
const PROG = {
	home: entryThresholdFor({ type: 'matchWinner', value: 'home' }) / 100,
	away: entryThresholdFor({ type: 'matchWinner', value: 'away' }) / 100,
	'1X': entryThresholdFor({ type: 'doubleChance', value: '1X' }) / 100,
	X2: entryThresholdFor({ type: 'doubleChance', value: 'X2' }) / 100,
};
const SUFIT = MARKET_CEILING / 100;

/*
 * PRÓG PRZEWAGI — czy `MIN_LIFT` jest ustawiony dobrze.
 *
 * Poprzednia wersja backtestu mierzyła jakość prognozy, ale nie regułę selekcji, więc próg
 * pozostawał wyborem, nie pomiarem. Tutaj każda selekcja każdego meczu testowego jest
 * sprawdzana tą samą regułą co produkcja (procent i przewaga nad normą), a potem liczymy,
 * ile typów by z tego wyszło i jak trafiały. Miarą NIE jest sama trafność — typ na 85%
 * trafia w 85% i nic to nie znaczy. Miarą jest PRZEWAGA nad normą tych samych selekcji:
 * o ile więcej trafiliśmy, niż dałoby zgadywanie średniej ligowej.
 *
 * Normy bierzemy z `lib/picks/policy`, czyli dokładnie te, którymi filtruje produkcja —
 * a nie z bieżących danych. Gdyby rozjechały się z rzeczywistością, ma to być widać
 * w wyniku, nie zniknąć w zmienionej definicji.
 */
const SELEKCJE_PROGU = [
	{
		nazwa: 'wygrana gospodarzy',
		base: BASE_RATES.matchWinner.home,
		p: (r) => r.matchWinner.home,
		zaszlo: (m) => m.homeGoals > m.awayGoals,
		rynek: (mp) => mp.home,
	},
	{
		nazwa: 'wygrana gości',
		base: BASE_RATES.matchWinner.away,
		p: (r) => r.matchWinner.away,
		zaszlo: (m) => m.awayGoals > m.homeGoals,
		rynek: (mp) => mp.away,
	},
	{
		nazwa: 'podwójna szansa 1X',
		base: BASE_RATES.doubleChance['1X'],
		p: (r) => r.doubleChance['1X'],
		zaszlo: (m) => m.homeGoals >= m.awayGoals,
		rynek: (mp) => mp.home + mp.draw,
	},
	{
		nazwa: 'podwójna szansa X2',
		base: BASE_RATES.doubleChance.X2,
		p: (r) => r.doubleChance.X2,
		zaszlo: (m) => m.awayGoals >= m.homeGoals,
		rynek: (mp) => mp.away + mp.draw,
	},
	{
		nazwa: 'gospodarz strzeli',
		base: BASE_RATES.teamGoals.home,
		p: (r) => r.teamGoals.home[0.5].over,
		zaszlo: (m) => m.homeGoals > 0,
		// Archiwum football-data nie ma kursów na gole drużyny — sufitu tu nie zmierzymy.
		rynek: () => null,
	},
	{
		nazwa: 'gość strzeli',
		base: BASE_RATES.teamGoals.away,
		p: (r) => r.teamGoals.away[0.5].over,
		zaszlo: (m) => m.awayGoals > 0,
		rynek: () => null,
	},
];
/** Wszystkie selekcje wszystkich meczów testowych — do przemiatania progów. */
const kandydaci = [];

/*
 * ROZBICIE PO ROZGRYWKACH — gdzie model pomaga, a gdzie szkodzi.
 *
 * Jedna liczba na całość ukrywa najważniejsze: model dopasowany do ligi o dużej próbie
 * i stabilnym składzie robi co innego niż ten sam model puszczony na rozgrywki, w których
 * drużyna ma za sobą kilkanaście spotkań. Bez tego rozbicia werdykt „model jest gorszy"
 * nie mówi, czy wyłączyć go wszędzie, czy tylko tam, gdzie faktycznie szkodzi.
 */
const wgLigi = new Map();

let przeliczonyDo = SPLIT_DATE.getTime();
let przeliczen = 0;

for (const m of testowe) {
	/*
	 * Aktualizacja modelu w rytmie, w jakim robiłaby to produkcja.
	 *
	 * Uczymy WYŁĄCZNIE na meczach rozegranych przed tym spotkaniem. Gdyby do danych
	 * uczących wpadł choćby jeden mecz z tego samego dnia, model znałby część odpowiedzi
	 * i cały backtest przestałby cokolwiek znaczyć.
	 */
	const kiedy = new Date(m.date).getTime();
	if (REFIT_DAYS > 0 && kiedy >= przeliczonyDo + REFIT_DAYS * 86_400_000) {
		const doNauki = wszystkie.filter((x) => new Date(x.date).getTime() < kiedy);
		model = fitRatings(doNauki, { referenceDate: new Date(kiedy), rho: model.rho });
		przeliczonyDo = kiedy;
		przeliczen += 1;
	}

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

	RYNKI_DWUSTANOWE.forEach((rynek, i) => {
		const prognoza = rynek.p(rynki);
		const zaszlo = rynek.zaszlo(m);
		wynikiRynkow[i].model.push(brier2(prognoza, zaszlo));
		wynikiRynkow[i].bazowa.push(brier2(bazoweRynki[i], zaszlo));
		wynikiRynkow[i].sredniaPrognoza.push(prognoza);
	});

	roznice.push(logLoss(bazowa, wynik) - logLoss(p, wynik));
	if (eg.known) {
		znane.model.push(logLoss(p, wynik));
		znane.bazowa.push(logLoss(bazowa, wynik));
	}

	const wiersz = rynekDane.size ? matchFixture(m, rynekDane.get(m.leagueId)) : null;
	const mp = wiersz ? marketProbabilities(wiersz) : null;

	const wpisLigi = wgLigi.get(m.leagueId) || {
		nazwa: m.leagueName || String(m.leagueId),
		tier: LEAGUE_TIERS.get(m.leagueId) ?? null,
		n: 0,
		model: 0,
		bazowa: 0,
	};
	wpisLigi.n += 1;
	wpisLigi.model += logLoss(p, wynik);
	wpisLigi.bazowa += logLoss(bazowa, wynik);
	wgLigi.set(m.leagueId, wpisLigi);

	for (const s of SELEKCJE_PROGU) {
		const p = 100 * s.p(rynki);
		const rynkowe = mp ? s.rynek(mp) : null;
		kandydaci.push({
			nazwa: s.nazwa,
			p,
			base: s.base,
			lift: Math.round(p - s.base),
			won: s.zaszlo(m),
			market: Number.isFinite(rynkowe) ? 100 * rynkowe : null,
		});
	}
	if (mp) {
		rynek.n += 1;
		rynek.model.push(logLoss(p, wynik));
		rynek.modelBrier.push(brier3(p, wynik));
		rynek.rynek.push(logLoss(mp, wynik));
		rynek.rynekBrier.push(brier3(mp, wynik));
		rynek.bazowa.push(logLoss(bazowa, wynik));
		// Dodatnie = model lepszy od rynku; spodziewane ujemne.
		rynek.roznice.push(logLoss(mp, wynik) - logLoss(p, wynik));
		if (mp.over25 !== null) {
			rynek.overModel.push(brier2(rynki.totalGoals[2.5].over, over));
			rynek.overRynek.push(brier2(mp.over25, over));
		}

		const kubelek = Math.min(9, Math.floor(p.home * 10));
		kalibracja[kubelek].n += 1;
		kalibracja[kubelek].model += p.home;
		kalibracja[kubelek].rynek += mp.home;
		kalibracja[kubelek].zaszlo += wynik === 'home' ? 1 : 0;

		// „Kurs 1,04": ile meczów rynek uznaje za rozstrzygnięte — i ile z nich nasz próg
		// przepuściłby jako typ, gdyby nie sufit rynkowy.
		const dc1X = mp.home + mp.draw;
		const dcX2 = mp.away + mp.draw;
		if (Math.max(mp.home, mp.away) >= SUFIT) rynek.pewniaki += 1;
		if (Math.max(dc1X, dcX2) >= SUFIT) rynek.pewniakiDC += 1;
		const typHome = p.home >= PROG.home;
		const typAway = p.away >= PROG.away;
		const typ1X = rynki.doubleChance['1X'] >= PROG['1X'];
		const typX2 = rynki.doubleChance.X2 >= PROG.X2;
		if (typHome || typAway) rynek.typy += 1;
		if (typ1X || typX2) rynek.typyDC += 1;
		if ((typHome && mp.home >= SUFIT) || (typAway && mp.away >= SUFIT)) rynek.typyPewne += 1;
		if ((typ1X && dc1X >= SUFIT) || (typX2 && dcX2 >= SUFIT)) rynek.typyPewneDC += 1;
	}

	// „Zawsze gospodarz" z prawdopodobieństwem 1 dałoby nieskończony log loss przy
	// pierwszej pomyłce, więc linia dostaje ostrożne 60/20/20.
	const zawszeDom = { home: 0.6, draw: 0.2, away: 0.2 };
	wyniki.gospodarz.logLoss.push(logLoss(zawszeDom, wynik));
	wyniki.gospodarz.brier.push(brier3(zawszeDom, wynik));
	if (wynik === 'home') wyniki.gospodarz.trafienia += 1;
}

const n = testowe.length;
console.log(
	`  meczów testowych: ${n} | z nieznaną drużyną: ${nieznane} (${((100 * nieznane) / n).toFixed(1)}%) | przeliczeń modelu: ${przeliczen}`
);
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

/*
 * CZY TA PRZEWAGA JEST PRAWDZIWA.
 *
 * Sama różnica średnich nie odpowiada na to pytanie. Przy trzech tysiącach meczów poprawa
 * o 0,01 może być realna albo być szumem — rozstrzyga to dopiero rozrzut różnic mecz po
 * meczu. Liczymy sparowany błąd standardowy: obie prognozy dotyczą TYCH SAMYCH spotkań,
 * więc porównujemy różnice, a nie dwie niezależne średnie.
 *
 * Statystyka t powyżej 2 znaczy z grubsza, że przewagi nie da się wytłumaczyć przypadkiem.
 */
const sredniaRoznica = srednia(roznice);
const wariancja =
	roznice.reduce((acc, r) => acc + (r - sredniaRoznica) ** 2, 0) / Math.max(1, roznice.length - 1);
const bladStandardowy = Math.sqrt(wariancja / roznice.length);
const t = bladStandardowy > 0 ? sredniaRoznica / bladStandardowy : 0;

/*
 * Które rynki wolno oddać modelowi.
 *
 * Kryterium jest jedno i twarde: model musi mieć NIŻSZY Brier niż stała prognoza równa
 * częstości zdarzenia. Rynek, w którym tego nie osiąga, nie jest „trochę gorszy" — jego
 * zmienność mecz po meczu to szum dokładany do liczby, którą i tak znamy z góry.
 */
console.log('');
console.log('  RYNKI DWUSTANOWE (Brier — mniej znaczy lepiej)');
console.log(
	'    ' + 'rynek'.padEnd(22) + 'MODEL'.padStart(9) + 'CZĘSTOŚĆ'.padStart(11) + 'ZYSK'.padStart(10) + '   werdykt'
);
console.log('    ' + '-'.repeat(62));

const rynkiDoUzycia = [];
RYNKI_DWUSTANOWE.forEach((rynek, i) => {
	const bModel = srednia(wynikiRynkow[i].model);
	const bBaza = srednia(wynikiRynkow[i].bazowa);
	const zysk = bBaza - bModel;
	const uzywalny = zysk > 0;
	if (uzywalny) rynkiDoUzycia.push(rynek.nazwa);

	console.log(
		'    ' +
			rynek.nazwa.padEnd(22) +
			f(bModel).padStart(9) +
			f(bBaza).padStart(11) +
			(zysk >= 0 ? '+' : '') + f(zysk).padStart(9) +
			(uzywalny ? '   nadaje się' : '   SZKODZI')
	);
});

console.log('');
console.log(`  Rynki, które można oddać modelowi: ${rynkiDoUzycia.length ? rynkiDoUzycia.join(', ') : 'żaden'}`);

console.log('');
console.log('  ISTOTNOŚĆ PRZEWAGI NAD CZĘSTOŚCIAMI (log loss, sparowany)');
console.log(
	`    poprawa: ${f(sredniaRoznica)} ± ${f(1.96 * bladStandardowy)} (95% ufności) | t = ${t.toFixed(2)}`
);
/*
 * Znak `t` decyduje o wyroku, nie jego wartość bezwzględna.
 *
 * Pierwsza wersja sprawdzała `Math.abs(t) < 2`, więc przy t = −2,31 wypisywała „Przewaga
 * istotna statystycznie" — dla wyniku, który znaczy DOKŁADNIE ODWROTNIE: model jest istotnie
 * GORSZY od częstości. Narzędzie pomiarowe, które chwali porażkę, jest gorsze niż jego brak.
 */
console.log(
	`    ${
		t <= -2
			? 'MODEL JEST ISTOTNIE GORSZY OD CZĘSTOŚCI — nie wolno go włączyć w tym zakresie.'
			: t >= 2
				? 'Przewaga istotna statystycznie.'
				: 'W GRANICACH SZUMU — przewagi nie da się odróżnić od przypadku.'
	}`
);

// Mecze, w których model znał obie drużyny — reszta to prognoza z przeciętnych ocen,
// czyli w praktyce te same częstości opakowane w model.
if (znane.model.length) {
	console.log('');
	console.log(
		`  TYLKO MECZE ZE ZNANYMI DRUŻYNAMI (${znane.model.length}): model ${f(srednia(znane.model))} vs częstości ${f(srednia(znane.bazowa))}`
	);
}

if (rynek.n) {
	const wLigach = testowe.filter((m) => FOOTBALL_DATA_CODES.has(m.leagueId)).length;
	const pokrycie = wLigach ? ((100 * rynek.n) / wLigach).toFixed(0) : '0';

	console.log('');
	console.log(
		`  RYNEK BUKMACHERSKI — kursy zamknięcia z football-data.co.uk po zdjęciu marży (${rynek.n} dopasowanych z ${wLigach} meczów w ligach z archiwum, ${pokrycie}%)`
	);
	console.log('    ' + 'miara'.padEnd(24) + 'MODEL'.padStart(9) + 'RYNEK'.padStart(9) + 'CZĘSTOŚCI'.padStart(11));
	console.log('    ' + '-'.repeat(53));
	console.log(
		'    ' +
			'log loss 1X2'.padEnd(24) +
			f(srednia(rynek.model)).padStart(9) +
			f(srednia(rynek.rynek)).padStart(9) +
			f(srednia(rynek.bazowa)).padStart(11)
	);
	console.log(
		'    ' +
			'Brier 1X2'.padEnd(24) +
			f(srednia(rynek.modelBrier)).padStart(9) +
			f(srednia(rynek.rynekBrier)).padStart(9) +
			'          —'
	);
	if (rynek.overModel.length) {
		console.log(
			'    ' +
				`Brier powyżej 2.5 (${rynek.overModel.length})`.padEnd(24) +
				f(srednia(rynek.overModel)).padStart(9) +
				f(srednia(rynek.overRynek)).padStart(9) +
				'          —'
		);
	}

	const sr = srednia(rynek.roznice);
	const war = rynek.roznice.reduce((acc, r) => acc + (r - sr) ** 2, 0) / Math.max(1, rynek.roznice.length - 1);
	const se = Math.sqrt(war / rynek.roznice.length);
	const tRynek = se > 0 ? sr / se : 0;
	console.log('');
	console.log(
		`    model wobec rynku (log loss, sparowany): ${f(sr)} ± ${f(1.96 * se)} | t = ${tRynek.toFixed(2)}  (ujemne = rynek lepszy)`
	);
	console.log(
		`    ${
			tRynek <= -2
				? 'Rynek wie więcej — to normalne. Liczy się rozmiar luki i miejsca, gdzie się rozjeżdżamy (kalibracja niżej).'
				: tRynek >= 2
					? 'Model bije zamknięcie rynku — sprawdź dwa razy, czy w danych nie ma przecieku z przyszłości.'
					: 'Różnica w granicach szumu.'
		}`
	);

	console.log('');
	console.log('    KALIBRACJA WOBEC RYNKU — szansa gospodarzy w kubełkach prognozy modelu');
	console.log('    ' + 'kubełek'.padEnd(10) + 'n'.padStart(6) + 'model'.padStart(9) + 'rynek'.padStart(9) + 'fakt'.padStart(9) + '   odczyt');
	kalibracja.forEach((k, i) => {
		if (!k.n) return;
		const sm = k.model / k.n;
		const sr2 = k.rynek / k.n;
		const sf = k.zaszlo / k.n;
		const luka = sr2 - sm;
		const odczyt =
			Math.abs(luka) < 0.03
				? 'zgodnie z rynkiem'
				: luka > 0
					? `model niedoszacowany o ${(100 * luka).toFixed(0)} pkt`
					: `model przeszacowany o ${(100 * -luka).toFixed(0)} pkt`;
		console.log(
			'    ' +
				`${i * 10}–${i * 10 + 9}%`.padEnd(10) +
				String(k.n).padStart(6) +
				`${(100 * sm).toFixed(0)}%`.padStart(9) +
				`${(100 * sr2).toFixed(0)}%`.padStart(9) +
				`${(100 * sf).toFixed(0)}%`.padStart(9) +
				'   ' +
				odczyt
		);
	});

	console.log('');
	console.log(`    „PEWNIAKI" — rynek daje co najmniej ${MARKET_CEILING}% (sufit z lib/picks/policy):`);
	console.log(
		`      na wyniku meczu: ${rynek.pewniaki} z ${rynek.n} (${((100 * rynek.pewniaki) / rynek.n).toFixed(1)}%) | na podwójnej szansie: ${rynek.pewniakiDC} (${((100 * rynek.pewniakiDC) / rynek.n).toFixed(1)}%)`
	);
	console.log(
		`      typy, które przeszłyby próg przewagi, a rynek uznaje za pewne: wynik meczu ${rynek.typyPewne} z ${rynek.typy}, podwójna szansa ${rynek.typyPewneDC} z ${rynek.typyDC} — tyle odetnie sufit rynkowy.`
	);
}

/*
 * Przemiatanie progu przewagi.
 *
 * `edge` to trafność minus średnia norma wybranych selekcji — jedyna liczba, która mówi,
 * czy reguła cokolwiek wnosi. Rośnie wraz z progiem tylko do momentu, w którym zaczyna
 * odcinać dobre typy razem ze złymi; tam, gdzie przestaje rosnąć, a liczba typów wciąż
 * spada, jest granica sensu.
 */
/*
 * GDZIE MODEL POMAGA, A GDZIE SZKODZI.
 *
 * Werdykt liczony na całości odpowiada na pytanie „czy włączyć model", a to jest złe
 * pytanie. Właściwe brzmi „w których rozgrywkach go włączyć" — bo dopasowanie do ligi
 * z kompletem wyników i stabilnymi składami to inne zadanie niż do rozgrywek, w których
 * połowa drużyn ma za sobą kilkanaście meczów.
 */
const ligiPosortowane = [...wgLigi.entries()]
	.map(([id, w]) => ({
		id,
		nazwa: w.nazwa,
		tier: w.tier,
		n: w.n,
		model: w.model / w.n,
		bazowa: w.bazowa / w.n,
		zysk: (w.bazowa - w.model) / w.n,
	}))
	.filter((l) => l.n >= 50)
	.sort((a, b) => a.zysk - b.zysk);

if (ligiPosortowane.length) {
	const pomaga = ligiPosortowane.filter((l) => l.zysk > 0);
	const szkodzi = ligiPosortowane.filter((l) => l.zysk <= 0);
	const suma = (list, pole) => list.reduce((acc, l) => acc + l[pole] * l.n, 0);
	const meczow = (list) => list.reduce((acc, l) => acc + l.n, 0);

	console.log('');
	console.log('  ROZGRYWKI — gdzie model pomaga, a gdzie szkodzi (log loss 1X2, min. 50 meczów)');
	console.log(
		'    ' + 'rozgrywki'.padEnd(30) + 'poz.'.padStart(5) + 'n'.padStart(6) + 'MODEL'.padStart(9) + 'CZĘSTOŚCI'.padStart(11) + 'ZYSK'.padStart(9)
	);
	console.log('    ' + '-'.repeat(70));
	for (const l of ligiPosortowane) {
		console.log(
			'    ' +
				l.nazwa.slice(0, 29).padEnd(30) +
				String(l.tier ?? '—').padStart(5) +
				String(l.n).padStart(6) +
				f(l.model).padStart(9) +
				f(l.bazowa).padStart(11) +
				`${l.zysk >= 0 ? '+' : ''}${l.zysk.toFixed(4)}`.padStart(9)
		);
	}

	console.log('');
	if (szkodzi.length && meczow(szkodzi)) {
		console.log(
			`    SZKODZI w ${szkodzi.length} rozgrywkach (${meczow(szkodzi)} meczów): model ${f(suma(szkodzi, 'model') / meczow(szkodzi))} wobec ${f(suma(szkodzi, 'bazowa') / meczow(szkodzi))}`
		);
	}
	if (pomaga.length && meczow(pomaga)) {
		console.log(
			`    POMAGA w ${pomaga.length} rozgrywkach (${meczow(pomaga)} meczów): model ${f(suma(pomaga, 'model') / meczow(pomaga))} wobec ${f(suma(pomaga, 'bazowa') / meczow(pomaga))}`
		);
		console.log(
			`    Identyfikatory do LEAGUE_TIERS albo do listy dopuszczonej dla modelu: ${pomaga.map((l) => l.id).join(', ')}`
		);
	}
}

console.log('');
console.log(`  PRÓG PRZEWAGI NAD NORMĄ (dolna granica ${MIN_PROBABILITY}%, obecny próg ${MIN_LIFT} pkt)`);
console.log(
	'    ' + 'próg'.padEnd(8) + 'typów'.padStart(8) + 'deklar.'.padStart(9) + 'trafność'.padStart(10) + 'norma'.padStart(9) + 'PRZEWAGA'.padStart(11) + '   po sufcie rynkowym'
);
console.log('    ' + '-'.repeat(72));

for (const prog of [0, 6, 9, 12, 15, 18, 21, 25]) {
	const wybrane = kandydaci.filter((k) => k.p >= MIN_PROBABILITY && k.lift >= prog);
	if (!wybrane.length) continue;
	const traf = (100 * wybrane.filter((k) => k.won).length) / wybrane.length;
	const norma = srednia(wybrane.map((k) => k.base));
	/*
	 * Średnie deklarowane prawdopodobieństwo obok trafności — bez tego nie widać, czy typy
	 * są uczciwie wycenione. Deklaracja 78% przy trafności 75% znaczy, że pokazujemy
	 * użytkownikowi liczbę zawyżoną o trzy punkty, choć sama selekcja jest dobra.
	 */
	const deklarowane = srednia(wybrane.map((k) => k.p));
	const zSufitem = wybrane.filter((k) => !(k.market !== null && k.market >= MARKET_CEILING));
	const trafSufit = zSufitem.length
		? (100 * zSufitem.filter((k) => k.won).length) / zSufitem.length
		: null;
	const normaSufit = zSufitem.length ? srednia(zSufitem.map((k) => k.base)) : null;

	console.log(
		'    ' +
			`${prog} pkt`.padEnd(8) +
			String(wybrane.length).padStart(8) +
			`${deklarowane.toFixed(1)}%`.padStart(9) +
			`${traf.toFixed(1)}%`.padStart(10) +
			`${norma.toFixed(1)}%`.padStart(9) +
			`${traf - norma >= 0 ? '+' : ''}${(traf - norma).toFixed(1)} pkt`.padStart(11) +
			(trafSufit === null
				? ''
				: `   ${zSufitem.length} typów, przewaga ${trafSufit - normaSufit >= 0 ? '+' : ''}${(trafSufit - normaSufit).toFixed(1)} pkt`) +
			(prog === MIN_LIFT ? '   <— OBECNY' : '')
	);
}

console.log('');
console.log('    ROZBICIE PRZY OBECNYM PROGU — czy któraś selekcja psuje całość');
console.log('    ' + 'selekcja'.padEnd(22) + 'typów'.padStart(8) + 'trafność'.padStart(10) + 'norma'.padStart(9) + 'PRZEWAGA'.padStart(11));
for (const s of SELEKCJE_PROGU) {
	const wybrane = kandydaci.filter((k) => k.nazwa === s.nazwa && k.p >= MIN_PROBABILITY && k.lift >= MIN_LIFT);
	if (!wybrane.length) {
		console.log('    ' + s.nazwa.padEnd(22) + '0'.padStart(8) + '        —' + '        —' + '          —');
		continue;
	}
	const traf = (100 * wybrane.filter((k) => k.won).length) / wybrane.length;
	console.log(
		'    ' +
			s.nazwa.padEnd(22) +
			String(wybrane.length).padStart(8) +
			`${traf.toFixed(1)}%`.padStart(10) +
			`${s.base.toFixed(1)}%`.padStart(9) +
			`${traf - s.base >= 0 ? '+' : ''}${(traf - s.base).toFixed(1)} pkt`.padStart(11)
	);
}

/*
 * Czy normy z `lib/picks/policy` nadal odpowiadają rzeczywistości.
 *
 * Tabela w polityce powstała na 3590 meczach uczących. Jeśli faktyczne częstości w danych
 * TESTOWYCH odjechały o kilka punktów, progi liczą przewagę względem nieaktualnej normy —
 * a wtedy cała reguła mierzy coś innego, niż myślimy.
 */
console.log('');
console.log('    NORMY Z POLITYKI WOBEC DANYCH TESTOWYCH');
for (const s of SELEKCJE_PROGU) {
	const wszystkie = kandydaci.filter((k) => k.nazwa === s.nazwa);
	const faktyczna = (100 * wszystkie.filter((k) => k.won).length) / wszystkie.length;
	const roznica = faktyczna - s.base;
	console.log(
		'    ' +
			s.nazwa.padEnd(22) +
			`polityka ${s.base.toFixed(1)}%`.padStart(18) +
			`  dane ${faktyczna.toFixed(1)}%`.padStart(14) +
			`   ${Math.abs(roznica) < 2 ? 'zgodne' : `ROZJAZD ${roznica > 0 ? '+' : ''}${roznica.toFixed(1)} pkt`}`
	);
}

const lepszy =
	srednia(wyniki.model.logLoss) < srednia(wyniki.bazowa.logLoss) &&
	srednia(wyniki.model.brier) < srednia(wyniki.bazowa.brier) &&
	// Sama przewaga nie wystarcza — musi być odróżnialna od przypadku. Bez tego warunku
	// werdykt przepuszczał poprawę rzędu setnych, o której nie wiadomo, czy istnieje.
	t >= 2;

console.log('');
console.log(
	lepszy
		? '  WERDYKT: przewaga nad częstościami jest istotna statystycznie — model można wpuścić do produkcji.'
		: '  WERDYKT: brak przewagi odróżnialnej od przypadku. Nie wolno go włączyć; to też jest wynik.'
);
process.exit(lepszy ? 0 : 2);
