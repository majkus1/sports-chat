import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kreator kuponu — część czysta (`lib/coupons/custom.js`): ustawienia, widełki, okno godzin, ligi,
 * wybór z puli TĄ SAMĄ funkcją co kupony serwisu i powód „nie da się". Bez bazy i sieci.
 *
 * Do tego szczelność publicznego bilansu: kupon `custom` nie ma swojego klucza w dorobku kuponów
 * i nie zostawia znacznika przy meczu na liście (`hintPresenter`).
 */

setupEnv();
const {
	CUSTOM_DEFAULTS,
	CUSTOM_ODDS,
	CUSTOM_WINDOWS,
	customAccept,
	customDiagnosis,
	customPrecheck,
	customRules,
	customSummary,
	minLegsFor,
	parseCustomParams,
	sameLegs,
	windowAccepts,
	windowDates,
	windowOpen,
} = await import('@/lib/coupons/custom');
const { COUPON_TYPES, LEG_MAX_ODDS, PUBLIC_COUPON_TYPES, buildCoupon, couponPool } = await import('@/lib/coupons/build');
const { LEAGUE_GROUPS, LEAGUE_TIERS, leagueGroup } = await import('@/lib/football/leagues');
const { couponBuilderContent, customImpossibleText } = await import('@/lib/coupons/content');
const { couponRecordFrom } = await import('@/lib/coupons/build');
const { hintPresenter } = await import('@/lib/coupons/marks');
const { localMidnight } = await import('@/lib/time');

/** Chwila w czasie polskim: `o('2099-06-10', 18, 30)`. */
const o = (date, h, m = 0) => new Date(localMidnight(date).getTime() + (h * 60 + m) * 60_000);
const DZIEN = '2099-06-10';
const JUTRO = '2099-06-11';

let n = 0;
/** Kandydat z `couponCandidates` (plakietka z kursem). */
const typ = (kickoff, probability, odds, extra = {}) => ({
	fixtureId: `c${++n}`,
	homeName: `Gospodarz ${n}`,
	awayName: `Gość ${n}`,
	leagueId: 39,
	league: 'Premier League, England',
	kickoff,
	key: 'home',
	selection: `Gospodarz ${n} wygra`,
	probability,
	odds,
	...extra,
});
const iloczyn = (xs) => xs.reduce((a, b) => a * b, 1);

describe('ustawienia kreatora', () => {
	test('brak pól — wartości domyślne; poprawne warianty zapisu kursu', () => {
		assert.deepEqual(parseCustomParams({}), { ok: true, params: { ...CUSTOM_DEFAULTS, leagues: [] } });
		assert.deepEqual(parseCustomParams(null), { ok: true, params: { ...CUSTOM_DEFAULTS, leagues: [] } });
		for (const [wejscie, id] of [
			[2, '2.0'],
			['2,0', '2.0'],
			[2.5, '2.5'],
			['2.5', '2.5'],
			[3, '3.0'],
			['3,0', '3.0'],
		]) {
			assert.equal(parseCustomParams({ odds: wejscie }).params.odds, id, String(wejscie));
		}
		const pelne = parseCustomParams({ odds: 3, legs: 5, window: 'days3', leagues: ['spain', 'england', 'spain'], skipPublished: true });
		assert.deepEqual(pelne.params, { odds: '3.0', legs: 5, window: 'days3', leagues: ['england', 'spain'], skipPublished: true });
	});

	test('złe wartości — błąd z nazwą pola, bez zgadywania', () => {
		assert.deepEqual(parseCustomParams({ odds: 2.2 }).errors, ['odds']);
		assert.deepEqual(parseCustomParams({ legs: 1 }).errors, ['legs']);
		assert.deepEqual(parseCustomParams({ legs: 6 }).errors, ['legs']);
		assert.deepEqual(parseCustomParams({ legs: 3.5 }).errors, ['legs']);
		assert.deepEqual(parseCustomParams({ window: 'week' }).errors, ['window']);
		assert.deepEqual(parseCustomParams({ leagues: 'england' }).errors, ['leagues']);
		assert.deepEqual(parseCustomParams({ leagues: ['mars'] }).errors, ['leagues']);
		assert.deepEqual(parseCustomParams({ skipPublished: 'tak' }).errors, ['skipPublished']);
		assert.deepEqual(parseCustomParams({ odds: 9, window: 'x' }).errors, ['odds', 'window']);
	});

	test('wszystkie grupy lig naraz to „wszystkie ligi"', () => {
		assert.deepEqual(parseCustomParams({ leagues: LEAGUE_GROUPS.map((g) => g.id) }).params.leagues, []);
	});
});

