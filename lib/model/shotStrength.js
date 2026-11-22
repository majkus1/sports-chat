import { fitRatings, expectedGoals } from '@/lib/model/ratings';
import { WINDOW, enoughShotHistory } from '@/lib/model/goalsCalibration';

/**
 * SIŁA DRUŻYN ZE STRZAŁÓW CELNYCH — część czysta (bez sieci i bazy), wspólna dla produkcji
 * (`lib/model/index.js`) i eksperymentu (`xgFeatures.js` → `xgExperiment.mjs`).
 *
 * PO CO. Model sił (`ratings.js`) uczy się z goli, a gol to zdarzenie rzadkie i w dużej części
 * losowe: 1:0 po jedynym strzale i 1:0 po dwudziestu to dla niego ta sama obserwacja. Strzały
 * celne mierzą okazje i są ich kilka razy więcej, więc mniej szumią. Do nauki zamiast goli idzie
 *
 *     gole skorygowane = a · gole + (1 − a) · k · strzały celne
 *
 * gdzie `k` = gole / strzały celne w danych uczących ligi (model ma nadal przewidywać GOLE,
 * suma się nie zmienia), a `a` — waga prawdziwych goli. `fitRatings` przyjmuje ułamki:
 * gradient Poissona to „obserwacja − λ" (quasi-wiarogodność).
 *
 * POMIAR 22.11.2026 (README, sekcja z tą datą; walk-forward, zysk log loss 1X2 wobec goli / t;
 * dziennik — mecze 11 lig archiwum, strzały tylko te, które produkcja ma w `FixtureStats`):
 *
 *   okres                               meczów   a = 0,5 (S50)    a = 0,7 (S70)
 *   archiwum 08.2024–07.2025              3798   +0,0081 / 4,4    +0,0064 / 5,7
 *   archiwum 08.2025–17.09.2026           4280   +0,0063 / 4,0    +0,0050 / 5,2
 *   dziennik do 19.10                      295   +0,0127 / 2,1    +0,0089 / 2,4
 *   dziennik od 20.10                      324   −0,0013 / −0,2   +0,0005 / 0,1
 *
 * Domyślna waga 0,7: jedyna z dwóch, która nie pogarsza ŻADNEGO okresu (S70 na plusie w 11 z 11
 * lig w obu okresach archiwum), wyższe t przy mniejszym zysku (mniejszy rozrzut) i mniejsza zmiana
 * prognoz, które użytkownik już zna. Na dzienniku od 20.10 obie są w szumie — dlatego wyłącznik
 * (`MODEL_SHOTS=off`) i waga (`MODEL_SHOTS_WEIGHT`) są zmiennymi środowiskowymi, a serwer sprawdza
 * wynik na wszystkich ligach (`xgExperiment.mjs --source=api`, wiersz `S70R`).
 *
 * ZAKRES. Wyłącznie 1X2 i podwójna szansa — to mierzył eksperyment i tam jest zysk. Rynki sumy
 * goli (regresja „powyżej 2,5", BTTS, oczekiwane gole, mecz w trakcie, gole drużyny) zostają na
 * macierzy modelu goli: kalibracja 2,5 na macierzy S70 nic nie zyskuje (Brier 0,2427 → 0,2429
 * i 0,2442 → 0,2439; BTTS 0,2463 → 0,2463), a regresja była uczona na macierzy goli. Gole drużyny
 * zyskałyby odrobinę (gospodarze 0,1657 → 0,1644), ale plakietek z tego nie przybywa — zostają
 * przy macierzy goli, żeby jedna zmiana dotyczyła jednej rzeczy.
 */

/** Waga prawdziwych goli. Wybór i pomiar — nagłówek pliku. */
export const DEFAULT_GOAL_WEIGHT = 0.7;
/** Poniżej tylu meczów ze strzałami celnymi skali `k` nie liczymy — z garstki wyszedłby szum. */
export const MIN_SCALE_SAMPLE = 30;
/** Skala poza tym przedziałem znaczy zepsute dane (xG w innych jednostkach, same zera). */
export const SCALE_BOUNDS = { xg: [0.6, 1.6], sot: [0.15, 0.6] };

const skonczona = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Czy mecz ma użyteczne xG. Para 0:0 w xG to brak danych zapisany jako zero (mecz bez żadnej
 * okazji się nie zdarza); jednostronne zero bywa prawdziwe.
 */
