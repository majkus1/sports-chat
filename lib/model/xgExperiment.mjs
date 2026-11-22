/**
 * Eksperyment: czy xG i strzały celne wzmacniają model sił drużyn (Dixon-Coles na golach)?
 *
 * Zasady, warianty i miary: `xgFeatures.js`. Ten plik tylko zbiera dane i drukuje tabele.
 * NICZEGO w modelu nie zmienia — uczy własne kopie `fitRatings` na podmienionych „golach".
 *
 * TRZY ŹRÓDŁA (`--source=`):
 *
 *   archive   (domyślne; BEZ klucza API i bez bazy) football-data.co.uk — 11 lig, wyniki,
 *             strzały celne, kursy zamknięcia, a dopiero od sezonu 2026/27 (sierpień 2026)
 *             także xG (kolumny HxG/AxG; w 2025/26 i wcześniej ich nie ma). Duża próba dla
 *             strzałów (kilka sezonów), mała dla xG. Identyfikator drużyny to jej nazwa
 *             w archiwum. ~55 plików CSV, buforowane na dysku (`--offline=on` — tylko bufor).
 *
 *   api       (NA SERWERZE) terminarze lig produkcji z `leagueFixtures` (Redis na serwerze ma
 *             je w cache'u) + xG i strzały z kolekcji `fixturestats` + kursy z dziennika
 *             prognoz (poranne `odds.open`, gdy brak — `odds.close`). To jest pomiar na danych,
 *             które produkcja miałaby w chwili prognozy, we WSZYSTKICH ligach modelu.
 *             Wiersz `S70R` to dokładnie produkcja od `dixon-coles/6` (waga 0,7 i reguła per
 *             mecz z `shotStrength.js`); jak go czytać — README modelu, sekcja z 22.11.2026.
 *             Koszt: 1 zapytanie o listę lig + 2 na ligę (ok. 100; z cache'u mniej).
 *             Wynik do stdout i jednym insertem do kolekcji `modelxgchecks`.
 *
 *   inventory (tylko odczyt bazy, zero zapytań do API) pokrycie `fixturestats`: ile meczów
 *             z xG / strzałami na ligę i sezon, zera, braki.
 *
 * URUCHOMIENIE:
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/xgExperiment.mjs
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/xgExperiment.mjs --source=inventory
 *   node --experimental-loader ./test/helpers/alias.mjs lib/model/xgExperiment.mjs --source=api
 *
 * PARAMETRY:
 *   --split=2025-11-01     początek okresu testowego (archive: domyślnie 2025-11-01,
 *                          api: 2026-09-01 — wcześniej w `fixturestats` prawie nie ma xG)
 *   --until=2026-12-01     koniec okresu testowego (domyślnie bez końca)
 *   --seasons=2023,2024,2025,2026   (archive) sezony do wczytania
 *   --leagues=39,140       ograniczenie lig
 *   --refit-days=14        co ile dni przeliczać modele
 *   --cache=<katalog>      (archive) bufor plików CSV
 *   --save=off             (api) bez zapisu do `modelxgchecks`
 *   --offline=on           (archive) nie pobieraj niczego — wyłącznie pliki z bufora
 *
 * JAK CZYTAĆ. „zysk" = log loss wariantu „gole" minus log loss wariantu (dodatni = wariant
 * lepszy), `t` = statystyka sparowanej różnicy mecz po meczu. Poniżej 2 to szum, choćby
 * średnia wyglądała ładnie. Werdykt osobno dla rodzin: warianty xG oceniamy WYŁĄCZNIE na
 * meczach, w których xG ma ≥ 10% wagi danych uczących (gdzie indziej są z definicji równe
 * golom i rozcieńczałyby wynik), warianty strzałów — na wszystkich. Kod wyjścia 0, gdy
 * któryś wariant bije gole z t ≥ 2 ORAZ ma dodatni zysk w obu połowach swojego zbioru
 * (podział po dacie); 2 w przeciwnym razie.
 */

import 'dotenv/config';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

dotenv.config({ path: '.env.local' });

