/**
 * Rozkład wyniku meczu i wyprowadzone z niego rynki.
 *
 * JEDEN RACHUNEK ZAMIAST CZTERECH HEURYSTYK. Dotąd każdy rynek liczył się osobno i po
 * swojemu: zwycięzcę braliśmy z procentów dostawcy, progi goli z Poissona na średnich,
 * podwójną szansę z sumy dwóch procentów. Te trzy rachunki potrafiły sobie przeczyć —
 * dawały na przykład 70% na wygraną gospodarzy i jednocześnie 65% na „poniżej 2.5 gola"
 * przy drużynie, która wygrywa 3:1. Tutaj wszystko wychodzi z jednej macierzy
 * prawdopodobieństw wyników, więc rynki są ze sobą spójne z definicji.
 *
 * KOREKTA DIXONA-COLESA. Czysty rozkład Poissona zakłada, że liczba goli gospodarzy jest
 * niezależna od liczby goli gościa. W piłce tak nie jest — wyniki niskobramkowe (0:0, 1:1)
 * padają częściej, niż wynikałoby z niezależności, a 1:0 i 0:1 rzadziej. Dixon i Coles
 * (1997) opisali to jedną poprawką na czterech polach macierzy. Bez niej model
 * systematycznie zaniża remisy, a remis to jeden z trzech możliwych wyników meczu.
 */

/**
 * Do ilu goli liczymy macierz.
 *
 * Przy oczekiwanych 1,5 gola na drużynę prawdopodobieństwo ośmiu bramek jednej ze stron
 * jest rzędu jednej milionowej. Dziesięć wierszy pokrywa praktycznie cały rozkład,
 * a resztę i tak domyka normalizacja.
 */
export const MAX_GOALS = 10;

/**
 * Domyślna siła korekty.
 *
 * Wartość ujemna zwiększa 0:0 i 1:1, a zmniejsza 1:0 i 0:1 — czyli dokładnie to, co widać
 * w danych. Rząd wielkości zgodny z oryginalną pracą; `fitRho` w `ratings.js` dobiera ją
 * do konkretnego zestawu meczów.
 */
export const DEFAULT_RHO = -0.13;

/** Silnia w tablicy — liczymy ją raz, nie w pętli po każdym polu macierzy. */
const FACTORIAL = (() => {
	const out = [1];
	for (let i = 1; i <= MAX_GOALS; i += 1) out[i] = out[i - 1] * i;
	return out;
})();

/** P(X = k) dla rozkładu Poissona o średniej `lambda`. */
export function poissonPmf(k, lambda) {
	if (lambda <= 0) return k === 0 ? 1 : 0;
	return (Math.exp(-lambda) * lambda ** k) / FACTORIAL[k];
}

/**
 * Współczynnik korekty dla czterech pól niskobramkowych; wszędzie indziej równy 1.
 *
 * Wynik jest przycinany do wartości dodatniej: przy skrajnych średnich i dużym `rho`
 * korekta potrafi zejść poniżej zera, co dałoby ujemne prawdopodobieństwo.
 */
export function tau(x, y, lambdaHome, lambdaAway, rho) {
	let value = 1;
	if (x === 0 && y === 0) value = 1 - lambdaHome * lambdaAway * rho;
	else if (x === 0 && y === 1) value = 1 + lambdaHome * rho;
	else if (x === 1 && y === 0) value = 1 + lambdaAway * rho;
	else if (x === 1 && y === 1) value = 1 - rho;
	return Math.max(value, 1e-6);
}

/**
 * Macierz prawdopodobieństw wyniku: `matrix[x][y]` = P(gospodarze x — goście y).
 *
 * Suma wszystkich pól wynosi 1 — normalizujemy, bo obcięcie na `MAX_GOALS` i korekta
 * niskobramkowa razem odbierają rozkładowi ułamek masy.
 */
export function scoreMatrix(lambdaHome, lambdaAway, rho = DEFAULT_RHO) {
	const home = Number.isFinite(lambdaHome) && lambdaHome > 0 ? lambdaHome : 0.01;
	const away = Number.isFinite(lambdaAway) && lambdaAway > 0 ? lambdaAway : 0.01;

	const matrix = [];
	let suma = 0;

	for (let x = 0; x <= MAX_GOALS; x += 1) {
		matrix[x] = [];
		for (let y = 0; y <= MAX_GOALS; y += 1) {
			const p = poissonPmf(x, home) * poissonPmf(y, away) * tau(x, y, home, away, rho);
			matrix[x][y] = p;
			suma += p;
		}
	}

	for (let x = 0; x <= MAX_GOALS; x += 1) {
		for (let y = 0; y <= MAX_GOALS; y += 1) matrix[x][y] /= suma;
	}

	return matrix;
}

/**
 * Prawdopodobieństwa wszystkich obsługiwanych rynków, wyprowadzone z jednej macierzy.
 *
 * Zwracamy ułamki (0–1), nie procenty — zaokrąglanie jest sprawą warstwy prezentacji,
 * a przy liczeniu miar jakości prognoz każde zaokrąglenie po drodze psuje wynik.
 *
 * Rynki odpowiadają dokładnie tym, które umie rozstrzygnąć `lib/picks/markets.js`.
 * Prognoza rynku, którego nie da się rozliczyć, byłaby liczbą bez konsekwencji.
 */
