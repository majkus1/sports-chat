import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Rozkład wyniku meczu i wyprowadzone z niego rynki.
 *
 * Testy pilnują trzech rzeczy: że macierz jest rozkładem prawdopodobieństwa (suma 1),
 * że rynki wyprowadzone z niej są WZAJEMNIE SPÓJNE — czego cztery osobne heurystyki nie
 * gwarantowały — oraz że korekta Dixona-Colesa działa w tę stronę, w którą ma działać.
 */

setupEnv();

const { scoreMatrix, marketProbabilities, predictMarkets, tau, DEFAULT_RHO, MAX_GOALS } =
	await import('@/lib/model/dixonColes');
const { fitRatings, expectedGoals } = await import('@/lib/model/ratings');

const sumaMacierzy = (m) => m.reduce((s, wiersz) => s + wiersz.reduce((a, b) => a + b, 0), 0);
const blisko = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

describe('macierz wyników', () => {
	test('jest rozkładem prawdopodobieństwa', () => {
		for (const [lh, la] of [[1.4, 1.1], [0.3, 0.2], [3.5, 2.8]]) {
			assert.ok(
				blisko(sumaMacierzy(scoreMatrix(lh, la)), 1, 1e-9),
				`suma dla λ=${lh}/${la} musi wynosić 1`
			);
		}
	});

	test('wyższa oczekiwana liczba goli przesuwa masę na wyższe wyniki', () => {
		const spokojny = scoreMatrix(0.8, 0.7);
		const otwarty = scoreMatrix(2.4, 2.1);

		assert.ok(otwarty[0][0] < spokojny[0][0], '0:0 musi być mniej prawdopodobne w otwartym meczu');
	});

	test('zerowe i ujemne średnie nie wywracają rachunku', () => {
		assert.ok(blisko(sumaMacierzy(scoreMatrix(0, 0)), 1, 1e-9));
		assert.ok(blisko(sumaMacierzy(scoreMatrix(-1, 2)), 1, 1e-9));
	});
});

describe('korekta Dixona-Colesa', () => {
	test('ujemne rho podnosi remisy niskobramkowe i obniża 1:0', () => {
		const bez = scoreMatrix(1.3, 1.1, 0);
		const z = scoreMatrix(1.3, 1.1, DEFAULT_RHO);

		assert.ok(z[0][0] > bez[0][0], '0:0 ma być częstsze');
		assert.ok(z[1][1] > bez[1][1], '1:1 ma być częstsze');
		assert.ok(z[1][0] < bez[1][0], '1:0 ma być rzadsze');
		assert.ok(z[0][1] < bez[0][1], '0:1 ma być rzadsze');
	});

	test('korekta dotyka wyłącznie czterech pól', () => {
		assert.equal(tau(2, 1, 1.5, 1.2, DEFAULT_RHO), 1);
		assert.equal(tau(0, 3, 1.5, 1.2, DEFAULT_RHO), 1);
		assert.notEqual(tau(0, 0, 1.5, 1.2, DEFAULT_RHO), 1);
	});

	test('nigdy nie schodzi do zera ani poniżej', () => {
		// Skrajne średnie i duże rho to sytuacja, w której naiwna korekta wychodzi ujemna.
		for (const rho of [-0.5, 0.5]) {
			for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
				assert.ok(tau(x, y, 6, 6, rho) > 0, `tau(${x},${y}) przy rho=${rho} musi być dodatnie`);
			}
		}
	});

	test('rho podnosi łączne prawdopodobieństwo remisu', () => {
		const bez = marketProbabilities(scoreMatrix(1.4, 1.2, 0));
		const z = marketProbabilities(scoreMatrix(1.4, 1.2, DEFAULT_RHO));

		assert.ok(
			z.matchWinner.draw > bez.matchWinner.draw,
			'to jest cały powód istnienia korekty — czysty Poisson zaniża remisy'
		);
	});
});

