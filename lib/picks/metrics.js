/**
 * Miary jakości prognoz — to, czego nie widać w samym odsetku trafień.
 *
 * Procent trafień odpowiada na pytanie „ile razy zgadliśmy". Nie odpowiada na dwa
 * ważniejsze: czy ta liczba jest w ogóle wiarygodna przy tylu typach, i czy deklarowane
 * prawdopodobieństwa cokolwiek znaczą. Model, który przy każdym typie mówi „70%" i trafia
 * w 70% przypadków, jest użyteczny. Model, który mówi „70%" i trafia w 90% albo w 50%,
 * jest bezużyteczny nawet wtedy, gdy jego średnia wygląda dobrze.
 */

/**
 * Przedział ufności Wilsona dla odsetka.
 *
 * Zamiast zwykłego przedziału normalnego, który przy małej próbie i skrajnych wynikach
 * potrafi wyjść poza zakres 0–100% i sugerować pewność, której nie ma. Przy 47/68 daje
 * uczciwe 57–79% zamiast gołego „69%".
 *
 * @param {number} won liczba trafień
 * @param {number} n liczba rozstrzygniętych typów
 * @param {number} z mnożnik; 1.96 = 95% ufności
 * @returns {{ low: number, high: number }|null} granice w punktach procentowych
 */
export function wilsonInterval(won, n, z = 1.96) {
	if (!Number.isFinite(won) || !Number.isFinite(n) || n <= 0) return null;

	const p = won / n;
	const mianownik = 1 + (z * z) / n;
	const srodek = p + (z * z) / (2 * n);
	const rozrzut = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));

	return {
		low: Math.round((100 * (srodek - rozrzut)) / mianownik),
		high: Math.round((100 * (srodek + rozrzut)) / mianownik),
	};
}

/**
 * Brier score — średni kwadrat błędu prognozy. Im niżej, tym lepiej.
 *
 * Typ z prawdopodobieństwem 90%, który przegrał, kosztuje 0,81; ten sam błąd przy
 * deklarowanych 55% kosztuje 0,30. Dzięki temu miara karze pewność siebie bez pokrycia,
 * czego odsetek trafień nie robi w ogóle.
 *
 * Punkt odniesienia: 0,25 to wynik prognozy „50% na wszystko", czyli rzutu monetą.
 * Cokolwiek powyżej znaczy, że deklarowane prawdopodobieństwa szkodzą zamiast pomagać.
 *
 * @param {Array<{ probability: number|null, status: 'won'|'lost' }>} picks
 */
export function brierScore(picks) {
	const zPrognoza = (picks || []).filter((p) => Number.isFinite(p.probability));
	if (!zPrognoza.length) return null;

	const suma = zPrognoza.reduce((acc, p) => {
		const prognoza = p.probability / 100;
		const wynik = p.status === 'won' ? 1 : 0;
		return acc + (prognoza - wynik) ** 2;
	}, 0);

	return Number((suma / zPrognoza.length).toFixed(4));
}

/** Wynik odniesienia: prognoza „50% na wszystko". Powyżej tego progu miara jest ostrzeżeniem. */
export const BRIER_BASELINE = 0.25;

/**
 * Ile rozstrzygniętych typów musi być w przekroju, żeby pokazać procent.
 *
 * Poniżej tego progu liczba wprowadza w błąd bardziej, niż informuje — przy dziesięciu
 * typach jedno trafienie przesuwa wynik o dziesięć punktów. Ten sam próg obowiązuje
 * na stronie głównej.
 */
export const MIN_SETTLED_FOR_RATE = 50;
