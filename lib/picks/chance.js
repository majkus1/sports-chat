import { liftFor, meetsPolicy, marketProbabilityFor } from '@/lib/picks/policy';
import { SELECTION_SHAPES, sameSelection } from '@/lib/picks/markets';
import { calibrateChance } from '@/lib/model/chanceCalibration';

/**
 * SZANSA DO POKAZANIA — jedna funkcja dla plakietek, typu dnia, raportu, analizy, kuponów i asystenta.
 *
 * ZASADA OD 21.11.2026: MODEL WYBIERA MECZ, KURS GO POTWIERDZA. Selekcja jest typem tylko wtedy, gdy
 * próg polityki (od 60% i co najmniej 12 pkt ponad normę) przechodzi i szansa modelu, i — gdy jest
 * kurs — szansa z kursu po zdjęciu marży. Pokazujemy jedną z dwóch liczb według tabeli niżej
 * (`MARKET_CHANCE_KEYS`), przy typie zapisujemy obie i źródło (`Pick.modelProbability`,
 * `marketProbability`, `chanceSource`). Bez kursu — szansa modelu po korekcie z dziennika
 * (`lib/model/chanceCalibration.js`).
 *
 * POMIAR (dziennik prognoz, 2081 meczów z porannym kursem i wynikiem, 27.09–16.11.2026; podział po
 * dacie do 19.10 / od 20.10; skrypty poza repozytorium, baza tylko do odczytu). Brier, mniej = lepiej:
 *
 *   WSZYSTKIE MECZE z kursem   „1" / „X2"   „2" / „1X"   gosp. strzelą   goście strzelą   powyżej 2,5
 *   model                        0,2145       0,1877        0,1599          0,1998          0,2399
 *   szansa z kursu               0,2058       0,1797        0,1537          0,1933          0,2357
 *   (w obu połowach to samo; log loss 1X2: częstości 1,061, model 0,971, rynek 0,946)
 *
 * NIEZGODA JEST SYGNAŁEM — i to jest główny zysk. Plakietka modelu (zasady sprzed zmiany) według tego,
 * czy szansa z kursu SAMA przechodzi próg:
 *
 *                                   do 19.10               od 20.10
 *   kurs potwierdza                247: 74,9% → 83,0%     558: 76,0% → 78,3%      (obiecane → trafione)
 *   kurs nie potwierdza            146: 74,5% → 58,9%     344: 73,8% → 60,2%
 *
 * Reguła nie ma parametru dopasowanego do danych (próg to polityka) i działa w obu połowach tak samo,
 * przy każdej selekcji osobno („1": 80/73% wobec 61/54%, „2": 74/85% wobec 40/44%, „X2": 86/80%
 * wobec 46/59%, „1X": 93/86% wobec 78/70%).
 *
 * KTÓRĄ LICZBĘ POKAZAĆ — tylko tam kurs, gdzie sprawdzian po czasie pokazał lepszą kalibrację. Na
 * WSZYSTKICH meczach kurs wygrywa przy każdej selekcji, ale pokazujemy szansę wyłącznie przy typach
 * POTWIERDZONYCH, a tam obie liczby są blisko i obie ostrożne (obiecują 74–76%, wchodzi 79–83%).
 * Potwierdzone plakietki tydzień po tygodniu, oceniane od 11.10 (Brier model / kurs, tygodnie z kursem
 * lepszym, połowa od 20.10):
 *
 *   „1"        253 typy   0,1842 / 0,1838   3 z 7    od 20.10: 0,1936 / 0,1901   → KURS
 *   „X2"       317        0,1653 / 0,1637   4 z 7    od 20.10: 0,1668 / 0,1643   → KURS
 *   +2,5        13        0,2014 / 0,1872   —        od 20.10: 0,1622 / 0,1432   → KURS (mała próba;
 *                                                     na wszystkich meczach kurs lepszy w obu połowach)
 *   „2"         82        0,1549 / 0,1608   2 z 6    do 19.10: 0,1920 / 0,1980, od 20.10: 0,1405 / 0,1508 → MODEL
 *   „1X"       197*       0,1055 / 0,1082   2 z 7    model lepszy w obu połowach (*wszystkie potwierdzone
 *                                                     kandydatury, plakietek 72: 0,0921 / 0,0926) → MODEL
 *   gol gosp.   —         kurs nie może potwierdzić (próg 91% > sufit 90%) → MODEL, tylko sufit;
 *                         kandydaci z kursem < 90%: 51, obiecane 91%, trafione 94%
 *
 * Przy NIEZGODZIE (typ odpada) liczba z kursu jest bliżej faktów przy każdej selekcji („X2" od 20.10:
 * model 72,5%, kurs 60,7%, weszło 59,4%), więc wiersz analizy i typ zapasowy dostają ostrożniejszą
 * z dwóch liczb — inaczej zapasowy z niepotwierdzonej selekcji obiecywałby 70%, a trafiał 40%.
 *
 * WYNIK (plakietki na meczach z kursem; obiecane → trafione, Brier):
 *
 *   zasady sprzed 21.11 (model, z „gośćmi strzelą")   do 19.10: 393, 74,8% → 74,0%, 0,1802   od 20.10: 902, 75,2% → 71,4%, 0,2018
 *   kurs zawsze (pierwsza wersja tej zmiany)                    257, 73,8% → 81,7%, 0,1499            592, 74,2% → 78,4%, 0,1657
 *   tabela źródeł (wdrożone)                                    263, 75,1% → 82,9%, 0,1401            607, 75,8% → 79,7%, 0,1552
 *   w tym 80%+                                                   79, 85,0% → 92,4%                     207, 84,5% → 88,9%
 *   (dawne plakietki 80%+:                                      128, 84,3% → 85,2%                    322, 83,9% → 76,7%)
 *
 * Plakietek jest mniej (dziennie 11 zamiast 17 i 22 zamiast 33), ale każda mówi prawdę albo mniej.
 * Podniesienie liczb o tę ostrożność świadomie NIE wdrożone — pomyłka w górę kosztuje zaufanie.
 *
 * CZYM TO NIE JEST. To nie „value betting": nie liczymy i nie pokazujemy przewagi nad rynkiem —
 * przeciwnie, typ, w który rynek wierzy wyraźnie mniej niż model, znika. Przewaga (`lift`) jest
 * nadal liczona od NORMY (jak często dzieje się to samo z siebie), nie od kursu. Treści analiz
 * i raportów nadal nie piszą o kursach ani bukmacherach; zmienia się to, skąd pochodzi procent,
 * i mówimy o tym w podpisach („z kursów" / „według modelu"). Sufit `MARKET_CEILING` zostaje.
 */