describe('spójność rynków', () => {
	const rynki = predictMarkets(1.6, 1.2);

	test('trzy wyniki meczu sumują się do jedności', () => {
		const { home, draw, away } = rynki.matchWinner;
		assert.ok(blisko(home + draw + away, 1, 1e-9));
	});

	test('podwójna szansa jest sumą swoich składników, nie osobnym rachunkiem', () => {
		const { home, draw, away } = rynki.matchWinner;
		assert.ok(blisko(rynki.doubleChance['1X'], home + draw, 1e-9));
		assert.ok(blisko(rynki.doubleChance.X2, away + draw, 1e-9));
		assert.ok(blisko(rynki.doubleChance['12'], home + away, 1e-9));
	});

	test('progi goli są monotoniczne', () => {
		assert.ok(
			rynki.totalGoals[1.5].over > rynki.totalGoals[2.5].over,
			'powyżej 1.5 musi być bardziej prawdopodobne niż powyżej 2.5'
		);
		assert.ok(rynki.totalGoals[2.5].over > rynki.totalGoals[3.5].over);
	});

	test('każdy rynek dwustanowy sumuje się do jedności', () => {
		assert.ok(blisko(rynki.btts.yes + rynki.btts.no, 1, 1e-9));
		for (const prog of [1.5, 2.5, 3.5]) {
			assert.ok(blisko(rynki.totalGoals[prog].over + rynki.totalGoals[prog].under, 1, 1e-9));
		}
		assert.ok(blisko(rynki.teamGoals.home[0.5].over + rynki.teamGoals.home[0.5].under, 1, 1e-9));
	});

	test('faworyt z wyższą oczekiwaną liczbą goli ma wyższe prawdopodobieństwo wygranej', () => {
		const { home, away } = predictMarkets(2.1, 0.9).matchWinner;
		assert.ok(home > away);
	});
});

describe('szacowanie sił drużyn', () => {
	/**
	 * Sztuczna liga o znanej prawdzie: cztery drużyny grają każdy z każdym u siebie
	 * i na wyjeździe, a wynik powstaje z jawnej reguły — siła ataku strzelca, słabość
	 * obrony rywala i stały bonus dla gospodarza.
	 *
	 * Terminarz musi być symetryczny, inaczej przewaga własnego boiska jest nieodróżnialna
	 * od siły drużyn: gdyby lider grał wyłącznie u siebie, model przypisałby jego wygrane
	 * atakowi i nie miałby z czego wyliczyć bonusu za granie w domu.
	 */
	const atak = { 1: 2, 2: 1, 3: 1, 4: 0 };
	const slabosc = { 1: 0, 2: 0, 3: 1, 4: 2 };
	const BONUS_GOSPODARZA = 1;

	const mecze = [];
	const dzien = (i) => new Date(2026, 0, 1 + i).toISOString();
	let licznik = 0;
	for (let runda = 0; runda < 4; runda += 1) {
		for (const h of [1, 2, 3, 4]) {
			for (const a of [1, 2, 3, 4]) {
				if (h === a) continue;
				mecze.push({
					homeId: h,
					awayId: a,
					homeGoals: atak[h] + slabosc[a] + BONUS_GOSPODARZA,
					awayGoals: atak[a] + slabosc[h],
					date: dzien(licznik++),
				});
			}
		}
	}

	const model = fitRatings(mecze, { referenceDate: new Date(2026, 6, 1) });

	test('odróżnia drużynę mocną od słabej', () => {
		const mocna = model.teams.get(1);
		const slaba = model.teams.get(4);

		assert.ok(mocna.attack > slaba.attack, 'atak lidera musi być wyżej oceniony');
		assert.ok(mocna.defence > slaba.defence, 'obrona lidera musi być wyżej oceniona');
	});

	test('wykrywa przewagę własnego boiska bez podpowiedzi', () => {
		assert.ok(model.homeAdvantage > 0, 'w tych wynikach gospodarze wygrywają — model musi to zobaczyć');
	});

	test('oceny są wyśrodkowane, więc porównywalne między ligami', () => {
		const sumaAtakow = [...model.teams.values()].reduce((s, t) => s + t.attack, 0);
		assert.ok(Math.abs(sumaAtakow) < 1e-6, 'bez centrowania parametry dryfują w nieskończoność');
	});

	test('prognoza dla pary odzwierciedla różnicę sił', () => {
		const mocnyDom = expectedGoals(model, 1, 4);
		const slabyDom = expectedGoals(model, 4, 1);

		assert.ok(mocnyDom.lambdaHome > slabyDom.lambdaHome);
		assert.equal(mocnyDom.known, true);
	});

	test('nieznana drużyna dostaje oceny przeciętne i jest oznaczona', () => {
		const eg = expectedGoals(model, 1, 999);

		assert.equal(eg.known, false, 'wywołujący musi wiedzieć, że prognoza stoi na domysłach');
		assert.ok(Number.isFinite(eg.lambdaHome) && eg.lambdaHome > 0);
	});

	test('pusta lista meczów nie wywraca dopasowania', () => {
		assert.equal(fitRatings([]), null);
		assert.equal(fitRatings(null), null);
	});
});

