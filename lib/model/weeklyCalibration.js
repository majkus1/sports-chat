import {
	fitSelection,
	applyShift,
	CALIBRATION_MAX_POINTS,
	CALIBRATION_MIN_SAMPLE,
	CALIBRATION_MIN_TEST,
	CALIBRATION_RECENT_WEEKS,
} from '@/lib/model/chanceCalibration';
import { HINT_TO_SELECTION, settleSelection } from '@/lib/model/oddsShadow';
import { isBannedMarket } from '@/lib/picks/policy';
import { SELECTION_SHAPES } from '@/lib/picks/markets';

/**
 * COTYGODNIOWA KALIBRACJA Z BEZPIECZNIKAMI — część czysta (bez bazy). Zadanie: `weeklyJob.js`.
 *
 * DLACZEGO SAMA, SKORO DOTĄD SZŁA PRZEZ PRZEGLĄD. Generator z 21.11.2026 (`chanceCalibration.mjs`)
 * działał dobrze, ale „co 2–4 tygodnie ręcznie" w praktyce znaczy „kiedy ktoś pamięta", a dziennik
 * rośnie o ~700 rozliczonych meczów tygodniowo. Przegląd zostaje — w mailu i w panelu, z liczbami —
 * ale włączenie korekty nie czeka na człowieka, gdy przechodzi WSZYSTKIE warunki poniżej. Każdy
 * warunek ma test (`test/model/weeklyCalibration.test.mjs`).
 *
 * BEZPIECZNIKI (per selekcja):
 *   1. próba — co najmniej `CALIBRATION_MIN_SAMPLE` (150) plakietek i `CALIBRATION_MIN_TEST` (100)
 *      w sprawdzianie tydzień po tygodniu (`fitSelection`); całość — `MIN_TOTAL_HINTS` (300);
 *   2. walk-forward — Brier po korekcie niższy na CAŁYM sprawdzianie i osobno na ostatnich
 *      `CALIBRATION_RECENT_WEEKS` (4) tygodniach, z co najmniej `MIN_RECENT_TEST` plakietkami;
 *   3. tylko w stronę faktów — model musiał obiecywać więcej, niż weszło, a po korekcie obietnica ma
 *      być bliżej faktów; korekta nigdy nie podnosi szansy (`applyShift`) i nie zdejmuje więcej niż
 *      `CALIBRATION_MAX_POINTS` (8) punktów;
 *   4. limit zmiany — przy typowej szansie selekcji pokazana liczba zmienia się najwyżej o
 *      `MAX_WEEKLY_STEP` punktu na tydzień; większą korektę dochodzimy w kilku krokach;
 *   5. wyłączenie korekty (powrót w górę) tylko wtedy, gdy sprawdzian pokazuje, że SZKODZI — i też
 *      najwyżej o `MAX_WEEKLY_STEP` na tydzień; brak danych nie zdejmuje działającej korekty;
 *   6. wersja i data w bazie, poprzednia wersja zachowana (`chanceCalibrationStore.js`).
 */

export const MIN_TOTAL_HINTS = 300;
/** Ile plakietek najmniej w ostatnich tygodniach sprawdzianu — mniej to rzut monetą. */
export const MIN_RECENT_TEST = 40;
/** O ile punktów procentowych najwyżej może się zmienić pokazana szansa w jeden tydzień. */
export const MAX_WEEKLY_STEP = 2;

const zaokr3 = (x) => Number(x.toFixed(3));

/**
 * Próbki per selekcja z wierszy dziennika (`ModelForecast` z `hint` i wynikiem).
 * Selekcje wyłączone polityką nie dostają korekty — i tak się nie pokażą.
 *
 * @param {Array<{ kickoff: Date|string, hint: object, result: { home, away } }>} rows
 * @returns {Map<string, Array<{ p: number, won: boolean, at: Date|string }>>}
 */
export function hintSamples(rows) {
	const wgSelekcji = new Map();
	for (const w of rows || []) {
		const key = w?.hint?.key;
		if (!key || !SELECTION_SHAPES[key] || isBannedMarket(SELECTION_SHAPES[key].normalized)) continue;
		const won = settleSelection(HINT_TO_SELECTION[key], w.result?.home, w.result?.away);
		// Surowa szansa modelu; starsze zapisy (sprzed korekty) mają ją w `probability`.
		const procent = Number.isFinite(w.hint.raw) ? w.hint.raw : w.hint.probability;
		if (won === null || !Number.isFinite(procent)) continue;
		if (!wgSelekcji.has(key)) wgSelekcji.set(key, []);
		wgSelekcji.get(key).push({ p: procent / 100, won, at: w.kickoff });
	}
	return wgSelekcji;
}