describe('widełki kursu', () => {
	test('„ok. 2,5" to dokładnie przedział kuponów serwisu; każdy cel nie schodzi wyraźnie poniżej nazwy', () => {
		const dwaIPol = CUSTOM_ODDS.find((x) => x.id === '2.5');
		assert.deepEqual([dwaIPol.target, dwaIPol.max], [COUPON_TYPES.daily.target, COUPON_TYPES.daily.max]);
		for (const cel of CUSTOM_ODDS) {
			assert.ok(cel.target >= cel.nominal - 0.1 - 1e-9 && cel.target <= cel.nominal, cel.id);
			assert.ok(cel.max > cel.target && cel.max <= cel.nominal + 0.6 + 1e-9, cel.id);
		}
		assert.deepEqual(customRules({ odds: '3.0', legs: 5 }), { target: 2.9, max: 3.6, maxLegs: 5 });
	});

	test('najmniej meczów z typami do 1,40: ~2,0 i ~2,5 — trzy, ~3,0 — cztery (1,40³ = 2,74)', () => {
		assert.equal(minLegsFor(2.0), 3);
		assert.equal(minLegsFor(2.4), 3);
		assert.equal(minLegsFor(2.9), 4);
		assert.ok(LEG_MAX_ODDS ** 2 < 2.0);
	});

	test('za mało meczów na ten kurs — „nie da się" od razu, bez pobierania', () => {
		assert.deepEqual(customPrecheck({ ...CUSTOM_DEFAULTS, legs: 2 }, o(DZIEN, 10)), {
			reason: 'too_few_legs',
			needed: 3,
			suggest: ['legs'],
		});
		assert.equal(customPrecheck({ ...CUSTOM_DEFAULTS, odds: '3.0', legs: 3 }, o(DZIEN, 10)).needed, 4);
		assert.equal(customPrecheck({ ...CUSTOM_DEFAULTS, odds: '3.0', legs: 4 }, o(DZIEN, 10)), null);
	});
});

