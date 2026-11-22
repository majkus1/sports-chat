import { evaluateMarkets } from '@/lib/reports/service';
import { bestHint } from '@/lib/model/hints';
import { confirmMarkets, impliedFromSnapshot, MARKET_CHANCE_KEYS } from '@/lib/picks/chance';
import { HINT_TO_SELECTION, settleSelection } from '@/lib/model/oddsShadow';

/**
 * COTYGODNIOWY RAPORT MODELU — liczby, część czysta (bez bazy). Zadanie i wysyłka: `weeklyJob.js`.
 *
 * Co tydzień to samo, co 21–22.11.2026 liczyliśmy ręcznie skryptami poza repozytorium (README modelu):
 *   1. log loss 1X2 model wobec rynku (poranny kurs) — i osobno siła ze strzałów wobec samych goli;
 *   2. kubełki „obiecane → weszło" na publicznych plakietkach (`Pick`, `kind: 'hint'`);
 *   3. tabela źródeł szansy (`MARKET_CHANCE_KEYS` w `lib/picks/chance.js`) tym samym sprawdzianem:
 *      potwierdzone plakietki, Brier modelu i kursu, tydzień po tygodniu — WYŁĄCZNIE zalecenie;
 *      zmiana tabeli zmienia liczbę, którą widzi użytkownik, więc idzie przez decyzję właściciela;
 *   4. wyniki kuponów publicznych;
 *   5. CLV plakietek (poranny kurs wobec zamknięcia), gdy oba zdjęcia są w dzienniku.
 * Wszystko z danych, które produkcja już zapisuje — zero zapytań do dostawcy.
 */

const DZIEN = 86_400_000;
const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r4 = (x) => (Number.isFinite(x) ? Number(x.toFixed(4)) : null);
const r1 = (x) => (Number.isFinite(x) ? Number(x.toFixed(1)) : null);
const kurs = (v) => Number.isFinite(v) && v > 1;

const wynik1x2 = (h, a) => (h > a ? 'home' : h < a ? 'away' : 'draw');
const ll = (p, w) => -Math.log(Math.max(1e-12, p[w]));

/** Poranny kurs 1X2 → prawdopodobieństwa po zdjęciu marży; `null` bez kompletu. */
export function marketTriple(snapshot) {
	if (!snapshot || !kurs(snapshot.home) || !kurs(snapshot.draw) || !kurs(snapshot.away)) return null;
	const s = 1 / snapshot.home + 1 / snapshot.draw + 1 / snapshot.away;
	return { home: 1 / snapshot.home / s, draw: 1 / snapshot.draw / s, away: 1 / snapshot.away / s };
}

const rozliczony = (f) => Number.isFinite(f?.result?.home) && Number.isFinite(f?.result?.away);

/**
 * Log loss 1X2: model, rynek (poranny kurs) i częstości na tych samych meczach, plus podział na
 * siłę ze strzałów (`strength: 'shots'`) i same gole — to mówi, czy `dixon-coles/6` działa na żywo.
 */
export function logLossSummary(forecasts) {
	const mecze = (forecasts || []).filter((f) => rozliczony(f) && Number.isFinite(f.markets?.home) && marketTriple(f.odds?.open));
	const grupa = (xs) => {
		if (!xs.length) return { n: 0, model: null, market: null, gap: null };
		const model = srednia(xs.map((f) => ll(f.markets, wynik1x2(f.result.home, f.result.away))));
		const market = srednia(xs.map((f) => ll(marketTriple(f.odds.open), wynik1x2(f.result.home, f.result.away))));
		return { n: xs.length, model: r4(model), market: r4(market), gap: r4(model - market) };
	};
	return {
		...grupa(mecze),
		shots: grupa(mecze.filter((f) => f.strength === 'shots')),
		goals: grupa(mecze.filter((f) => f.strength === 'goals')),
		unknown: mecze.filter((f) => !f.strength).length,
	};
}

export const BUCKETS = [
	[60, 70],
	[70, 80],
	[80, 90],
	[90, 101],
];

/** Kubełki obietnica/fakt na rozliczonych typach (pokazana szansa → odsetek trafionych). */
export function promiseBuckets(picks) {
	const typy = (picks || []).filter((p) => Number.isFinite(p?.probability) && (p.status === 'won' || p.status === 'lost'));
	const kubly = BUCKETS.map(([lo, hi]) => {
		const xs = typy.filter((p) => p.probability >= lo && p.probability < hi);
		return {
			range: `${lo}–${Math.min(hi, 100)}%`,
			n: xs.length,
			promised: r1(srednia(xs.map((p) => p.probability))),
			hit: xs.length ? r1((100 * xs.filter((p) => p.status === 'won').length) / xs.length) : null,
		};
	});
	return {
		n: typy.length,
		promised: r1(srednia(typy.map((p) => p.probability))),
		hit: typy.length ? r1((100 * typy.filter((p) => p.status === 'won').length) / typy.length) : null,
		buckets: kubly,
	};
}