const { VARIANTS, evaluateVariants, summarize, hasXg, hasSot, logLoss } = await import('@/lib/model/xgFeatures');
const { LEAGUE_TIERS } = await import('@/lib/football/leagues');
const { EXCLUDED_COMPETITIONS } = await import('@/lib/model');

function arg(name, domyslna) {
	const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
	return hit ? hit.split('=').slice(1).join('=') : domyslna;
}

const SOURCE = arg('source', 'archive');
const SPLIT = new Date(`${arg('split', SOURCE === 'api' ? '2026-09-01' : '2025-11-01')}T00:00:00Z`);
const UNTIL = arg('until', '') ? new Date(`${arg('until')}T00:00:00Z`) : null;
const REFIT_DAYS = Number(arg('refit-days', '14'));
const SAVE = arg('save', 'on') !== 'off';
const OFFLINE = arg('offline', 'off') === 'on';
const WYBRANE = String(arg('leagues', ''))
	.split(',')
	.map((s) => Number(s.trim()))
	.filter(Boolean);

const f = (x, n = 4) => (Number.isFinite(x) ? x.toFixed(n) : '—');
const znak = (x, n = 4) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(n)}` : '—');
const proc = (x) => (Number.isFinite(x) ? `${Math.round(100 * x)}%` : '—');

/* ---------------------------------------------------------------- inwentarz */

async function inventory() {
	const mongoose = (await import('mongoose')).default;
	await mongoose.connect(process.env.DATABASE_URL);
	try {
		const col = mongoose.connection.db.collection('fixturestats');
		const jest = (pole) => ({ $sum: { $cond: [{ $ne: [`$${pole}`, null] }, 1, 0] } });
		const wiersze = await col
			.aggregate([
				{
					$group: {
						_id: { l: '$leagueId', s: '$season' },
						n: { $sum: 1 },
						xg: jest('hxg'),
						sot: jest('hst'),
						shots: jest('hs'),
						xgZero: { $sum: { $cond: [{ $and: [{ $eq: ['$hxg', 0] }, { $eq: ['$axg', 0] }] }, 1, 0] } },
						od: { $min: '$date' },
						do: { $max: '$date' },
					},
				},
				{ $sort: { '_id.l': 1, '_id.s': 1 } },
			])
			.toArray();

		const modelowe = [...LEAGUE_TIERS.keys()].filter((id) => !EXCLUDED_COMPETITIONS.has(id));
		const perLiga = new Map();
		for (const w of wiersze) {
			const p = perLiga.get(w._id.l) || { n: 0, xg: 0, sot: 0 };
			perLiga.set(w._id.l, { n: p.n + w.n, xg: p.xg + w.xg, sot: p.sot + w.sot });
		}
		const razem = wiersze.reduce((a, w) => ({ n: a.n + w.n, xg: a.xg + w.xg, sot: a.sot + w.sot, z: a.z + w.xgZero }), { n: 0, xg: 0, sot: 0, z: 0 });

		console.log(`FIXTURESTATS: ${razem.n} meczów, z xG ${razem.xg} (${proc(razem.xg / razem.n)}), ze strzałami celnymi ${razem.sot} (${proc(razem.sot / razem.n)}), xG 0:0 (traktowane jak brak): ${razem.z}`);
		console.log('UWAGA: kolekcja nie ma wyników meczów i trzyma tylko ~12 ostatnich meczów drużyny sprzed startu zbieracza (wrzesień 2026) + wszystko od tamtej pory.\n');
		console.log('liga  sezon  mecze   xG  celne  xG%   od          do');
		for (const w of wiersze) {
			console.log(
				String(w._id.l).padStart(4) +
					String(w._id.s).padStart(7) +
					String(w.n).padStart(7) +
					String(w.xg).padStart(5) +
					String(w.sot).padStart(7) +
					proc(w.xg / w.n).padStart(6) +
					`   ${w.od.toISOString().slice(0, 10)}  ${w.do.toISOString().slice(0, 10)}`
			);
		}
		const grupa = (test) => modelowe.filter((id) => perLiga.has(id) && test(perLiga.get(id).xg / perLiga.get(id).n));
		const bezDanych = modelowe.filter((id) => !perLiga.has(id));
		console.log(`\nLIGI MODELU (${modelowe.length}, bez pucharów europejskich):`);
		console.log(`  xG w ≥ 80% meczów : ${grupa((u) => u >= 0.8).join(', ') || '—'}`);
		console.log(`  xG w 30–80%       : ${grupa((u) => u >= 0.3 && u < 0.8).join(', ') || '—'}`);
		console.log(`  xG poniżej 30%    : ${grupa((u) => u < 0.3).join(', ') || '—'}`);
		console.log(`  brak w kolekcji   : ${bezDanych.join(', ') || '—'} (puchary i reprezentacje liczą pule — zbieracz ich nie obejmuje)`);
	} finally {
		await mongoose.disconnect().catch(() => {});
	}
}

/* ---------------------------------------------------------------- archiwum */

async function loadArchive() {
	const { parseCsv, parseDate, closingOdds, demargin, FOOTBALL_DATA_CODES, footballDataUrl } = await import('./marketData.mjs');
	const SEASONS = String(arg('seasons', '2023,2024,2025,2026'))
		.split(',')
		.map((s) => Number(s.trim()))
		.filter(Boolean);
	const CACHE_DIR = arg('cache', path.join(os.tmpdir(), 'czat-football-data'));
	const ligi = (WYBRANE.length ? WYBRANE : [...FOOTBALL_DATA_CODES.keys()]).filter((id) => FOOTBALL_DATA_CODES.has(id));
	// Bieżący sezon zmienia się co tydzień — jego pliku nie wolno trzymać w buforze bez końca.
	const biezacy = Math.max(...SEASONS);

	async function pobierz(url, season) {
		await fs.mkdir(CACHE_DIR, { recursive: true });
		const plik = path.join(CACHE_DIR, url.split('/').slice(-2).join('_'));
		try {
			const stat = await fs.stat(plik);
			if (season !== biezacy || Date.now() - stat.mtimeMs < 86_400_000) return await fs.readFile(plik, 'utf8');
		} catch {
			/* brak w buforze — pobieramy */
		}
		if (OFFLINE) {
			try {
				return await fs.readFile(plik, 'utf8');
			} catch {
				throw new Error('brak w buforze (tryb offline)');
			}
		}
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const text = await res.text();
		await fs.writeFile(plik, text);
		return text;
	}

	const liczba = (v) => {
		const s = String(v ?? '').trim();
		if (!s) return null;
		const n = Number(s);
		return Number.isFinite(n) ? n : null;
	};

	const byLeague = new Map();
	const bledy = [];
	for (const leagueId of ligi) {
		for (const season of SEASONS) {
			const url = footballDataUrl(leagueId, season);
			try {
				for (const row of parseCsv(await pobierz(url, season))) {
					const date = parseDate(row.Date);
					const hg = liczba(row.FTHG);
					const ag = liczba(row.FTAG);
					if (!date || !row.HomeTeam || !row.AwayTeam || hg === null || ag === null) continue;
					const odds = closingOdds(row);
					const rynek = odds ? demargin([odds.home, odds.draw, odds.away]) : null;
					const lista = byLeague.get(leagueId) || [];
					lista.push({
						date: `${date}T12:00:00Z`,
						season,
						homeId: row.HomeTeam.trim(),
						awayId: row.AwayTeam.trim(),
						homeGoals: hg,
						awayGoals: ag,
						hxg: liczba(row.HxG),
						axg: liczba(row.AxG),
						hst: liczba(row.HST),
						ast: liczba(row.AST),
						market: rynek ? { home: rynek[0], draw: rynek[1], away: rynek[2] } : null,
					});
					byLeague.set(leagueId, lista);
				}
			} catch (error) {
				bledy.push(`${url}: ${error.message}`);
			}
		}
	}
	if (bledy.length) console.warn(`Nie wczytano ${bledy.length} plików:\n  ${bledy.join('\n  ')}`);
	return { byLeague, names: new Map(ligi.map((id) => [id, FOOTBALL_DATA_CODES.get(id)])), requests: 0 };
}

/* ---------------------------------------------------------------- serwer: API + baza */

async function loadApi(mongoose) {
	const { leagueFixtures } = await import('@/lib/football/endpoints');
	const { footballRequest } = await import('@/lib/football/client');
	const { poolFor } = await import('@/lib/model/pools');
	const { demargin } = await import('./marketData.mjs');

	// Tylko ligi liczone modelem jednej ligi — puchary i reprezentacje idą przez pule (`pools.js`).
	const ligi = [...LEAGUE_TIERS.keys()].filter((id) => !EXCLUDED_COMPETITIONS.has(id) && !poolFor(id)).filter((id) => !WYBRANE.length || WYBRANE.includes(id));

	let zapytan = 1;
	const biezace = new Map();
	try {
		for (const row of (await footballRequest('leagues', { current: 'true' })) || []) {
			const s = (row.seasons || []).find((x) => x.current);
			if (s) biezace.set(row.league?.id, { season: s.year, name: `${row.league?.name} (${row.country?.name})` });
		}
	} catch (error) {
		console.warn('Lista lig niedostępna — przyjmuję bieżący rok jako sezon:', error.message);
	}

	const db = mongoose.connection.db;
	const byLeague = new Map();
	const names = new Map();
	for (const leagueId of ligi) {
		const cur = biezace.get(leagueId)?.season ?? new Date().getFullYear();
		names.set(leagueId, biezace.get(leagueId)?.name ?? String(leagueId));
		const mecze = [];
		// Jak `getLeagueModel`: bieżący i poprzedni sezon (resztę i tak odcina okno 730 dni).
		for (const season of [cur - 1, cur]) {
			try {
				const rows = await leagueFixtures({ leagueId, season });
				zapytan += 1;
				for (const r of rows || []) {
					if (!['FT', 'AET', 'PEN'].includes(r?.fixture?.status?.short)) continue;
					if (!Number.isFinite(r?.goals?.home) || !Number.isFinite(r?.goals?.away)) continue;
					mecze.push({
						fixtureId: String(r.fixture.id),
						date: r.fixture.date,
						season,
						homeId: r.teams?.home?.id,
						awayId: r.teams?.away?.id,
						homeGoals: r.goals.home,
						awayGoals: r.goals.away,
					});
				}
			} catch (error) {
				console.warn(`  liga ${leagueId} / ${season}: ${error.message}`);
			}
		}

		// xG i strzały: po identyfikatorze meczu, jednym zapytaniem na ligę (tylko odczyt).
		const staty = new Map((await db.collection('fixturestats').find({ leagueId }).project({ fixtureId: 1, hxg: 1, axg: 1, hst: 1, ast: 1 }).toArray()).map((d) => [d.fixtureId, d]));
		const prognozy = new Map(
			(await db.collection('modelforecasts').find({ leagueId, pool: null }).project({ fixtureId: 1, markets: 1, modelVersion: 1, 'odds.open': 1, 'odds.close': 1 }).toArray()).map((d) => [d.fixtureId, d])
		);
		for (const m of mecze) {
			const s = staty.get(m.fixtureId);
			if (s) Object.assign(m, { hxg: s.hxg ?? null, axg: s.axg ?? null, hst: s.hst ?? null, ast: s.ast ?? null });
			const p = prognozy.get(m.fixtureId);
			/*
			 * Rynek: poranny kurs (`odds.open`, od 9:00 w dniu meczu — ten, który potwierdza plakietki;
			 * w dzienniku od 27.09.2026), a gdy go brak — zamknięcie. Poranny jest uczciwszym
			 * odniesieniem: tyle wiedział rynek, kiedy użytkownik widział plakietkę.
			 */
			const k = p?.odds?.open?.home ? p.odds.open : p?.odds?.close;
			const rynek = k?.home && k?.draw && k?.away ? demargin([k.home, k.draw, k.away]) : null;
			if (rynek) m.market = { home: rynek[0], draw: rynek[1], away: rynek[2] };
			// Prognoza zapisana przez produkcję — kontrola, że wariant odtwarza to, co naprawdę poszło
			// (do `dixon-coles/5` — wariant G, od `/6` — S70R).
			if (Number.isFinite(p?.markets?.home)) m.extra = { logged: { home: p.markets.home, draw: p.markets.draw, away: p.markets.away }, version: p.modelVersion ?? null };
		}
		byLeague.set(leagueId, mecze);
		process.stdout.write('.');
	}
	console.log('');
	return { byLeague, names, requests: zapytan };
}

/* ---------------------------------------------------------------- tabele */

function tabela(tytul, s) {
	if (!s.n) return;
	console.log(`\n${tytul} — ${s.n} meczów | częstości ligi: log loss ${f(s.base.logLoss)}, Brier ${f(s.base.brier)}`);
	console.log('  ' + 'wariant'.padEnd(40) + 'log loss'.padStart(9) + 'zysk'.padStart(9) + 't'.padStart(7) + 'Brier'.padStart(8) + 't(Br)'.padStart(7) + 'typy'.padStart(6) + 'obiec/traf'.padStart(13) + 'dane'.padStart(6));
	for (const v of VARIANTS) {
		const r = s.variants[v.key];
		console.log(
			'  ' +
				`${v.key.padEnd(5)}${v.label}`.slice(0, 39).padEnd(40) +
				f(r.logLoss).padStart(9) +
				(v.key === 'G' ? '—' : znak(r.gain)).padStart(9) +
				(v.key === 'G' ? '—' : f(r.t, 2)).padStart(7) +
				f(r.brier).padStart(8) +
				(v.key === 'G' ? '—' : f(r.brierT, 2)).padStart(7) +
				String(r.picks).padStart(6) +
				(r.picks ? `${f(r.promised, 1)}/${f(r.hit, 1)}%` : '—').padStart(13) +
				proc(r.used).padStart(6)
		);
	}
	if (s.market) {
		const najlepszy = VARIANTS.map((v) => `${v.key} ${f(s.market.variants[v.key])}`).join(' | ');
		console.log(`  rynek (${SOURCE === 'api' ? 'poranny kurs, gdy brak — zamknięcie' : 'zamknięcie'}, bez marży) na ${s.market.n} meczach: log loss ${f(s.market.logLoss)}; warianty na tych samych: ${najlepszy}`);
	}
}

/** Jedna linia na przekrój: zysk i t wybranych wariantów — do czytania stabilności w czasie i po ligach. */
function przekroj(tytul, grupy, klucze) {
	console.log(`\n${tytul}  (zysk log loss wobec goli / t)`);
	console.log('  ' + ''.padEnd(26) + 'n'.padStart(6) + 'xG%'.padStart(6) + 'G'.padStart(8) + klucze.map((k) => k.padStart(17)).join(''));
	for (const [nazwa, rows] of grupy) {
		if (!rows.length) continue;
		const s = summarize(rows);
		const cov = rows.reduce((a, r) => a + r.cov.xg, 0) / rows.length;
		console.log(
			'  ' +
				String(nazwa).slice(0, 25).padEnd(26) +
				String(s.n).padStart(6) +
				proc(cov).padStart(6) +
				f(s.variants.G.logLoss, 3).padStart(8) +
				klucze.map((k) => `${znak(s.variants[k].gain)} / ${f(s.variants[k].t, 1).padStart(4)}`.padStart(17)).join('')
		);
	}
}

/* ---------------------------------------------------------------- przebieg */

if (SOURCE === 'inventory') {
	await inventory();
	process.exit(0);
}

let mongoose = null;
if (SOURCE === 'api') {
	mongoose = (await import('mongoose')).default;
	await mongoose.connect(process.env.DATABASE_URL);
}

console.log(`Źródło: ${SOURCE} | okres testowy od ${SPLIT.toISOString().slice(0, 10)}${UNTIL ? ` do ${UNTIL.toISOString().slice(0, 10)}` : ''} | przeliczanie co ${REFIT_DAYS} dni`);
const { byLeague, names, requests } = SOURCE === 'api' ? await loadApi(mongoose) : await loadArchive();

const rows = [];
const dane = [];
for (const [leagueId, mecze] of byLeague) {
	dane.push({ leagueId, name: names.get(leagueId), matches: mecze.length, withXg: mecze.filter(hasXg).length, withSot: mecze.filter(hasSot).length });
	rows.push(...evaluateVariants(mecze, { leagueId, split: SPLIT, until: UNTIL, refitDays: REFIT_DAYS }).rows);
}
rows.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

console.log('\nDANE (wszystkie wczytane mecze z wynikiem; xG i strzały celne — ile z nich je ma)');
for (const d of dane) console.log(`  ${String(d.leagueId).padStart(4)} ${String(d.name).slice(0, 34).padEnd(35)} mecze ${String(d.matches).padStart(5)}  xG ${String(d.withXg).padStart(5)} (${proc(d.withXg / d.matches)})  celne ${String(d.withSot).padStart(5)} (${proc(d.withSot / d.matches)})`);

if (!rows.length) {
	console.log('\nBrak meczów testowych z działającym modelem — nic do oceny.');
	await mongoose?.disconnect().catch(() => {});
	process.exit(2);
}

/*
 * Podział na „ligi z xG" i „bez": po udziale xG w WADZE danych uczących w chwili prognozy.
 * Poniżej 10% warianty xG są praktycznie dzisiejszym modelem — ich zysk musi tam wynosić ~0
 * (to kontrola poprawności, nie wynik).
 */
const zXg = rows.filter((r) => r.cov.xg >= 0.5);
const czesciowo = rows.filter((r) => r.cov.xg >= 0.1 && r.cov.xg < 0.5);
const bezXg = rows.filter((r) => r.cov.xg < 0.1);

const calosc = summarize(rows);
tabela('WSZYSTKIE MECZE TESTOWE', calosc);
tabela('xG w ≥ 50% wagi danych uczących', summarize(zXg));
tabela('xG w 10–50% wagi', summarize(czesciowo));
tabela('xG poniżej 10% wagi (warianty X ≈ gole; mierzymy tu strzały celne)', summarize(bezXg));

/*
 * CZY xG DOKŁADA COŚ PONAD STRZAŁY CELNE. Strzały celne są w danych prawie zawsze, xG tylko
 * w części lig i od niedawna — xG jest warte wdrożenia tylko wtedy, gdy bije wariant ze
 * strzałami, nie same gole. Odniesieniem jest tu S50, mecze — te z ≥ 10% wagi xG.
 */
{
	const zXg10 = rows.filter((r) => r.cov.xg >= 0.1);
	const s = summarize(zXg10, { reference: 'S50' });
	if (s.n) {
		console.log(`