export function hasXg(m) {
	return skonczona(m?.hxg) && skonczona(m?.axg) && m.hxg + m.axg > 0;
}

/** Czy mecz ma strzały celne (0:0 w strzałach celnych zdarza się naprawdę — zostaje). */
export function hasSot(m) {
	return skonczona(m?.hst) && skonczona(m?.ast);
}

/**
 * Skale przeliczenia na gole z danych uczących: `xg` = gole / xG, `sot` = gole / strzały celne.
 * `null`, gdy danych jest za mało albo wynik jest niewiarygodny — wtedy wariant spada na gole.
 */
export function scaleFactors(matches) {
	let gx = 0;
	let x = 0;
	let nx = 0;
	let gs = 0;
	let s = 0;
	let ns = 0;
	for (const m of matches || []) {
		if (!Number.isFinite(m.homeGoals) || !Number.isFinite(m.awayGoals)) continue;
		if (hasXg(m)) {
			gx += m.homeGoals + m.awayGoals;
			x += m.hxg + m.axg;
			nx += 1;
		}
		if (hasSot(m)) {
			gs += m.homeGoals + m.awayGoals;
			s += m.hst + m.ast;
			ns += 1;
		}
	}
	const wGranicach = (v, [lo, hi]) => (Number.isFinite(v) && v >= lo && v <= hi ? v : null);
	return {
		xg: nx >= MIN_SCALE_SAMPLE && x > 0 ? wGranicach(gx / x, SCALE_BOUNDS.xg) : null,
		sot: ns >= MIN_SCALE_SAMPLE && s > 0 ? wGranicach(gs / s, SCALE_BOUNDS.sot) : null,
		nXg: nx,
		nSot: ns,
	};
}

/**
 * „Gole skorygowane" jednego meczu. `variant` = `{ a, source }`: `a` — waga goli, `source` —
 * czym uzupełniamy resztę (`sot`, `xg`, `xg+sot`, `none`). Zwraca też `used` — z czego powstały
 * (`xg`, `sot` albo `goals`). Mecz bez danych wchodzi z prawdziwymi golami, nigdy nie wypada.
 */
export function adjustedGoals(m, variant, scales) {
	const a = variant.a;
	const czyste = { homeGoals: m.homeGoals, awayGoals: m.awayGoals, used: 'goals' };
	if (!(a < 1) || variant.source === 'none') return czyste;

	const chceXg = variant.source === 'xg' || variant.source === 'xg+sot';
	const chceSot = variant.source === 'sot' || variant.source === 'xg+sot';

	if (chceXg && scales?.xg && hasXg(m)) {
		return {
			homeGoals: a * m.homeGoals + (1 - a) * scales.xg * m.hxg,
			awayGoals: a * m.awayGoals + (1 - a) * scales.xg * m.axg,
			used: 'xg',
		};
	}
	if (chceSot && scales?.sot && hasSot(m)) {
		return {
			homeGoals: a * m.homeGoals + (1 - a) * scales.sot * m.hst,
			awayGoals: a * m.awayGoals + (1 - a) * scales.sot * m.ast,
			used: 'sot',
		};
	}
	return czyste;
}

/** Dane uczące z podmienionymi golami — gotowe dla `fitRatings`. Skale z TYCH SAMYCH meczów. */
export function adjustMatches(matches, variant, scales = scaleFactors(matches)) {
	return (matches || []).map((m) => {
		const g = adjustedGoals(m, variant, scales);
		return { ...m, homeGoals: g.homeGoals, awayGoals: g.awayGoals, used: g.used };
	});
}

/* ------------------------------------------------------------------ produkcja */

/**
 * Czy model ze strzałami jest włączony i z jaką wagą goli. Zmienne środowiskowe czytane przy
 * każdym wywołaniu (a nie raz przy imporcie), żeby test i proces mogły je zmienić bez przeładowania:
 *
 *   MODEL_SHOTS=off            wyłącza (sam model goli, jak `dixon-coles/5`)
 *   MODEL_SHOTS_WEIGHT=0.5     waga goli `a` (0,3–0,9; poza zakresem — domyślna 0,7)
 */
