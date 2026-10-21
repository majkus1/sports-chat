import Coupon from '@/models/Coupon';
import { liveFixtures, liveOdds, fixtureEvents, fixtureStatistics, predictions } from '@/lib/football/endpoints';
import {
	normalizeFixture,
	normalizeEvents,
	normalizeFixtureStatistics,
	normalizeTeamForm,
	normalizeH2H,
} from '@/lib/football/normalize';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { predictFixture } from '@/lib/model';
import { COMPACT_LABELS } from '@/lib/model/hints';
import { SELECTION_SHAPES } from '@/lib/picks/markets';
import { generateStructured } from '@/lib/ai';
import { MODEL_CHAT } from '@/lib/ai/config';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { peekVerdict } from '@/lib/coupons/news';
import { localDate } from '@/lib/time';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import {
	bestLiveSingle,
	buildLiveCoupon,
	lambdasFromOdds,
	liveLeagueOk,
	liveMinuteOk,
	liveModelMarkets,
	liveOddsFromRow,
	liveSelections,
	legVeto,
	LIVE_LEG_MAX_ODDS,
	LIVE_LEG_MIN_ODDS,
	LIVE_SINGLE,
} from '@/lib/live/select';

/**
 * Generator kuponu live — część z siecią, AI i bazą. Zasady wyboru: `select.js`.
 *
 * PRZEBIEG. (1) Trwające mecze w minutach 10–80 — z lig modelu i z pozostałych (bez młodzieży,
 * kobiet, rezerw i sparingów). (2) Kursy na żywo — jedno zapytanie dla wszystkich meczów.
 * (3) Szanse przy obecnym stanie: z modelu ligi, a gdy liga jest poza modelem — z kursów sprzed
 * meczu (jedno zapytanie na mecz, pamiętane 6 godzin, najwyżej `PRZEDMECZOWE_NA_RAZ` nowych). (4) Kandydaci, przy
 * których model zgadza się z rynkiem; drużyna w osłabieniu (czerwona kartka) odpada od razu.
 * (5) AI dostaje do każdego kandydata statystyki na żywo (strzały, posiadanie, xG, kartki),
 * zdarzenia, formę i H2H sprzed meczu oraz wynik sprawdzenia wiadomości, jeśli był dziś robiony —
 * może typ odrzucić i pisze krótkie uzasadnienie. Liczb nie zmienia. (6) Z przyjętych: kupon
 * ~2,0 (do 3,0), inaczej najlepszy pojedynczy typ, inaczej „nic wartego uwagi".
 *
 * WSPÓLNY WYNIK NA 3 MINUTY. Kurs live żyje kilkadziesiąt sekund, ale liczenie z AI trwa
 * kilkanaście — każdy pytający w oknie dostaje ten sam kupon, a koszt nie rośnie z ruchem.
 *
 * ROZLICZANY PUBLICZNIE. Wynik (kupon albo pojedynczy typ) zapisujemy raz na 15 minut jako kupon
 * `live` — rozlicza go ten sam przebieg co pozostałe kupony, bilans w zakładce „Kupon live".
 */

const WYNIK_TTL_MS = 3 * 60_000;
const SLOT_MS = 15 * 60_000;
const MAX_KANDYDATOW_AI = 10;
const CONCURRENCY = 4;
const PRZEDMECZOWE_TTL_MS = 6 * 3600_000;
const PRZEDMECZOWE_NA_RAZ = 25;

/** Kursy sprzed meczu dla lig poza modelem: fixtureId → { at, value } (także `null` — brak u dostawcy). */
const przedmeczowe = new Map();