/** Prognoza z dziennika w kształcie `predictFixture` — dla `evaluateMarkets`, jak na produkcji. */
function prognozaZDziennika(f) {
	const m = f.markets || {};
	if (![m.home, m.draw, m.away].every(Number.isFinite)) return null;
	return {
		matchWinner: { home: m.home, draw: m.draw, away: m.away },
		doubleChance: { '1X': m.dc1X ?? m.home + m.draw, X2: m.dcX2 ?? m.away + m.draw, 12: m.home + m.away },
		teamGoals: { home: { over: m.homeScores ?? null }, away: { over: m.awayScores ?? null } },
		over25: Number.isFinite(m.over25) && Number.isFinite(f.over25?.base) ? { probability: m.over25, base: f.over25.base } : null,
		known: true,
	};
}

/**
 * Tabela źródeł szansy — ten sam sprawdzian co 21.11.2026: plakietki, które kurs POTWIERDZIŁ
 * (dokładnie `confirmMarkets` + `bestHint` z produkcji na zapisanej prognozie i porannym kursie),
 * Brier szansy modelu i szansy z kursu per selekcja, tydzień po tygodniu.
 *
 * Zalecenie przy ≥ `minN` typach: źródło z niższym Brierem, ale dopiero gdy przewaga przekracza
 * `margin` (0,002 — rząd różnic z tabeli 21.11.2026, np. „1" 0,1842 / 0,1838); w remisie zostaje
 * obowiązujące, żeby tabela nie skakała co tydzień od szumu. Liczba tygodni z kursem lepszym —
 * do wglądu. Różnica z obowiązującą tabelą idzie do raportu jako sygnał „do decyzji".
 */
export function chanceSourceTable(forecasts, { minN = 30, margin = 0.002, current = MARKET_CHANCE_KEYS } = {}) {
	const typy = [];
	for (const f of forecasts || []) {
		if (!rozliczony(f) || !f.odds?.open || f.odds.open.bookmakers === 0) continue;
		const prognoza = prognozaZDziennika(f);
		const implied = prognoza ? impliedFromSnapshot(f.odds.open) : null;
		if (!implied) continue;
		const h = bestHint(confirmMarkets(evaluateMarkets({ modelPrediction: prognoza, homeName: 'A', awayName: 'B' }), implied));
		if (!h?.chanceConfirmed || !Number.isFinite(h.modelProbability) || !Number.isFinite(h.marketProbability)) continue;
		const won = settleSelection(HINT_TO_SELECTION[h.key], f.result.home, f.result.away);
		if (won === null) continue;
		typy.push({ key: h.key, m: h.modelProbability / 100, k: h.marketProbability / 100, won, t: new Date(f.kickoff).getTime() });
	}
	const br = (xs, pole) => srednia(xs.map((x) => (x[pole] - (x.won ? 1 : 0)) ** 2));
	const start = typy.reduce((a, x) => Math.min(a, x.t), Infinity);
	const wiersze = [];
	for (const key of [...new Set(typy.map((x) => x.key))].sort()) {
		const xs = typy.filter((x) => x.key === key);
		const tygodnie = new Map();
		for (const x of xs) {
			const w = Math.floor((x.t - start) / (7 * DZIEN));
			tygodnie.set(w, [...(tygodnie.get(w) || []), x]);
		}
		const kursLepszy = [...tygodnie.values()].filter((ws) => br(ws, 'k') < br(ws, 'm')).length;
		const bm = br(xs, 'm');
		const bk = br(xs, 'k');
		const obecnie = current.has(key) ? 'market' : 'model';
		const zalecenie = xs.length < minN ? null : bk < bm - margin ? 'market' : bm < bk - margin ? 'model' : obecnie;
		wiersze.push({
			key,
			n: xs.length,
			brierModel: r4(bm),
			brierMarket: r4(bk),
			weeks: tygodnie.size,
			marketBetterWeeks: kursLepszy,
			hit: r1(100 * srednia(xs.map((x) => (x.won ? 1 : 0)))),
			model: r1(100 * srednia(xs.map((x) => x.m))),
			market: r1(100 * srednia(xs.map((x) => x.k))),
			current: obecnie,
			recommended: zalecenie,
			differs: zalecenie !== null && zalecenie !== obecnie,
		});
	}
	return wiersze;
}

