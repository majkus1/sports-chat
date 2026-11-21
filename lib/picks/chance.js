import { liftFor, meetsPolicy, marketProbabilityFor } from '@/lib/picks/policy';
import { calibrateChance } from '@/lib/model/chanceCalibration';

/**
 * SZANSA DO POKAZANIA — jedna funkcja dla plakietek, typu dnia, raportu, analizy, kuponów i asystenta.
 *
 * ZASADA OD 21.11.2026: MODEL WYBIERA MECZ, KURS MÓWI, ILE WYNOSI SZANSA.
 * Gdy mamy kurs selekcji, pokazujemy i zapisujemy szansę z kursu (po zdjęciu marży), a typ zostaje
 * typem tylko wtedy, gdy TA szansa też przechodzi próg polityki (od 60% i co najmniej 12 pkt ponad
 * normę). Gdy kursu nie ma — szansa modelu po korekcie z dziennika (`lib/model/chanceCalibration.js`).
 * Przy typie zapisujemy obie liczby i źródło (`Pick.modelProbability`, `marketProbability`, `chanceSource`).
 *
 * POMIAR (dziennik prognoz, 2081 meczów z porannym kursem i wynikiem, 27.09–16.11.2026; podział po
 * dacie: do 19.10 / od 20.10). Brier, mniej = lepiej:
 *
 *   WSZYSTKIE MECZE z kursem   „1" / „X2"   „2" / „1X"   gosp. strzelą   goście strzelą   powyżej 2,5
 *   model                        0,2145       0,1877        0,1599          0,1998          0,2399
 *   szansa z kursu               0,2058       0,1797        0,1537          0,1933          0,2357
 *   (od 20.10 to samo: rynek lepszy przy każdej selekcji; log loss 1X2: model 0,971, rynek 0,946)
 *
 *   PLAKIETKI z kursem (1295)       typów   model   rynek   trafione   Brier model / rynek
 *   do 19.10 rynek potwierdza         232   75,1%   74,6%    82,8%      0,1395 / 0,1420
 *            rynek nie potwierdza     161   74,3%   64,0%    61,5%      0,2388 / 0,2142
 *   od 20.10 rynek potwierdza         543   76,1%   74,7%    78,8%      0,1644 / 0,1659
 *            rynek nie potwierdza     359   73,8%   63,6%    60,2%      0,2584 / 0,2370
 *
 * NIEZGODA JEST SYGNAŁEM — i to jest główny zysk, nie sama liczba. 40% plakietek trafiało jak rzut
 * monetą (60%) przy obietnicy 74%, a dało się je rozpoznać rano po kursie; w obu połowach okresu
 * tak samo, a reguła nie ma ani jednego parametru dopasowanego do danych (próg to polityka).
 * Wariant produkcyjny (plakietka = selekcja z największą przewagą spośród tych, które przechodzą
 * próg i u modelu, i w kursie; bez „gości strzelą"), od 20.10: 592 plakietki (22 dziennie zamiast
 * 32), obiecane 74,3%, trafione 78,4%, Brier 0,1659 wobec 0,2018 dzisiejszych plakietek.
 *
 * NA SAMYCH POTWIERDZONYCH typach liczba z kursu i z modelu są skalibrowane podobnie (tydzień po
 * tygodniu od 11.10, 737 typów: Brier 0,1636 rynek, 0,1637 model; per selekcja „1" 0,1835/0,1838,
 * „X2" 0,1631/0,1643, „1X" 0,0982/0,0979, „2" 0,1622/0,1550 — 80 typów, w szumie). Obie są
 * ostrożne: obiecują 74–76%, wchodzi 79%. Pokazujemy kurs, bo na całej próbie jest lepszy przy
 * każdej selekcji, a przy potwierdzonych nie gorszy. Podniesienie szansy z kursu o tę ostrożność
 * (przesunięcie dopasowane tydzień po tygodniu) dawało Brier 0,1615 — NIE wdrożone: podnosiłoby
 * obietnice o 5 pkt na podstawie sześciu tygodni, a pomyłka w tę stronę kosztuje zaufanie.
 *
 * CZYM TO NIE JEST. To nie „value betting": nie liczymy i nie pokazujemy przewagi nad rynkiem —
 * przeciwnie, typ, w który rynek wierzy wyraźnie mniej niż model, znika. Przewaga (`lift`) jest
 * nadal liczona od NORMY (jak często dzieje się to samo z siebie), nie od kursu. Treści analiz
 * i raportów nadal nie piszą o kursach ani bukmacherach; zmienia się to, skąd pochodzi procent,
 * i mówimy o tym w podpisach („szansa z kursów"). Sufit `MARKET_CEILING` zostaje.
 */

