/**
 * Raport trybu cienia „typy modelu przy kursie ≥ 1,50" — na żywych danych z dziennika prognoz.
 *
 * To samo, co `oddsExperiment.mjs` liczy na archiwach 11 lig, tylko na tym, czego archiwum nie ma:
 * wszystkie ligi modelu, kursy z API-Football (mediana bukmacherów rano w dniu meczu), rynki
 * „powyżej 2,5 gola" i „drużyna strzeli". Reguły i bilans z `oddsShadow.js` — jedna definicja.
 *
 * KRYTERIA ZAKŁADKI (ustalone PRZED zebraniem danych, żeby nie dopasowywać ich do wyniku),
 * dla reguły „plakietka modelu, kurs ≥ 1,50":
 *   1. co najmniej 300 rozliczonych zakładów;
 *   2. zwrot po kursie rynkowym > 0;
 *   3. CLV ≥ 0 — kurs częściej spada do zamknięcia, niż rośnie (rynek idzie za modelem);
 *   4. trafność najwyżej 5 pkt poniżej tego, co model obiecywał.
 * Nawet przy spełnieniu wszystkich: po polskim podatku 12% od stawki zakład wychodzi na plus
 * dopiero przy zwrocie powyżej ~14% — zakładka nie może obiecywać zarobku.
 *
 * URUCHOMIENIE (wymaga bazy; nie pyta API):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/oddsShadowCheck.mjs  --since=2026-09-28
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const ModelForecast = (await import('@/models/ModelForecast')).default;
const { LEAGUE_TIERS } = await import('@/lib/football/leagues');
const { RULES, betFor, summarize, PL_TAX } = await import('@/lib/model/oddsShadow');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}
const SINCE = arg('since', '');

const CRITERIA = { minBets: 300, maxCalibrationGap: 0.05 };

const pct = (x, n = 1) => (x === null || x === undefined || Number.isNaN(x) ? '  —  ' : `${(100 * x).toFixed(n)}%`);
const znak = (x) => (x === null || x === undefined ? '  —  ' : `${x >= 0 ? '+' : ''}${(100 * x).toFixed(1)}%`);

await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const filtr = {
	settledAt: { $ne: null },
	'result.status': 'FT', // dogrywki i karne rozlicza się po 90 minutach — takich wyników dziennik nie ma
	'odds.open.bookmakers': { $gt: 0 },
	...(SINCE ? { kickoff: { $gte: new Date(`${SINCE}T00:00:00Z`) } } : {}),
};
const rekordy = await ModelForecast.find(filtr).select('leagueId kickoff markets hint odds result').lean();
const wszystkie = await ModelForecast.countDocuments({ 'odds.open': { $ne: null } });
const pusteKursy = await ModelForecast.countDocuments({ 'odds.open.bookmakers': 0 });
const zamkniete = rekordy.filter((r) => r.odds?.close?.bookmakers > 0).length;

console.log(
	`Prognozy ze zdjęciem kursów: ${wszystkie} (bez kursów u dostawcy: ${pusteKursy}). ` +
		`Rozliczone z kursami: ${rekordy.length}, z zamknięciem: ${zamkniete}.`
);
console.log(`Zwrot = średni zysk na zakład o stawce 1; „po podatku" = wygrana × ${1 - PL_TAX}.`);

for (const [rule, { label }] of Object.entries(RULES)) {
	const bets = rekordy.map((r) => ({ r, b: betFor(r, rule) })).filter((x) => x.b);
	const s = summarize(bets.map((x) => x.b));
	console.log(`\n=== ${label} ===`);
	if (!s.n) {
		console.log('  brak rozliczonych zakładów');
		continue;
	}
	const przedzial = s.roiSe ? ` ±${(196 * s.roiSe).toFixed(1)} pkt (95%)` : '';
	console.log(
		`  zakładów ${s.n}, średni kurs ${s.avgOdds.toFixed(2)} | model obiecywał ${pct(s.promised)}, ` +
			`trafione ${pct(s.hitRate)}, próg opłacalności ${pct(s.implied)}`
	);
	console.log(`  zwrot ${znak(s.roi)}${przedzial} | po podatku PL ${znak(s.roiTaxed)}`);
	console.log(`  CLV: kurs spadał do zamknięcia w ${pct(s.clvShare)} zakładów, średnio ${znak(s.clv)} (n=${s.clvN})`);

	const grupy = (klucz) => {
		const mapa = new Map();
		for (const x of bets) {
			const k = klucz(x);
			mapa.set(k, [...(mapa.get(k) || []), x.b]);
		}
		return [...mapa.entries()]
			.map(([k, lista]) => [k, summarize(lista)])
			.sort((a, b) => b[1].n - a[1].n)
			.map(([k, x]) => `${k} n=${x.n} obiecane ${pct(x.promised, 0)} traf. ${pct(x.hitRate, 0)} zwrot ${znak(x.roi)}`)
			.join(' · ');
	};
	console.log(`  po selekcjach: ${grupy((x) => x.b.selection)}`);
	console.log(`  po randze lig: ${grupy((x) => `poziom ${LEAGUE_TIERS.get(x.r.leagueId) ?? '?'}`)}`);

	if (rule === 'hint') {
		const warunki = [
			[`próba ≥ ${CRITERIA.minBets}`, s.n >= CRITERIA.minBets],
			['zwrot > 0', s.roi > 0],
			['CLV ≥ 0', s.clvN > 0 && s.clv >= 0],
			[`trafność ≥ obietnica − ${100 * CRITERIA.maxCalibrationGap} pkt`, s.hitRate >= s.promised - CRITERIA.maxCalibrationGap],
		];
		console.log('\n  KRYTERIA ZAKŁADKI: ' + warunki.map(([n, ok]) => `${ok ? '✔' : '✘'} ${n}`).join('  '));
		if (s.n < CRITERIA.minBets) {
			console.log(`  Za mała próba: ${s.n} z ${CRITERIA.minBets}. Werdykt po zebraniu reszty.`);
		} else {
			console.log(warunki.every(([, ok]) => ok) ? '  WERDYKT: zakładka ma podstawy.' : '  WERDYKT: zakładki nie wystawiamy.');
		}
	}
}

await mongoose.disconnect();