/** Skąd pochodzi pokazana szansa — zapisywane przy typie (`Pick.chanceSource`), żeby dało się to mierzyć. */
export const CHANCE_SOURCE = { market: 'market', model: 'model', live: 'live', provider: 'provider' };

/** Selekcje, przy których potwierdzony typ pokazuje szansę z kursu (tabela w nagłówku); reszta — modelu. */
export const MARKET_CHANCE_KEYS = new Set(['home', 'X2', 'over25']);

/**
 * Selekcje bez potwierdzenia kursem — tylko sufit `MARKET_CEILING`, jak przed 21.11.2026. „Gospodarze
 * strzelą" ma próg 91% (norma 79% + 12), a sufit odcina już 90% z kursu, więc potwierdzenia nie da się
 * spełnić z definicji; model jest tu skalibrowany (85–90%: 87% → 89%, 90%+: 93% → 95%).
 */
export const CONFIRMATION_EXEMPT_KEYS = new Set(['homeScores']);

/**
 * Marża przy kursie, dla którego nie mamy drugiej strony rynku („gospodarze strzelą", „powyżej 2,5"
 * w porannym zdjęciu kursów). Zmierzona na dzienniku jako średnie 1/kurs podzielone przez częstość
 * zdarzenia: 1,051 (gospodarze strzelą), 1,059 (goście), 1,053 (powyżej 2,5) na całości; do 19.10
 * 1,047 / 1,038 / 1,003, od 20.10 1,053 / 1,069 / 1,078. Marża 1X2 w tych samych zdjęciach: 1,069.
 * Brier prawie nie zależy od wyboru 1,03–1,09; bierzemy 1,06 — pomyłka ma iść w stronę niższej szansy.
 */
export const ONE_SIDED_MARGIN = 1.06;