describe('okno godzin', () => {
	test('dziś do 23:00, wieczór 18–23, 24 godziny, 3 dni', () => {
		const teraz = o(DZIEN, 10);
		assert.equal(windowAccepts('today', o(DZIEN, 23), teraz), true);
		assert.equal(windowAccepts('today', o(DZIEN, 23, 5), teraz), false);
		assert.equal(windowAccepts('today', o(JUTRO, 15), teraz), false);
		assert.equal(windowAccepts('evening', o(DZIEN, 17, 59), teraz), false);
		assert.equal(windowAccepts('evening', o(DZIEN, 18), teraz), true);
		assert.equal(windowAccepts('h24', o(JUTRO, 9, 59), teraz), true);
		assert.equal(windowAccepts('h24', o(JUTRO, 10, 1), teraz), false);
		assert.equal(windowAccepts('days3', o('2099-06-13', 9, 59), teraz), true);
		assert.equal(windowAccepts('days3', o('2099-06-13', 10, 1), teraz), false);
		assert.equal(windowAccepts('today', o(DZIEN, 9), teraz), false, 'mecz, który już się zaczął');
		assert.equal(windowAccepts('nieznane', o(DZIEN, 15), teraz), false);
	});

	test('w dzień zmiany czasu „dziś do 23:00" to 23:00 czasu polskiego (doba ma 25 godzin)', () => {
		// 25.10.2026 o 3:00 zegary cofają się na 2:00 — „północ + 23 h" wypadłoby o 22:00.
		const teraz = new Date('2026-10-25T08:00:00Z'); // 9:00 w Polsce
		assert.equal(windowAccepts('today', new Date('2026-10-25T21:30:00Z'), teraz), true, '22:30');
		assert.equal(windowAccepts('today', new Date('2026-10-25T22:00:00Z'), teraz), true, '23:00');
		assert.equal(windowAccepts('today', new Date('2026-10-25T22:05:00Z'), teraz), false, '23:05');
	});

	test('dni do pobrania i okno, w którym nie ma już miejsca', () => {
		assert.deepEqual(windowDates('today', o(DZIEN, 10)), [DZIEN]);
		assert.deepEqual(windowDates('evening', o(DZIEN, 10)), [DZIEN]);
		assert.deepEqual(windowDates('h24', o(DZIEN, 10)), [DZIEN, JUTRO]);
		assert.deepEqual(windowDates('days3', o(DZIEN, 10)), [DZIEN, JUTRO, '2099-06-12', '2099-06-13']);
		assert.equal(windowOpen('today', o(DZIEN, 21, 59)), true);
		assert.equal(windowOpen('evening', o(DZIEN, 22, 1)), false);
		assert.equal(windowOpen('today', o(DZIEN, 23, 30)), false);
		assert.equal(windowOpen('h24', o(DZIEN, 23, 30)), true);
		assert.equal(customPrecheck({ ...CUSTOM_DEFAULTS, window: 'evening' }, o(DZIEN, 22, 30)).reason, 'window_closed');
		assert.ok(CUSTOM_WINDOWS.every((w) => couponBuilderContent('pl').window[w] && couponBuilderContent('en').window[w]));
	});
});

describe('ligi', () => {
	test('każda liga z LEAGUE_TIERS w dokładnie jednej grupie, grupy bez lig spoza listy, nazwy w obu językach', () => {
		const wszystkie = LEAGUE_GROUPS.flatMap((g) => g.leagues);
		assert.equal(new Set(wszystkie).size, wszystkie.length, 'liga w dwóch grupach');
		assert.deepEqual([...wszystkie].sort((a, b) => a - b), [...LEAGUE_TIERS.keys()].sort((a, b) => a - b));
		for (const lang of ['pl', 'en']) {
			const nazwy = couponBuilderContent(lang).leagueGroups;
			for (const g of LEAGUE_GROUPS) assert.ok(nazwy[g.id], `${lang}: brak nazwy grupy ${g.id}`);
		}
		assert.equal(leagueGroup(106), 'poland');
		assert.equal(leagueGroup('39'), 'england');
		assert.equal(leagueGroup(999999), null);
	});
});

