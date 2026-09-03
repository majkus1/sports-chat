/**
 * Model wobec rynku na ROZLICZONYCH TYPACH z produkcji.
 *
 * Backtest porównuje model z kursami zamknięcia na archiwum czołowych lig. Ten skrypt robi
 * to samo na typach, które serwis faktycznie wystawił: każdy typ ma zapisane prawdopodobieństwo
 * modelu i prawdopodobieństwo rynkowe z chwili powstania (`marketProbability`), a po meczu
 * wynik. To jedyny materiał z lig spoza archiwum (Ekstraklasa, Skandynawia, Ameryka, Azja)
 * i jedyny, który obejmuje rynek „drużyna strzeli".
 *
 * Wnioski przychodzą z czasem: kilkanaście typów nic nie mówi, kilkaset zaczyna.
 *
 * URUCHOMIENIE (na serwerze, bo potrzebuje bazy):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/marketCheck.mjs
 *   node ... lib/model/marketCheck.mjs --days=90
 */

import 'dotenv/config';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { default: connectToDb } = await import('@/lib/db');
const { default: Pick } = await import('@/models/Pick');
const { MARKET_GROUPS } = await import('@/lib/picks/markets');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}

const DAYS = Number(arg('days', '365'));
const od = new Date(Date.now() - DAYS * 86_400_000);

await connectToDb();

const typy = await Pick.find({
	author: 'ai',
	status: { $in: ['won', 'lost'] },
	probability: { $ne: null },
	marketProbability: { $ne: null },
	kickoff: { $gte: od },
})
	.select('status probability marketProbability baseRate lift normalized kind policyReason')
	.lean();

const srednia = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
const f = (x) => (x === null ? '   —  ' : x.toFixed(4));
const brier = (p, won) => (p / 100 - (won ? 1 : 0)) ** 2;
const logLoss = (p, won) => -Math.log(Math.max(1e-6, won ? p / 100 : 1 - p / 100));

console.log(`Rozliczone typy AI z zapisanym rynkiem (ostatnie ${DAYS} dni): ${typy.length}`);
if (!typy.length) {
	console.log('Nic do porównania — typy z prawdopodobieństwem rynkowym powstają od wdrożenia sufitu.');
	process.exit(0);
}

const grupy = new Map();
for (const t of typy) {
	const klucz = t.normalized?.type ?? 'nieznany';
	const g = grupy.get(klucz) || { n: 0, won: 0, model: [], rynek: [], baza: [], roznice: [] };
	const won = t.status === 'won';
	g.n += 1;
	g.won += won ? 1 : 0;
	g.model.push(brier(t.probability, won));
	g.rynek.push(brier(t.marketProbability, won));
	if (Number.isFinite(t.baseRate)) g.baza.push(brier(t.baseRate, won));
	g.roznice.push(logLoss(t.marketProbability, won) - logLoss(t.probability, won));
	grupy.set(klucz, g);
}

console.log('');
console.log('  ' + 'rynek'.padEnd(20) + 'n'.padStart(5) + 'trafność'.padStart(10) + 'MODEL'.padStart(9) + 'RYNEK'.padStart(9) + 'NORMA'.padStart(9) + '   (Brier, mniej = lepiej)');
console.log('  ' + '-'.repeat(62));
for (const [klucz, g] of grupy) {
	console.log(
		'  ' +
			(MARKET_GROUPS[klucz] ?? klucz).padEnd(20) +
			String(g.n).padStart(5) +
			`${((100 * g.won) / g.n).toFixed(0)}%`.padStart(10) +
			f(srednia(g.model)).padStart(9) +
			f(srednia(g.rynek)).padStart(9) +
			f(srednia(g.baza)).padStart(9)
	);
}

const wszystkieRoznice = [...grupy.values()].flatMap((g) => g.roznice);
const sr = srednia(wszystkieRoznice);
const war = wszystkieRoznice.reduce((acc, r) => acc + (r - sr) ** 2, 0) / Math.max(1, wszystkieRoznice.length - 1);
const se = Math.sqrt(war / wszystkieRoznice.length);
const t = se > 0 ? sr / se : 0;

console.log('');
console.log(`  model wobec rynku (log loss, sparowany): ${f(sr)} ± ${f(1.96 * se)} | t = ${t.toFixed(2)}  (ujemne = rynek lepszy)`);
console.log(
	`  ${
		wszystkieRoznice.length < 100
			? 'Za mało typów, żeby cokolwiek stwierdzić — wróć przy stu rozliczonych.'
			: Math.abs(t) < 2
				? 'Różnica w granicach szumu.'
				: t < 0
					? 'Rynek wie więcej. Luka mówi, ile informacji modelowi brakuje.'
					: 'Model bije rynek na wystawionych typach — sprawdź, czy to nie selekcja próby.'
	}`
);

const odrzucone = await Pick.countDocuments({ author: 'ai', policyReason: 'market_certain', kickoff: { $gte: od } });
console.log('');
console.log(`  Typy odcięte sufitem rynkowym w tym okresie: ${odrzucone}`);

process.exit(0);
