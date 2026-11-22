import FixtureLineup from '@/models/FixtureLineup';
import ModelForecast from '@/models/ModelForecast';
import Pick from '@/models/Pick';
import Coupon from '@/models/Coupon';
import DailyPick from '@/models/DailyPick';
import { FootballApiError, footballRequest } from '@/lib/football/client';
import { teamRecentFixtures } from '@/lib/football/endpoints';
import { loadMatchSchedule, peekMatchSchedule } from '@/lib/football/schedule';
import { isEstablishedLeague } from '@/lib/football/leagues';
import { PUBLIC_COUPON_TYPES } from '@/lib/coupons/build';
import { getRedisClient } from '@/lib/redis';
import { localDate } from '@/lib/time';
import {
	HISTORY_MATCHES,
	MIN_KNOWN,
	lineupConfirmed,
	lineupVeto,
	measureForLog,
	parseFixtureRow,
	parseInjuries,
	vetoNote,
} from '@/lib/football/lineups';
import { computeSquad, historyDocs } from '@/lib/football/lineupsStore';

/**
 * ZBIERANIE SKŁADÓW I NIEOBECNYCH — w harmonogramie co 20 minut (`/api/cron/odds-snapshot`, na końcu przebiegu).
 * Każdy przebieg robi tylko to, czego brakuje, w twardym budżecie zapytań.
 *
 * KOLEJNOŚĆ W PRZEBIEGU (od najpilniejszego):
 *   1. SKŁADY — mecze startujące w ciągu `LINEUP_WINDOW_MS` bez potwierdzonej jedenastki. Dostawca podaje je
 *      zwykle 20–60 minut przed meczem; przy oknie 75 minut i przebiegu co 20 minut każdy mecz jest pytany
 *      najwyżej 4 razy. `fixtures?ids=` — 20 meczów na zapytanie.
 *   2. NIEOBECNI — `injuries?ids=` (20 meczów na zapytanie; gdy dostawca odrzuci `ids`, per mecz). Odświeżane co
 *      6 godzin, w ostatnich 3 godzinach przed meczem co 90 minut; po potwierdzonej jedenastce już nie.
 *   3. HISTORIA — wyjściowe jedenastki i strzelcy z ostatnich 10 meczów drużyn (`fixtures?ids=`, 20 na zapytanie).
 *      Listę meczów drużyny daje dziennik prognoz (zero zapytań); dopiero drużyna z mniej niż 5 meczami w dzienniku
 *      kosztuje jedno `fixtures?team=&last=10` (ta sama pamięć podręczna co terminarz i forma).
 *   4. MIARA — siła składu (`computeSquad`), zapis przy meczu, w dzienniku prognoz (tryb cienia) i ostrzeżenia
 *      przy nogach opublikowanych kuponów i typie dnia.
 *
 * PRIORYTET: mecze z opublikowanymi typami AI (raport, analiza, typ dnia), nogami kuponów serwisu (dnia, 3-, 5-dniowy,
 * live) i typem dnia — do 5 dni naprzód; potem reszta lig sprawdzonych z dziennika prognoz na najbliższe 30 godzin.
 *
 * KOSZT (liczony, nie zgadywany — `budget` w wyniku przebiegu i licznik dnia w Redisie). Dzień z ~150 meczami lig
 * sprawdzonych: składy ~40–70 zapytań (mecze grupują się w godzinach, jedno zapytanie na przebieg z meczami
 * w oknie, czasem dwa), nieobecni ~25 (150 meczów × ~3 odświeżenia / 20), historia ~10 (wczorajsze mecze
 * po 20 na zapytanie) — razem ok. 80–120 dziennie, 1–2% limitu 7500. Pierwsze dni są droższe: historia
 * wszystkich drużyn od zera to ~3 500 meczów, czyli ~175 zapytań — rozłożone przez budżet na pierwszą dobę.
 * Twardy limit: `RUN_BUDGET` na przebieg i `DAY_BUDGET` na dzień (8% limitu dziennego).
 */

