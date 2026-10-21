/**
 * Sprawdzian lig-kandydatów: czy model wolno w nich włączyć (`leagueCheck.js` — zasady i progi).
 *
 * Kandydaci nie są nigdzie włączeni — ten skrypt niczego w modelu nie zmienia. Po przebiegu
 * do `LEAGUE_TIERS` trafiają (jako poziom 3, „okres próbny") wyłącznie ligi z werdyktem
 * „dopuszczona". Obok kandydatów liczymy tą samą miarą kilka lig, które już działają
 * (`BENCHMARK`) — żeby było widać, jak wygląda liczba ligi, w której model sprawdza się dziś.
 *
 * URUCHOMIENIE (na serwerze, bo wymaga klucza z dziennym limitem 7500):
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/leagueCheck.mjs
 *   ... --leagues=136,79      tylko wybrane
 *   ... --split=2025-10-21    początek okresu testowego (domyślnie rok temu)
 *   ... --save=off            bez zapisu do bazy
 *
 * Koszt: 1 zapytanie o listę lig + 3 na ligę (trzy ostatnie sezony) — ok. 190 przy pełnej liście.
 * Wynik trafia też do kolekcji `modelleaguechecks`, żeby dało się go przeczytać bez kopiowania
 * z terminala.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env.local' });

const { leagueFixtures } = await import('@/lib/football/endpoints');
const { footballRequest } = await import('@/lib/football/client');
const { LEAGUE_TIERS } = await import('@/lib/football/leagues');
const { evaluateLeague, GATE } = await import('@/lib/model/leagueCheck');

/** Kandydaci — identyfikatory sprawdzone u dostawcy 21.10.2026 (`leagues?current=true`). */
const CANDIDATES = [
	// Drugie poziomy czołowych lig Europy i niższe ligi angielskie.
	[136, 'Serie B (Włochy)'],
	[79, '2. Bundesliga'],
	[141, 'Segunda División (Hiszpania)'],
	[62, 'Ligue 2'],
	[89, 'Eerste Divisie (Holandia)'],
	[145, 'Challenger Pro League (Belgia)'],
	[95, 'Liga Portugal 2'],
	[204, '1. Lig (Turcja)'],
	[41, 'League One'],
	[42, 'League Two'],
	[80, '3. Liga (Niemcy)'],
	[180, 'Championship (Szkocja)'],
	[219, '2. Liga (Austria)'],
	[120, '1. Division (Dania)'],
	[114, 'Superettan (Szwecja)'],
	[104, '1. Division (Norwegia)'],
	// Ekstraklasy Europy spoza listy.
	[197, 'Super League 1 (Grecja)'],
	[345, 'Czech Liga'],
	[333, 'Premier League (Ukraina)'],
	[235, 'Premier League (Rosja)'],
	[271, 'NB I (Węgry)'],
	[332, 'Super Liga (Słowacja)'],
	[172, 'First League (Bułgaria)'],
	[383, "Ligat Ha'al (Izrael)"],
	[318, '1. Division (Cypr)'],
	[373, '1. SNL (Słowenia)'],
	[244, 'Veikkausliiga (Finlandia)'],
	[357, 'Premier Division (Irlandia)'],
	[164, 'Úrvalsdeild (Islandia)'],
	[116, 'Premier League (Białoruś)'],
	[327, 'Erovnuli Liga (Gruzja)'],
	// Ameryki.
	[72, 'Serie B (Brazylia)'],
	[129, 'Primera Nacional (Argentyna)'],
	[255, 'USL Championship'],
	[263, 'Liga de Expansión MX'],
	[239, 'Primera A (Kolumbia)'],
	[265, 'Primera División (Chile)'],
	[281, 'Primera División (Peru)'],
	[268, 'Primera División (Urugwaj)'],
	[242, 'Liga Pro (Ekwador)'],
	// Azja, Australia, Afryka, Bliski Wschód.
	[188, 'A-League (Australia)'],
	[169, 'Super League (Chiny)'],
	[99, 'J2 League (Japonia)'],
	[293, 'K League 2 (Korea)'],
	[296, 'Thai League 1'],
	[233, 'Premier League (Egipt)'],
	[200, 'Botola Pro (Maroko)'],
	[305, 'Stars League (Katar)'],
	[301, 'Pro League (ZEA)'],
];

/** Ligi, które już działają — punkt odniesienia, liczony tą samą miarą. Nie zmieniamy ich. */
const BENCHMARK = [
	[40, 'Championship (Anglia)'],
	[88, 'Eredivisie'],
	[113, 'Allsvenskan'],
	[107, 'I liga (Polska)'],
	[253, 'MLS'],
	[71, 'Serie A (Brazylia)'],
];

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=')[1] : domyslna;
}

const wybrane = String(arg('leagues', ''))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);
const SPLIT = new Date(arg('split', new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)));
const REFIT_DAYS = Number(arg('refit-days', '14'));
const SAVE = arg('save', 'on') !== 'off';

const lista = [...CANDIDATES.map(([id, nazwa]) => ({ id, nazwa, rola: 'kandydat' })), ...BENCHMARK.map(([id, nazwa]) => ({ id, nazwa, rola: 'działa' }))].filter(
	(l) => !wybrane.length || wybrane.includes(l.id)
);

for (const l of lista) {
	if (l.rola === 'kandydat' && LEAGUE_TIERS.has(l.id)) {
		console.error(`Liga ${l.id} (${l.nazwa}) już jest w LEAGUE_TIERS — nie jest kandydatem. Popraw listę.`);
		process.exit(1);
	}
}

