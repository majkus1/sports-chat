import DANE from '@/lib/model/chanceCalibrationData';

/**
 * KOREKTA ZAWYŻONYCH PROCENTÓW — automatyczna kalibracja szansy modelu z dziennika prognoz.
 *
 * PO CO. Pomiar z 21.11.2026 (1354 rozliczone typy): typy z deklarowaną szansą 80–89% trafiały
 * w 77%, a 90%+ w 84%. Większość tej różnicy to jedna selekcja — „goście strzelą gola" (120 typów
 * 80%+: obiecane 85%, trafione 68%), wyłączona w `lib/picks/policy.js`. Bez niej 80–89%: 365 typów,
 * 83,5% → 80,3%; 90%+: 55 typów, 92,4% → 85,5%. Reszta to głównie „1X" z plakietek (132 typy 80%+,
 * 83% → 77%).
 *
 * JAK. Jedna liczba na selekcję: przesunięcie na skali logitu, `logit(p') = logit(p) + shift`,
 * dopasowane na plakietkach tej selekcji (to, co pokazujemy — nie na wszystkich meczach, bo tam
 * model jest skalibrowany przyzwoicie, a zawyżenie bierze się z WYBORU meczów z największą przewagą).
 * Jeden parametr, bo plakietki jednej selekcji siedzą w wąskim przedziale (1X: 81–90%) i nachylenia
 * nie da się z nich uczciwie wyznaczyć; przesunięcie jest z definicji monotoniczne.
 *
 * BEZPIECZNIKI (każdy ma test):
 *   - minimum próby na selekcję (`CALIBRATION_MIN_SAMPLE`) — poniżej korekty nie ma;
 *   - TYLKO W DÓŁ, W STRONĘ FAKTÓW: korekta może szansę obniżyć, nigdy podnieść ponad to, co policzył
 *     model (podniesienie obietnicy wymaga osobnej decyzji — pomyłka w górę kosztuje zaufanie);
 *   - limit wielkości (`CALIBRATION_MAX_POINTS` punktów procentowych);
 *   - SPRAWDZIAN TYDZIEŃ PO TYGODNIU: dla każdego tygodnia przesunięcie dopasowane wyłącznie na
 *     wcześniejszych plakietkach, ocena na plakietkach tego tygodnia. Selekcja dostaje korektę tylko
 *     wtedy, gdy na sumie takich tygodni (co najmniej `CALIBRATION_MIN_TEST` plakietek) Brier spada;
 *   - wersja, data i próba w zapisie (`chanceCalibrationData.js`), nic nie uczy się w locie.
 *
 * WYNIK PRZEBIEGU Z 21.11.2026 — KOREKTA TYLKO TAM, GDZIE SPRAWDZIAN JĄ POTWIERDZA (patrz plik danych).
 * Generator: „X2" 0,1897 → 0,1916 (korekta ściągała 75% do 70%, a weszło 74%), „1" 0,2081 → 0,2086;
 * „1X" i „2" — za krótki sprawdzian; nigdzie nie włączona. Niezależnie, tydzień po tygodniu na
 * wszystkich plakietkach modelu od 2.10 (1228, bez „gości strzelą", dopasowanie wyłącznie na
 * wcześniejszych tygodniach): bez korekty Brier 0,1935, przesunięcie per selekcja 0,1935, regresja
 * logit z nachyleniem na wszystkich meczach 0,1936, izotoniczna na wszystkich meczach (tylko w dół,
 * z limitem) 0,1930 — ale na typach 80%+ gorsza (0,1506 wobec 0,1486). Typy 80%+ obiecywały tam 83,8%,
 * a trafiły 81,7% — po wyłączeniu „gości strzelą" zawyżenie to ok. 2 pkt i w czasie zmienia znak.
 * Mechanizm sam włączy korektę, gdy dziennik ją potwierdzi; dziś zawyżone procenty naprawia co innego:
 * wyłączenie „gości strzelą" i potwierdzenie kursem (`lib/picks/chance.js`) — plakietki 80%+ z kursem
 * trafiały 92% i 89% (do 19.10 / od 20.10) przy obietnicy 85%.
 *
 * ODŚWIEŻANIE. Plik danych jest GENEROWANY skryptem z dziennika (`chanceCalibration.mjs --emit`)
 * i trafia do repozytorium — tak jak regresja „powyżej 2,5" (`goalsCalibrationData.js`). Wybrane
 * zamiast uczenia w cronie: zmiana liczb, które widzi użytkownik, przechodzi przez przegląd
 * i historię zmian, a produkcja nie zależy od tego, czy nocny przebieg się udał. Przeliczać co
 * 2–4 tygodnie; dziennik niesie surową szansę (`hint.raw`), więc kolejne dopasowanie nie nakłada
 * korekty na korektę.
 */

export const CALIBRATION_MIN_SAMPLE = 150;
/** Ile plakietek najmniej musi mieć sprawdzian tydzień po tygodniu, żeby jego werdykt cokolwiek znaczył. */
export const CALIBRATION_MIN_TEST = 100;
/** O ile punktów procentowych korekta może najwyżej obniżyć szansę. */
export const CALIBRATION_MAX_POINTS = 8;
/** Kurczenie przesunięcia do zera — przy 150 plakietkach bez niego liczba skacze z tygodnia na tydzień. */
export const CALIBRATION_RIDGE = 5;
const TYDZIEN_MS = 7 * 24 * 3600_000;

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const przytnij = (p) => Math.min(0.995, Math.max(0.005, p));