export const RUN_BUDGET = 40;
export const DAY_BUDGET = 600;
export const LINEUP_WINDOW_MS = 75 * 60_000;
export const TARGET_HORIZON_MS = 30 * 3600_000;
export const PRIORITY_HORIZON_MS = 5 * 86_400_000;
export const INJURIES_REFRESH_MS = 6 * 3600_000;
export const INJURIES_NEAR_MS = 3 * 3600_000;
export const INJURIES_NEAR_REFRESH_MS = 90 * 60_000;
/** Po tylu godzinach od pierwszego gwizdka mecz idzie do historii (wynik, jedenastka i strzelcy ostateczni). */
export const FINAL_AFTER_MS = 150 * 60_000;
/** Miarę przeliczamy przy nowych danych albo co 3 godziny — terminarz i historia drużyny zmieniają się wolno. */
const SQUAD_REFRESH_MS = 3 * 3600_000;
const BATCH = 20;
const HISTORY_CONCURRENCY = 3;

/* ------------------------------------------------------------------ budżet */

/**
 * Licznik zapytań dnia: Redis (wspólny dla procesów i restartów), a gdy nie odpowiada — pamięć procesu.
 * Zawsze bierzemy większą z dwóch liczb, żeby awaria Redisa nie wyzerowała limitu w połowie dnia.
 */
const pamiecDnia = new Map();
const kluczDnia = (day) => `lineups:api-calls:${day}`;
export const dayCounter = {
	async get(day) {
		const lokalnie = pamiecDnia.get(day) || 0;
		try {
			const c = await getRedisClient();
			const v = c ? Number(await c.get(kluczDnia(day))) : 0;
			return Math.max(lokalnie, Number.isFinite(v) ? v : 0);
		} catch {
			return lokalnie;
		}
	},
	async add(day, n) {
		if (!n) return;
		pamiecDnia.set(day, (pamiecDnia.get(day) || 0) + n);
		try {
			const c = await getRedisClient();
			if (!c) return;
			await c.incrBy(kluczDnia(day), n);
			await c.expire(kluczDnia(day), 3 * 86_400);
		} catch {
			/* zostaje licznik w pamięci */
		}
	},
};

/**
 * Twardy limit zapytań: na przebieg i na dzień. `take(n)` rezerwuje `n` zapytań albo odmawia — wtedy
 * przebieg kończy daną część, a resztę zrobi następny (za 20 minut, albo jutro).
 */
export function createBudget({ perRun = RUN_BUDGET, perDay = DAY_BUDGET, usedToday = 0 } = {}) {
	let run = 0;
	let odmowy = 0;
	return {
		take(n = 1) {
			if (run + n > perRun || usedToday + run + n > perDay) {
				odmowy += 1;
				return false;
			}
			run += n;
			return true;
		},
		get used() {
			return run;
		},
		get refused() {
			return odmowy;
		},
		get left() {
			return Math.max(0, Math.min(perRun - run, perDay - usedToday - run));
		},
		get usedToday() {
			return usedToday + run;
		},
	};
}

/* ------------------------------------------------------------------ dostawca */

/** Czy dostawca przyjmuje `injuries?ids=` — po odmowie (stary plan, inna wersja API) per mecz do restartu. */
let injuriesIdsOk = true;

export const PROVIDER = {
	fixtures: (ids) => footballRequest('fixtures', { ids: ids.join('-') }, { timeoutMs: 30_000 }),
	injuries: (ids) => footballRequest('injuries', { ids: ids.join('-') }),
	injuriesOne: (id) => footballRequest('injuries', { fixture: id }),
	teamRecent: (teamId) => teamRecentFixtures(teamId, HISTORY_MATCHES),
	schedule: (match) => loadMatchSchedule(match),
	peekSchedule: (match) => peekMatchSchedule(match),
};

/* ------------------------------------------------------------------ cele */

const czas = (x) => new Date(x).getTime();

