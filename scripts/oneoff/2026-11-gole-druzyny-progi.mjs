/**
 * JEDNORAZOWA KOREKTA — sześć typów „Gole drużyny" z progiem wziętym z nazwy klubu.
 *
 * DO DECYZJI WŁAŚCICIELA. Domyślnie tylko pokazuje, co by zmienił (nic nie zapisuje).
 * Zapis wyłącznie z `--apply`:
 *
 *   node scripts/oneoff/2026-11-gole-druzyny-progi.mjs            # podgląd
 *   node scripts/oneoff/2026-11-gole-druzyny-progi.mjs --apply    # zapis
 *
 * CO SIĘ STAŁO. Do listopada 2026 parser brał próg z pierwszej liczby w selekcji, więc
 * „1899 Hoffenheim powyżej 0.5 gola" zapisało się jako próg 1899 (tak samo Mainz 05 → 5,
 * RED Star FC 93 → 93, FC Basel 1893 → 1893). Rozliczenie liczy `gole > próg`, więc każdy
 * z tych typów przegrał bez względu na wynik. Naprawa parsera (`lib/picks/markets.js`)
 * działa tylko na nowe typy — rozliczenie czyta `normalized` zapisane przy typie.
 *
 * SKALA (odczyt z bazy 21.11.2026): 6 typów, żaden nie czeka na rozliczenie. 5 to plakietki
 * modelu liczone do skuteczności (0 z 5 trafionych → poprawnie 3 z 5), 1 to typ do Kolejki
 * (poza skutecznością, ale w rankingu kolejki). Publiczna skuteczność: 977/1355 = 72,1 %
 * → 980/1355 = 72,3 %.
 *
 * `countsToStats` zostaje bez zmian. Plakietka niesie normę z modelu (`baseRate` 70), więc
 * polityka nie doszła do `market_not_measured` nawet przy progu 1899 — a przy poprawnym
 * progu 0.5 rynek jest zmierzony i typ słusznie się liczy. Typ do Kolejki ma `false`
 * z założenia (`excludeFromStats`) i tak zostaje.
 *
 * BEZPIECZNIKI. Lista identyfikatorów jest zamknięta i zapisana niżej — skrypt nie szuka
 * niczego sam. Każda zmiana ma w filtrze dotychczasowy próg i status, więc rekord zmieniony
 * w międzyczasie zostaje nietknięty. Poprzednia postać ląduje w `correction.from`, żeby
 * dało się ją odtworzyć.
 */

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });
const { MongoClient, ObjectId } = require('mongodb');

const APPLY = process.argv.includes('--apply');

/** Zapisany (błędny) próg każdego typu — warunek w filtrze, nie tylko informacja. */
const TYPY = [
	{ id: '6ad31a4768f486e409d94d59', staryProg: 1899, opis: 'Borussia Mönchengladbach – 1899 Hoffenheim, 18.10.2026 (hint)' },
	{ id: '6adfdc01c40fe5a406a170b9', staryProg: 5, opis: 'SV Elversberg – FSV Mainz 05, 30.10.2026 (round)' },
	{ id: '6ae2f4cbe27f736973b2cdeb', staryProg: 5, opis: 'SV Elversberg – FSV Mainz 05, 30.10.2026 (hint)' },
	{ id: '6ae4465563898980ddb81ed9', staryProg: 1899, opis: 'Werder Bremen – 1899 Hoffenheim, 31.10.2026 (hint)' },
	{ id: '6aec2f20b29ee378ca62ce49', staryProg: 93, opis: 'Dijon – RED Star FC 93, 06.11.2026 (hint)' },
	{ id: '6aeed22375b39ee5267d79aa', staryProg: 1893, opis: 'FC Thun – FC Basel 1893, 08.11.2026 (hint)' },
];

const POPRAWNY = { type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 };

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('Brak DATABASE_URL w .env.local — uruchom z katalogu repozytorium.');
	process.exit(1);
}

const client = new MongoClient(url);
await client.connect();
const picks = client.db().collection('picks');
console.log(`Baza: ${client.db().databaseName} · tryb: ${APPLY ? 'ZAPIS' : 'podgląd (bez zapisu)'}\n`);

let zmienione = 0;
for (const typ of TYPY) {
	const _id = new ObjectId(typ.id);
	const pick = await picks.findOne({ _id });
	const n = pick?.normalized;

	if (!pick || n?.type !== 'teamGoals' || n.side !== 'away' || n.line !== typ.staryProg || !['won', 'lost'].includes(pick.status)) {
		console.log(`POMINIĘTY ${typ.id} — ${typ.opis}: stan inny niż w odczycie z 21.11 (próg ${n?.line}, status ${pick?.status}).`);
		continue;
	}
	const wynik = pick.finalScore;
	if (!Number.isFinite(wynik?.home) || !Number.isFinite(wynik?.away)) {
		console.log(`POMINIĘTY ${typ.id} — brak wyniku końcowego.`);
		continue;
	}

	// Gość powyżej 0.5 gola = gość strzelił przynajmniej jednego.
	const nowyStatus = wynik.away > POPRAWNY.line ? 'won' : 'lost';
	console.log(
		`${typ.id} — ${typ.opis}\n  wynik ${wynik.home}:${wynik.away}, próg ${n.line} → ${POPRAWNY.line}, status ${pick.status} → ${nowyStatus}, countsToStats ${pick.countsToStats} (bez zmian)`
	);

	if (!APPLY) continue;
	const res = await picks.updateOne(
		{ _id, 'normalized.line': typ.staryProg, status: pick.status },
		{
			$set: {
				normalized: POPRAWNY,
				status: nowyStatus,
				correction: {
					at: new Date(),
					reason: 'team_name_number_as_line',
					from: { normalized: n, status: pick.status },
				},
			},
		}
	);
	console.log(`  zapisano: ${res.modifiedCount}`);
	zmienione += res.modifiedCount;
}

console.log(APPLY ? `\nZmienionych rekordów: ${zmienione}.` : '\nPodgląd — nic nie zapisano. Zapis: dodaj --apply.');
await client.close();