/**
 * Przesunięcie na skali logitu dopasowane metodą Newtona, z kurczeniem do zera.
 *
 * @param {Array<{ p: number, won: boolean|number }>} samples `p` — szansa modelu jako ułamek
 * @returns {number} ujemne = model obiecywał za dużo
 */
export function fitShift(samples, { ridge = CALIBRATION_RIDGE } = {}) {
	const dane = (samples || []).filter((s) => Number.isFinite(s?.p) && s.p > 0 && s.p < 1);
	if (!dane.length) return 0;
	let a = 0;
	for (let i = 0; i < 50; i++) {
		let g = -ridge * a;
		let h = ridge;
		for (const s of dane) {
			const p = sigmoid(a + logit(przytnij(s.p)));
			g += (s.won ? 1 : 0) - p;
			h += p * (1 - p);
		}
		const krok = g / h;
		a += krok;
		if (Math.abs(krok) < 1e-9) break;
	}
	return a;
}

/**
 * Szansa (w procentach) po przesunięciu — z oboma bezpiecznikami: nigdy wyżej niż wejście
 * i nigdy niżej niż wejście minus `maxPoints`.
 */
export function applyShift(percent, shift, { maxPoints = CALIBRATION_MAX_POINTS } = {}) {
	if (!Number.isFinite(percent)) return percent;
	if (!Number.isFinite(shift) || shift >= 0 || percent <= 0 || percent >= 100) return percent;
	const po = 100 * sigmoid(logit(przytnij(percent / 100)) + shift);
	return Math.max(percent - maxPoints, Math.min(percent, po));
}

const brier = (xs) => xs.reduce((s, x) => s + (x.p - (x.won ? 1 : 0)) ** 2, 0) / xs.length;
const zaokr = (x) => Number(x.toFixed(4));

/**
 * Dopasowanie jednej selekcji ze sprawdzianem tydzień po tygodniu.
 *
 * @param {Array<{ p: number, won: boolean, at: number|Date|string }>} samples plakietki selekcji
 * @returns {{ n: number, shift: number, enabled: boolean, reason: string|null,
 *   check: null | { n: number, weeks: number, promised: number, calibrated: number, hit: number, brierRaw: number, brierCalibrated: number } }}
 */
export function fitSelection(
	samples,
	{ minSample = CALIBRATION_MIN_SAMPLE, minTest = CALIBRATION_MIN_TEST, ridge = CALIBRATION_RIDGE } = {}
) {
	const dane = (samples || [])
		.filter((s) => Number.isFinite(s?.p) && s.p > 0 && s.p < 1 && Number.isFinite(new Date(s?.at).getTime()))
		.map((s) => ({ ...s, t: new Date(s.at).getTime() }))
		.sort((a, b) => a.t - b.t);
	const n = dane.length;
	if (n < minSample) return { n, shift: 0, enabled: false, reason: 'za_mala_proba', check: null };

	// Pierwszy tydzień sprawdzianu zaczyna się, gdy przed nim jest już `minSample` plakietek.
	const sprawdzian = [];
	let tygodni = 0;
	for (let od = dane[minSample - 1].t + 1; od <= dane[n - 1].t; od += TYDZIEN_MS) {
		const tydzien = dane.filter((s) => s.t >= od && s.t < od + TYDZIEN_MS);
		if (!tydzien.length) continue;
		tygodni += 1;
		const s = Math.min(0, fitShift(dane.filter((x) => x.t < od), { ridge }));
		for (const x of tydzien) sprawdzian.push({ ...x, pc: applyShift(100 * x.p, s) / 100 });
	}

	const shift = Number(fitShift(dane, { ridge }).toFixed(3));
	if (sprawdzian.length < minTest) return { n, shift, enabled: false, reason: 'za_krotki_sprawdzian', check: null };

	const srednia = (f) => sprawdzian.reduce((a, x) => a + f(x), 0) / sprawdzian.length;
	const check = {
		n: sprawdzian.length,
		weeks: tygodni,
		promised: zaokr(srednia((x) => x.p)),
		calibrated: zaokr(srednia((x) => x.pc)),
		hit: zaokr(srednia((x) => (x.won ? 1 : 0))),
		brierRaw: zaokr(brier(sprawdzian)),
		brierCalibrated: zaokr(brier(sprawdzian.map((x) => ({ ...x, p: x.pc })))),
	};
	if (!(shift < 0)) return { n, shift, enabled: false, reason: 'model_nie_zawyza', check };
	if (!(check.brierCalibrated < check.brierRaw)) {
		return { n, shift, enabled: false, reason: 'sprawdzian_nie_potwierdza', check };
	}
	return { n, shift, enabled: true, reason: null, check };
}

/**
 * Szansa modelu po korekcie, w procentach (bez zaokrąglania — zaokrągla wywołujący, raz).
 * Selekcja bez danych, wyłączona albo nieznana wraca bez zmian.
 *
 * @param {string} key klucz selekcji z `SELECTION_SHAPES` (`home`, `1X`, …)
 * @param {number} percent szansa modelu
 * @param {object} [data] zapis kalibracji; domyślnie wygenerowany plik
 */
export function calibrateChance(key, percent, data = DANE) {
	const wpis = data?.selections?.[key];
	if (!wpis || !wpis.enabled) return percent;
	return applyShift(percent, wpis.shift);
}

/** Wersja kalibracji do zapisu przy typie; `null`, gdy żadna selekcja nie ma korekty. */
export function calibrationVersion(data = DANE) {
	const czynne = Object.values(data?.selections || {}).some((w) => w?.enabled);
	return czynne ? (data.version ?? null) : null;
}