describe('wybór z puli — ta sama funkcja co kupony serwisu', () => {
	const teraz = o(DZIEN, 10);
	// Wieczorem w Anglii, po południu w Hiszpanii, jutro w Polsce i jeden mecz o 23:30 (poza oknem kuponów).
	const wieczorAnglia = [typ(o(DZIEN, 18), 78, 1.27), typ(o(DZIEN, 19), 76, 1.3), typ(o(DZIEN, 20), 75, 1.31), typ(o(DZIEN, 21), 74, 1.33)];
	const poludnieHiszpania = [typ(o(DZIEN, 14), 80, 1.24, { leagueId: 140 }), typ(o(DZIEN, 15), 79, 1.25, { leagueId: 140 })];
	const jutroPolska = [typ(o(JUTRO, 18), 82, 1.21, { leagueId: 106 }), typ(o(JUTRO, 20), 81, 1.22, { leagueId: 106 })];
	const noc = typ(o(DZIEN, 23, 30), 90, 1.1);
	const kandydaci = [...wieczorAnglia, ...poludnieHiszpania, ...jutroPolska, noc];
	const zloz = (params, exclude = []) =>
		buildCoupon(kandydaci, { type: 'custom', rules: customRules(params), accept: customAccept(params, teraz), now: teraz, exclude });

	test('wieczór: tylko mecze 18–23, najmniej typów, potem najwyższa szansa — jak przeszukanie wszystkich zestawów', () => {
		const params = { ...CUSTOM_DEFAULTS, odds: '2.0', legs: 4, window: 'evening' };
		const kupon = zloz(params);
		assert.ok(kupon.legs.every((l) => wieczorAnglia.includes(l)));
		assert.ok(kupon.totalOdds >= 2.0 && kupon.totalOdds <= 2.6, String(kupon.totalOdds));
		// Wzorzec: wszystkie trójki z wieczoru (dwójki nie dojdą do 2,0) — najwyższa szansa w widełkach.
		let najlepsza = 0;
		for (let a = 0; a < 4; a++)
			for (let b = a + 1; b < 4; b++)
				for (let c = b + 1; c < 4; c++) {
					const t = [wieczorAnglia[a], wieczorAnglia[b], wieczorAnglia[c]];
					const k = iloczyn(t.map((x) => x.odds));
					if (k >= 2.0 && k <= 2.6) najlepsza = Math.max(najlepsza, iloczyn(t.map((x) => x.probability / 100)));
				}
		assert.equal(kupon.legs.length, 3);
		assert.equal(kupon.chance, Math.round(100 * najlepsza));
	});

	test('ligi: tylko wybrane grupy; mecz o 23:30 nigdy (zasada 12:00–23:00 z kuponów serwisu)', () => {
		const tylkoPolska = zloz({ ...CUSTOM_DEFAULTS, odds: '2.0', legs: 5, window: 'h24', leagues: ['poland'] });
		assert.equal(tylkoPolska, null, 'dwa polskie typy nie dają 2,0');
		const anglia = zloz({ ...CUSTOM_DEFAULTS, odds: '2.0', legs: 5, window: 'today', leagues: ['england'] });
		assert.ok(anglia.legs.every((l) => l.leagueId === 39));
		assert.ok(!anglia.legs.includes(noc));
		const pula = couponPool(kandydaci, { now: teraz, accept: customAccept({ ...CUSTOM_DEFAULTS, window: 'today' }, teraz) });
		assert.ok(!pula.includes(noc));
		assert.equal(pula.length, wieczorAnglia.length + poludnieHiszpania.length);
	});

	test('„bez meczów z kuponów serwisu": wykluczone mecze nie wchodzą', () => {
		const params = { ...CUSTOM_DEFAULTS, odds: '2.0', legs: 4, window: 'today' };
		const pierwszy = zloz(params);
		const bez = zloz(params, pierwszy.legs.map((l) => l.fixtureId));
		assert.ok(bez);
		assert.ok(!bez.legs.some((l) => pierwszy.legs.includes(l)));
	});
});