/**
 * Mecze do obsłużenia w tym przebiegu, od najważniejszych: `priority` 0 — typy AI, kupony serwisu, typ dnia;
 * 1 — reszta lig sprawdzonych z dziennika prognoz w najbliższych 30 godzinach.
 */
export async function lineupTargets(now = new Date()) {
	const t = now.getTime();
	const horyzont = new Date(t + PRIORITY_HORIZON_MS);
	const [picks, kupony, dzienne, prognozy] = await Promise.all([
		Pick.find({ author: 'ai', status: 'pending', kind: { $in: ['report', 'prematch', 'daily'] }, kickoff: { $gt: now, $lte: horyzont } })
			.select('fixtureId kickoff homeId awayId homeName awayName')
			.lean(),
		Coupon.find({ type: { $in: PUBLIC_COUPON_TYPES }, status: 'pending', 'legs.kickoff': { $gt: now } })
			.select('legs.fixtureId legs.kickoff')
			.lean(),
		DailyPick.find({ kickoff: { $gt: now } }).select('fixtureId').lean(),
		ModelForecast.find({ kickoff: { $gt: now, $lte: horyzont } })
			.select('fixtureId kickoff leagueId season homeId awayId homeName awayName')
			.lean(),
	]);
	const pilne = new Set([
		...picks.map((p) => String(p.fixtureId)),
		...kupony.flatMap((c) => (c.legs || []).filter((l) => czas(l.kickoff) > t).map((l) => String(l.fixtureId))),
		...dzienne.map((d) => String(d.fixtureId)),
	]);
	const opis = new Map();
	for (const p of picks) {
		if (p.homeId && p.awayId) opis.set(String(p.fixtureId), { fixtureId: String(p.fixtureId), kickoff: p.kickoff, homeId: p.homeId, awayId: p.awayId, homeName: p.homeName, awayName: p.awayName, leagueId: null, season: null });
	}
	for (const f of prognozy) opis.set(String(f.fixtureId), { ...f, fixtureId: String(f.fixtureId) });

	const out = [];
	for (const [id, m] of opis) {
		const priority = pilne.has(id) ? 0 : 1;
		if (priority === 1 && (czas(m.kickoff) - t > TARGET_HORIZON_MS || !isEstablishedLeague(m.leagueId))) continue;
		out.push({ ...m, priority });
	}
	return out.sort((a, b) => a.priority - b.priority || czas(a.kickoff) - czas(b.kickoff));
}

/* ------------------------------------------------------------------ przebieg */

const bazaMeczu = (m, now) => ({
	kickoff: new Date(m.kickoff),
	leagueId: m.leagueId ?? null,
	season: m.season ?? null,
	homeId: m.homeId ?? null,
	awayId: m.awayId ?? null,
	homeName: m.homeName ?? null,
	awayName: m.awayName ?? null,
	expiresAt: new Date(now.getTime() + 150 * 86_400_000),
});

function potrzebaNieobecnych(m, doc, t) {
	if (doc?.lineupAt) return false;
	if (!doc?.injuriesAt) return true;
	const wiek = t - czas(doc.injuriesAt);
	return czas(m.kickoff) - t <= INJURIES_NEAR_MS ? wiek > INJURIES_NEAR_REFRESH_MS : wiek > INJURIES_REFRESH_MS;
}

const paczki = (xs, n = BATCH) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Jeden przebieg naraz w procesie — harmonogram woła co 20 minut, a składy i historia potrafią potrwać. */
let trwa = false;

/**
 * @param {{ now?: Date, api?: object, perRun?: number, perDay?: number, counter?: object, targets?: Array }} [options]
 *   `api`, `counter` i `targets` podmieniane w testach (bez dostawcy i bez wspólnego licznika)
 * @returns {Promise<object>} podsumowanie przebiegu z liczbą zapytań (`budget.used`) i stanem dnia
 */
export async function snapshotLineups(options = {}) {
	if (trwa) return { busy: true };
	trwa = true;
	try {
		return await przebieg(options);
	} finally {
		trwa = false;
	}
}