describe('czy model naprawdę się uczy', () => {
	/*
	 * To jest miniaturowy backtest na danych o ZNANEJ prawdzie.
	 *
	 * Generujemy sezon z jawnie zadanych sił drużyn, losując gole z rozkładu Poissona —
	 * czyli tak, jak zachowuje się piłka w założeniu modelu. Uczymy na pierwszej połowie
	 * terminarza, sprawdzamy na drugiej i wymagamy, żeby model bił licznik częstości.
	 *
	 * Bez tego testu wiedzielibyśmy tylko, że kod się wykonuje. Prawdziwy backtest na
	 * danych z API (`lib/model/backtest.mjs`) odpowiada na to samo pytanie na prawdziwych
	 * meczach; tutaj sprawdzamy, że sam mechanizm uczenia działa i nie wymaga sieci.
	 */

	/** Generator z ziarnem — test musi dawać ten sam wynik przy każdym uruchomieniu. */
	function losowy(ziarno) {
		let stan = ziarno;
		return () => {
			stan = (stan * 1103515245 + 12345) % 2147483648;
			return stan / 2147483648;
		};
	}

	const rand = losowy(42);

	/** Losowanie liczby goli z rozkładu Poissona metodą Knutha. */
	function poisson(lambda) {
		const prog = Math.exp(-lambda);
		let k = 0;
		let p = 1;
		do {
			k += 1;
			p *= rand();
		} while (p > prog);
		return k - 1;
	}

	const SILA = { 1: 0.45, 2: 0.2, 3: 0.0, 4: -0.25, 5: -0.4, 6: -0.6 };
	const DRUZYNY = Object.keys(SILA).map(Number);
	const PRZEWAGA = 0.28;
	const BAZA = Math.log(1.35);

	const mecze = [];
	let dzien = 0;
	for (let runda = 0; runda < 8; runda += 1) {
		for (const h of DRUZYNY) {
			for (const a of DRUZYNY) {
				if (h === a) continue;
				mecze.push({
					homeId: h,
					awayId: a,
					homeGoals: poisson(Math.exp(BAZA + SILA[h] - SILA[a] / 2 + PRZEWAGA)),
					awayGoals: poisson(Math.exp(BAZA + SILA[a] - SILA[h] / 2)),
					date: new Date(2026, 0, 1 + dzien++).toISOString(),
				});
			}
		}
	}

	const podzial = Math.floor(mecze.length * 0.6);
	const uczace = mecze.slice(0, podzial);
	const testowe = mecze.slice(podzial);
	const model = fitRatings(uczace, { referenceDate: new Date(mecze[podzial].date) });

	const wynikMeczu = (m) =>
		m.homeGoals > m.awayGoals ? 'home' : m.homeGoals < m.awayGoals ? 'away' : 'draw';

	// Linia odniesienia: częstości wyników policzone WYŁĄCZNIE na danych uczących.
	const licznik = { home: 0, draw: 0, away: 0 };
	for (const m of uczace) licznik[wynikMeczu(m)] += 1;
	const bazowa = {
		home: licznik.home / uczace.length,
		draw: licznik.draw / uczace.length,
		away: licznik.away / uczace.length,
	};

	const logLoss = (p, wynik) => -Math.log(Math.max(1e-12, p[wynik]));
	const sredni = (list) => list.reduce((a, b) => a + b, 0) / list.length;

	test('bije licznik częstości na meczach, których nie widział', () => {
		const modelu = [];
		const bazy = [];

		for (const m of testowe) {
			const eg = expectedGoals(model, m.homeId, m.awayId);
			const p = predictMarkets(eg.lambdaHome, eg.lambdaAway, model.rho).matchWinner;
			const wynik = wynikMeczu(m);
			modelu.push(logLoss(p, wynik));
			bazy.push(logLoss(bazowa, wynik));
		}

		assert.ok(
			sredni(modelu) < sredni(bazy),
			`model (${sredni(modelu).toFixed(4)}) musi mieć niższy log loss niż częstości (${sredni(bazy).toFixed(4)})`
		);
	});

	test('odtwarza kolejność sił drużyn z samych wyników', () => {
		const oceny = DRUZYNY.map((id) => ({ id, sila: model.teams.get(id).attack + model.teams.get(id).defence }));
		oceny.sort((a, b) => b.sila - a.sila);

		assert.equal(oceny[0].id, 1, 'najmocniejsza drużyna musi wyjść na czele');
		assert.equal(oceny[oceny.length - 1].id, 6, 'najsłabsza musi wylądować na końcu');
	});

	test('odtwarza przewagę własnego boiska z dokładnością do rzędu wielkości', () => {
		assert.ok(
			model.homeAdvantage > 0.1 && model.homeAdvantage < 0.6,
			`oczekiwano wartości w okolicy ${PRZEWAGA}, dostano ${model.homeAdvantage.toFixed(3)}`
		);
	});
});

describe('rozmiar macierzy', () => {
	test('pokrywa realny zakres wyników', () => {
		assert.ok(MAX_GOALS >= 8, 'przy mniejszym zakresie ucinamy wyniki, które naprawdę padają');
		const m = scoreMatrix(1.5, 1.5);
		assert.equal(m.length, MAX_GOALS + 1);
	});
});