/**
 * Kandydat na nową korektę — w kształcie pliku `chanceCalibrationData.js` (ten sam zapis idzie do
 * bazy). Wspólne dla generatora z wiersza poleceń i dla zadania tygodniowego.
 */
export function buildCandidate(rows, { now = new Date() } = {}) {
	const dzis = new Date(now).toISOString().slice(0, 10);
	const selections = {};
	for (const [key, dane] of [...hintSamples(rows)].sort(([a], [b]) => a.localeCompare(b))) {
		selections[key] = fitSelection(dane);
	}
	const ostatni = (rows || []).reduce((m, r) => Math.max(m, new Date(r.kickoff).getTime() || 0), 0);
	return {
		version: `chance-cal/${dzis}`,
		generatedAt: dzis,
		through: ostatni ? new Date(ostatni).toISOString().slice(0, 10) : null,
		hints: (rows || []).length,
		selections,
	};
}

/** Przesunięcie obowiązujące dla selekcji w zapisie (0, gdy wyłączone albo brak). */
export const shiftOf = (data, key) => {
	const w = data?.selections?.[key];
	return w?.enabled && Number.isFinite(w.shift) ? w.shift : 0;
};

/** Pokazana szansa (w procentach) przy danej szansie modelu i przesunięciu. */
const pokazana = (procent, shift) => applyShift(procent, shift);

/**
 * Przesunięcie między `from` a `to`, przy którym szansa `procent` zmienia się najwyżej o `krok`
 * punktów względem `from`. Bisekcja — `applyShift` jest monotoniczne w przesunięciu.
 */
export function limitShift(procent, from, to, krok = MAX_WEEKLY_STEP) {
	const zmiana = (s) => Math.abs(pokazana(procent, s) - pokazana(procent, from));
	if (zmiana(to) <= krok + 1e-9) return to;
	let lo = from;
	let hi = to;
	for (let i = 0; i < 60; i += 1) {
		const mid = (lo + hi) / 2;
		if (zmiana(mid) <= krok) lo = mid;
		else hi = mid;
	}
	// Zaokrąglenie do 3 miejsc ZAWSZE w stronę `from` — zwykłe mogłoby przekroczyć limit o włos.
	return to < from ? Math.ceil(lo * 1000) / 1000 : Math.floor(lo * 1000) / 1000;
}

/**
 * Czy DZIAŁAJĄCA korekta szkodzi: na plakietkach z ostatnich `CALIBRATION_RECENT_WEEKS` tygodni
 * Brier z obowiązującym przesunięciem nie jest niższy niż bez niego. `null` — za mało danych.
 */
export function activeShiftHurts(samples, shift) {
	const dane = (samples || []).map((x) => ({ ...x, t: new Date(x.at).getTime() })).filter((x) => Number.isFinite(x.t));
	if (!dane.length || !(shift < 0)) return null;
	const koniec = Math.max(...dane.map((x) => x.t));
	const ostatnie = dane.filter((x) => x.t > koniec - CALIBRATION_RECENT_WEEKS * 7 * 86_400_000);
	if (ostatnie.length < MIN_RECENT_TEST) return null;
	const br = (f) => ostatnie.reduce((a, x) => a + (f(x) - (x.won ? 1 : 0)) ** 2, 0) / ostatnie.length;
	return br((x) => applyShift(100 * x.p, shift) / 100) >= br((x) => x.p);
}

/** Warunki 2 i 3 dla włączenia albo pogłębienia korekty; zwraca listę niespełnionych. */
function powodyOdmowy(w) {
	const c = w.check;
	const powody = [];
	if (!c) return [w.reason || 'brak_sprawdzianu'];
	if (!(c.brierCalibrated < c.brierRaw)) powody.push('sprawdzian_nie_potwierdza');
	if (!c.recent || c.recent.n < MIN_RECENT_TEST) powody.push('za_malo_w_ostatnich_tygodniach');
	else if (!(c.recent.brierCalibrated < c.recent.brierRaw)) powody.push('ostatnie_tygodnie_nie_potwierdzaja');
	if (!(c.promised > c.hit)) powody.push('model_nie_zawyza');
	else if (!(Math.abs(c.calibrated - c.hit) < Math.abs(c.promised - c.hit))) powody.push('nie_w_strone_faktow');
	if (!(w.shift < 0)) powody.push('przesuniecie_nieujemne');
	return powody;
}