const kurs = (v) => (Number.isFinite(v) && v > 1 ? v : null);
const procent = (ulamek) => Number((100 * ulamek).toFixed(1));

/** Klucz z `SELECTION_SHAPES` dla postaci znormalizowanej albo `null`. */
export function selectionKeyFor(normalized) {
	if (!normalized) return null;
	for (const [key, ksztalt] of Object.entries(SELECTION_SHAPES)) {
		if (sameSelection(ksztalt.normalized, normalized)) return key;
	}
	return null;
}

/**
 * Szanse rynkowe (procenty po zdjęciu marży) ze ZDJĘCIA KURSÓW — mediany bukmacherów z dziennika
 * prognoz albo pobranej dla kuponu (`oddsSnapshot`). Ten sam kształt co `impliedFromOdds`, więc
 * dalej idzie przez `marketProbabilityFor`. 1X2 i podwójna szansa z odmarżowanej trójki (jedno
 * źródło, jedna marża — jak w `impliedFromOdds`); kursy jednostronne przez `ONE_SIDED_MARGIN`.
 *
 * @param {object|null} snapshot `{ home, draw, away, homeScores, awayScores, over25 }`
 * @returns {object|null} `null`, gdy w zdjęciu nie ma żadnego użytecznego kursu
 */
export function impliedFromSnapshot(snapshot) {
	if (!snapshot) return null;
	const [h, d, a] = [kurs(snapshot.home), kurs(snapshot.draw), kurs(snapshot.away)];
	let trojka = null;
	if (h && d && a) {
		const suma = 1 / h + 1 / d + 1 / a;
		trojka = [1 / h / suma, 1 / d / suma, 1 / a / suma];
	}
	const jednostronny = (v) => (kurs(v) ? procent(Math.min(0.99, 1 / v / ONE_SIDED_MARGIN)) : null);
	const out = {
		home: trojka ? procent(trojka[0]) : null,
		draw: trojka ? procent(trojka[1]) : null,
		away: trojka ? procent(trojka[2]) : null,
		'1X': trojka ? procent(trojka[0] + trojka[1]) : null,
		X2: trojka ? procent(trojka[1] + trojka[2]) : null,
		homeScores: jednostronny(snapshot.homeScores),
		awayScores: jednostronny(snapshot.awayScores),
		over25: jednostronny(snapshot.over25),
	};
	return Object.values(out).some((v) => v !== null) ? out : null;
}

/**
 * Szansa modelu do pokazania, gdy kursu nie ma: po korekcie z dziennika, zaokrąglona raz.
 *
 * @param {string} key klucz selekcji z `SELECTION_SHAPES`
 * @param {number} percent surowa szansa modelu w procentach
 */
export function modelChance(key, percent) {
	if (!Number.isFinite(percent)) return null;
	return Math.round(calibrateChance(key, percent));
}

/**
 * Selekcja zestawiona z rynkiem: werdykt (potwierdzona czy nie), szansa do pokazania, jej źródło,
 * obie liczby i przewaga nad normą liczona od pokazanej szansy.
 *
 *   - bez kursu selekcji: szansa modelu, werdykt polityki dla niej, `confirmed: false`;
 *   - selekcja z `CONFIRMATION_EXEMPT_KEYS`: szansa modelu, polityka z sufitem rynkowym;
 *   - inaczej `ok` tylko wtedy, gdy próg przechodzą OBIE liczby (z sufitem); potwierdzona pokazuje
 *     liczbę według `MARKET_CHANCE_KEYS`, niepotwierdzona — ostrożniejszą z dwóch (nagłówek pliku).
 *
 * @param {{ normalized: object, model: number|null, base?: number|null, implied?: object|null, modelSource?: string }} input
 *   `model` — szansa modelu po korekcie, w procentach; `base` — norma warunkowa (np. ligowa dla
 *   „powyżej 2,5"); `implied` — z `impliedFromOdds` albo `impliedFromSnapshot`; `modelSource` — jak
 *   nazwać liczbę spoza kursu (`provider` dla prognozy dostawcy w raporcie)
 * @returns {{ probability: number|null, source: string|null, modelProbability: number|null,
 *   marketProbability: number|null, base: number|null, lift: number|null, ok: boolean, reason: string|null, confirmed: boolean }}
 */
