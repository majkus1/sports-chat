import { scoreMatrix, tau, DEFAULT_RHO } from '@/lib/model/dixonColes';

/**
 * Siły ataku i obrony drużyn szacowane z wyników meczów.
 *
 * CZYM TO SIĘ RÓŻNI OD ŚREDNIEJ GOLI. Średnia mówi „ta drużyna strzela 1,8 na mecz" i nie
 * wie, przeciw komu. Drużyna z dolnej połowy tabeli, która trafiła w terminarzu na same
 * słabe zespoły, wygląda w średniej jak czołówka. Tutaj każdy wynik jest tłumaczony przez
 * siłę rywala: trzy gole z liderem znaczą więcej niż trzy z beniaminkiem, a wypuszczenie
 * dwóch z beniaminkiem obniża ocenę obrony bardziej niż dwa z liderem.
 *
 * MODEL. Dla meczu gospodarz `h` z gościem `a`:
 *
 *     λ_gospodarze = exp( intercept + atak[h] − obrona[a] + przewagaBoiska )
 *     λ_goście     = exp( intercept + atak[a] − obrona[h] )
 *
 * Parametry dobieramy metodą największej wiarogodności dla rozkładu Poissona, wspinaczką
 * gradientową. Mecze starsze ważą mniej — skład i forma zmieniają się w ciągu sezonu,
 * więc wynik sprzed roku nie może ważyć tyle samo co sprzed tygodnia.
 */

/**
 * Tempo zapominania: waga meczu spada `exp(-XI * dni)`.
 *
 * 0,0045 daje połowiczny zanik po około 154 dniach — pół roku temu mecz waży połowę tego,
 * co dzisiejszy. Wartość z okolic tej, którą Dixon i Coles wyznaczyli empirycznie;
 * `fitRatings` pozwala ją nadpisać, a backtest sprawdza, czy inna działa lepiej.
 */
export const DEFAULT_XI = 0.0045;

/** Siła ściągania ocen do zera — chroni przed rozjazdem drużyn z dwoma meczami w danych. */
const RIDGE = 0.02;

/*
 * Krok Newtona zbiega w kilkudziesięciu iteracjach, nie w setkach — stąd 120 zamiast 400,
 * mimo że dopasowanie jest teraz dokładniejsze. Tłumienie 0,7 chroni przed wystrzeleniem
 * ocen drużyn o bardzo krótkiej historii.
 */
const ITERATIONS = 120;
const LEARNING_RATE = 0.7;

/**
 * @typedef {{ homeId: number, awayId: number, homeGoals: number, awayGoals: number,
 *   date: string|Date }} MatchResult
 */

/**
 * Szacuje parametry z listy rozegranych meczów.
 *
 * @param {MatchResult[]} matches mecze ZAKOŃCZONE, z wynikiem
 * @param {{ referenceDate?: Date, xi?: number, rho?: number }} options
 *   `referenceDate` to moment, względem którego liczymy wiek meczu — przy backteście musi
 *   być datą prognozy, nie „dziś", inaczej model uczy się z przyszłości.
 */