async function przebieg({ now = new Date(), api: podane = {}, perRun = RUN_BUDGET, perDay = DAY_BUDGET, counter = dayCounter, targets = null } = {}) {
	const api = { ...PROVIDER, ...podane };
	const t = now.getTime();
	const dzien = localDate(now);
	const budget = createBudget({ perRun, perDay, usedToday: await counter.get(dzien) });
	const summary = { targets: 0, priority: 0, lineups: 0, injuries: 0, history: 0, measured: 0, logged: 0, warnings: 0, failed: 0 };

	try {
		const cele = targets || (await lineupTargets(now));
		summary.targets = cele.length;
		summary.priority = cele.filter((m) => m.priority === 0).length;
		if (!cele.length) return summary;
		const docs = new Map(
			(await FixtureLineup.find({ fixtureId: { $in: cele.map((m) => m.fixtureId) } })
				.select('fixtureId lineupAt injuriesAt squadAt')
				.lean()).map((d) => [String(d.fixtureId), d])
		);
		const zmienione = new Set();

		/* 1. Składy tuż przed meczem. */
		const doSkladow = cele.filter((m) => czas(m.kickoff) - t <= LINEUP_WINDOW_MS && !docs.get(m.fixtureId)?.lineupAt);
		for (const paczka of paczki(doSkladow)) {
			if (!budget.take(1)) break;
			let rows;
			try {
				rows = await api.fixtures(paczka.map((m) => m.fixtureId));
			} catch (error) {
				summary.failed += 1;
				console.warn('[lineups] składy:', error.message);
				continue;
			}
			const ops = [];
			for (const p of (rows || []).map(parseFixtureRow).filter(Boolean)) {
				const m = paczka.find((x) => x.fixtureId === p.fixtureId);
				if (!m || !p.teams.length) continue;
				const oba = p.teams.filter(lineupConfirmed).length >= 2;
				ops.push({
					updateOne: {
						filter: { fixtureId: p.fixtureId },
						update: { $set: { ...bazaMeczu(m, now), teams: p.teams, status: p.status, ...(oba ? { lineupAt: now } : {}) } },
						upsert: true,
					},
				});
				zmienione.add(p.fixtureId);
				if (oba) summary.lineups += 1;
			}
			if (ops.length) await FixtureLineup.bulkWrite(ops, { ordered: false });
		}

		/* 2. Nieobecni (kontuzje, zawieszenia). */
		const doNieobecnych = cele.filter((m) => potrzebaNieobecnych(m, docs.get(m.fixtureId), t));
		for (const paczka of paczki(doNieobecnych)) {
			const ids = paczka.map((m) => m.fixtureId);
			let mapa = null;
			if (injuriesIdsOk) {
				if (!budget.take(1)) break;
				try {
					mapa = parseInjuries(await api.injuries(ids));
				} catch (error) {
					// Dostawca nie zna `ids` (błąd merytoryczny, nie przejściowy) — od teraz per mecz.
					if (error instanceof FootballApiError && !error.retryable) injuriesIdsOk = false;
					else {
						summary.failed += 1;
						console.warn('[lineups] nieobecni:', error.message);
						continue;
					}
				}
			}
			if (!mapa) {
				mapa = new Map();
				const zrobione = [];
				for (const id of ids) {
					if (!budget.take(1)) break;
					try {
						for (const [k, v] of parseInjuries(await api.injuriesOne(id), id)) mapa.set(k, v);
						zrobione.push(id);
					} catch (error) {
						summary.failed += 1;
						console.warn(`[lineups] nieobecni ${id}:`, error.message);
					}
				}
				paczka.splice(0, paczka.length, ...paczka.filter((m) => zrobione.includes(m.fixtureId)));
			}
			const ops = paczka.map((m) => ({
				updateOne: {
					filter: { fixtureId: m.fixtureId },
					// Pusta lista też jest odpowiedzią („nikogo nie brakuje") — zapisana, żeby nie pytać co przebieg.
					update: { $set: { ...bazaMeczu(m, now), injuries: mapa.get(m.fixtureId) || [], injuriesAt: now } },
					upsert: true,
				},
			}));
			if (ops.length) await FixtureLineup.bulkWrite(ops, { ordered: false });
			for (const m of paczka) zmienione.add(m.fixtureId);
			summary.injuries += paczka.length;
		}

		/* 3. Historia drużyn — ostatnie 10 meczów z jedenastką i strzelcami. `Set` trzyma kolejność celów (najpierw pilne). */
		const druzyny = [...new Set(cele.flatMap((m) => [m.homeId, m.awayId]).filter(Boolean).map(Number))];
		const nowaHistoria = await uzupelnijHistorie(druzyny, { now, api, budget, summary });

		/* 4. Miara, dziennik, ostrzeżenia. */
		const doMiary = cele.filter((m) => {
			const d = docs.get(m.fixtureId);
			if (!d && !zmienione.has(m.fixtureId)) return false;
			return (
				zmienione.has(m.fixtureId) ||
				nowaHistoria.has(Number(m.homeId)) ||
				nowaHistoria.has(Number(m.awayId)) ||
				!d?.squadAt ||
				t - czas(d.squadAt) > SQUAD_REFRESH_MS
			);
		});
		if (doMiary.length) await zmierz(doMiary, { now, api, budget, summary });
		return summary;
	} finally {
		summary.budget = { used: budget.used, left: budget.left, refused: budget.refused, usedToday: budget.usedToday, perRun, perDay };
		await counter.add(dzien, budget.used);
	}
}

