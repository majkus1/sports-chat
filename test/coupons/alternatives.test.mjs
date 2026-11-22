import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Propozycje kreatora kuponu przy „nie da się" (`lib/coupons/alternatives.js`) — część czysta, bez bazy
 * i sieci — oraz nowe okno „jutro", powód „w wybranych ligach nic" i zestawienie dziennika prób.
 *
 * Najważniejsze: propozycja to INNE USTAWIENIA, nie inne zasady. Kandydaci z kursem ponad 1,60, bez
 * potwierdzenia kursem albo o 23:30 dawaliby kupon przy obecnych ustawieniach — test sprawdza, że żadna
 * zapowiedź ich nie bierze, a typy zablokowane (wiadomości) i kupony serwisu (przy „bez meczów z kuponów
 * serwisu") też nie wchodzą.
 */

setupEnv();
const { ALT_MAX, alternativeVariants, findAlternatives, otherLeaguesCount } = await import('@/lib/coupons/alternatives');
const { CUSTOM_ODDS, CUSTOM_WINDOWS, customDiagnosis, customOdds, customPrecheck, parseCustomParams, tomorrowDate, windowAccepts, windowDates, windowOpen } =
	await import('@/lib/coupons/custom');
const { LEG_MAX_ODDS, legEligible, legOddsFit } = await import('@/lib/coupons/build');
const { couponBuilderContent, customImpossibleText } = await import('@/lib/coupons/content');
const { summarizeAttempts } = await import('@/lib/coupons/attempts');
const { localMidnight } = await import('@/lib/time');

const o = (date, h, m = 0) => new Date(localMidnight(date).getTime() + (h * 60 + m) * 60_000);
const DZIEN = '2099-06-10';
const JUTRO = '2099-06-11';
const POJUTRZE = '2099-06-12';

let n = 0;
const typ = (kickoff, probability, odds, extra = {}) => ({
	fixtureId: `a${++n}`,
	homeName: `Gospodarz ${n}`,
	awayName: `Gość ${n}`,
	leagueId: 39,
	league: 'Premier League, England',
	kickoff,
	key: 'home',
	selection: `Gospodarz ${n} wygra`,
	probability,
	odds,
	chanceConfirmed: true,
	...extra,
});

/** Dziś: dwa typy w zasadach (1,30 · 1,35 = 1,76) i trzy, które zasad NIE spełniają, a domknęłyby kupon. */
const dzis = [typ(o(DZIEN, 19), 77, 1.3), typ(o(DZIEN, 20), 74, 1.35)];
const lamiace = [
	typ(o(DZIEN, 21), 62, 1.62), // kurs ponad 1,60 — z 1,30 dałby 2,11 („ok. 2,0")
	typ(o(DZIEN, 21, 30), 85, 1.45, { chanceConfirmed: false }), // bez potwierdzenia kursem — dałby 2,54
	typ(o(DZIEN, 23, 30), 90, 1.5), // po 23:00
];
const jutro = [typ(o(JUTRO, 18), 74, 1.35), typ(o(JUTRO, 19), 73, 1.36), typ(o(JUTRO, 20), 72, 1.37)];
const pojutrze = [typ(o(POJUTRZE, 18), 70, 1.38), typ(o(POJUTRZE, 19), 69, 1.39)];
const wszystkie = [...dzis, ...lamiace, ...jutro, ...pojutrze];
const TERAZ = o(DZIEN, 10);
const DZIS_25 = { odds: '2.5', legs: 3, window: 'today', leagues: [], skipPublished: false };

/** Każda noga zapowiedzi spełnia zasady kuponu i ustawienia propozycji; kurs łączny w widełkach. */
function zgodnaZZasadami(alt, now = TERAZ) {
	const cel = customOdds(alt.params.odds);
	assert.ok(alt.preview.totalOdds >= cel.target - 1e-9 && alt.preview.totalOdds <= cel.max + 1e-9, `kurs ${alt.preview.totalOdds}`);
	assert.ok(alt.preview.legs.length <= alt.params.legs);
	for (const l of alt.preview.legs) {
		const c = wszystkie.find((x) => x.fixtureId === l.fixtureId);
		assert.ok(legOddsFit(c), `${l.fixtureId}: kurs ${c.odds}, potwierdzony ${c.chanceConfirmed}`);
		assert.ok(legEligible(c.kickoff, now), `${l.fixtureId}: godzina`);
		assert.ok(windowAccepts(alt.params.window, c.kickoff, now), `${l.fixtureId}: okno ${alt.params.window}`);
	}
	assert.ok(parseCustomParams(alt.params).ok);
	assert.equal(customPrecheck(alt.params, now), null);
}

describe('okno „jutro"', () => {
	test('jutro 12–23 czasu polskiego; dni do pobrania; zawsze otwarte', () => {
		assert.ok(CUSTOM_WINDOWS.includes('tomorrow'));
		assert.ok(windowAccepts('tomorrow', o(JUTRO, 18), TERAZ));
		assert.ok(!windowAccepts('tomorrow', o(DZIEN, 18), TERAZ));
		assert.ok(!windowAccepts('tomorrow', o(JUTRO, 23, 30), TERAZ));
		assert.ok(!windowAccepts('tomorrow', o(POJUTRZE, 18), TERAZ));
		assert.deepEqual(windowDates('tomorrow', TERAZ), [JUTRO]);
		assert.ok(windowOpen('tomorrow', o(DZIEN, 23, 30)));
		assert.ok(couponBuilderContent('pl').window.tomorrow && couponBuilderContent('en').window.tomorrow);
	});

	test('zmiana czasu: 25.10.2026 o 0:30 (doba 25 h) jutro to 26.10, a 29.03.2026 o 23:30 (doba 23 h) — 30.03', () => {
		assert.equal(tomorrowDate(new Date('2026-10-24T22:30:00Z')), '2026-10-26');
		assert.equal(tomorrowDate(new Date('2026-03-29T21:30:00Z')), '2026-03-30');
	});
});

describe('warianty ustawień — kolejność od najbliższego', () => {
	test('od najtańszej zmiany; kurs tylko w dół; żaden wariant nie powtarza prośby ani nie łamie ustawień', () => {
		const params = { odds: '2.5', legs: 3, window: 'today', leagues: ['england'], skipPublished: true };
		const w = alternativeVariants(params, TERAZ);
		assert.ok(w.length > 10);
		for (let i = 1; i < w.length; i++) {
			assert.ok(w[i - 1].cost < w[i].cost || (w[i - 1].cost === w[i].cost && w[i - 1].changes.length <= w[i].changes.length));
		}
		// Najtańsze (koszt 1): „także mecze z kuponów serwisu", 4 mecze, najbliższe 24 h — pojedyncze zmiany.
		assert.deepEqual(
			w.filter((v) => v.cost === 1).map((v) => v.changes.map((c) => `${c.field}=${c.to}`).join('+')).sort(),
			['legs=4', 'skipPublished=false', 'window=h24']
		);
		const i = (id) => CUSTOM_ODDS.findIndex((x) => x.id === id);
		for (const v of w) {
			assert.ok(parseCustomParams(v.params).ok);
			assert.notDeepEqual(v.params, params);
			assert.ok(v.changes.length >= 1 && v.changes.length <= 3);
			assert.ok(i(v.params.odds) <= i(params.odds), 'wyższy kurs to mniejsza szansa — nie proponujemy');
			assert.ok(v.params.legs >= params.legs);
			assert.equal(customPrecheck(v.params, TERAZ), null);
		}
		// Zmiana kursu kosztuje najwięcej: pierwszy wariant z innym kursem stoi za wszystkimi pojedynczymi zmianami godzin.
		const pierwszyKurs = w.findIndex((v) => v.changes.some((c) => c.field === 'odds'));
		const ostatnieGodziny = w.findLastIndex((v) => v.changes.length === 1 && v.changes[0].field === 'window' && v.cost <= 2);
		assert.ok(pierwszyKurs > ostatnieGodziny);
	});

	test('za mało meczów na ~3,0: każdy wariant ma co najmniej 3 mecze; po 22:00 bez „dziś" i „wieczorem"', () => {
		const w = alternativeVariants({ ...DZIS_25, odds: '3.0', legs: 2 }, TERAZ);
		assert.ok(w.every((v) => v.params.legs >= 3 || v.params.odds !== '3.0'));
		assert.equal(w[0].changes[0].field, 'legs');
		const pozno = alternativeVariants({ ...DZIS_25, window: 'evening' }, o(DZIEN, 22, 30));
		assert.ok(pozno.every((v) => !['today', 'evening'].includes(v.params.window)));
		assert.ok(pozno.some((v) => v.params.window === 'tomorrow'));
	});
});

describe('propozycje z zapowiedzią — bez obchodzenia zasad', () => {
	test('dziś za mało typów w zasadach: jedyna propozycja to jutro, typy łamiące zasady nie wchodzą', () => {
		const alt = findAlternatives({ params: DZIS_25, candidates: wszystkie, now: TERAZ });
		assert.ok(alt.length >= 1 && alt.length <= ALT_MAX);
		assert.deepEqual(alt[0].changes, [{ field: 'window', from: 'today', to: 'tomorrow' }]);
		assert.deepEqual(alt[0].preview.legs.map((l) => l.fixtureId), jutro.map((c) => c.fixtureId));
		assert.equal(alt[0].preview.totalOdds, 2.52);
		assert.deepEqual(alt[0].picks, { before: 2, after: 3 });
		const lamiaceId = lamiace.map((c) => c.fixtureId);
		for (const a of alt) {
			zgodnaZZasadami(a);
			assert.ok(!a.preview.legs.some((l) => lamiaceId.includes(l.fixtureId)));
		}
		// „3 dni" daje te same typy co „jutro" — nie ma drugiej karty z tym samym kuponem.
		assert.ok(!alt.slice(1).some((a) => a.preview.legs.every((l) => jutro.some((c) => c.fixtureId === l.fixtureId))));
	});

	test('przy „ok. 2,0" typ z kursem 1,62 domknąłby kupon dziś — mimo to żadna propozycja go nie bierze', () => {
		const params = { ...DZIS_25, odds: '2.0', legs: 2 };
		const alt = findAlternatives({ params, candidates: wszystkie, now: TERAZ });
		assert.ok(alt.length >= 1);
		for (const a of alt) zgodnaZZasadami(a);
		assert.ok(!alt.some((a) => a.params.window === 'today' && a.params.odds === '2.0' && a.params.legs === 2));
	});

	test('typ zablokowany (wiadomości, zapisane ryzyko) nie wchodzi do żadnej zapowiedzi — kupon idzie dalej, na 3 dni', () => {
		const zly = jutro[0].fixtureId;
		const alt = findAlternatives({ params: DZIS_25, candidates: wszystkie, now: TERAZ, blocked: [zly] });
		assert.ok(alt.length >= 1);
		assert.ok(alt.every((a) => !a.preview.legs.some((l) => l.fixtureId === zly)));
		assert.ok(alt.some((a) => a.params.window === 'days3'));
		for (const a of alt) zgodnaZZasadami(a);
	});

	test('„bez meczów z kuponów serwisu": najbliżej jest dopuścić te mecze; inne propozycje nadal ich nie biorą', () => {
		const opublikowany = typ(o(DZIEN, 21), 72, 1.4);
		const kandydaci = [...wszystkie, opublikowany];
		const params = { ...DZIS_25, skipPublished: true };
		const alt = findAlternatives({ params, candidates: kandydaci, now: TERAZ, published: [opublikowany.fixtureId] });
		assert.deepEqual(alt[0].changes, [{ field: 'skipPublished', from: true, to: false }]);
		assert.ok(alt[0].preview.legs.some((l) => l.fixtureId === opublikowany.fixtureId));
		assert.equal(alt[1].changes[0].field, 'window');
		for (const a of alt.filter((x) => x.params.skipPublished)) {
			assert.ok(!a.preview.legs.some((l) => l.fixtureId === opublikowany.fixtureId));
		}
	});

	test('nic nie działa w 3 dniach — pusta lista, nie „coś na siłę"', () => {
		assert.deepEqual(findAlternatives({ params: DZIS_25, candidates: [...dzis, ...lamiace], now: TERAZ }), []);
	});

	test('najwyżej 3 propozycje, najwyżej 2 z tym samym polem, bez wariantu, który tylko dokłada zmiany', () => {
		const duzo = [];
		for (const d of [DZIEN, JUTRO, POJUTRZE]) for (let h = 13; h <= 22; h++) duzo.push(typ(o(d, h), 80 - h, 1.2 + h / 100, { leagueId: h % 2 ? 39 : 140 }));
		const params = { odds: '3.0', legs: 3, window: 'evening', leagues: ['spain'], skipPublished: false };
		const alt = findAlternatives({ params, candidates: duzo, now: TERAZ });
		assert.ok(alt.length <= ALT_MAX);
		const pola = alt.map((a) => a.changes.map((c) => c.field).sort().join('+'));
		for (const p of new Set(pola)) assert.ok(pola.filter((x) => x === p).length <= 2);
		for (let i = 0; i < alt.length; i++) {
			for (let j = 0; j < i; j++) {
				const wczesniej = alt[j].changes.map((c) => c.field);
				const teraz = alt[i].changes.map((c) => c.field);
				assert.ok(!(wczesniej.length < teraz.length && wczesniej.every((f) => teraz.includes(f))), `${pola[i]} ⊃ ${pola[j]}`);
			}
		}
	});
});

describe('powód „w wybranych ligach nic" i tekst', () => {
	test('plakietki są tylko w innych ligach — inny powód niż „w tych godzinach nic"', () => {
		const params = { ...DZIS_25, leagues: ['spain'] };
		const plakietki = dzis.map((c) => ({ fixtureId: c.fixtureId, kickoff: c.kickoff, leagueId: c.leagueId }));
		assert.equal(otherLeaguesCount(params, plakietki, TERAZ), 2);
		assert.equal(otherLeaguesCount(DZIS_25, plakietki, TERAZ), 0);
		const d = customDiagnosis({ params, stats: { entries: 0, withOdds: 0, failed: 0 }, candidates: [], now: TERAZ, otherLeagues: 2 });
		assert.equal(d.reason, 'leagues_empty');
		assert.equal(d.counts.otherLeagues, 2);
		assert.deepEqual(d.suggest, ['leagues', 'window']);
		assert.match(customImpossibleText('pl', { ...d, params }).reason, /W wybranych ligach nie ma w tych godzinach meczu z typem modelu — w pozostałych są 2 takie mecze\./);
		assert.match(customImpossibleText('en', { ...d, params }).reason, /the other leagues have 2\./);
		// Bez wybranych lig to zwykłe „brak meczów" — liczba z innych lig nic nie zmienia.
		assert.equal(customDiagnosis({ params: DZIS_25, stats: { entries: 0 }, candidates: [], now: TERAZ, otherLeagues: 5 }).reason, 'no_matches');
	});
});

describe('teksty propozycji (`messages/*.json`, przestrzeń builder2)', () => {
	test('te same klucze po polsku i angielsku, bez kolizji z innymi przestrzeniami', async () => {
		const { readFileSync } = await import('node:fs');
		const pl = JSON.parse(readFileSync(new URL('../../messages/pl.json', import.meta.url), 'utf8'));
		const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8'));
		assert.ok(pl.builder2 && en.builder2);
		assert.deepEqual(Object.keys(pl.builder2).sort(), Object.keys(en.builder2).sort());
		for (const k of ['title', 'accept', 'accepting', 'previewNote', 'change_window', 'why_window', 'why_legs', 'why_odds']) assert.ok(pl.builder2[k], k);
		assert.equal(pl.builder2.title, 'Tak się nie da, ale możemy…');
	});
});

describe('zestawienie dziennika prób (panel administratora)', () => {
	test('najczęstsze przyczyny, odsetek z propozycją, przyjęte i udane, przyjęte zmiany, plany', () => {
		const alt = (changes) => ({ changes });
		const s = summarizeAttempts([
			{ userId: 'u1', reason: 'few_picks', plan: 'free', inTrial: true, alternatives: [alt(['window']), alt(['odds'])], accepted: { index: 0, outcome: 'ok' } },
			{ userId: 'u1', reason: 'few_picks', plan: 'pro', alternatives: [alt(['window', 'legs'])], accepted: { index: 0, outcome: 'impossible' } },
			{ userId: 'u2', reason: 'news_dropped', plan: 'pro', alternatives: [alt(['odds'])], accepted: null },
			{ userId: 'u3', reason: 'window_closed', plan: 'vip', alternatives: [], accepted: null, fromAttempt: 'x' },
		]);
		assert.equal(s.total, 4);
		assert.equal(s.users, 3);
		assert.deepEqual(s.reasons, [
			{ key: 'few_picks', count: 2, share: 50 },
			{ key: 'news_dropped', count: 1, share: 25 },
			{ key: 'window_closed', count: 1, share: 25 },
		]);
		assert.equal(s.withAlternatives, 3);
		assert.equal(s.withAlternativesRate, 75);
		assert.equal(s.accepted, 2);
		assert.equal(s.acceptRate, 67);
		assert.equal(s.acceptedOk, 1);
		assert.equal(s.acceptedOkRate, 50);
		assert.deepEqual(s.acceptedChanges, [
			{ key: 'window', count: 2 },
			{ key: 'legs', count: 1 },
		]);
		assert.deepEqual(s.acceptedPosition, [2, 0, 0]);
		assert.deepEqual(s.plans.map((p) => p.key).sort(), ['pro', 'trial', 'vip']);
		assert.equal(s.followUps, 1);
		assert.deepEqual(summarizeAttempts([]).reasons, []);
		assert.equal(summarizeAttempts([]).acceptRate, null);
	});
});

test('granica nogi z build.js — propozycje nie mają własnej', () => {
	assert.equal(LEG_MAX_ODDS, 1.6);
});