xG PONAD STRZAŁY CELNE (odniesienie S50; ${s.n} meczów z ≥ 10% wagi xG; zysk dodatni = lepiej niż S50)`);
		for (const k of ['X70', 'X50', 'X30', 'X0', 'XS50']) console.log(`  ${k.padEnd(5)} zysk ${znak(s.variants[k].gain)}  t ${f(s.variants[k].t, 2)}`);
	}
}

const KLUCZE = ['X50', 'S70', 'S50', 'S70R', 'S50R'];
const srodek = Date.parse(rows[Math.floor(rows.length / 2)].date);
const polowy = [
	['pierwsza połowa okresu', rows.filter((r) => Date.parse(r.date) < srodek)],
	['druga połowa okresu', rows.filter((r) => Date.parse(r.date) >= srodek)],
];
const kwartaly = new Map();
for (const r of rows) {
	const d = new Date(r.date);
	const k = `${d.getUTCFullYear()} kw.${Math.floor(d.getUTCMonth() / 3) + 1}`;
	kwartaly.set(k, [...(kwartaly.get(k) || []), r]);
}
przekroj('PODZIAŁ PO DACIE', [...polowy, ...kwartaly], KLUCZE);
przekroj(
	'PO LIGACH',
	[...byLeague.keys()].map((id) => [`${id} ${names.get(id)}`, rows.filter((r) => r.leagueId === id)]),
	KLUCZE
);

// Kontrola (tylko api): czy wariant „gole" odtwarza prognozy zapisane przez produkcję.
const zDziennika = rows.filter((r) => r.extra?.logged);
if (zDziennika.length) {
	const sr = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
	console.log(
		`\nKONTROLA z dziennikiem prognoz (${zDziennika.length} meczów): produkcja ${f(sr(zDziennika.map((r) => logLoss(r.extra.logged, r.outcome))))}, tutaj G ${f(sr(zDziennika.map((r) => logLoss(r.p.G, r.outcome))))}, S70R ${f(sr(zDziennika.map((r) => logLoss(r.p.S70R, r.outcome))))} — produkcja do dixon-coles/5 ma być blisko G, od /6 blisko S70R. Reguła per mecz przepuściła strzały w ${proc(rows.filter((r) => r.shotsRule).length / rows.length)} meczów testowych.`
	);
}

/*
 * WERDYKT — kryterium ustalone przed uruchomieniem: wariant musi bić gole z t ≥ 2 na swoim
 * zbiorze i mieć dodatni zysk w OBU jego połowach (podział po dacie). Jedno bez drugiego to
 * najczęściej dopasowanie do jednego dobrego kwartału. Warianty xG — tylko mecze, w których
 * xG ma ≥ 10% wagi danych uczących; reszta (strzały, gole) — wszystkie mecze.
 */
const polowki = (rs) => {
	if (!rs.length) return [summarize([]), summarize([])];
	const sr = Date.parse(rs[Math.floor(rs.length / 2)].date);
	return [summarize(rs.filter((r) => Date.parse(r.date) < sr)), summarize(rs.filter((r) => Date.parse(r.date) >= sr))];
};
const [p1, p2] = polowy.map(([, r]) => summarize(r));
const zXgCzesc = rows.filter((r) => r.cov.xg >= 0.1);
const rodziny = {
	xg: { rows: zXgCzesc, all: summarize(zXgCzesc), halves: polowki(zXgCzesc) },
	other: { rows, all: calosc, halves: [p1, p2] },
};
const rodzina = (v) => (v.source === 'xg' ? rodziny.xg : rodziny.other);
const werdykty = VARIANTS.filter((v) => v.key !== 'G').map((v) => {
	const r = rodzina(v);
	const s = r.all.variants?.[v.key];
	const [h1, h2] = r.halves.map((h) => h.variants?.[v.key]?.gain ?? null);
	return { key: v.key, label: v.label, n: r.all.n, gain: s?.gain ?? null, t: s?.t ?? 0, halves: [h1, h2], pass: Boolean(s && s.t >= 2 && h1 > 0 && h2 > 0) };
});
const zwyciezcy = werdykty.filter((w) => w.pass);
console.log('\nWERDYKT (t ≥ 2 i dodatni zysk w obu połowach; xG — na meczach z ≥ 10% wagi xG):');
for (const w of werdykty) {
	console.log(`  ${w.pass ? 'TAK' : 'nie'} ${w.key.padEnd(5)}${w.label.slice(0, 38).padEnd(39)} n ${String(w.n).padStart(5)}  zysk ${znak(w.gain)}  t ${f(w.t, 2).padStart(5)}  połowy ${znak(w.halves[0])} / ${znak(w.halves[1])}`);
}
if (!zwyciezcy.length) console.log('  żaden wariant nie spełnia kryterium — zostają gole.');
if (requests) console.log(`\nZapytań do API: ${requests}`);

if (SOURCE === 'api' && SAVE) {
	try {
		// Jedyny zapis skryptu: jeden dokument z wynikiem, żeby dało się go przeczytać bez kopiowania z terminala.
		await mongoose.connection.db.collection('modelxgchecks').insertOne({
			at: new Date(),
			source: SOURCE,
			split: SPLIT,
			until: UNTIL,
			refitDays: REFIT_DAYS,
			requests,
			variants: VARIANTS,
			data: dane,
			all: calosc,
			withXg: summarize(zXg),
			partialXg: summarize(czesciowo),
			withoutXg: summarize(bezXg),
			halves: [p1, p2],
			leagues: [...byLeague.keys()].map((id) => ({ leagueId: id, name: names.get(id), ...summarize(rows.filter((r) => r.leagueId === id)) })),
			verdicts: werdykty,
			winners: zwyciezcy.map((v) => v.key),
		});
		console.log('Zapisano w kolekcji modelxgchecks.');
	} catch (error) {
		console.warn('Zapis do bazy nie powiódł się:', error.message);
	}
}
await mongoose?.disconnect().catch(() => {});
process.exit(zwyciezcy.length ? 0 : 2);