async function kursyPrzedMeczem(fixtureId, now, budzet) {
	const zapis = przedmeczowe.get(fixtureId);
	if (zapis && now.getTime() - zapis.at < PRZEDMECZOWE_TTL_MS) return zapis.value;
	if (budzet.left <= 0) return null;
	budzet.left -= 1;
	let value = null;
	try {
		value = await fetchOddsSnapshot(fixtureId);
	} catch {
		return null; // błąd dostawcy — spróbujemy przy następnym liczeniu
	}
	przedmeczowe.set(fixtureId, { at: now.getTime(), value });
	if (przedmeczowe.size > 2000) przedmeczowe.delete(przedmeczowe.keys().next().value);
	return value;
}

let pamiec = null; // { at, value }
let wToku = null;

const czerwone = (events, teamId) =>
	events.filter((e) => e.teamId === teamId && e.type === 'Card' && /red/i.test(e.detail || '')).length;

/** Statystyki na żywo w kilku słowach dla AI — tylko te, które coś mówią o przewadze. */
function opisStatystyk(stats, homeId, awayId) {
	const z = (teamId) => stats.find((s) => s.teamId === teamId)?.stats || {};
	const g = z(homeId);
	const a = z(awayId);
	const para = (nazwa, k) => (g[k] != null || a[k] != null ? `${nazwa} ${g[k] ?? '?'}–${a[k] ?? '?'}` : null);
	return [
		para('strzały', 'Total Shots'),
		para('celne', 'Shots on Goal'),
		para('posiadanie', 'Ball Possession'),
		para('xG', 'expected_goals'),
		para('rożne', 'Corner Kicks'),
		para('niebezpieczne ataki', 'Dangerous Attacks'),
	]
		.filter(Boolean)
		.join(', ');
}

const forma = (f) => (f ? `forma ${f.form || '?'}, śr. gole ${f.goals?.for?.average?.total ?? '?'}–${f.goals?.against?.average?.total ?? '?'}` : 'brak');

export const AI_SCHEMA = {
	type: 'object',
	properties: {
		oceny: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					id: { type: 'string' },
					decyzja: { type: 'string', enum: ['ok', 'odrzuc'] },
					powod: { type: 'string' },
					uzasadnienie: { type: 'string' },
				},
				required: ['id', 'decyzja', 'powod', 'uzasadnienie'],
				additionalProperties: false,
			},
		},
	},
	required: ['oceny'],
	additionalProperties: false,
};

export const AI_SYSTEM = `Jesteś analitykiem meczów piłkarskich na żywo. Dostajesz kandydatów na typy w trwających meczach: typ, kurs (mediana bukmacherów na żywo), szansę według rynku i według modelu statystycznego (model zna siły drużyn, wynik i minutę, ale NIE widzi przebiegu gry), statystyki na żywo, zdarzenia, formę i H2H sprzed meczu.

Przy części kandydatów (oznaczonych „liga poza modelem") zamiast modelu jest szansa wyliczona z kursów sprzed meczu z doliczonym wynikiem i minutą. Tam nie ma przewagi modelu, więc szczególnie pilnuj, czy przebieg gry nie przeczy typowi.
BRAK STATYSTYK NA ŻYWO NIE JEST POWODEM DO ODRZUCENIA — w wielu ligach dostawca ich nie podaje. Wtedy oceniaj z tego, co jest: wyniku, minuty, zdarzeń (gole, kartki), formy, H2H i zgodności rynku z wyliczeniem; w uzasadnieniu napisz krótko, że statystyk meczu brak.

Twoja rola: ocenić, czy przebieg meczu WSPIERA typ, czy mu przeczy. Odrzuć ("odrzuc"), gdy dane wyraźnie przeczą typowi — np. drużyna, na którą idzie typ, jest zdominowana (dużo mniej strzałów, celnych strzałów, xG), rywal naciska i ma serię okazji, typ na gola drużyny, która od dawna nie oddała celnego strzału. Gdy dane są neutralne albo wspierają typ — "ok".
Nie zmieniaj liczb. "powod": przy odrzuceniu krótko dlaczego (do 12 słów), przy ok pusty napis. "uzasadnienie": 1–2 zdania z konkretnymi liczbami z meczu (strzały, xG, minuta, wynik), po polsku. Nie zachęcaj do gry, nie podawaj stawek, nie pisz „pewniak". "id" przepisz dokładnie.`;