/** Skąd pochodzi pokazana szansa — zapisywane przy typie (`Pick.chanceSource`), żeby dało się to mierzyć. */
export const CHANCE_SOURCE = { market: 'market', model: 'model', live: 'live', provider: 'provider' };

/**
 * Marża przy kursie, dla którego nie mamy drugiej strony rynku („gospodarze strzelą", „powyżej 2,5"
 * w porannym zdjęciu kursów). Zmierzona na dzienniku jako średnie 1/kurs podzielone przez częstość
 * zdarzenia: 1,051 (gospodarze strzelą), 1,059 (goście), 1,053 (powyżej 2,5) na całości; na samych
 * meczach do 19.10 — 1,047 / 1,038 / 1,003. Bierzemy górną wartość: pomyłka ma iść w stronę niższej
 * szansy.
 */
export const ONE_SIDED_MARGIN = 1.06;

const kurs = (v) => (Number.isFinite(v) && v > 1 ? v : null);
const procent = (ulamek) => Number((100 * ulamek).toFixed(1));

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
 * Szansa do pokazania z dwóch liczb. Rynek, gdy jest; inaczej model (już po korekcie).
 *
 * @param {{ model: number|null, market: number|null }} input procenty
 * @returns {{ probability: number|null, source: string|null, modelProbability: number|null, marketProbability: number|null }}
 */
export function shownChance({ model, market }) {
	const m = Number.isFinite(model) ? Math.round(model) : null;
	const r = Number.isFinite(market) ? market : null;
	if (r !== null) {
		return { probability: Math.round(r), source: CHANCE_SOURCE.market, modelProbability: m, marketProbability: r };
	}
	return { probability: m, source: m === null ? null : CHANCE_SOURCE.model, modelProbability: m, marketProbability: null };
}

/**
 * Selekcja wybrana przez model, zestawiona z rynkiem: szansa do pokazania, przewaga nad normą
 * liczona od TEJ szansy i werdykt polityki dla niej. `ok: false` przy kursie znaczy „rynek nie
 * potwierdza" — wywołujący takiej selekcji nie wystawia.
 *
 * Bez kursu wraca szansa modelu i `ok` z polityki dla niej (czyli to, co model już przeszedł).
 *
 * @param {{ normalized: object, model: number, base?: number|null, implied?: object|null }} input
 *   `model` — szansa modelu po korekcie, w procentach; `base` — norma warunkowa (np. ligowa dla
 *   „powyżej 2,5"); `implied` — z `impliedFromOdds` albo `impliedFromSnapshot`
 */
export function confirmWithMarket({ normalized, model, base = null, implied = null }) {
	const market = marketProbabilityFor(normalized, implied);
	const szansa = shownChance({ model, market });
	const opcje = {
		...(Number.isFinite(base) ? { base } : {}),
		...(market !== null ? { market } : {}),
	};
	const polityka = meetsPolicy(normalized, szansa.probability, opcje);
	const { base: norma, lift } = liftFor(normalized, szansa.probability, opcje);
	return { ...szansa, base: norma, lift, ok: polityka.ok, reason: polityka.reason };
}

/**
 * Selekcje z `evaluateMarkets` (raport, plakietki) zestawione z kursami meczu: każda dostaje szansę
 * do pokazania, przewagę od niej i źródło; te, których rynek nie potwierdza (albo uważa za pewne —
 * `MARKET_CEILING`), wypadają. Selekcja, której rynek nie wycenia, zostaje z szansą modelu.
 * Bez kursów wraca lista bez zmian — brak danych to brak potwierdzenia, nie odrzucenie.
 *
 * @param {Array} entries wpisy z `evaluateMarkets` (`normalized`, `probability`, `base`)
 * @param {object|null} implied wynik `impliedFromOdds` albo `impliedFromSnapshot`
 */
export function confirmMarkets(entries, implied) {
	if (!implied) return entries || [];
	return (entries || [])
		.map((e) => {
			const c = confirmWithMarket({ normalized: e.normalized, model: e.modelProbability ?? e.probability, base: e.base, implied });
			return {
				...e,
				probability: c.probability,
				base: c.base,
				lift: c.lift,
				modelProbability: c.modelProbability,
				marketProbability: c.marketProbability,
				chanceSource: c.source,
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
