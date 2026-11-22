/**
 * Pomiar trybu cienia „siła składu" — czy typy przy osłabionym składzie trafiają gorzej, niż obiecują.
 *
 * Dane: dziennik prognoz (`ModelForecast`) — plakietka SAMEGO modelu (`hint`), wynik i od 22.11.2026 zdjęcia
 * siły składu obu drużyn (`lineup.expected` z listy nieobecnych, `lineup.confirmed` z potwierdzonej jedenastki;
 * `lib/football/lineupsJob.js`). Definicja weta ta sama co w produkcji (`lineupVeto`, `lib/football/lineups.js`).
 *
 * CO MÓWI WYNIK (kryteria ustalone PRZED zebraniem danych, żeby nie dopasowywać ich do wyniku):
 *   WETO POTWIERDZONE, gdy: co najmniej 100 plakietek z wetem, ich trafność co najmniej 5 pkt pod obietnicą,
 *   plakietki bez weta najwyżej 2 pkt pod obietnicą, a różnica „trafione − obiecane" między grupami ma |z| ≥ 2.
 *   Weto ZBYT OSTRE, gdy plakietki z wetem trafiają tyle, ile obiecują (różnica w szumie) — wtedy wyrzucamy
 *   z kuponów dobre typy i trzeba podnieść próg (np. 4 podstawowych zamiast 3).
 *   KOREKTA SZANS (nie tylko weto) do rozważenia dopiero przy ≥ 300 meczach z osłabioną drużyną i błędzie modelu
 *   na jej wygranej (wynik − szansa) ≤ −4 pkt przy |z| ≥ 2 — i wtedy jako osobny eksperyment z podziałem po dacie.
 *
 * KIEDY. Przy ~150 meczach dziennie z danymi i weto u ~3–8% plakietek (szacunek — dokładnie to policzy ten skrypt)
 * 100 plakietek z wetem to ~4–6 tygodni. Pierwszy odczyt: połowa stycznia 2027.
 *
 * URUCHOMIENIE (wymaga bazy, tylko odczyt; nie pyta API):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/lineupCheck.mjs [--since=2026-11-23] [--stage=confirmed|expected|any]
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });
dotenv.config();

const ModelForecast = (await import('@/models/ModelForecast')).default;
const { HINT_TO_SELECTION, settleSelection } = await import('@/lib/model/oddsShadow');
const { lineupVeto, BACKED_SIDES } = await import('@/lib/football/lineups');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}
const SINCE = arg('since', '');
const STAGE = arg('stage', 'any');

const CRITERIA = { minVetoed: 100, vetoGap: -0.05, cleanGap: -0.02, minZ: 2, minWeakenedMatches: 300, modelGap: -0.04 };

const pct = (x, n = 1) => (x === null || x === undefined || Number.isNaN(x) ? '  —  ' : `${(100 * x).toFixed(n)}%`);
const pkt = (x) => (x === null || Number.isNaN(x) ? ' — ' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)} pkt`);

/** Zdjęcie do oceny: potwierdzone składy, a bez nich ostatnie z listy nieobecnych (`--stage` zawęża). */
function zdjecie(r) {
	if (STAGE === 'confirmed') return r.lineup?.confirmed || null;
	if (STAGE === 'expected') return r.lineup?.expected || null;
	return r.lineup?.confirmed || r.lineup?.expected || null;
}

/** Średnia, błąd średniej i liczność (do |z| różnicy dwóch grup). */
function stat(xs) {
	const n = xs.length;
	if (!n) return { n: 0, mean: null, se: null };
	const mean = xs.reduce((a, b) => a + b, 0) / n;
	const varr = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
	return { n, mean, se: Math.sqrt(varr / n) };
}
const zRoznicy = (a, b) => (a.n && b.n && (a.se || b.se) ? (a.mean - b.mean) / Math.sqrt(a.se ** 2 + b.se ** 2) : null);

function grupa(nazwa, wiersze) {
	const traf = stat(wiersze.map((w) => (w.hit ? 1 : 0)));
	const obiec = stat(wiersze.map((w) => w.p));
	const luka = stat(wiersze.map((w) => (w.hit ? 1 : 0) - w.p));
	console.log(
		`  ${nazwa.padEnd(34)} n=${String(traf.n).padStart(5)}  obiecane ${pct(obiec.mean)}  trafione ${pct(traf.mean)}` +
			`${traf.se ? ` ±${(196 * traf.se).toFixed(1)}` : ''}  różnica ${pkt(luka.mean)}`
	);
	return luka;
}

await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const filtr = {
	settledAt: { $ne: null },
	'result.status': 'FT',
	$or: [{ 'lineup.confirmed': { $ne: null } }, { 'lineup.expected': { $ne: null } }],
	...(SINCE ? { kickoff: { $gte: new Date(`${SINCE}T00:00:00Z`) } } : {}),
};
const rekordy = await ModelForecast.find(filtr).select('kickoff markets hint result lineup').lean();
const zDanymi = await ModelForecast.countDocuments({ $or: [{ 'lineup.confirmed': { $ne: null } }, { 'lineup.expected': { $ne: null } }] });
const potwierdzone = rekordy.filter((r) => r.lineup?.confirmed).length;

console.log(`Prognozy ze zdjęciem składu: ${zDanymi}; rozliczone (FT): ${rekordy.length}, z potwierdzoną jedenastką: ${potwierdzone}.`);
console.log(`Etap: ${STAGE}${SINCE ? `, od ${SINCE}` : ''}. Weto = drużyna typu bez 3+ podstawowych, bramkarza nr 1 albo najlepszego strzelca.\n`);