describe('„nie da się" — powód z liczb, które już są', () => {
	const teraz = o(DZIEN, 10);
	const params = { ...CUSTOM_DEFAULTS, odds: '2.5', legs: 4, window: 'evening', leagues: ['england'] };

	test('brak plakietek w oknie i ligach; dane nie przyszły', () => {
		const brak = customDiagnosis({ params, stats: { entries: 0, withOdds: 0, failed: 0 }, candidates: [], now: teraz });
		assert.equal(brak.reason, 'no_matches');
		assert.deepEqual(brak.suggest, ['window', 'leagues']);
		const awaria = customDiagnosis({ params, stats: { entries: 0, withOdds: 0, failed: 2 }, candidates: [], now: teraz });
		assert.equal(awaria.reason, 'unavailable');
		assert.deepEqual(awaria.suggest, ['retry']);
	});

	test('za mało typów spełniających zasady (kurs 1,40+ albo rynek mniej pewny niż model)', () => {
		const kandydaci = [typ(o(DZIEN, 19), 80, 1.25), typ(o(DZIEN, 20), 60, 1.6), typ(o(DZIEN, 21), 85, 1.3)];
		const d = customDiagnosis({ params, stats: { entries: 4, withOdds: 3, failed: 0 }, candidates: kandydaci, now: teraz });
		assert.equal(d.reason, 'few_picks');
		assert.deepEqual(d.counts, { matches: 4, withOdds: 3, picks: 1, needed: 3 });
		const tekst = customImpossibleText('pl', { ...d, params });
		assert.match(tekst.reason, /Z 4 meczów z typem modelu zasady kuponu .* spełnia 1 — a potrzeba co najmniej 3\. Kursy są na razie przy 3 z nich\./);
		assert.ok(tekst.suggestions.length >= 2);
	});

	test('typów dość, ale żaden zestaw nie mieści się w widełkach; odrzucone przez wiadomości; część kursów nie przyszła', () => {
		const kandydaci = [typ(o(DZIEN, 19), 90, 1.1), typ(o(DZIEN, 20), 89, 1.11), typ(o(DZIEN, 21), 88, 1.12)];
		const bezZestawu = customDiagnosis({ params, stats: { entries: 3, withOdds: 3, failed: 1 }, candidates: kandydaci, now: teraz });
		assert.equal(bezZestawu.reason, 'no_combo');
		assert.equal(bezZestawu.partial, true);
		assert.ok(bezZestawu.suggest.includes('legs') && bezZestawu.suggest.includes('odds'));
		assert.match(customImpossibleText('pl', { ...bezZestawu, params }).reason, /Zasady spełniają 3 typy, ale żaden zestaw z najwyżej 4 meczów/);

		const odrzucone = [{ fixtureId: 'x', homeName: 'A', awayName: 'B', selection: 'A wygra', reason: 'kontuzja lidera' }];
		const wiadomosci = customDiagnosis({
			params,
			stats: { entries: 3, withOdds: 3, failed: 0 },
			candidates: kandydaci,
			now: teraz,
			newsCheck: { checked: 3, dropped: odrzucone },
		});
		assert.equal(wiadomosci.reason, 'news_dropped');
		assert.deepEqual(wiadomosci.dropped, odrzucone);
		assert.match(customImpossibleText('en', { ...wiadomosci, params }).reason, /dropped 1 pick, and without it/);
	});

	test('teksty powodów w obu językach — każdy powód ma zdanie, liczby z wyniku', () => {
		for (const lang of ['pl', 'en']) {
			const c = couponBuilderContent(lang);
			for (const reason of ['too_few_legs', 'window_closed', 'unavailable', 'no_matches', 'few_picks', 'no_combo', 'news_dropped']) {
				const t = customImpossibleText(lang, {
					reason,
					params,
					needed: 3,
					counts: { matches: 5, withOdds: 5, picks: 0, needed: 3 },
					dropped: [{}],
					suggest: ['window'],
				});
				assert.ok(t.reason && t.reason !== c.error, `${lang}: ${reason}`);
				assert.deepEqual(t.suggestions, [c.suggest.window]);
			}
		}
		assert.match(customImpossibleText('pl', { reason: 'too_few_legs', needed: 3, params }).reason, /co najmniej 3 meczów: .* 2 dają najwyżej 1,96/);
	});
});