export function confirmWithMarket({ normalized, model, base = null, implied = null, modelSource = CHANCE_SOURCE.model }) {
	const m = Number.isFinite(model) ? Math.round(model) : null;
	const market = marketProbabilityFor(normalized, implied);
	const r = market === null ? null : Math.round(market);
	const key = selectionKeyFor(normalized);
	const opcje = { ...(Number.isFinite(base) ? { base } : {}), ...(market !== null ? { market } : {}) };
	const wynik = (probability, source, polityka, confirmed) => {
		const { base: norma, lift } = liftFor(normalized, probability, opcje);
		return {
			probability,
			source: probability === null ? null : source,
			modelProbability: m,
			marketProbability: market,
			base: norma,
			lift,
			ok: polityka.ok,
			reason: polityka.reason,
			confirmed,
		};
	};

	const politykaModelu = meetsPolicy(normalized, m, opcje);
	if (market === null || CONFIRMATION_EXEMPT_KEYS.has(key)) {
		return wynik(m, modelSource, politykaModelu, market !== null && politykaModelu.ok);
	}

	const politykaRynku = meetsPolicy(normalized, r, opcje);
	if (m !== null && politykaModelu.ok && politykaRynku.ok) {
		const zKursu = MARKET_CHANCE_KEYS.has(key);
		return wynik(zKursu ? r : m, zKursu ? CHANCE_SOURCE.market : modelSource, politykaModelu, true);
	}
	// Model bez własnej liczby (typ sprzed tego pola): decyduje i mówi sam kurs.
	if (m === null) return wynik(r, CHANCE_SOURCE.market, politykaRynku, politykaRynku.ok);
	// Niezgoda: ostrożniejsza liczba i jej werdykt — próg jest monotoniczny, więc typ odpada.
	const zKursu = r <= m;
	const p = zKursu ? r : m;
	return wynik(p, zKursu ? CHANCE_SOURCE.market : modelSource, meetsPolicy(normalized, p, opcje), false);
}

/**
 * Selekcje z `evaluateMarkets` (raport, plakietki) zestawione z kursami meczu: każda dostaje szansę
 * do pokazania, przewagę od niej, obie liczby i źródło; te, których rynek nie potwierdza (albo uważa
 * za pewne — `MARKET_CEILING`), wypadają. Selekcja, której rynek nie wycenia, zostaje z szansą modelu.
 * Bez kursów wraca lista bez zmian — brak danych to brak potwierdzenia, nie odrzucenie.
 *
 * @param {Array} entries wpisy z `evaluateMarkets` (`normalized`, `probability`, `base`)
 * @param {object|null} implied wynik `impliedFromOdds` albo `impliedFromSnapshot`
 */
export function confirmMarkets(entries, implied) {
	if (!implied) return entries || [];
	return (entries || [])
		.map((e) => {
			const c = confirmWithMarket({
				normalized: e.normalized,
				model: e.modelProbability ?? e.probability,
				base: e.base,
				implied,
				modelSource: e.chanceSource === CHANCE_SOURCE.provider ? CHANCE_SOURCE.provider : CHANCE_SOURCE.model,
			});
			return {
				...e,
				probability: c.probability,
				base: c.base,
				lift: c.lift,
				modelProbability: c.modelProbability,
				marketProbability: c.marketProbability,
				chanceSource: c.source,
				chanceConfirmed: c.confirmed,
				ok: c.ok,
			};
		})
		.filter((e) => e.ok)
		.map(({ ok, ...e }) => e);
}

/**
 * Szansa typu NA ŻYWO: nie wyższa niż nasze wyliczenie i nie wyższa niż kurs live (100 / kurs,
 * z marżą — drugiej strony rynku live nie mamy). Przy zgodzie `LIVE_AGREEMENT` obie liczby różnią
 * się najwyżej o kilkanaście punktów; bierzemy ostrożniejszą. Kursów live z wynikiem jeszcze nie
 * zbieramy, więc tej liczby nie da się dziś skalibrować — patrz README modelu.
 */
export function liveChance(model, odds) {
	if (!Number.isFinite(model)) return null;
	if (!(Number.isFinite(odds) && odds > 1)) return Math.round(model);
	return Math.round(Math.min(model, 100 / odds));
}