/**
 * Brakująca historia drużyn: mecze z dziennika prognoz (albo, gdy dziennik ma ich mniej niż 5, z `teamRecent`)
 * bez ostatecznego zapisu składu — pobrane po 20. Zwraca drużyny, których historia się zmieniła.
 */
async function uzupelnijHistorie(druzyny, { now, api, budget, summary }) {
	const zmiana = new Set();
	if (!druzyny.length) return zmiana;
	const t = now.getTime();
	const przeszle = await ModelForecast.find({
		kickoff: { $gte: new Date(t - 120 * 86_400_000), $lt: new Date(t - FINAL_AFTER_MS) },
		$or: [{ homeId: { $in: druzyny } }, { awayId: { $in: druzyny } }],
		'result.status': { $nin: ['PST', 'CANC', 'ABD', 'AWD', 'WO'] },
	})
		.select('fixtureId kickoff homeId awayId')
		.sort({ kickoff: -1 })
		.lean();
	const meczeDruzyny = new Map(druzyny.map((d) => [d, []]));
	for (const f of przeszle) {
		for (const d of [f.homeId, f.awayId]) {
			const lista = meczeDruzyny.get(Number(d));
			if (lista && lista.length < HISTORY_MATCHES) lista.push(String(f.fixtureId));
		}
	}
	// Drużyna z krótką historią w dzienniku (puchary, nowa liga) — ostatnie mecze od dostawcy, od najważniejszych.
	for (const d of druzyny) {
		const lista = meczeDruzyny.get(d);
		if (lista.length >= MIN_KNOWN) continue;
		if (budget.left <= 2 || !budget.take(1)) break;
		try {
			const rows = await api.teamRecent(d);
			for (const r of (rows || []).sort((a, b) => czas(b?.fixture?.date) - czas(a?.fixture?.date))) {
				const id = r?.fixture?.id != null ? String(r.fixture.id) : null;
				if (!id || lista.includes(id) || !['FT', 'AET', 'PEN'].includes(r.fixture?.status?.short)) continue;
				if (czas(r.fixture.date) > t - FINAL_AFTER_MS || lista.length >= HISTORY_MATCHES) continue;
				lista.push(id);
			}
		} catch (error) {
			summary.failed += 1;
			console.warn(`[lineups] ostatnie mecze ${d}:`, error.message);
		}
	}

	const wszystkie = [...new Set([...meczeDruzyny.values()].flat())];
	const mamy = new Set(
		(await FixtureLineup.find({ fixtureId: { $in: wszystkie }, final: true }).select('fixtureId').lean()).map((d) => String(d.fixtureId))
	);
	// Kolejność drużyn = kolejność celów (najpierw mecze z typami), więc budżet idzie najpierw na nie.
	const brakujace = new Set();
	for (const d of druzyny) for (const id of meczeDruzyny.get(d)) if (!mamy.has(id)) brakujace.add(id);

	// Po trzy paczki naraz: pierwszego dnia to kilkadziesiąt odpowiedzi po ~1 MB, a harmonogram czeka najwyżej 5 minut.
	const grupy = paczki(paczki([...brakujace]), HISTORY_CONCURRENCY);
	for (const grupa of grupy) {
		const wziete = grupa.filter(() => budget.take(1));
		if (!wziete.length) break;
		await Promise.all(wziete.map((paczka) => zapiszHistorie(paczka, { now, api, summary, zmiana })));
		if (wziete.length < grupa.length) break;
	}
	return zmiana;
}