/** Kandydaci z wszystkich trwających meczów — bez AI. */
async function kandydaci(now) {
	const mecze = (await liveFixtures())
		.map(normalizeFixture)
		.filter(
			(f) =>
				f &&
				(LEAGUE_TIERS.has(f.league?.id) || liveLeagueOk(f.league?.name)) &&
				liveMinuteOk(f.status?.code, f.status?.elapsed)
		);
	const kursy = new Map(((await liveOdds()) || []).map((row) => [String(row.fixture?.id), liveOddsFromRow(row)]));
	const budzet = { left: PRZEDMECZOWE_NA_RAZ };

	const wstepni = [];
	let zModelu = 0;
	for (const f of mecze) {
		const odds = kursy.get(String(f.id));
		if (!odds) continue;
		let lambdy = null;
		let source = 'model';
		if (LEAGUE_TIERS.has(f.league?.id)) {
			const p = await predictFixture({
				leagueId: f.league?.id,
				season: f.league?.season,
				homeId: f.teams?.home?.id,
				awayId: f.teams?.away?.id,
			}).catch(() => null);
			if (p?.known) lambdy = { lambdaHome: p.lambdaHome, lambdaAway: p.lambdaAway };
		}
		if (lambdy) zModelu += 1;
		else {
			// Liga poza modelem (albo drużyna, której model nie zna) — obraz z kursów sprzed meczu.
			lambdy = lambdasFromOdds(await kursyPrzedMeczem(String(f.id), now, budzet));
			source = 'market';
		}
		if (!lambdy) continue;
		const model = liveModelMarkets({
			...lambdy,
			homeGoals: f.goals?.home ?? 0,
			awayGoals: f.goals?.away ?? 0,
			minute: f.status.elapsed,
		});
		const sel = liveSelections({ odds, model, source });
		if (sel.length) wstepni.push({ f, sel });
	}

	// Zdarzenia (czerwone kartki) tylko dla meczów z kandydatami — reszta nic nie kosztuje.
	const out = [];
	for (let i = 0; i < wstepni.length; i += CONCURRENCY) {
		await Promise.all(
			wstepni.slice(i, i + CONCURRENCY).map(async ({ f, sel }) => {
				let events = [];
				try {
					events = normalizeEvents(await fixtureEvents(f.id));
				} catch {
					events = [];
				}
				const red = { home: czerwone(events, f.teams?.home?.id), away: czerwone(events, f.teams?.away?.id) };
				const nazwy = { homeName: f.teams?.home?.name ?? '?', awayName: f.teams?.away?.name ?? '?' };
				for (const s of sel) {
					// Model nie widzi czerwonych kartek — typ na drużynę w osłabieniu odpada.
					if (legVeto(s.key, red)) continue;
					out.push({
						fixtureId: String(f.id),
						...nazwy,
						homeId: f.teams?.home?.id,
						awayId: f.teams?.away?.id,
						league: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
						leagueId: f.league?.id ?? null,
						kickoff: new Date(f.date),
						minute: f.status.elapsed,
						liveScore: `${f.goals?.home ?? 0}:${f.goals?.away ?? 0}`,
						key: s.key,
						label: COMPACT_LABELS[s.key] || s.key,
						selection: SELECTION_SHAPES[s.key]?.label(nazwy) ?? s.key,
						odds: s.odds,
						market: s.market,
						model: s.model,
						probability: s.model,
						source: s.source,
						events: events.filter((e) => e.type === 'Goal' || e.type === 'Card').slice(-6),
						red,
					});
				}
			})
		);
	}
	return {
		candidates: out,
		analyzed: mecze.length,
		withOdds: mecze.filter((f) => kursy.has(String(f.id))).length,
		modelMatches: zModelu,
	};
}

