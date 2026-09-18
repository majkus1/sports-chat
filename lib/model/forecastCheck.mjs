/**
 * Pomiar modelu na dzienniku prognoz (`ModelForecast`) — na WSZYSTKIM, co policzył.
 *
 * PO CO. `marketCheck.mjs` mierzy rozliczone TYPY, czyli to, co przeszło próg i zostało
 * opublikowane — kilkadziesiąt na miesiąc. Dziennik prognoz ma każdy mecz z każdego dnia,
 * więc po dwóch miesiącach odpowiada na pytania, na które typy odpowiedzą za rok:
 *
 *   1. Czy „66 %" trafia w 66 %? Kalibracja w kubełkach dla każdego rynku.
 *   2. Czy model bije stałą? Brier wobec częstości w tym samym zbiorze, ze statystyką t.
 *   3. Czy wariant `shots` jest lepszy od `goals` w „powyżej 2,5"? Osobno dla każdego.
 *   4. Gdzie jest najsłabszy? Rozbicie po ligach — kandydaci do wyłączenia.
 *   5. Czy typy po polityce (plakietki) trafiają tak, jak obiecują? To samo, co panel
 *      skuteczności, ale na pełnej puli, nie tylko na opublikowanych.
 *
 * URUCHOMIENIE (wymaga bazy):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/forecastCheck.mjs
 *   --since=2026-10-01   --league=39   --min=200 (minimalna próba dla wiersza ligi)
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const ModelForecast = (await import('@/models/ModelForecast')).default;
const { MIN_PROBABILITY, MIN_LIFT } = await import('@/lib/picks/policy');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}
const SINCE = arg('since', '');
const LEAGUE = Number(arg('league', 0));
const MIN_ROW = Number(arg('min', 200));

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f = (x, n = 4) => (x === null || x === undefined || Number.isNaN(x) ? '   —  ' : x.toFixed(n));
const brier = (p, y) => (p - y) ** 2;
function tStat(diffs) {
	const n = diffs.length;
	if (n < 2) return null;
	const m = srednia(diffs);
	const v = diffs.reduce((s, d) => s + (d - m) ** 2, 0) / (n - 1);
	return v > 0 ? m / Math.sqrt(v / n) : null;
}

/** Rynki: prognoza z dziennika → czy zaszło. */
const RYNKI = {
	home: { p: (r) => r.markets.home, y: (r) => (r.result.home > r.result.away ? 1 : 0), nazwa: 'wygrana gospodarzy' },
	away: { p: (r) => r.markets.away, y: (r) => (r.result.away > r.result.home ? 1 : 0), nazwa: 'wygrana gości' },
	dc1X: { p: (r) => r.markets.dc1X, y: (r) => (r.result.home >= r.result.away ? 1 : 0), nazwa: '1X' },
	dcX2: { p: (r) => r.markets.dcX2, y: (r) => (r.result.away >= r.result.home ? 1 : 0), nazwa: 'X2' },
	homeScores: { p: (r) => r.markets.homeScores, y: (r) => (r.result.home > 0 ? 1 : 0), nazwa: 'gospodarz strzeli' },
	awayScores: { p: (r) => r.markets.awayScores, y: (r) => (r.result.away > 0 ? 1 : 0), nazwa: 'gość strzeli' },
	over25: { p: (r) => r.markets.over25, y: (r) => (r.result.home + r.result.away > 2.5 ? 1 : 0), nazwa: 'powyżej 2,5' },
	btts: { p: (r) => r.markets.btts, y: (r) => (r.result.home > 0 && r.result.away > 0 ? 1 : 0), nazwa: 'obie strzelą (opis)' },
};

await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const filtr = { settledAt: { $ne: null }, 'result.home': { $ne: null }, 'result.away': { $ne: null } };
if (SINCE) filtr.kickoff = { $gte: new Date(SINCE) };
if (LEAGUE) filtr.leagueId = LEAGUE;
const rows = await ModelForecast.find(filtr).lean();
const ileCzeka = await ModelForecast.countDocuments({ settledAt: null });
console.log(`Prognoz z wynikiem: ${rows.length}${SINCE ? ` od ${SINCE}` : ''}${LEAGUE ? ` (liga ${LEAGUE})` : ''}; bez wyniku (nadchodzące): ${ileCzeka}.`);
if (rows.length < 50) {
	console.log('Za mało prognoz, żeby cokolwiek mierzyć — wróć za kilka tygodni.');
	await mongoose.disconnect();
	process.exit(0);
}

/* ---------------------------------------------------------------- 1–2: rynki */
console.log('\n=== RYNKI: Brier modelu wobec stałej (częstość w tym zbiorze), t > 2 = istotnie lepiej ===');
console.log('rynek                     n     częstość   Brier model  Brier stała   t');
for (const [klucz, r] of Object.entries(RYNKI)) {
	const dane = rows.filter((x) => Number.isFinite(r.p(x)));
	if (dane.length < 30) continue;
	const y = dane.map(r.y);
	const p = dane.map(r.p);
	const stala = srednia(y);
	const bm = p.map((v, i) => brier(v, y[i]));
	const bs = y.map((v) => brier(stala, v));
	const t = tStat(bs.map((v, i) => v - bm[i]));
	console.log(`${r.nazwa.padEnd(24)} ${String(dane.length).padStart(5)}   ${f(stala, 3)}     ${f(srednia(bm))}      ${f(srednia(bs))}    ${t === null ? '—' : f(t, 2)}`);
}