/** Jedna paczka historii (do 20 meczów) — pobranie i zapis ostatecznych składów i strzelców. */
async function zapiszHistorie(paczka, { now, api, summary, zmiana }) {
	let rows;
	try {
		rows = await api.fixtures(paczka);
	} catch (error) {
		summary.failed += 1;
		console.warn('[lineups] historia:', error.message);
		return;
	}
	const ops = [];
	for (const p of (rows || []).map(parseFixtureRow).filter(Boolean)) {
		if (!p.finished && !['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(p.status)) continue;
		ops.push({
			updateOne: {
				filter: { fixtureId: p.fixtureId },
				update: {
					$set: {
						kickoff: p.kickoff,
						leagueId: p.leagueId,
						season: p.season,
						homeId: p.homeId,
						awayId: p.awayId,
						homeName: p.homeName,
						awayName: p.awayName,
						status: p.status,
						// Mecz bez składów u dostawcy też jest zapisany (pusto), żeby nie pytać o niego drugi raz.
						teams: p.teams,
						goals: p.goals,
						final: true,
						expiresAt: new Date(now.getTime() + 150 * 86_400_000),
					},
				},
				upsert: true,
			},
		});
		for (const d of [p.homeId, p.awayId]) if (d) zmiana.add(Number(d));
	}
	if (ops.length) await FixtureLineup.bulkWrite(ops, { ordered: false });
	summary.history += ops.length;
}

/** Siła składu celów, zapis przy meczu i w dzienniku, ostrzeżenia przy opublikowanych typach. */
async function zmierz(cele, { now, api, budget, summary }) {
	const ids = cele.map((m) => m.fixtureId);
	const [docs, history] = await Promise.all([
		FixtureLineup.find({ fixtureId: { $in: ids } }).select('fixtureId teams injuries lineupAt').lean(),
		historyDocs(cele.flatMap((m) => [m.homeId, m.awayId]), now),
	]);
	const poId = new Map(docs.map((d) => [String(d.fixtureId), d]));
	const opsSkladu = [];
	const opsDziennika = [];
	const squads = new Map();

	for (const m of cele) {
		const d = poId.get(m.fixtureId);
		if (!d) continue;
		const mecz = { fixtureId: m.fixtureId, kickoff: m.kickoff, leagueId: m.leagueId, homeId: m.homeId, awayId: m.awayId, homeName: m.homeName, awayName: m.awayName };
		// Rotacja z terminarza: z pamięci procesu (zero zapytań); dla meczów z typami — także z dostawcy (do 2 zapytań, 6 h pamięci).
		let schedule = null;
		try {
			schedule = api.peekSchedule(mecz) || (m.priority === 0 && budget.left > 4 && budget.take(2) ? await api.schedule(mecz) : null);
		} catch {
			schedule = null;
		}
		const squad = computeSquad(mecz, { teams: d.teams, injuries: d.injuries, schedule, history });
		if (!squad) continue;
		squads.set(m.fixtureId, squad);
		opsSkladu.push({ updateOne: { filter: { fixtureId: m.fixtureId }, update: { $set: { squad, squadAt: now } } } });
		summary.measured += 1;

		if (!squad.home?.reliable && !squad.away?.reliable) continue;
		const zdjecie = { at: now, home: measureForLog(squad.home), away: measureForLog(squad.away) };
		// Potwierdzone składy: pierwsze zdjęcie zostaje. Przed nimi: ostatnie zdjęcie z listy nieobecnych.
		opsDziennika.push({
			updateOne: {
				filter: { fixtureId: m.fixtureId, 'lineup.confirmed': null },
				update: { $set: d.lineupAt ? { 'lineup.confirmed': zdjecie } : { 'lineup.expected': zdjecie } },
			},
		});
	}
	if (opsSkladu.length) await FixtureLineup.bulkWrite(opsSkladu, { ordered: false });
	if (opsDziennika.length) summary.logged = (await ModelForecast.bulkWrite(opsDziennika, { ordered: false })).modifiedCount ?? 0;
	summary.warnings = await ostrzezenia(squads, cele, now);
}

/**
 * OPUBLIKOWANE TYPY SIĘ NIE ZMIENIAJĄ (`lib/coupons/build.js`, `models/DailyPick.js`): noga zostaje na kuponie,
 * z tym samym kursem, szansą i rozliczeniem. Dochodzi tylko JAWNE ostrzeżenie „osłabiony skład" przy nodze
 * i przy typie dnia — widoczne na karcie, w obu językach — i znika, gdy nowsze dane (np. potwierdzona jedenastka)
 * weta już nie dają. Kupon nie ma mechanizmu wymiany nogi po publikacji: `news.js` wymienia typy tylko PRZED
 * zapisem, a statusy nóg (`pending/won/lost/void`) opisują wynik, nie decyzję redakcji.
 */
async function ostrzezenia(squads, cele, now) {
	if (!squads.size) return 0;
	const ids = [...squads.keys()];
	const nazwy = new Map(cele.map((m) => [m.fixtureId, { homeName: m.homeName, awayName: m.awayName }]));
	let ile = 0;
	const kupony = await Coupon.find({ type: { $in: PUBLIC_COUPON_TYPES }, status: 'pending', 'legs.fixtureId': { $in: ids } })
		.select('legs.fixtureId legs.key legs.kickoff legs.status legs.homeName legs.awayName legs.lineup')
		.lean();
	for (const c of kupony) {
		for (const l of c.legs || []) {
			const squad = squads.get(String(l.fixtureId));
			if (!squad || l.status !== 'pending' || czas(l.kickoff) <= now.getTime()) continue;
			const notka = vetoNote(lineupVeto(l.key, squad), squad, { homeName: l.homeName, awayName: l.awayName });
			if ((notka?.pl ?? null) === (l.lineup?.pl ?? null)) continue;
			await Coupon.updateOne(
				{ _id: c._id },
				{ $set: { 'legs.$[n].lineup': notka ? { pl: notka.pl, en: notka.en, at: now } : null } },
				{ arrayFilters: [{ 'n.fixtureId': String(l.fixtureId), 'n.key': l.key }] }
			);
			if (notka) ile += 1;
		}
	}
	const dzienne = await DailyPick.find({ fixtureId: { $in: ids }, kickoff: { $gt: now } }).select('fixtureId key lineupWarning').lean();
	for (const d of dzienne) {
		const squad = squads.get(String(d.fixtureId));
		const notka = vetoNote(lineupVeto(d.key, squad), squad, nazwy.get(String(d.fixtureId)) || {});
		if ((notka?.pl ?? null) === (d.lineupWarning?.pl ?? null)) continue;
		await DailyPick.updateOne({ _id: d._id }, { $set: { lineupWarning: notka ? { pl: notka.pl, en: notka.en, at: now } : null } });
		if (notka) ile += 1;
	}
	return ile;
}