/** Krótka lista dla AI: najlepszy kandydat z każdego meczu (na kupon albo pojedynczy). */
function shortlista(candidates) {
	const najlepszy = new Map();
	for (const c of candidates) {
		const sensowny =
			(c.odds >= LIVE_LEG_MIN_ODDS && c.odds < LIVE_LEG_MAX_ODDS) || (c.odds >= LIVE_SINGLE.minOdds && c.odds <= LIVE_SINGLE.maxOdds);
		if (!sensowny) continue;
		const obecny = najlepszy.get(c.fixtureId);
		if (!obecny || c.model > obecny.model) najlepszy.set(c.fixtureId, c);
	}
	return [...najlepszy.values()].sort((a, b) => b.model - a.model).slice(0, MAX_KANDYDATOW_AI);
}

/** Ocena AI: statystyki na żywo, zdarzenia, forma, H2H, werdykt wiadomości. `null` — bez AI. */
async function ocenaAI(lista) {
	if (!lista.length) return null;
	try {
		if (!(await checkSpendCap()).allowed) return null;
	} catch {
		/* brak progu to nie powód, żeby nie oceniać */
	}
	const kontekst = await Promise.all(
		lista.map(async (c) => {
			const [st, pr] = await Promise.allSettled([fixtureStatistics(c.fixtureId), predictions(c.fixtureId)]);
			const stats = st.status === 'fulfilled' ? normalizeFixtureStatistics(st.value) : [];
			const raw = pr.status === 'fulfilled' ? pr.value?.[0] : null;
			const h2h = raw ? normalizeH2H(raw.h2h, { limit: 3 }) : [];
			const news = peekVerdict({ fixtureId: c.fixtureId, selection: c.selection });
			return [
				`--- id: ${c.fixtureId}:${c.key}`,
				`Mecz: ${c.homeName} – ${c.awayName} (${c.league}), ${c.minute}. minuta, wynik ${c.liveScore}`,
				c.source === 'market'
					? `Typ: ${c.selection} | kurs ${c.odds} | rynek ${c.market}% | szansa z kursów sprzed meczu + wynik i minuta ${c.model}% (liga poza modelem)`
					: `Typ: ${c.selection} | kurs ${c.odds} | rynek ${c.market}% | model ${c.model}%`,
				`Statystyki na żywo (gospodarze–goście): ${opisStatystyk(stats, c.homeId, c.awayId) || 'brak'}`,
				`Zdarzenia: ${c.events.map((e) => `${e.minute}' ${e.type === 'Goal' ? 'gol' : e.detail} ${e.teamName}`).join('; ') || 'brak'}`,
				`Forma sprzed meczu: ${c.homeName} ${forma(raw ? normalizeTeamForm(raw.teams?.home) : null)}; ${c.awayName} ${forma(raw ? normalizeTeamForm(raw.teams?.away) : null)}`,
				`H2H: ${h2h.map((m) => `${m.home.name} ${m.home.goals}-${m.away.goals} ${m.away.name}`).join('; ') || 'brak'}`,
				news ? `Wiadomości sprzed meczu: ${news.verdict === 'risk' ? `RYZYKO — ${news.reason}` : 'bez poważnych sygnałów'}` : null,
			]
				.filter(Boolean)
				.join('\n');
		})
	);
	try {
		const { data, meta } = await generateStructured({
			model: MODEL_CHAT,
			system: AI_SYSTEM,
			user: `KANDYDACI:\n\n${kontekst.join('\n\n')}`,
			schema: AI_SCHEMA,
			maxTokens: 2500,
		});
		await recordSpend(meta?.costUsd).catch(() => {});
		return new Map((data?.oceny || []).map((o) => [o.id, o]));
	} catch (error) {
		console.warn('[live] ocena AI nie powiodła się:', error.message);
		return null;
	}
}

const bezPomocniczych = ({ events, red, homeId, awayId, ...reszta }) => reszta;