/**
 * Decyzja tygodnia: co włączyć, co zostawić, co cofnąć — z powodami do raportu.
 *
 * @param {{ candidate: object, active: object|null, samples?: Map }} input `candidate` z `buildCandidate`,
 *   `active` — obowiązująca korekta (baza albo plik), `samples` — `hintSamples` tych samych wierszy
 *   (do sprawdzenia, czy działająca korekta szkodzi; bez nich — sprawdzian kandydata)
 * @returns {{ changed: boolean, data: object, selections: Array<{ key, from, to, status, reasons, promised, hit }>, reasons: string[] }}
 *   `data` — zapis do aktywowania (gdy `changed`), w kształcie pliku danych
 */
export function decideCalibration({ candidate, active, samples = null }) {
	const wynik = [];
	const nowe = {};
	const ogolne = [];
	if (!candidate || (candidate.hints ?? 0) < MIN_TOTAL_HINTS) {
		ogolne.push(`za_malo_plakietek (${candidate?.hints ?? 0} < ${MIN_TOTAL_HINTS})`);
	}

	const klucze = new Set([...Object.keys(candidate?.selections || {}), ...Object.keys(active?.selections || {})]);
	for (const key of [...klucze].sort()) {
		const w = candidate?.selections?.[key] ?? { n: 0, shift: 0, enabled: false, reason: 'brak_plakietek', check: null };
		const from = shiftOf(active, key);
		const typowa = 100 * (w.check?.promised ?? 0.8);
		let to = from;
		let status = 'bez_zmian';
		const reasons = [];

		if (ogolne.length) {
			reasons.push(...ogolne);
		} else if (w.n < CALIBRATION_MIN_SAMPLE || !w.check || w.check.n < CALIBRATION_MIN_TEST) {
			// Brak danych NIE zdejmuje działającej korekty — zostaje, jak była.
			reasons.push(w.reason || 'za_mala_proba');
		} else {
			const odmowa = powodyOdmowy(w);
			if (!odmowa.length) {
				to = limitShift(typowa, from, w.shift);
				status = from === 0 ? 'wlaczona' : 'zmieniona';
				if (to !== w.shift) reasons.push(`limit_zmiany_${MAX_WEEKLY_STEP}_pkt`);
			} else if (from < 0 && (samples ? activeShiftHurts(samples.get(key), from) === true : w.check.brierCalibrated >= w.check.brierRaw)) {
				// Działająca korekta, która w sprawdzianie SZKODZI — schodzimy do zera, krokami.
				to = limitShift(typowa, from, 0);
				status = 'wylaczana';
				reasons.push('sprawdzian_pokazuje_szkode', ...(to !== 0 ? [`limit_zmiany_${MAX_WEEKLY_STEP}_pkt`] : []));
			} else {
				reasons.push(...odmowa);
			}
		}
		if (Math.abs(to - from) < 1e-9) {
			to = from;
			if (status !== 'bez_zmian') status = 'bez_zmian';
		}
		wynik.push({
			key,
			from,
			to,
			status,
			reasons,
			n: w.n,
			promised: w.check?.promised ?? null,
			hit: w.check?.hit ?? null,
			pointsAtTypical: Number((pokazana(typowa, to) - typowa).toFixed(1)),
		});
		nowe[key] = { ...w, shift: to, enabled: to < 0, ...(to < 0 ? { reason: null } : {}) };
	}

	const changed = wynik.some((s) => s.to !== s.from);
	return {
		changed,
		data: { ...(candidate || {}), selections: nowe },
		selections: wynik,
		reasons: ogolne,
		limits: { minSample: CALIBRATION_MIN_SAMPLE, minTest: CALIBRATION_MIN_TEST, maxPoints: CALIBRATION_MAX_POINTS, weeklyStep: MAX_WEEKLY_STEP },
	};
}