/**
 * CLV plakietek modelu: kurs poranny wobec kursu zamknięcia tej samej selekcji (`open/close − 1`).
 * Dodatnie = kurs spadł po plakietce, rynek poszedł w stronę modelu. Pole `odds.close` z dziennika.
 */
export function clvSummary(forecasts) {
	const xs = [];
	for (const f of forecasts || []) {
		const sel = HINT_TO_SELECTION[f?.hint?.key];
		const o = f?.odds?.open?.[sel];
		const c = f?.odds?.close?.[sel];
		if (!sel || !kurs(o) || !kurs(c)) continue;
		xs.push(o / c - 1);
	}
	return {
		n: xs.length,
		mean: xs.length ? r1(100 * srednia(xs)) : null,
		positive: xs.length ? r1((100 * xs.filter((x) => x > 0).length) / xs.length) : null,
	};
}

/** Kupony publiczne rozliczone w oknie: per rodzaj — ile weszło, ile nie, średni kurs. */
export function couponSummary(coupons) {
	const out = {};
	for (const c of coupons || []) {
		if (c.status !== 'won' && c.status !== 'lost') continue;
		const w = (out[c.type] ||= { won: 0, lost: 0, odds: [] });
		w[c.status] += 1;
		if (Number.isFinite(c.totalOdds)) w.odds.push(c.totalOdds);
	}
	return Object.fromEntries(
		Object.entries(out).map(([type, w]) => [type, { won: w.won, lost: w.lost, avgOdds: w.odds.length ? Number(srednia(w.odds).toFixed(2)) : null }])
	);
}

/** Okno po dacie meczu (dziennik) albo rozliczenia (typy, kupony). */
export const inWindow = (date, now, days) => {
	const t = new Date(date).getTime();
	return Number.isFinite(t) && t <= new Date(now).getTime() && t > new Date(now).getTime() - days * DZIEN;
};

/**
 * Cały raport tygodnia z gotowych danych.
 *
 * @param {{ forecasts: Array, picks: Array, coupons: Array, decision: object, active: object,
 *   activated?: string|null, model?: { version: string, shots: { enabled: boolean, a: number } }, now?: Date }} input
 *   `forecasts` — dziennik z wynikiem (ostatnie 28 dni), `picks` — plakietki rozliczone w 28 dniach,
 *   `coupons` — kupony publiczne rozliczone w 28 dniach, `decision` — z `decideCalibration`
 */
export function buildWeeklySummary({ forecasts, picks, coupons, decision, active, activated = null, model = null, now = new Date() }) {
	const tydzien = (xs, pole) => (xs || []).filter((x) => inWindow(x[pole], now, 7));
	const fTydz = tydzien(forecasts, 'kickoff');
	return {
		at: new Date(now).toISOString(),
		model,
		logLoss: { week: logLossSummary(fTydz), month: logLossSummary(forecasts) },
		buckets: { week: promiseBuckets(tydzien(picks, 'settledAt')), month: promiseBuckets(picks) },
		chanceSource: chanceSourceTable(forecasts),
		coupons: { week: couponSummary(tydzien(coupons, 'settledAt')), month: couponSummary(coupons) },
		clv: { week: clvSummary(fTydz), month: clvSummary(forecasts) },
		calibration: {
			before: active?.version ?? null,
			after: activated ?? active?.version ?? null,
			changed: Boolean(decision?.changed && activated),
			selections: decision?.selections ?? [],
			reasons: decision?.reasons ?? [],
		},
	};
}

const pct = (x) => (x === null || x === undefined ? '—' : `${String(x).replace('.', ',')}%`);
const num = (x, d = 3) => (x === null || x === undefined ? '—' : x.toFixed(d).replace('.', ','));
const COUPON_NAMES = { daily: 'dnia', days3: '3-dniowy', days5: '5-dniowy', live: 'live', weekend: 'weekendowy' };
const STATUS = {
	wlaczona: 'WŁĄCZONA',
	zmieniona: 'ZMIENIONA',
	wylaczana: 'WYŁĄCZANA',
	bez_zmian: 'bez zmian',
};

/**
 * Treść maila — krótko: liczby i co zmieniono. Ten sam tekst ląduje w panelu (`ModelReport.text`).
 *
 * @returns {{ subject: string, text: string }}
 */