/** Wylicza kupon live (bez pamięci podręcznej). */
export async function computeLiveCoupon({ now = new Date() } = {}) {
	const { candidates, analyzed, withOdds, modelMatches } = await kandydaci(now);
	const lista = shortlista(candidates);
	const oceny = await ocenaAI(lista);

	const odrzucone = [];
	const przyjete = lista.filter((c) => {
		const o = oceny?.get(`${c.fixtureId}:${c.key}`);
		if (o?.decyzja === 'odrzuc') {
			odrzucone.push({ match: `${c.homeName} – ${c.awayName}`, selection: c.selection, reason: o.powod || null });
			return false;
		}
		c.why = o?.uzasadnienie || null;
		return true;
	});

	const kupon = buildLiveCoupon(przyjete);
	const pojedynczy = kupon ? null : bestLiveSingle(przyjete);
	return {
		generatedAt: now.toISOString(),
		analyzed,
		withOdds,
		modelMatches,
		aiChecked: Boolean(oceny),
		mode: kupon ? 'coupon' : pojedynczy ? 'single' : 'none',
		coupon: kupon ? { ...kupon, legs: kupon.legs.map(bezPomocniczych) } : null,
		single: pojedynczy ? bezPomocniczych(pojedynczy) : null,
		rejected: odrzucone,
	};
}

/** Zapis do rozliczenia — raz na 15 minut (kolejne wywołania w tym oknie nic nie dopisują). */
async function zapiszDoBilansu(wynik, now) {
	if (wynik.mode === 'none') return;
	const legs = wynik.mode === 'coupon' ? wynik.coupon.legs : [wynik.single];
	const slot = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString().slice(0, 16);
	try {
		await Coupon.create({
			key: `live:${slot}`,
			type: 'live',
			date: localDate(now),
			legs: legs.map((l) => ({ ...l, status: 'pending', score: null })),
			totalOdds: wynik.mode === 'coupon' ? wynik.coupon.totalOdds : wynik.single.odds,
			chance: wynik.mode === 'coupon' ? wynik.coupon.chance : wynik.single.model,
			status: 'pending',
		});
	} catch (error) {
		if (error?.code !== 11000) console.warn('[live] zapis kuponu nie powiódł się:', error.message);
	}
}

/**
 * Kupon live ze wspólnej pamięci (3 minuty) — liczy, gdy pamięć wygasła. Jedno liczenie naraz.
 *
 * @param {{ now?: Date, compute?: Function }} [options] `compute` podmieniane w testach
 */
export async function getLiveCoupon({ now = new Date(), compute = computeLiveCoupon } = {}) {
	if (pamiec && now.getTime() - pamiec.at < WYNIK_TTL_MS) return pamiec.value;
	if (!wToku) {
		wToku = (async () => {
			const wynik = await compute({ now });
			pamiec = { at: now.getTime(), value: wynik };
			await zapiszDoBilansu(wynik, now);
			return wynik;
		})().finally(() => {
			wToku = null;
		});
	}
	return wToku;
}

/** Ostatni wynik bez liczenia — dla planu darmowego (zapowiedź bez kosztu AI). */
export function peekLiveCoupon(now = new Date()) {
	return pamiec && now.getTime() - pamiec.at < WYNIK_TTL_MS ? pamiec.value : null;
}

/** Postać dla planu darmowego: liczby kuponu bez meczów. */
export function lockedLiveDto(wynik) {
	if (!wynik) return null;
	const legs = wynik.mode === 'coupon' ? wynik.coupon.legs : wynik.mode === 'single' ? [wynik.single] : [];
	return {
		locked: true,
		generatedAt: wynik.generatedAt,
		analyzed: wynik.analyzed,
		mode: wynik.mode,
		totalOdds: wynik.mode === 'coupon' ? wynik.coupon.totalOdds : wynik.single?.odds ?? null,
		chance: wynik.mode === 'coupon' ? wynik.coupon.chance : wynik.single?.model ?? null,
		legsCount: legs.length,
	};
}