export function fitRatings(matches, { referenceDate, xi = DEFAULT_XI, rho = DEFAULT_RHO } = {}) {
	const useful = (matches || []).filter(
		(m) =>
			Number.isFinite(m.homeGoals) &&
			Number.isFinite(m.awayGoals) &&
			m.homeId != null &&
			m.awayId != null
	);
	if (!useful.length) return null;

	const koniec = referenceDate ? new Date(referenceDate).getTime() : Math.max(...useful.map((m) => new Date(m.date).getTime()));

	const teamIds = [...new Set(useful.flatMap((m) => [m.homeId, m.awayId]))];
	const index = new Map(teamIds.map((id, i) => [id, i]));

	const attack = new Float64Array(teamIds.length);
	const defence = new Float64Array(teamIds.length);
	let homeAdvantage = 0.25;
	let intercept = Math.log(
		Math.max(0.2, useful.reduce((s, m) => s + m.homeGoals + m.awayGoals, 0) / (2 * useful.length))
	);

	// Wagi liczymy raz — nie zmieniają się między iteracjami.
	const przygotowane = useful.map((m) => {
		const wiek = Math.max(0, (koniec - new Date(m.date).getTime()) / 86_400_000);
		return {
			h: index.get(m.homeId),
			a: index.get(m.awayId),
			gh: m.homeGoals,
			ga: m.awayGoals,
			w: Math.exp(-xi * wiek),
		};
	});

	for (let iter = 0; iter < ITERATIONS; iter += 1) {
		const gAttack = new Float64Array(teamIds.length);
		const gDefence = new Float64Array(teamIds.length);
		let gHome = 0;
		let gIntercept = 0;

		/*
		 * Obok gradientu zbieramy KRZYWIZNĘ (informację Fishera) każdego parametru.
		 *
		 * Dla rozkładu Poissona z parametrem w wykładniku pochodna log-wiarogodności to
		 * `(obserwacja − oczekiwanie)`, a druga pochodna to po prostu `−oczekiwanie`. Znając
		 * obie, robimy krok Newtona `gradient / krzywizna` zamiast mnożyć gradient przez
		 * stałą wziętą z sufitu.
		 *
		 * To nie jest optymalizacja dla ozdoby. Poprzednia wersja szła stałym krokiem
		 * i po czterystu iteracjach docierała może w jedną piątą drogi: przewaga własnego
		 * boiska wychodziła 0,186 zamiast typowych 0,25–0,30, a korekta niskobramkowa
		 * −0,02 zamiast −0,13. Model nie był słaby — był niedouczony.
		 */
		const iAttack = new Float64Array(teamIds.length);
		const iDefence = new Float64Array(teamIds.length);
		let iHome = 0;
		let iIntercept = 0;

		for (const m of przygotowane) {
			const lambdaH = Math.exp(intercept + attack[m.h] - defence[m.a] + homeAdvantage);
			const lambdaA = Math.exp(intercept + attack[m.a] - defence[m.h]);

			const resztaH = m.w * (m.gh - lambdaH);
			const resztaA = m.w * (m.ga - lambdaA);
			const krzywiznaH = m.w * lambdaH;
			const krzywiznaA = m.w * lambdaA;

			gAttack[m.h] += resztaH;
			gDefence[m.a] -= resztaH;
			gAttack[m.a] += resztaA;
			gDefence[m.h] -= resztaA;
			gHome += resztaH;
			gIntercept += resztaH + resztaA;

			iAttack[m.h] += krzywiznaH;
			iDefence[m.a] += krzywiznaH;
			iAttack[m.a] += krzywiznaA;
			iDefence[m.h] += krzywiznaA;
			iHome += krzywiznaH;
			iIntercept += krzywiznaH + krzywiznaA;
		}

		/*
		 * Tłumienie kroku (`LEARNING_RATE` < 1) zostaje mimo Newtona.
		 *
		 * Pełny krok bywa zbyt śmiały przy drużynie z dwoma meczami w danych — potrafi
		 * wystrzelić ocenę i rozhuśtać kolejne iteracje. Ułamek pełnego kroku zbiega
		 * niewiele wolniej, a nie wybucha.
		 */
		for (let i = 0; i < teamIds.length; i += 1) {
			attack[i] += LEARNING_RATE * ((gAttack[i] - RIDGE * attack[i]) / (iAttack[i] + RIDGE));
			defence[i] += LEARNING_RATE * ((gDefence[i] - RIDGE * defence[i]) / (iDefence[i] + RIDGE));
		}
		homeAdvantage += LEARNING_RATE * (gHome / (iHome + RIDGE));
		intercept += LEARNING_RATE * (gIntercept / (iIntercept + RIDGE));

		/*
		 * Centrowanie ocen po każdej iteracji.
		 *
		 * Model jest nieoznaczony: dodanie stałej do wszystkich ataków i odjęcie jej od
		 * wyrazu wolnego daje identyczne prognozy. Bez centrowania parametry dryfują
		 * w nieskończoność, a wyniki przestają być porównywalne między ligami.
		 */
		const srAttack = attack.reduce((s, v) => s + v, 0) / teamIds.length;
		const srDefence = defence.reduce((s, v) => s + v, 0) / teamIds.length;
		for (let i = 0; i < teamIds.length; i += 1) {
			attack[i] -= srAttack;
			defence[i] -= srDefence;
		}
		intercept += srAttack;
	}

	const teams = new Map();
	for (const [id, i] of index) {
		teams.set(id, { attack: attack[i], defence: defence[i] });
	}

	return { teams, intercept, homeAdvantage, rho, xi, matchesUsed: useful.length };
}