/* ---------------------------------------------------------------- 1: kalibracja */
console.log('\n=== KALIBRACJA: prognoza wobec tego, co zaszło (kubełki po 10 pkt) ===');
for (const klucz of ['home', 'away', 'over25', 'btts']) {
	const r = RYNKI[klucz];
	const dane = rows.filter((x) => Number.isFinite(r.p(x)));
	if (dane.length < 100) continue;
	console.log(`--- ${r.nazwa} ---`);
	for (let dol = 0.2; dol < 0.9; dol += 0.1) {
		const w = dane.filter((x) => r.p(x) >= dol && r.p(x) < dol + 0.1);
		if (w.length < 20) continue;
		const prog = srednia(w.map(r.p));
		const obs = srednia(w.map(r.y));
		console.log(`  ${(dol * 100).toFixed(0).padStart(3)}–${((dol + 0.1) * 100).toFixed(0)}%  n=${String(w.length).padStart(5)}  prognoza ${f(prog, 3)}  zaszło ${f(obs, 3)}  różnica ${(obs - prog >= 0 ? '+' : '') + f(obs - prog, 3)}`);
	}
}

/* ---------------------------------------------------------------- 3: warianty 2,5 */
console.log('\n=== POWYŻEJ 2,5 wg wariantu regresji ===');
for (const wariant of ['goals', 'shots']) {
	const dane = rows.filter((x) => x.over25?.variant === wariant && Number.isFinite(x.markets.over25));
	if (dane.length < 30) {
		console.log(`  ${wariant}: n=${dane.length} — za mało`);
		continue;
	}
	const y = dane.map(RYNKI.over25.y);
	const p = dane.map(RYNKI.over25.p);
	const stala = srednia(y);
	const bm = srednia(p.map((v, i) => brier(v, y[i])));
	const bs = srednia(y.map((v) => brier(stala, v)));
	console.log(`  ${wariant.padEnd(6)} n=${String(dane.length).padStart(5)}  Brier ${f(bm)} wobec stałej ${f(bs)}  (zysk ${f(bs - bm)})`);
}

/* ---------------------------------------------------------------- 4: ligi */
console.log(`\n=== LIGI: zysk Briera nad stałą w 1X2 i 2,5 (min. ${MIN_ROW} meczów) — ujemny = kandydat do wyłączenia ===`);
const ligi = new Map();
for (const x of rows) ligi.set(x.leagueId, [...(ligi.get(x.leagueId) || []), x]);
const wiersze = [];
for (const [leagueId, dane] of ligi) {
	if (dane.length < MIN_ROW) continue;
	const zysk = (klucz) => {
		const r = RYNKI[klucz];
		const d = dane.filter((x) => Number.isFinite(r.p(x)));
		if (d.length < 30) return null;
		const y = d.map(r.y);
		const stala = srednia(y);
		return srednia(y.map((v) => brier(stala, v))) - srednia(d.map((x, i) => brier(r.p(x), y[i])));
	};
	wiersze.push({ leagueId, n: dane.length, home: zysk('home'), away: zysk('away'), over25: zysk('over25') });
}
wiersze.sort((a, b) => (a.home ?? 0) + (a.away ?? 0) - ((b.home ?? 0) + (b.away ?? 0)));
console.log('liga      n    gospodarz    gość     powyżej 2,5');
for (const w of wiersze) {
	console.log(`${String(w.leagueId).padEnd(6)} ${String(w.n).padStart(5)}   ${f(w.home)}   ${f(w.away)}   ${f(w.over25)}`);
}

/* ---------------------------------------------------------------- 5: plakietki */
console.log(`\n=== PLAKIETKI (typy po polityce ≥${MIN_PROBABILITY}% i ≥${MIN_LIFT} pkt) — trafność wobec obietnicy ===`);
const zPlakietka = rows.filter((x) => x.hint?.key);
const wgKlucza = new Map();
for (const x of zPlakietka) wgKlucza.set(x.hint.key, [...(wgKlucza.get(x.hint.key) || []), x]);
const trafila = (x) => {
	const r = RYNKI[x.hint.key === '1X' ? 'dc1X' : x.hint.key === 'X2' ? 'dcX2' : x.hint.key];
	return r ? r.y(x) : null;
};
let razemN = 0;
let razemTraf = 0;
let razemProg = 0;
for (const [klucz, dane] of [...wgKlucza.entries()].sort((a, b) => b[1].length - a[1].length)) {
	const oceny = dane.map(trafila).filter((v) => v !== null);
	if (!oceny.length) continue;
	const traf = srednia(oceny);
	const prog = srednia(dane.map((x) => x.hint.probability / 100));
	const norma = srednia(dane.map((x) => x.hint.base / 100));
	razemN += oceny.length;
	razemTraf += traf * oceny.length;
	razemProg += prog * oceny.length;
	console.log(`  ${klucz.padEnd(12)} n=${String(oceny.length).padStart(5)}  obiecane ${f(prog, 3)}  trafiło ${f(traf, 3)}  norma ${f(norma, 3)}  ${traf >= prog - 0.03 ? 'OK' : 'ZA PEWNY SIEBIE'}`);
}
if (razemN) console.log(`  razem        n=${String(razemN).padStart(5)}  obiecane ${f(razemProg / razemN, 3)}  trafiło ${f(razemTraf / razemN, 3)}`);

await mongoose.disconnect();