/* --- 1. Plakietki modelu: z wetem i bez. */
const plakietki = [];
for (const r of rekordy) {
	const key = r.hint?.key;
	const sel = HINT_TO_SELECTION[key];
	const z = zdjecie(r);
	if (!sel || !z || !Number.isFinite(r.hint?.probability)) continue;
	const hit = settleSelection(sel, r.result.home, r.result.away);
	if (hit === null) continue;
	const w = lineupVeto(key, { home: z.home, away: z.away });
	const strona = BACKED_SIDES[key]?.[0];
	plakietki.push({ r, key, hit, p: r.hint.probability / 100, veto: w.veto, reasons: w.reasons, backed: z[strona] || null, potw: Boolean(r.lineup?.confirmed) });
}
console.log('=== Plakietki modelu (obiecane = szansa plakietki z dziennika) ===');
const zWetem = grupa('z wetem (osłabiony skład)', plakietki.filter((x) => x.veto));
const bezWeta = grupa('bez weta', plakietki.filter((x) => !x.veto));
const z = zRoznicy(zWetem, bezWeta);
console.log(`  różnica „trafione − obiecane" między grupami: ${pkt(zWetem.mean !== null && bezWeta.mean !== null ? zWetem.mean - bezWeta.mean : null)}, |z| = ${z === null ? '—' : Math.abs(z).toFixed(2)}`);

console.log('\n  według brakujących podstawowych (drużyna typu):');
for (const [nazwa, f] of [
	['0', (m) => m?.missingCore === 0],
	['1', (m) => m?.missingCore === 1],
	['2', (m) => m?.missingCore === 2],
	['3+', (m) => m?.missingCore >= 3],
]) grupa(`  brak ${nazwa}`, plakietki.filter((x) => x.backed?.reliable && f(x.backed)));
console.log('  według powodu weta:');
grupa('  bez bramkarza nr 1', plakietki.filter((x) => x.reasons.includes('goalkeeper')));
grupa('  bez najlepszego strzelca', plakietki.filter((x) => x.reasons.includes('top_scorer')));
grupa('  rotacja (terminarz + 2 na ławce)', plakietki.filter((x) => x.backed?.rotationRisk && x.backed?.rested >= 2));
console.log('  według etapu:');
grupa('  z wetem, potwierdzone składy', plakietki.filter((x) => x.veto && x.potw));
grupa('  z wetem, lista nieobecnych', plakietki.filter((x) => x.veto && !x.potw));

/* --- 2. Model na meczach z osłabioną drużyną: czy przecenia jej wygraną? */
console.log('\n=== Model 1X2 a osłabiona drużyna (wynik − szansa modelu na jej wygraną) ===');
const bledy = { oslabiona: [], pelna: [] };
for (const r of rekordy) {
	const zd = zdjecie(r);
	if (!zd) continue;
	for (const [side, sel] of [['home', 'home'], ['away', 'away']]) {
		const m = zd[side];
		const p = r.markets?.[sel];
		if (!m?.reliable || !Number.isFinite(p)) continue;
		const wynik = settleSelection(sel, r.result.home, r.result.away) ? 1 : 0;
		(m.weakened ? bledy.oslabiona : bledy.pelna).push(wynik - p);
	}
}
const so = stat(bledy.oslabiona);
const sp = stat(bledy.pelna);
console.log(`  osłabiona: n=${so.n}, błąd ${pkt(so.mean)} | pełny skład: n=${sp.n}, błąd ${pkt(sp.mean)} | |z| = ${zRoznicy(so, sp) === null ? '—' : Math.abs(zRoznicy(so, sp)).toFixed(2)}`);

/* --- 3. Werdykt wg kryteriów z nagłówka. */
console.log('\n=== Werdykt (kryteria z nagłówka) ===');
if (zWetem.n < CRITERIA.minVetoed) {
	console.log(`  ZA MAŁO DANYCH: ${zWetem.n} plakietek z wetem, potrzeba ${CRITERIA.minVetoed}.`);
} else if (zWetem.mean <= CRITERIA.vetoGap && bezWeta.mean >= CRITERIA.cleanGap && z !== null && Math.abs(z) >= CRITERIA.minZ) {
	console.log('  WETO POTWIERDZONE — osłabione typy trafiają wyraźnie poniżej obietnicy. Próg zostaje.');
} else if (z !== null && Math.abs(z) < CRITERIA.minZ) {
	console.log('  WETO W SZUMIE — typy z wetem nie trafiają istotnie gorzej. Rozważyć wyższy próg (np. 4 podstawowych).');
} else {
	console.log('  WYNIK MIESZANY — przejrzeć grupy wyżej przed decyzją.');
}
if (so.n >= CRITERIA.minWeakenedMatches && so.mean <= CRITERIA.modelGap && Math.abs(zRoznicy(so, sp) ?? 0) >= CRITERIA.minZ) {
	console.log('  Model przecenia osłabione drużyny — kandydat na eksperyment z korektą szans (osobny, z podziałem po dacie).');
} else {
	console.log(`  Korekta szans: brak podstaw (potrzeba ≥ ${CRITERIA.minWeakenedMatches} występów osłabionych drużyn i błędu ≤ ${pkt(CRITERIA.modelGap)} przy |z| ≥ 2).`);
}

await mongoose.disconnect();