describe('bilans własnych kuponów i powtórka', () => {
	test('weszło z rozliczonych, w grze osobno, średnia obietnica modelu obok', () => {
		const s = customSummary([
			{ status: 'won', totalOdds: 2.1, chance: 48 },
			{ status: 'lost', totalOdds: 2.5, chance: 40 },
			{ status: 'lost', totalOdds: 3.1, chance: 30 },
			{ status: 'pending', totalOdds: 2.4, chance: 41 },
			{ status: 'void', totalOdds: 2.0, chance: 50 },
		]);
		assert.deepEqual(s, { total: 5, won: 1, lost: 2, settled: 3, pending: 1, void: 1, hitRate: 33, avgOdds: 2.57, avgChance: 39 });
		assert.deepEqual(customSummary([]), {
			total: 0,
			won: 0,
			lost: 0,
			settled: 0,
			pending: 0,
			void: 0,
			hitRate: null,
			avgOdds: null,
			avgChance: null,
		});
	});

	test('ten sam zestaw (mecz i selekcja) niezależnie od kolejności', () => {
		const a = [{ fixtureId: '1', key: 'home' }, { fixtureId: '2', key: 'X2' }];
		assert.equal(sameLegs(a, [...a].reverse()), true);
		assert.equal(sameLegs(a, [{ fixtureId: '1', key: 'home' }, { fixtureId: '2', key: '1X' }]), false);
		assert.equal(sameLegs([], []), false);
	});
});

describe('publiczny bilans bez kuponów z kreatora', () => {
	test('dorobek kuponów: tylko rodzaje publiczne, `custom` nie dolicza się nigdzie', () => {
		const rows = [
			{ type: 'daily', status: 'won' },
			{ type: 'daily', status: 'lost' },
			{ type: 'custom', status: 'won' },
			{ type: 'custom', status: 'won' },
			{ type: 'days3', status: 'pending' },
		];
		const r = couponRecordFrom(rows);
		assert.deepEqual(Object.keys(r), PUBLIC_COUPON_TYPES);
		assert.equal(r.custom, undefined);
		assert.deepEqual(r.daily, { won: 1, total: 2 });
		assert.deepEqual(r.days3, { won: 0, total: 0 });
		assert.ok(!PUBLIC_COUPON_TYPES.includes('custom'));
	});

	test('lista meczów: noga kuponu z kreatora nie daje znacznika ani selekcji z zapisu', () => {
		const { present, fixtureIds } = hintPresenter({
			full: true,
			couponLegs: [{ type: 'custom', fixtureId: '7', key: '1X', selection: 'zapis 1X', probability: 87, base: 69 }],
		});
		assert.deepEqual(fixtureIds, []);
		const biezaca = { key: 'home', label: '1', selection: 'bieżąca', probability: 62, base: 45, lift: 17 };
		assert.deepEqual(present('7', biezaca), biezaca);
	});
});

describe('teksty kreatora', () => {
	for (const locale of ['pl', 'en']) {
		test(`${locale}: uczciwie o kursie i szansie, 18+, bez zachęt do gry`, () => {
			const c = couponBuilderContent(locale);
			assert.match(c.honest, /18\+/);
			assert.match(c.honest, locale === 'en' ? /not a sure thing/ : /nie pewniak/);
			assert.match(c.honest, locale === 'en' ? /median of several bookmakers/ : /mediana kilku bukmacherów/);
			assert.match(c.honest, /12%/);
			assert.match(c.honest, locale === 'en' ? /Higher odds mean a lower chance/ : /Wyższy kurs to mniejsza szansa/);
			assert.match(c.honest, locale === 'en' ? /public accuracy/ : /publicznej skuteczności/);
			const wszystko = JSON.stringify(c).toLowerCase();
			for (const slowo of ['zarob', 'gwarant', 'obstaw', 'wygrasz', 'pewniak!', 'guarantee', 'win big', 'place a bet']) {
				assert.ok(!wszystko.includes(slowo), slowo);
			}
			assert.equal(c.oddsOptions.length, CUSTOM_ODDS.length);
			assert.ok(c.oddsOptions.every((x) => x.label && x.range));
		});
	}
});