/**
 * Oczekiwane gole obu stron dla konkretnej pary.
 *
 * Drużyna nieznana modelowi (beniaminek, pierwszy mecz w danych) dostaje oceny zerowe,
 * czyli przeciętne dla ligi. To uczciwsze niż odmowa prognozy, ale mniej pewne — wywołujący
 * dostaje `known`, żeby mógł taką prognozę oznaczyć albo odrzucić.
 */
export function expectedGoals(model, homeId, awayId) {
	if (!model) return null;

	const dom = model.teams.get(homeId);
	const gosc = model.teams.get(awayId);

	const attackH = dom?.attack ?? 0;
	const defenceH = dom?.defence ?? 0;
	const attackA = gosc?.attack ?? 0;
	const defenceA = gosc?.defence ?? 0;

	return {
		lambdaHome: Math.exp(model.intercept + attackH - defenceA + model.homeAdvantage),
		lambdaAway: Math.exp(model.intercept + attackA - defenceH),
		known: Boolean(dom && gosc),
	};
}

/**
 * Log-wiarogodność zestawu meczów przy danych parametrach — do porównywania wariantów.
 *
 * Liczona na pełnej macierzy z korektą Dixona-Colesa, a nie na samym Poissonie, bo to
 * właśnie ta wartość ma decydować o wyborze `rho`.
 */
export function logLikelihood(model, matches) {
	let suma = 0;
	let policzone = 0;

	for (const m of matches) {
		const eg = expectedGoals(model, m.homeId, m.awayId);
		if (!eg) continue;
		const matrix = scoreMatrix(eg.lambdaHome, eg.lambdaAway, model.rho);
		const p = matrix[Math.min(m.homeGoals, matrix.length - 1)]?.[Math.min(m.awayGoals, matrix.length - 1)];
		if (!p || p <= 0) continue;
		suma += Math.log(p);
		policzone += 1;
	}

	return policzone ? suma / policzone : null;
}

/**
 * Dobiera siłę korekty niskobramkowej przeszukaniem siatki.
 *
 * Pełne dopasowanie `rho` metodą największej wiarogodności razem z resztą parametrów
 * wymagałoby liczenia pochodnych po korekcie. Przy jednym parametrze i dziewięciu
 * kandydatach przeszukanie siatki daje ten sam efekt mniejszym kosztem — a różnica między
 * sąsiednimi wartościami jest i tak mniejsza niż szum w danych.
 */
export function fitRho(matches, baseModel) {
	const kandydaci = [-0.2, -0.17, -0.14, -0.11, -0.08, -0.05, -0.02, 0, 0.03];
	let best = { rho: baseModel.rho, score: -Infinity };

	for (const rho of kandydaci) {
		const score = logLikelihood({ ...baseModel, rho }, matches);
		if (score !== null && score > best.score) best = { rho, score };
	}

	return best.rho;
}

/** Czy korekta zachowuje się sensownie przy danych średnich — bezpiecznik dla `fitRho`. */
export function rhoIsSafe(rho, lambdaHome = 3, lambdaAway = 3) {
	return (
		tau(0, 0, lambdaHome, lambdaAway, rho) > 0 &&
		tau(0, 1, lambdaHome, lambdaAway, rho) > 0 &&
		tau(1, 0, lambdaHome, lambdaAway, rho) > 0 &&
		tau(1, 1, lambdaHome, lambdaAway, rho) > 0
	);
}