console.log(`Ligi: ${lista.length} | okres testowy od ${SPLIT.toISOString().slice(0, 10)} | przeliczanie co ${REFIT_DAYS} dni`);
console.log(`Progi: ≥${GATE.minMatches} meczów, pokrycie ≥${100 * GATE.minCoverage}%, t ≥ ${GATE.minT}, kalibracja typów do −${GATE.maxCalibrationGap} pkt\n`);

// Bieżący sezon każdej ligi — numeracja bywa nieregularna (J1 League gra sezon „2027" od sierpnia 2026).
const biezace = new Map();
try {
	for (const row of (await footballRequest('leagues', { current: 'true' })) || []) {
		const s = (row.seasons || []).find((x) => x.current);
		if (s) biezace.set(row.league?.id, s.year);
	}
} catch (error) {
	console.warn('Lista lig niedostępna — przyjmuję bieżący rok jako sezon:', error.message);
}

const toResults = (rows) =>
	(rows || [])
		.filter((r) => ['FT', 'AET', 'PEN'].includes(r?.fixture?.status?.short))
		.filter((r) => Number.isFinite(r?.goals?.home) && Number.isFinite(r?.goals?.away))
		.map((r) => ({ date: r.fixture.date, homeId: r.teams?.home?.id, awayId: r.teams?.away?.id, homeGoals: r.goals.home, awayGoals: r.goals.away }));

const wyniki = [];
let zapytan = 1;
for (const l of lista) {
	const cur = biezace.get(l.id) ?? new Date().getFullYear();
	const mecze = [];
	for (const season of [cur - 2, cur - 1, cur]) {
		try {
			mecze.push(...toResults(await leagueFixtures({ leagueId: l.id, season })));
			zapytan += 1;
		} catch (error) {
			console.warn(`  ${l.nazwa} / ${season}: ${error.message}`);
		}
	}
	const r = evaluateLeague(mecze, { leagueId: l.id, split: SPLIT, refitDays: REFIT_DAYS });
	wyniki.push({ ...r, name: l.nazwa, role: l.rola });
	process.stdout.write('.');
}
console.log(`\nZapytań: ${zapytan}\n`);

const f = (x, n = 3) => (Number.isFinite(x) ? x.toFixed(n) : '—');
const wiersz = (r) =>
	'  ' +
	(r.pass ? 'TAK ' : 'nie ') +
	r.name.slice(0, 30).padEnd(31) +
	String(r.n).padStart(5) +
	`${Math.round(100 * r.coverage)}%`.padStart(6) +
	f(r.logLossModel).padStart(8) +
	f(r.logLossBase).padStart(8) +
	`${r.gain >= 0 ? '+' : ''}${f(r.gain)}`.padStart(8) +
	f(r.t, 1).padStart(6) +
	String(r.picks).padStart(6) +
	(r.picks ? `${f(r.promised, 0)}/${f(r.hit, 0)}%` : '—').padStart(11) +
	(r.reason ? `  ${r.reason}` : '');
const naglowek = '       ' + 'liga'.padEnd(31) + 'n'.padStart(5) + 'pokr.'.padStart(6) + 'model'.padStart(8) + 'częst.'.padStart(8) + 'zysk'.padStart(8) + 't'.padStart(6) + 'typy'.padStart(6) + 'obiec/traf'.padStart(11);

const kandydaci = wyniki.filter((r) => r.role === 'kandydat').sort((a, b) => b.pass - a.pass || b.t - a.t);
console.log('KANDYDACI (log loss 1X2: mniej = lepiej; zysk = częstości − model)');
console.log(naglowek);
kandydaci.forEach((r) => console.log(wiersz(r)));
console.log('\nLIGI, KTÓRE JUŻ DZIAŁAJĄ — ta sama miara, dla porównania');
console.log(naglowek);
wyniki.filter((r) => r.role === 'działa').forEach((r) => console.log(wiersz(r)));

const dopuszczone = kandydaci.filter((r) => r.pass);
const typyRazem = dopuszczone.reduce((a, r) => a + r.picks, 0);
const obiecRazem = typyRazem ? dopuszczone.reduce((a, r) => a + r.promised * r.picks, 0) / typyRazem : null;
const trafRazem = typyRazem ? dopuszczone.reduce((a, r) => a + r.hit * r.picks, 0) / typyRazem : null;
console.log(`\nDOPUSZCZONE: ${dopuszczone.length} z ${kandydaci.length} — typy razem ${typyRazem}, obiecane ${f(obiecRazem, 1)}%, trafione ${f(trafRazem, 1)}%`);
console.log(`Identyfikatory: ${dopuszczone.map((r) => r.leagueId).join(', ') || '—'}`);

if (SAVE && process.env.DATABASE_URL) {
	try {
		await mongoose.connect(process.env.DATABASE_URL);
		await mongoose.connection.db.collection('modelleaguechecks').insertOne({
			at: new Date(),
			split: SPLIT,
			refitDays: REFIT_DAYS,
			gate: GATE,
			requests: zapytan,
			leagues: wyniki,
		});
		console.log('Zapisano w kolekcji modelleaguechecks.');
	} catch (error) {
		console.warn('Zapis do bazy nie powiódł się:', error.message);
	} finally {
		await mongoose.disconnect().catch(() => {});
	}
}
process.exit(0);