export function marketProbabilities(matrix) {
	let home = 0;
	let draw = 0;
	let away = 0;
	let bttsYes = 0;
	const totals = {}; // suma goli -> prawdopodobieństwo
	const homeGoals = [];
	const awayGoals = [];

	for (let x = 0; x < matrix.length; x += 1) {
		homeGoals[x] = 0;
		for (let y = 0; y < matrix[x].length; y += 1) {
			const p = matrix[x][y];
			if (x > y) home += p;
			else if (x === y) draw += p;
			else away += p;

			if (x > 0 && y > 0) bttsYes += p;

			totals[x + y] = (totals[x + y] || 0) + p;
			homeGoals[x] += p;
			awayGoals[y] = (awayGoals[y] || 0) + p;
		}
	}

	/** P(suma goli > próg) dla progu połówkowego. */
	const over = (line) => {
		let acc = 0;
		for (const [suma, p] of Object.entries(totals)) {
			if (Number(suma) > line) acc += p;
		}
		return acc;
	};

	/** P(dana drużyna strzeli więcej niż `line`). */
	const teamOver = (rozklad, line) =>
		rozklad.reduce((acc, p, gole) => (gole > line ? acc + p : acc), 0);

	return {
		matchWinner: { home, draw, away },
		// Podwójna szansa to suma dwóch wyników, nie osobny rachunek — stąd bierze się
		// jej wysokie prawdopodobieństwo i dlatego sama w sobie niewiele znaczy.
		doubleChance: { '1X': home + draw, X2: away + draw, 12: home + away },
		btts: { yes: bttsYes, no: 1 - bttsYes },
		totalGoals: {
			1.5: { over: over(1.5), under: 1 - over(1.5) },
			2.5: { over: over(2.5), under: 1 - over(2.5) },
			3.5: { over: over(3.5), under: 1 - over(3.5) },
		},
		teamGoals: {
			home: {
				0.5: { over: teamOver(homeGoals, 0.5), under: 1 - teamOver(homeGoals, 0.5) },
				1.5: { over: teamOver(homeGoals, 1.5), under: 1 - teamOver(homeGoals, 1.5) },
			},
			away: {
				0.5: { over: teamOver(awayGoals, 0.5), under: 1 - teamOver(awayGoals, 0.5) },
				1.5: { over: teamOver(awayGoals, 1.5), under: 1 - teamOver(awayGoals, 1.5) },
			},
		},
		/** Najbardziej prawdopodobny dokładny wynik — do opisu, nie do typowania. */
		likeliestScore: (() => {
			let best = { home: 0, away: 0, p: 0 };
			for (let x = 0; x < matrix.length; x += 1) {
				for (let y = 0; y < matrix[x].length; y += 1) {
					if (matrix[x][y] > best.p) best = { home: x, away: y, p: matrix[x][y] };
				}
			}
			return best;
		})(),
	};
}

/** Skrót: średnie bramkowe → komplet rynków. */
export function predictMarkets(lambdaHome, lambdaAway, rho = DEFAULT_RHO) {
	return marketProbabilities(scoreMatrix(lambdaHome, lambdaAway, rho));
}

/** Regulaminowy czas gry; doliczony traktujemy jako resztkę, nie jako zero. */
export const REGULATION_MINUTES = 90;

/**
 * Rynki dla meczu W TRAKCIE: rozkład goli, które JESZCZE padną, przesunięty o aktualny wynik.
 *
 * Prognoza przedmeczowa w 70. minucie jest bezużyteczna — opisuje mecz, który już się
 * w większości rozegrał. Tu liczymy tylko resztę: średnie bramkowe skalujemy ułamkiem
 * pozostałego czasu, budujemy macierz pozostałych goli i dodajemy do niej to, co już
 * jest na tablicy. Wynik końcowy to stan plus reszta, więc rynki wychodzą z tej samej
 * funkcji co przed meczem — bez osobnej heurystyki na „drużyna prowadzi 2:0".
 *
 * Dwa uproszczenia, świadomie: tempo goli przyjmujemy stałe w czasie (w rzeczywistości
 * końcówki są bramkowsze), a korektę niskobramkową wyłączamy — dotyczy ona wyników
 * końcowych całego meczu, nie jego reszty. Po 90. minucie zostaje ułamek na czas
 * doliczony, bo gole wtedy padają, a zero dawałoby fałszywą pewność.
 *
 * @param {{ lambdaHome: number, lambdaAway: number, homeGoals: number, awayGoals: number, minute: number }} stan
 */
export function inPlayMarkets({ lambdaHome, lambdaAway, homeGoals = 0, awayGoals = 0, minute = 0 }) {
	const minuta = Number.isFinite(minute) ? Math.max(0, minute) : 0;
	const pozostalo = Math.max(REGULATION_MINUTES - minuta, 0) / REGULATION_MINUTES;
	// Doliczony czas: ~3 minuty z 90, gdy zegar przekroczył regulaminowe.
	const ulamek = pozostalo > 0 ? pozostalo : 3 / REGULATION_MINUTES;

	const reszta = scoreMatrix(lambdaHome * ulamek, lambdaAway * ulamek, 0);

	const dom = Math.max(0, Math.trunc(homeGoals) || 0);
	const gosc = Math.max(0, Math.trunc(awayGoals) || 0);

	// Macierz wyniku końcowego: pole [x][y] reszty ląduje na [x + dom][y + gosc].
	const koncowa = [];
	for (let x = 0; x < reszta.length + dom; x += 1) {
		koncowa[x] = new Array(reszta[0].length + gosc).fill(0);
	}
	for (let x = 0; x < reszta.length; x += 1) {
		for (let y = 0; y < reszta[x].length; y += 1) {
			koncowa[x + dom][y + gosc] = reszta[x][y];
		}
	}

	return marketProbabilities(koncowa);
}