export function shotsConfig(env = process.env) {
	const wylaczone = ['off', 'false', '0', 'no'].includes(String(env.MODEL_SHOTS ?? '').trim().toLowerCase());
	const w = Number(env.MODEL_SHOTS_WEIGHT);
	const a = Number.isFinite(w) && w >= 0.3 && w <= 0.9 ? w : DEFAULT_GOAL_WEIGHT;
	return { enabled: !wylaczone, a };
}

/**
 * Ile z ostatnich `WINDOW` meczów każdej drużyny ma strzały celne — do reguły per mecz.
 *
 * @param {Array} matches mecze ligi (z polami `hst`/`ast`, gdy są), w DOWOLNEJ kolejności
 * @returns {Map<*, number>}
 */
export function sotHistory(matches) {
	const chrono = [...(matches || [])].sort((x, y) => new Date(x.date) - new Date(y.date));
	const hist = new Map();
	for (const m of chrono) {
		for (const id of [m.homeId, m.awayId]) {
			if (!hist.has(id)) hist.set(id, []);
			hist.get(id).push(hasSot(m));
		}
	}
	const out = new Map();
	for (const [id, h] of hist) out.set(id, h.slice(-WINDOW).filter(Boolean).length);
	return out;
}

/**
 * Model sił ze strzałami celnymi dla ligi — obok modelu goli, na TYCH SAMYCH meczach.
 *
 * `null`, gdy skali nie da się policzyć (mniej niż `MIN_SCALE_SAMPLE` meczów ze strzałami albo
 * skala poza granicami) — wtedy cała liga idzie na same gole.
 *
 * @param {Array} matches zakończone mecze `{ date, homeId, awayId, homeGoals, awayGoals, hst?, ast? }`
 * @param {{ referenceDate?: Date, a?: number }} options
 * @returns {null | { model: object, a: number, scale: number, sot: Map<*, number>, used: number }}
 *   `sot` — ile z ostatnich 10 meczów drużyny ma strzały celne; `used` — udział meczów ze strzałami
 */
export function fitShotModel(matches, { referenceDate, a = DEFAULT_GOAL_WEIGHT } = {}) {
	const skale = scaleFactors(matches);
	if (!skale.sot) return null;
	const dane = adjustMatches(matches, { a, source: 'sot' }, { sot: skale.sot, xg: null });
	const model = fitRatings(dane, { referenceDate });
	if (!model) return null;
	return {
		model,
		a,
		scale: skale.sot,
		sot: sotHistory(matches),
		used: dane.filter((d) => d.used === 'sot').length / dane.length,
	};
}

/**
 * Reguła per mecz — ta sama co przy wariancie `shots` regresji goli (`enoughShotHistory`):
 * model ze strzałami tylko wtedy, gdy OBIE drużyny mają strzały celne w co najmniej
 * `MIN_SHOT_MATCHES` z ostatnich `WINDOW` meczów. Inaczej ocena jednej z nich pochodziłaby
 * prawie wyłącznie z goli, a druga — ze strzałów, i porównanie byłoby krzywe.
 */
export function shotsApplyTo(shots, homeId, awayId) {
	if (!shots?.model) return false;
	return enoughShotHistory(shots.sot.get(homeId) ?? 0, shots.sot.get(awayId) ?? 0);
}

/**
 * Oczekiwane gole meczu dla rynków SIŁY (1X2, podwójna szansa): z modelu ze strzałami, gdy reguła
 * per mecz pozwala, inaczej z modelu goli. `goals` — zawsze z modelu goli, dla rynków sumy goli.
 *
 * @param {object} model model ligi z `getLeagueModel` (model goli; `model.shots` z `fitShotModel` albo brak)
 * @returns {null | { lambdaHome, lambdaAway, known, strength: 'shots'|'goals', goals: { lambdaHome, lambdaAway, known } }}
 */
export function matchExpectation(model, homeId, awayId) {
	const gole = expectedGoals(model, homeId, awayId);
	if (!gole) return null;
	if (!shotsApplyTo(model.shots, homeId, awayId)) return { ...gole, strength: 'goals', goals: gole };
	const s = expectedGoals(model.shots.model, homeId, awayId);
	// Ta sama pula meczów, więc i te same drużyny — `known` z modelu goli zostaje miarodajne.
	return { lambdaHome: s.lambdaHome, lambdaAway: s.lambdaAway, known: gole.known, strength: 'shots', goals: gole };
}