export function formatWeeklyReport(s) {
	const L = [];
	const ll = s.logLoss;
	const c = s.calibration;
	L.push(`Raport modelu — tydzień do ${s.at.slice(0, 10)}${s.model ? ` (${s.model.version}${s.model.shots?.enabled ? `, strzały celne z wagą goli ${String(s.model.shots.a).replace(".", ",")}` : ', bez strzałów'})` : ''}`);
	L.push('');
	L.push(`KOREKTA SZANSY: ${c.changed ? `zmieniona — ${c.before ?? 'brak'} → ${c.after}` : `bez zmian (${c.before ?? 'plik'})`}`);
	for (const x of c.selections) {
		if (x.status === 'bez_zmian' && !x.reasons.length) continue;
		L.push(
			`  ${x.key}: ${STATUS[x.status] ?? x.status}${x.to !== x.from ? ` (przesunięcie ${num(x.from)} → ${num(x.to)}, przy typowej szansie ${x.pointsAtTypical} pkt)` : ''}` +
				`${x.promised !== null ? `; sprawdzian ${pct(r1(100 * x.promised))} obiecane / ${pct(r1(100 * x.hit))} weszło, n ${x.n}` : ''}` +
				`${x.reasons.length ? `; ${x.reasons.join(', ')}` : ''}`
		);
	}
	for (const r of c.reasons) L.push(`  ${r}`);
	L.push('');
	L.push(`LOG LOSS 1X2 (mniej = lepiej) — model / rynek (poranny kurs):`);
	L.push(`  7 dni: ${num(ll.week.model, 4)} / ${num(ll.week.market, 4)} (n ${ll.week.n}); 28 dni: ${num(ll.month.model, 4)} / ${num(ll.month.market, 4)} (n ${ll.month.n})`);
	if (ll.month.shots.n || ll.month.goals.n) {
		L.push(
			`  28 dni, siła ze strzałów: ${num(ll.month.shots.model, 4)} / ${num(ll.month.shots.market, 4)} (n ${ll.month.shots.n}); same gole: ${num(ll.month.goals.model, 4)} / ${num(ll.month.goals.market, 4)} (n ${ll.month.goals.n})`
		);
	}
	L.push('');
	const b = s.buckets.month;
	L.push(`PLAKIETKI (28 dni): ${b.n} rozliczonych, obiecane ${pct(b.promised)}, weszło ${pct(b.hit)}; 7 dni: ${s.buckets.week.n}, ${pct(s.buckets.week.promised)} → ${pct(s.buckets.week.hit)}`);
	for (const k of b.buckets) if (k.n) L.push(`  ${k.range}: ${k.n} typów, ${pct(k.promised)} → ${pct(k.hit)}`);
	L.push('');
	L.push('ŹRÓDŁO SZANSY (potwierdzone plakietki, Brier model / kurs, tygodnie z kursem lepszym):');
	for (const w of s.chanceSource) {
		L.push(
			`  ${w.key}: ${w.n} typów, ${num(w.brierModel, 4)} / ${num(w.brierMarket, 4)}, ${w.marketBetterWeeks} z ${w.weeks}; teraz ${w.current === 'market' ? 'kurs' : 'model'}` +
				`${w.recommended ? `, wychodzi ${w.recommended === 'market' ? 'kurs' : 'model'}` : ', za mało typów'}${w.differs ? ' ← DO DECYZJI' : ''}`
		);
	}
	if (!s.chanceSource.length) L.push('  brak potwierdzonych plakietek w oknie');
	L.push('');
	const kup = (o) => Object.entries(o).map(([t, v]) => `${COUPON_NAMES[t] ?? t} ${v.won}/${v.won + v.lost}`).join(', ') || 'brak rozliczonych';
	L.push(`KUPONY (weszło / rozliczone): 7 dni — ${kup(s.coupons.week)}; 28 dni — ${kup(s.coupons.month)}`);
	const clv = s.clv.month;
	L.push(clv.n ? `CLV plakietek (28 dni): ${clv.n} typów, średnio ${pct(clv.mean)}, kurs spadł w ${pct(clv.positive)}` : 'CLV: brak plakietek z kursem porannym i zamknięcia');

	const zmiana = c.changed ? 'korekta zmieniona' : 'bez zmian';
	const doDecyzji = s.chanceSource.some((w) => w.differs) ? ', źródło szansy do decyzji' : '';
	return { subject: `Model: raport tygodnia (${zmiana}${doDecyzji})`, text: L.join('\n') };
}
