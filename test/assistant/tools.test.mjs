import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Wykonawcy narzędzi asystenta (`lib/assistant/tools.js`) na podstawionych źródłach.
 *
 * Pilnujemy tego, czego zabrakło w prawdziwej rozmowie („daj 3 mecze z live i typy" → „nie mam
 * danych live"): na żywo z minutą, wynikiem, kursem live, szansą rynku i wyliczeniem ze źródłem,
 * uczciwe „nic" z liczbą sprawdzonych meczów, plan bez liczb → pole `dostep` bez uruchamiania
 * liczenia. Analiza: gotowa za darmo, nowa dopiero na wyraźną prośbę i z tym samym limitem co
 * strona meczu. Raporty, typ dnia, katalog funkcji z dostępem użytkownika, jego ulubione i typy.
 *
 * ŹRÓDŁA PODSTAWIONE (`makeExecutor({ zrodla })`): żadnego zapytania do API piłkarskiego, żadnego
 * modelu AI. Raporty, ulubione i typy idą przez PRAWDZIWĄ bazę (to ona jest tu logiką: filtr po
 * właścicielu, wariant, kolejność) — na losowym koncie, z meczami w 2099 roku, ze sprzątaniem.
 * Typy w bazie są „czekające" albo „anulowane", więc przez chwilę testu nie liczą się do żadnej
 * publicznej statystyki ani rankingu.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const { TOOLS, makeExecutor } = await import('@/lib/assistant/tools');
const { assistantSystemPrompt, ASSISTANT_PROMPT_VERSION } = await import('@/lib/ai/prompts/assistant');
const { TOOLS: KAFELKI } = await import('@/lib/tools/content');
const Report = (await import('@/models/Report')).default;
const Pick = (await import('@/models/Pick')).default;
const FavoriteMatch = (await import('@/models/FavoriteMatch')).default;

const PREFIX = `9${crypto.randomInt(10_000_000, 99_999_999)}`;
const USER_ID = new mongoose.Types.ObjectId();

after(async () => {
	await Report.deleteMany({ userId: USER_ID });
	await FavoriteMatch.deleteMany({ userId: USER_ID });
	await Pick.deleteMany({ $or: [{ userId: USER_ID }, { fixtureId: { $regex: `^${PREFIX}` } }] });
	await mongoose.disconnect();
});

const DAWNO = new Date('2020-01-01T00:00:00Z');
const PRO = { plan: 'pro', planStatus: 'active', planValidUntil: new Date('2099-01-01T00:00:00Z'), createdAt: DAWNO, credits: 0 };
const DARMOWY = { plan: 'free', createdAt: DAWNO, credits: 0 };
const NA_PROBIE = { plan: 'free', createdAt: new Date(), credits: 0 };

/** Limit podstawiony zamiast Redisa — `checkQuota` tylko czyta, tu podajemy, co „przeczytał". */
const limit = (over = {}) => async ({ kind }) => ({
	allowed: true,
	limit: kind === 'report' ? 12 : 5,
	used: 2,
	remaining: kind === 'report' ? 10 : 3,
	plan: 'pro',
	credits: 0,
	creditCost: 1,
	usingCredit: false,
	...over,
});

/**
 * Wszystkie źródła wykonawcy (`ZRODLA` w `lib/assistant/tools.js`). Niepodstawione rzucają —
 * zapomniana atrapa ma wywrócić test, a nie po cichu zapytać prawdziwe API albo model AI.
 */
const ZRODLA = ['liveCoupon', 'peekLiveCoupon', 'liveMatchesNow', 'liveMatch', 'dailyOverview', 'checkQuota', 'fixture', 'readAnalysis', 'prepareAnalysis', 'generateAnalysis'];
const niepodstawione = Object.fromEntries(
	ZRODLA.map((nazwa) => [
		nazwa,
		() => {
			throw new Error(`źródło ${nazwa} niepodstawione w teście`);
		},
	])
);

/** Wykonawca z licznikami wywołań źródeł — test sprawdza też, czego NIE zawołano. */
function wykonawca({ user = PRO, userId = USER_ID, language = 'pl', zrodla = {} } = {}) {
	const wolania = {};
	const owiniete = Object.fromEntries(
		Object.entries({ ...niepodstawione, checkQuota: limit(), ...zrodla }).map(([nazwa, fn]) => [
			nazwa,
			(...args) => {
				(wolania[nazwa] ||= []).push(args);
				return fn(...args);
			},
		])
	);
	const exec = makeExecutor({ userId, user, language, zrodla: owiniete });
	return { wolania, uruchom: async (name, input = {}) => JSON.parse(await exec(name, input)) };
}

/* ------------------------------------------------------------------------------------------ */

/** Typ z `top` generatora live — kształt z `liveResult`. */
const typLive = (id, over = {}) => ({
	fixtureId: String(id),
	homeName: `Gospodarz ${id}`,
	awayName: `Gość ${id}`,
	league: 'Serie B, Italy',
	leagueId: 136,
	kickoff: new Date('2099-01-01T17:00:00Z'),
	minute: 62,
	liveScore: '1:0',
	key: 'home',
	label: '1',
	selection: `Gospodarz ${id} wygra`,
	odds: 1.25,
	market: 80,
	model: 83,
	probability: 83,
	source: 'model',
	why: 'Gospodarze 11–3 w strzałach, xG 1,6–0,3.',
	...over,
});

const wynikLive = (over = {}) => ({
	generatedAt: '2099-01-01T18:03:00.000Z',
	analyzed: 14,
	withOdds: 11,
	modelMatches: 3,
	shortlisted: 6,
	aiChecked: true,
	mode: 'coupon',
	coupon: { legs: [typLive(1), typLive(2)], totalOdds: 2.05, chance: 64 },
	single: null,
	top: [typLive(1), typLive(2), typLive(3, { source: 'market', why: null }), typLive(4)],
	rejected: [{ match: 'A – B', selection: 'A wygra', reason: 'rywal ma serię okazji' }],
	...over,
});

/** Trwający mecz po `normalizeFixture`. */
const trwajacy = (id, leagueId, elapsed, code = '2H') => ({
	id,
	date: '2099-01-01T17:00:00+00:00',
	status: { code, elapsed, isLive: true },
	league: { id: leagueId, name: `Liga ${leagueId}`, country: 'Kraj' },
	teams: { home: { id: id * 10, name: `Dom ${id}` }, away: { id: id * 10 + 1, name: `Wyjazd ${id}` } },
	goals: { home: 2, away: 1 },
});

describe('na_zywo — trwające mecze i typy live', () => {
	test('plan z liczbami: minuta, wynik, kurs live, szansa rynku i wyliczenie ze źródłem, uzasadnienie, odnośnik', async () => {
		const { uruchom, wolania } = wykonawca({ zrodla: { liveCoupon: async () => wynikLive(), liveMatchesNow: async () => [] } });
		const w = await uruchom('na_zywo', { ile: 3 });

		assert.equal(w.typy.length, 3);
		const [pierwszy, , trzeci] = w.typy;
		assert.equal(pierwszy.mecz, 'Gospodarz 1 – Gość 1');
		assert.equal(pierwszy.minuta, 62);
		assert.equal(pierwszy.wynik, '1:0');
		assert.equal(pierwszy.kurs_live, 1.25);
		assert.equal(pierwszy.szansa_wg_rynku_pct, 80);
		assert.equal(pierwszy.szansa_wyliczona_pct, 83);
		assert.equal(pierwszy.zrodlo_wyliczenia, 'model');
		assert.match(pierwszy.uzasadnienie_ai, /11–3/);
		assert.equal(pierwszy.na_kuponie_live, true);
		assert.equal(pierwszy.link, '/pl/mecz/1');
		// Liga poza modelem — źródło nazwane wprost; bez AI — powiedziane, nie zmyślone.
		assert.match(trzeci.zrodlo_wyliczenia, /kursy sprzed meczu/);
		assert.match(trzeci.uzasadnienie_ai, /niedostępne/);
		assert.equal(trzeci.na_kuponie_live, undefined);

		assert.equal(w.pozostalych_przyjetych_typow, 1);
		assert.deepEqual(w.sprawdzono, {
			meczow_w_minutach_typowania: 14,
			z_kursami_live: 11,
			w_ligach_modelu: 3,
			kandydatow_ocenionych_przez_ai: 6,
			sprawdzenie_ai: 'tak',
		});
		assert.deepEqual(w.kupon_live, { kurs_laczny: 2.05, szansa_pct: 64, liczba_typow: 2 });
		assert.equal(w.odrzucone_przez_ai[0].powod, 'rywal ma serię okazji');
		assert.equal(w.wyliczono_o, '19:03');
		assert.match(w.zasady, /10–80/);
		assert.match(w.uwaga, /18\+/);
		assert.equal(w.link_generatora, '/pl/pilka-nozna/live');
		// Komplet typów — lista trwających meczów niepotrzebna, więc nie pytamy o nią.
		assert.equal(wolania.liveMatchesNow, undefined);
		assert.equal(w.dostep, undefined);
	});

	test('nic nie przechodzi zasad: uczciwe „nic" z liczbą sprawdzonych i trwającymi meczami (najpierw ligi modelu)', async () => {
		const { uruchom } = wykonawca({
			zrodla: {
				liveCoupon: async () => wynikLive({ mode: 'none', coupon: null, top: [], analyzed: 7, shortlisted: 2 }),
				// 999999 — liga spoza modelu; 39 (Premier League) — z modelu, więc idzie pierwsza.
				liveMatchesNow: async () => [trwajacy(5, 999999, 70), trwajacy(6, 39, 30), trwajacy(7, 999998, 45, 'HT')],
			},
		});
		const w = await uruchom('na_zywo', {});

		assert.deepEqual(w.typy, []);
		assert.match(w.brak, /ile meczów sprawdzono/);
		assert.equal(w.sprawdzono.meczow_w_minutach_typowania, 7);
		assert.equal(w.trwa_meczow, 3);
		assert.deepEqual(w.trwajace_mecze.map((m) => m.fixtureId), ['6', '5', '7']);
		assert.equal(w.trwajace_mecze[2].stan, 'przerwa');
		assert.equal(w.trwajace_mecze[0].wynik, '2:1');
		assert.equal(w.kupon_live, undefined);
	});

	test('wynik sprzed listy `top` (pamięć procesu) — przynajmniej typy z kuponu', async () => {
		const { uruchom } = wykonawca({ zrodla: { liveCoupon: async () => wynikLive({ top: undefined }), liveMatchesNow: async () => [] } });
		const w = await uruchom('na_zywo', { ile: 3 });
		assert.deepEqual(w.typy.map((t) => t.fixtureId), ['1', '2']);
	});

	test('plan bez liczb: pole „dostep" z cennikiem, zapowiedź bez meczów, trwające mecze — i żadnego liczenia', async () => {
		const { uruchom, wolania } = wykonawca({
			user: DARMOWY,
			zrodla: {
				liveCoupon: async () => assert.fail('plan darmowy nie może uruchomić liczenia z AI'),
				peekLiveCoupon: () => wynikLive(),
				liveMatchesNow: async () => [trwajacy(8, 39, 50)],
			},
		});
		const w = await uruchom('na_zywo', { ile: 3 });

		assert.match(w.dostep, /Pro i VIP/);
		assert.match(w.dostep, /\/pl\/cennik/);
		assert.deepEqual(w.zapowiedz_bez_meczow, { co: 'kupon live', kurs: 2.05, szansa_pct: 64, liczba_typow: 2, z_godziny: '19:03' });
		assert.equal(w.typy, undefined);
		assert.equal(w.trwajace_mecze[0].mecz, 'Dom 8 – Wyjazd 8');
		assert.equal(wolania.liveCoupon, undefined);
		// Bez świeżego wyniku w pamięci — sam dostęp i lista, bez zapowiedzi.
		const pusto = await wykonawca({ user: DARMOWY, zrodla: { peekLiveCoupon: () => null, liveMatchesNow: async () => [] } }).uruchom('na_zywo');
		assert.equal(pusto.zapowiedz_bez_meczow, undefined);
	});

	test('okres próbny odkrywa typy live jak Pro (ta sama funkcja planu co kupon live)', async () => {
		const { uruchom } = wykonawca({ user: NA_PROBIE, zrodla: { liveCoupon: async () => wynikLive(), liveMatchesNow: async () => [] } });
		const w = await uruchom('na_zywo', { ile: 2 });
		assert.equal(w.typy.length, 2);
		assert.equal(w.dostep, undefined);
	});

	test('awaria źródła: błąd dla modelu z instrukcją, nie wyjątek', async () => {
		const { uruchom } = wykonawca({ zrodla: { liveCoupon: async () => { throw new Error('limit API'); } } });
		const w = await uruchom('na_zywo');
		assert.match(w.blad, /Chwilowy problem/);
		assert.ok(w.instrukcja_dla_asystenta);
	});
});

/* ------------------------------------------------------------------------------------------ */

/** Jeden mecz z `liveMatch` — tak jak oddaje go serwis. */
function meczLive({ chances = true } = {}) {
	const fixture = trwajacy(42, 39, 67);
	return {
		fixture,
		live: true,
		stats: [
			{ teamId: 420, stats: { 'Total Shots': 12, 'Shots on Goal': 5, 'Ball Possession': '61%', expected_goals: '1.84', 'Red Cards': null } },
			{ teamId: 421, stats: { 'Total Shots': 4, 'Shots on Goal': 1, 'Ball Possession': '39%', expected_goals: '0.41', 'Red Cards': 1 } },
		],
		events: [
			{ minute: 23, extra: null, teamId: 420, teamName: 'Dom 42', type: 'Goal', detail: 'Normal Goal', player: 'Nowak' },
			{ minute: 40, extra: null, teamId: 421, teamName: 'Wyjazd 42', type: 'subst', detail: 'Substitution 1', player: 'X' },
			{ minute: 45, extra: 2, teamId: 420, teamName: 'Dom 42', type: 'Goal', detail: 'Penalty', player: 'Kowal' },
			{ minute: 58, extra: null, teamId: 421, teamName: 'Wyjazd 42', type: 'Card', detail: 'Red Card', player: 'Lis' },
		],
		red: { home: 0, away: 1 },
		chances: chances
			? {
					source: 'model',
					hasOdds: true,
					inCouponWindow: true,
					markets: [
						{ key: 'home', selection: 'Dom 42 wygra', odds: 1.18, market: 85, model: 88, source: 'model', agrees: true, veto: false },
						{ key: 'X2', selection: 'Wyjazd 42 nie przegra', odds: 6.5, market: 15, model: 12, source: 'model', agrees: false, veto: true },
					],
				}
			: null,
	};
}

describe('mecz_na_zywo — jeden mecz w trakcie', () => {
	test('plan z liczbami: statystyki parami, gole i kartki z minutą, kursy live z szansą rynku i wyliczeniem', async () => {
		const { uruchom, wolania } = wykonawca({ zrodla: { liveMatch: async () => meczLive() } });
		const w = await uruchom('mecz_na_zywo', { fixtureId: '42' });

		assert.deepEqual(wolania.liveMatch[0], ['42', { chances: true }]);
		assert.equal(w.mecz, 'Dom 42 – Wyjazd 42');
		assert.equal(w.stan, 'w trakcie');
		assert.equal(w.minuta, 67);
		assert.equal(w.wynik, '2:1');
		assert.deepEqual(w.statystyki_gospodarze_goscie, { strzaly: '12–4', celne: '5–1', posiadanie: '61%–39%', xG: '1.84–0.41', czerwone_kartki: '?–1' });
		assert.deepEqual(w.zdarzenia, ["23' gol — Nowak (Dom 42)", "45+2' gol z karnego — Kowal (Dom 42)", "58' czerwona kartka — Lis (Wyjazd 42)"]);
		assert.deepEqual(w.czerwone_kartki, { gospodarze: 0, goscie: 1 });
		assert.equal(w.zrodlo_wyliczenia, 'model');
		assert.deepEqual(w.rynki[0], { typ: 'Dom 42 wygra', kurs_live: 1.18, szansa_wg_rynku_pct: 85, szansa_wyliczona_pct: 88, zgodne_z_rynkiem: true });
		assert.match(w.rynki[1].odpada, /czerwona kartka/);
		assert.match(w.uwaga, /18\+/);
		assert.equal(w.link, '/pl/mecz/42');
	});

	test('plan bez liczb: wynik i statystyki za darmo, kursów i szans nie liczymy wcale', async () => {
		const { uruchom, wolania } = wykonawca({ user: DARMOWY, zrodla: { liveMatch: async () => meczLive({ chances: false }) } });
		const w = await uruchom('mecz_na_zywo', { fixtureId: '42' });
		assert.deepEqual(wolania.liveMatch[0], ['42', { chances: false }]);
		assert.equal(w.statystyki_gospodarze_goscie.strzaly, '12–4');
		assert.match(w.kursy_i_szanse.dostep, /\/pl\/cennik/);
		assert.equal(w.rynki, undefined);
	});

	test('mecz, który nie trwa, i nieznany mecz', async () => {
		const przed = { ...trwajacy(43, 39, null), status: { code: 'NS', isLive: false, isFinished: false } };
		const { uruchom } = wykonawca({ zrodla: { liveMatch: async (id) => (id === '43' ? { fixture: przed, live: false } : null) } });
		const w = await uruchom('mecz_na_zywo', { fixtureId: '43' });
		assert.match(w.stan, /^przed meczem/);
		assert.match(w.uwaga, /nie trwa/);
		assert.match((await uruchom('mecz_na_zywo', { fixtureId: '44' })).blad, /Nie znam/);
		assert.match((await uruchom('mecz_na_zywo', { fixtureId: 'abc' })).blad, /identyfikator/);
	});
});

/* ------------------------------------------------------------------------------------------ */

const SEKCJE = {
	summary: 'Gospodarze w formie, goście bez kluczowego napastnika.',
	keyFactors: [{ title: 'Forma', detail: '4 wygrane z rzędu', favors: 'home' }],
	probabilities: { home: 58, draw: 24, away: 18 },
	picks: [{ market: 'Wynik meczu', selection: 'Gospodarze wygrają', probability: 58, confidence: 70, rationale: '…', baseRate: 45, lift: 13 }],
	risks: ['Rotacja składu przed pucharem'],
};

describe('analiza_meczu — gotowa za darmo, nowa na wyraźną prośbę', () => {
	test('gotowa analiza: streszczenie, czynniki, szanse, typy z przeciętną i przewagą — bez generowania', async () => {
		const { uruchom, wolania } = wykonawca({
			zrodla: {
				readAnalysis: async () => ({ status: 'cached', sections: SEKCJE, createdAt: new Date('2099-01-01T10:00:00Z') }),
				prepareAnalysis: async () => assert.fail('gotowej analizy nie generujemy'),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777' });
		assert.match(w.zrodlo, /limit nie został zużyty/);
		assert.equal(w.streszczenie, SEKCJE.summary);
		assert.deepEqual(w.czynniki, ['Forma: 4 wygrane z rzędu']);
		assert.deepEqual(w.szanse_pct, { gospodarz: 58, remis: 24, gosc: 18 });
		assert.deepEqual(w.typy, [{ typ: 'Wynik meczu: Gospodarze wygrają', prawdopodobienstwo_pct: 58, zwykle_pct: 45, przewaga_pkt: 13 }]);
		assert.deepEqual(w.ryzyka, ['Rotacja składu przed pucharem']);
		assert.equal(w.link, '/pl/mecz/777');
		assert.equal(wolania.prepareAnalysis, undefined);
	});

	test('brak gotowej: ile kosztuje nowa i prośba o zgodę — nic się nie generuje', async () => {
		const { uruchom, wolania } = wykonawca({
			zrodla: {
				readAnalysis: async () => null,
				fixture: async () => ({ id: 777, status: { isLive: false, isCancelled: false } }),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777' });
		assert.equal(w.analiza, null);
		assert.equal(w.mozna_wygenerowac, true);
		assert.equal(w.koszt, 'jedna analiza z limitu — zostało 3 z 5');
		assert.match(w.instrukcja_dla_asystenta, /wygeneruj: true dopiero po jego zgodzie/);
		assert.equal(wolania.prepareAnalysis, undefined);
		assert.equal(wolania.checkQuota[0][0].kind, 'analysis');
	});

	test('brak gotowej, mecz w trakcie, plan bez analizy live (także okres próbny) — nie proponujemy generowania', async () => {
		for (const user of [DARMOWY, NA_PROBIE]) {
			const { uruchom } = wykonawca({
				user,
				zrodla: { readAnalysis: async () => null, fixture: async () => ({ id: 777, status: { isLive: true } }) },
			});
			const w = await uruchom('analiza_meczu', { fixtureId: '777' });
			assert.equal(w.mozna_wygenerowac, false);
			assert.match(w.dostep, /Pro i VIP/);
			assert.match(w.dostep, /\/pl\/cennik/);
		}
	});

	test('brak gotowej, limit wykorzystany — nie proponujemy generowania', async () => {
		const { uruchom } = wykonawca({
			zrodla: {
				readAnalysis: async () => null,
				fixture: async () => ({ id: 777, status: {} }),
				checkQuota: limit({ allowed: false, used: 5, remaining: 0 }),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777' });
		assert.equal(w.mozna_wygenerowac, false);
		assert.match(w.dostep, /5 z 5/);
	});

	test('wygeneruj: ta sama droga co strona meczu, jedna analiza z limitu, blokada zwolniona', async () => {
		let zwolnione = 0;
		const { uruchom, wolania } = wykonawca({
			zrodla: {
				readAnalysis: async () => assert.fail('przy generowaniu gotową sprawdza prepareAnalysis'),
				prepareAnalysis: async () => ({
					status: 'ready',
					quota: { allowed: true, limit: 5, used: 2, remaining: 3, usingCredit: false },
					release: async () => {
						zwolnione += 1;
					},
				}),
				generateAnalysis: async () => ({ analysisText: '…', sections: SEKCJE }),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777', wygeneruj: true });
		assert.match(w.zrodlo, /nowa analiza/);
		assert.equal(w.zuzyto, 'jedną analizę z limitu');
		assert.equal(w.pozostalo_analiz, 2);
		assert.equal(w.typy[0].przewaga_pkt, 13);
		assert.equal(zwolnione, 1);
		assert.deepEqual(wolania.prepareAnalysis[0][0], { userId: USER_ID, fixtureId: '777', language: 'pl' });
		assert.deepEqual(wolania.generateAnalysis[0][1], { fixtureId: '777', language: 'pl' });
	});

	test('wygeneruj, ale analiza już istnieje — oddajemy gotową, limit nietknięty', async () => {
		const { uruchom, wolania } = wykonawca({
			zrodla: {
				prepareAnalysis: async () => ({ status: 'cached', sections: SEKCJE, analysis: '…' }),
				generateAnalysis: async () => assert.fail('nie generujemy drugi raz'),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777', wygeneruj: true });
		assert.match(w.zrodlo, /już istniała/);
		assert.equal(wolania.generateAnalysis, undefined);
	});

	test('wygeneruj zablokowane (limit, plan) — zdanie z serwisu i cennik, bez generowania', async () => {
		const { uruchom } = wykonawca({
			zrodla: {
				prepareAnalysis: async () => ({ status: 'blocked', code: 'limit_exceeded', message: 'Wykorzystałeś limit analiz.' }),
				generateAnalysis: async () => assert.fail('zablokowane nie generuje'),
			},
		});
		const w = await uruchom('analiza_meczu', { fixtureId: '777', wygeneruj: true });
		assert.equal(w.niedostepne, 'Wykorzystałeś limit analiz.');
		assert.equal(w.cennik, '/pl/cennik');
	});

	test('odmowa modelu — błąd dla użytkownika, blokada i tak zwolniona; limit odsłon gotowej analizy', async () => {
		let zwolnione = 0;
		const odmowa = Object.assign(new Error('refusal'), { name: 'AiRefusalError' });
		const { uruchom } = wykonawca({
			zrodla: {
				prepareAnalysis: async () => ({ status: 'ready', quota: { limit: 5, remaining: 3 }, release: async () => (zwolnione += 1) }),
				generateAnalysis: async () => {
					throw odmowa;
				},
				readAnalysis: async () => ({ status: 'blocked', code: 'view_limit_exceeded', message: 'Wykorzystałeś dzienny limit oglądania cudzych analiz (10).' }),
			},
		});
		assert.match((await uruchom('analiza_meczu', { fixtureId: '777', wygeneruj: true })).blad, /nie mógł przygotować/);
		assert.equal(zwolnione, 1);
		assert.match((await uruchom('analiza_meczu', { fixtureId: '777' })).niedostepne, /limit oglądania/);
	});
});

/* ------------------------------------------------------------------------------------------ */

describe('typ_dnia', () => {
	const typ = (over = {}) => ({
		date: '2099-01-01',
		fixtureId: `${PREFIX}1`,
		home: 'Lech',
		away: 'Legia',
		league: 'Ekstraklasa, Poland',
		kickoff: new Date('2099-01-01T17:30:00Z'),
		key: 'home',
		selection: 'Lech wygra',
		probability: 61,
		base: 44.6,
		lift: 16,
		explanation: { home: 61, draw: 22, away: 17, lambdaHome: 1.7, lambdaAway: 0.9, over25: 52 },
		status: 'pending',
		score: null,
		...over,
	});

	test('dzisiejszy, wczorajszy z wynikiem i bilans; odnośnik do strony typów', async () => {
		const { uruchom } = wykonawca({
			user: DARMOWY,
			zrodla: { dailyOverview: async () => ({ today: typ(), tomorrow: null, yesterday: typ({ status: 'won', score: '2:0' }), record: { won: 7, total: 11 } }) },
		});
		const w = await uruchom('typ_dnia');
		assert.equal(w.typ_dnia_dzis.mecz, 'Lech – Legia');
		assert.equal(w.typ_dnia_dzis.zwykle_pct, 45);
		assert.equal(w.typ_dnia_dzis.przewaga_pkt, 16);
		assert.deepEqual(w.typ_dnia_dzis.szanse_1x2_pct, { gospodarz: 61, remis: 22, gosc: 17 });
		assert.equal(w.typ_dnia_dzis.stan, 'czeka na wynik');
		assert.equal(w.wczorajszy.stan, 'trafiony');
		assert.equal(w.wczorajszy.wynik, '2:0');
		assert.equal(w.bilans, '7 z 11 rozliczonych trafionych');
		assert.equal(w.link, '/pl/typy-na-dzis');
	});

	test('dziś nic nie zostało — typ na jutro', async () => {
		const { uruchom } = wykonawca({ zrodla: { dailyOverview: async () => ({ today: null, tomorrow: typ(), yesterday: null, record: { won: 0, total: 0 } }) } });
		const w = await uruchom('typ_dnia');
		assert.match(w.typ_dnia_dzis, /jutro/);
		assert.equal(w.typ_dnia_jutro.typ, 'Lech wygra');
	});
});

/* ------------------------------------------------------------------------------------------ */

describe('raporty — ostatnie raporty użytkownika (prawdziwa baza)', () => {
	test('zwykły i „Wyższe kursy": typy, stan, odnośnik z wariantem; ile zostało; tylko raporty właściciela', async () => {
		const obcy = new mongoose.Types.ObjectId();
		const [starszy, zwykly, wyzsze] = await Report.create([
			{ userId: USER_ID, type: 'soon', variant: 'standard', language: 'pl', sections: { intro: 'stary', picks: [] }, createdAt: new Date('2099-01-01T08:00:00Z') },
			{
				userId: USER_ID,
				type: 'threeDays',
				variant: 'standard',
				language: 'pl',
				sections: {
					intro: 'Trzy mecze z wyraźną przewagą.',
					picks: [
						{ fixtureId: Number(`${PREFIX}2`), match: 'Lech vs Legia', league: 'Ekstraklasa', kickoffUtc: '2099-01-03T17:30:00.000Z', market: 'Wynik meczu', selection: 'Lech wygra', probability: 63, baseRate: 45, lift: 18 },
					],
				},
				createdAt: new Date('2099-01-02T08:00:00Z'),
			},
			{
				userId: USER_ID,
				type: 'soon',
				variant: 'value',
				language: 'pl',
				sections: {
					intro: 'Wyższe kursy.',
					picks: [{ fixtureId: Number(`${PREFIX}3`), key: 'away', match: 'Ajax vs PSV', league: 'Eredivisie', kickoffUtc: '2099-01-02T19:00:00.000Z', market: 'Wyższy kurs', selection: 'PSV wygra', odds: 2.12, marketProbability: 46, modelProbability: 49, probability: 46 }],
				},
				createdAt: new Date('2099-01-02T09:00:00Z'),
			},
			// Cudzy raport — nie może wyjść w odpowiedzi.
			{ userId: obcy, type: 'soon', variant: 'standard', language: 'pl', sections: { intro: 'cudzy', picks: [] }, createdAt: new Date('2099-02-01T08:00:00Z') },
		]);
		try {
			// Typ raportu w `Pick` (tak zapisuje go trasa generowania) — czekający, więc nigdzie się nie liczy.
			await Pick.create({ author: 'ai', kind: 'report', source: 'report', sourceId: zwykly._id, userId: USER_ID, fixtureId: `${PREFIX}2`, market: 'Wynik meczu', selection: 'Lech wygra', countsToStats: false, kickoff: new Date('2099-01-03T17:30:00Z'), status: 'pending' });

			const { uruchom } = wykonawca();
			const w = await uruchom('raporty');

			assert.equal(w.raport_zwykly.okno, 'najbliższe 3 dni');
			assert.equal(w.raport_zwykly.wstep, 'Trzy mecze z wyraźną przewagą.');
			assert.deepEqual(w.raport_zwykly.typy, [
				{ fixtureId: `${PREFIX}2`, mecz: 'Lech – Legia', liga: 'Ekstraklasa', kiedy: '2099-01-03 18:30', typ: 'Wynik meczu: Lech wygra', prawdopodobienstwo_pct: 63, zwykle_pct: 45, przewaga_pkt: 18, stan: 'czeka na wynik' },
			]);
			assert.equal(w.raport_zwykly.link, `/pl/pilka-nozna/ai-agent?variant=standard&report=${zwykly._id}`);
			assert.deepEqual(w.raport_wyzsze_kursy.typy[0], {
				fixtureId: `${PREFIX}3`,
				mecz: 'Ajax – PSV',
				liga: 'Eredivisie',
				kiedy: '2099-01-02 20:00',
				typ: 'PSV wygra',
				kurs: 2.12,
				szansa_wg_rynku_pct: 46,
				szansa_wg_modelu_pct: 49,
			});
			assert.equal(w.raport_wyzsze_kursy.link, `/pl/pilka-nozna/ai-agent?variant=value&report=${wyzsze._id}`);
			assert.equal(w.generowanie.zostalo_raportow, 10);
			assert.equal(w.generowanie.link_wyzsze_kursy, '/pl/pilka-nozna/ai-agent?variant=value');
			assert.match(w.generowanie.zasada, /nie generuje/);
			assert.doesNotMatch(JSON.stringify(w), /cudzy|stary/);
		} finally {
			await Report.deleteMany({ _id: { $in: [starszy._id, zwykly._id, wyzsze._id] } });
			await Report.deleteMany({ userId: obcy });
		}
	});

	test('plan bez raportów i konto bez raportów: „brak" i dostęp z cennikiem', async () => {
		const { uruchom } = wykonawca({ user: DARMOWY, userId: new mongoose.Types.ObjectId(), zrodla: { checkQuota: limit({ allowed: false, limit: 0, remaining: 0 }) } });
		const w = await uruchom('raporty');
		assert.match(w.raport_zwykly, /^brak/);
		assert.match(w.raport_wyzsze_kursy, /^brak/);
		assert.match(w.generowanie.dostep, /Pro i VIP/);
		assert.match(w.generowanie.dostep, /\/pl\/cennik/);
		assert.equal(w.generowanie.link_raport, undefined);
	});
});

/* ------------------------------------------------------------------------------------------ */

describe('funkcje_aplikacji — katalog z dostępem tego użytkownika', () => {
	const nazwa = (id) => KAFELKI.find((t) => t.id === id).pl.name;
	const funkcja = (w, id) => w.funkcje.find((f) => f.nazwa === nazwa(id));

	test('plan darmowy: co za darmo, co częściowo, co płatne — z dopiskiem dostępu i odnośnikami z językiem', async () => {
		const { uruchom } = wykonawca({ user: DARMOWY });
		const w = await uruchom('funkcje_aplikacji');

		assert.equal(w.funkcje.length, KAFELKI.length);
		assert.equal(w.twoj_plan.plan, 'darmowy');
		assert.equal(w.twoj_plan.okres_probny, undefined);
		assert.equal(w.twoj_plan.limity['analizy meczów'], 'zostało 3 z 5');
		assert.equal(funkcja(w, 'typ-dnia').dla_ciebie, 'tak');
		assert.equal(funkcja(w, 'typ-dnia').szczegoly_dostepu, undefined);
		assert.equal(funkcja(w, 'kupon-live').dla_ciebie, 'nie — w planie Pro i VIP');
		assert.ok(funkcja(w, 'kupon-live').szczegoly_dostepu);
		assert.match(funkcja(w, 'mecze').dla_ciebie, /^częściowo/);
		assert.equal(funkcja(w, 'analiza').dla_ciebie, 'tak — zostało 3 z 5');
		assert.equal(funkcja(w, 'kupon-live').link, '/pl/pilka-nozna/live');
		assert.equal(funkcja(w, 'poranny-mail').gdzie, 'w panelu konta — ikona konta w nagłówku strony');
		assert.equal(w.cennik, '/pl/cennik');
		for (const f of w.funkcje) assert.match(f.link, /^\/pl\//);
	});

	test('Pro: kupon live i analiza live odkryte; okres próbny: kupon live tak, analiza live nie', async () => {
		const pro = await wykonawca({ user: PRO }).uruchom('funkcje_aplikacji');
		assert.equal(pro.twoj_plan.plan, 'Pro');
		assert.equal(pro.twoj_plan.wazny_do, '2099-01-01');
		assert.equal(funkcja(pro, 'kupon-live').dla_ciebie, 'tak');
		assert.equal(funkcja(pro, 'analiza-live').dla_ciebie, 'tak');

		const proba = await wykonawca({ user: NA_PROBIE }).uruchom('funkcje_aplikacji');
		assert.equal(proba.twoj_plan.okres_probny.zostalo_dni, 7);
		assert.equal(funkcja(proba, 'kupon-live').dla_ciebie, 'tak');
		assert.match(funkcja(proba, 'analiza-live').dla_ciebie, /^nie/);
	});

	test('szukaj zawęża listę; bez dopasowań — cała lista z informacją', async () => {
		const { uruchom } = wykonawca();
		const kupony = await uruchom('funkcje_aplikacji', { szukaj: 'kupon' });
		assert.ok(kupony.funkcje.length >= 2 && kupony.funkcje.length < KAFELKI.length);
		assert.ok(kupony.funkcje.some((f) => f.nazwa === nazwa('kupon-live')));
		const nic = await uruchom('funkcje_aplikacji', { szukaj: 'zzz-nie-ma-takiej' });
		assert.match(nic.brak_dopasowan, /wszystkie/);
		assert.equal(nic.funkcje.length, KAFELKI.length);
	});
});

/* ------------------------------------------------------------------------------------------ */

describe('moje_mecze_i_typy (prawdziwa baza)', () => {
	test('ulubione: nadchodzące i trwające osobno od minionych; typy czekające i rozliczone; tylko własne', async () => {
		const teraz = Date.now();
		await FavoriteMatch.create([
			{ userId: USER_ID, fixtureId: `${PREFIX}10`, homeName: 'Arsenal', awayName: 'Chelsea', leagueName: 'Premier League', country: 'England', kickoff: new Date('2099-01-05T15:00:00Z') },
			{ userId: USER_ID, fixtureId: `${PREFIX}11`, homeName: 'Inter', awayName: 'Milan', leagueName: 'Serie A', kickoff: new Date(teraz - 30 * 60_000) },
			{ userId: USER_ID, fixtureId: `${PREFIX}12`, homeName: 'Ajax', awayName: 'PSV', kickoff: new Date(teraz - 3 * 86_400_000) },
		]);
		await Pick.create([
			{ author: 'user', kind: 'prematch', source: 'user', userId: USER_ID, fixtureId: `${PREFIX}10`, homeName: 'Arsenal', awayName: 'Chelsea', market: 'Wynik meczu', selection: 'Arsenal wygra', kickoff: new Date('2099-01-05T15:00:00Z'), status: 'pending' },
			{ author: 'user', kind: 'round', source: 'round', userId: USER_ID, fixtureId: `${PREFIX}12`, homeName: 'Ajax', awayName: 'PSV', market: 'Wynik meczu', selection: 'Remis', kickoff: new Date('2099-01-01T15:00:00Z'), status: 'void' },
			// Cudzy typ na ten sam mecz — nie może wyjść w odpowiedzi.
			{ author: 'user', kind: 'prematch', source: 'user', userId: new mongoose.Types.ObjectId(), fixtureId: `${PREFIX}10`, homeName: 'Arsenal', awayName: 'Chelsea', market: 'Wynik meczu', selection: 'Chelsea wygra', kickoff: new Date('2099-01-05T15:00:00Z'), status: 'pending' },
		]);

		const w = await wykonawca().uruchom('moje_mecze_i_typy');
		assert.deepEqual(w.ulubione_nadchodzace_i_trwajace.map((m) => m.fixtureId), [`${PREFIX}11`, `${PREFIX}10`]);
		assert.match(w.ulubione_nadchodzace_i_trwajace[0].moze_trwac, /mecz_na_zywo/);
		assert.equal(w.ulubione_nadchodzace_i_trwajace[1].liga, 'Premier League, England');
		assert.equal(w.ulubione_nadchodzace_i_trwajace[1].moze_trwac, undefined);
		assert.deepEqual(w.ulubione_ostatnie.map((m) => m.fixtureId), [`${PREFIX}12`]);
		assert.deepEqual(w.moje_typy_czekajace.map((t) => [t.typ, t.stan]), [['Wynik meczu: Arsenal wygra', 'czeka na wynik']]);
		assert.deepEqual(w.moje_typy_ostatnio_rozliczone.map((t) => [t.stan, t.kolejka]), [['anulowany', true]]);
		assert.equal(w.moje_typy_czekajace[0].link, `/pl/mecz/${PREFIX}10`);
		assert.doesNotMatch(JSON.stringify(w), /Chelsea wygra/);
	});

	test('konto bez ulubionych i typów', async () => {
		const w = await wykonawca({ userId: new mongoose.Types.ObjectId() }).uruchom('moje_mecze_i_typy');
		assert.match(w.ulubione_nadchodzace_i_trwajace, /gwiazdką/);
		assert.equal(w.moje_typy_czekajace, 'brak');
	});
});

/* ------------------------------------------------------------------------------------------ */

describe('definicje narzędzi i prompt assistant/4', () => {
	const NOWE = ['na_zywo', 'mecz_na_zywo', 'analiza_meczu', 'typ_dnia', 'raporty', 'funkcje_aplikacji', 'moje_mecze_i_typy'];

	test('nowe narzędzia mają definicję (wykonawców sprawdzają testy wyżej); gotowa_analiza zastąpiona', async () => {
		const nazwy = TOOLS.map((t) => t.name);
		assert.equal(new Set(nazwy).size, nazwy.length);
		for (const n of NOWE) assert.ok(nazwy.includes(n), `brak definicji ${n}`);
		assert.ok(!nazwy.includes('gotowa_analiza'));
		for (const t of TOOLS) assert.equal(t.input_schema?.type, 'object', `${t.name}: schemat wejścia`);
		const { uruchom } = wykonawca();
		assert.match((await uruchom('nie_ma_takiego')).blad, /Nieznane narzędzie/);
		// Walidacja identyfikatora, zanim cokolwiek pójdzie do źródeł.
		assert.match((await uruchom('analiza_meczu', { fixtureId: '1; drop' })).blad, /identyfikator/);
	});

	test('lista źródeł w teście zgadza się z kodem — nowe źródło bez atrapy nie przejdzie niezauważone', () => {
		const kod = readFileSync(new URL('../../lib/assistant/tools.js', import.meta.url), 'utf8');
		const blok = kod.slice(kod.indexOf('const ZRODLA = {'), kod.indexOf('\n};', kod.indexOf('const ZRODLA = {')));
		const wKodzie = [...blok.matchAll(/^\t(\w+)[,:]/gm)].map((m) => m[1]);
		assert.deepEqual([...wKodzie].sort(), [...ZRODLA].sort());
	});

	test('prompt w obu językach zna wszystkie narzędzia i nowe zasady', () => {
		assert.equal(ASSISTANT_PROMPT_VERSION, 'assistant/4');
		const pl = assistantSystemPrompt({ language: 'pl', locale: 'pl', today: '2099-01-01' });
		const en = assistantSystemPrompt({ language: 'en', locale: 'en', today: '2099-01-01' });
		for (const prompt of [pl, en]) {
			for (const t of TOOLS) assert.ok(prompt.includes(t.name), `prompt nie zna ${t.name}`);
			assert.doesNotMatch(prompt, /gotowa_analiza/);
			assert.match(prompt, /18\+/);
			assert.match(prompt, /wygeneruj: true/);
			assert.match(prompt, /"dostep"/);
		}
		assert.match(pl, /nigdy nie mów, że ich nie masz/);
		assert.match(pl, /ile meczów sprawdzono/);
		assert.match(pl, /To szacunki, nie pewniaki/);
		assert.match(en, /never say you don't/);
		assert.match(en, /how many matches were checked/);
		assert.match(en, /\[Pricing\]\(\/en\/cennik\)/);
	});
});
