import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Tryb cienia „typy modelu przy kursie ≥ 1,50".
 *
 * Część czysta: kursy z odpowiedzi dostawcy, rozliczenie selekcji, reguły i bilans — te same
 * funkcje liczą archiwum i żywe dane, więc błąd tutaj przekłamałby oba pomiary naraz.
 * Plakietka odtwarzana dla archiwum musi być DOKŁADNIE produkcyjną (`evaluateMarkets` + `bestHint`).
 *
 * Część z bazą: zadanie zdejmuje kursy tylko w swoich oknach, nie pyta drugi raz i zapisuje
 * brak kursów, żeby nie pytać w kółko. Na dokumentach w 2099 roku — w tym oknie nie ma
 * prawdziwych meczów, więc test nie dotknie produkcyjnego dziennika.
 */

setupEnv();

const {
	oddsSnapshot, doubleChanceFrom1x2, settleSelection, hintFromMarkets, betFor, summarize, PL_TAX,
} = await import('@/lib/model/oddsShadow');
const { normalizeOddsFixture } = await import('@/lib/football/normalize');
const { evaluateMarkets } = await import('@/lib/reports/service');
const { bestHint } = await import('@/lib/model/hints');
const { predictMarkets } = await import('@/lib/model/dixonColes');

/** Odpowiedź `odds?fixture=` w kształcie dostawcy: trzech bukmacherów, mediana to środkowy. */
function odpowiedz() {
	const bet = (name, values) => ({ name, values: values.map(([value, odd]) => ({ value, odd: String(odd) })) });
	const bukmacher = (id, k) => ({
		id,
		name: `B${id}`,
		bets: [
			bet('Match Winner', [['Home', 1.8 + k], ['Draw', 3.6], ['Away', 4.5]]),
			bet('Double Chance', [['Home/Draw', 1.22 + k], ['Draw/Away', 2.0], ['Home/Away', 1.3]]),
			bet('Goals Over/Under', [['Over 2.5', 1.9], ['Under 2.5', 1.9]]),
			bet('Total - Away', [['Over 0.5', 1.45], ['Under 0.5', 2.6]]),
			bet('Home Team Score a Goal', [['Yes', 1.2], ['No', 4.2]]),
		],
	});
	return {
		fixture: { id: 7, date: '2026-10-01T18:00:00+00:00' },
		league: { id: 39, name: 'Premier League', country: 'England' },
		bookmakers: [bukmacher(1, 0), bukmacher(2, 0.1), bukmacher(3, 0.3)],
	};
}

describe('kursy z odpowiedzi dostawcy', () => {
	test('mediana bukmacherów per selekcja, z podwójną szansą i golami drużyn', () => {
		const s = oddsSnapshot(normalizeOddsFixture(odpowiedz()), new Date('2026-10-01T07:00:00Z'));
		assert.equal(s.bookmakers, 3);
		assert.equal(s.home, 1.9);
		assert.equal(s.draw, 3.6);
		assert.equal(s.dc1X, 1.32);
		assert.equal(s.dcX2, 2);
		assert.equal(s.over25, 1.9);
		assert.equal(s.awayScores, 1.45);
		// „Gospodarz strzeli" tylko jako tak/nie — też się liczy.
		assert.equal(s.homeScores, 1.2);
	});

	test('brak kursów to null, nie zdjęcie z samymi pustkami', () => {
		assert.equal(oddsSnapshot(null), null);
		assert.equal(oddsSnapshot(normalizeOddsFixture({ fixture: { id: 1 }, bookmakers: [] })), null);
	});

	test('podwójna szansa z 1X2 dla archiwów: 1 / (1/kurs1 + 1/kursX)', () => {
		const dc = doubleChanceFrom1x2({ home: 2.0, draw: 4.0, away: 4.0 });
		assert.equal(dc.dc1X, 1.333);
		assert.equal(dc.dcX2, 2);
	});
});

describe('rozliczenie selekcji', () => {
	test('każda selekcja po wyniku z 90 minut', () => {
		const przy = (h, a) => Object.fromEntries(
			['home', 'draw', 'away', 'dc1X', 'dcX2', 'homeScores', 'awayScores', 'over25'].map((k) => [k, settleSelection(k, h, a)])
		);
		assert.deepEqual(przy(2, 1), { home: true, draw: false, away: false, dc1X: true, dcX2: false, homeScores: true, awayScores: true, over25: true });
		assert.deepEqual(przy(0, 0), { home: false, draw: true, away: false, dc1X: true, dcX2: true, homeScores: false, awayScores: false, over25: false });
		assert.equal(settleSelection('home', null, 1), null);
	});
});

describe('plakietka dla archiwum = plakietka z produkcji', () => {
	test('na 400 prognozach Dixona-Colesa ten sam typ, procent i przewaga', () => {
		let zgodne = 0;
		let zPlakietka = 0;
		for (let i = 0; i < 400; i += 1) {
			// Deterministyczny rozrzut średnich bramkowych: od wyraźnego gościa po wyraźnego gospodarza.
			const lh = 0.4 + ((i * 37) % 100) / 40;
			const la = 0.3 + ((i * 53) % 100) / 45;
			const r = predictMarkets(lh, la);
			const modelPrediction = {
				matchWinner: r.matchWinner,
				doubleChance: r.doubleChance,
				teamGoals: { home: { over: r.teamGoals.home[0.5].over }, away: { over: r.teamGoals.away[0.5].over } },
				known: true,
			};
			const produkcja = bestHint(evaluateMarkets({ modelPrediction, homeName: 'A', awayName: 'B' }));
			const archiwum = hintFromMarkets({
				home: r.matchWinner.home,
				away: r.matchWinner.away,
				dc1X: r.doubleChance['1X'],
				dcX2: r.doubleChance.X2,
				homeScores: r.teamGoals.home[0.5].over,
				awayScores: r.teamGoals.away[0.5].over,
			});
			if (produkcja) zPlakietka += 1;
			if (
				(produkcja === null && archiwum === null) ||
				(produkcja && archiwum && produkcja.key === archiwum.key && produkcja.probability === archiwum.probability && produkcja.lift === archiwum.lift)
			) {
				zgodne += 1;
			}
		}
		assert.equal(zgodne, 400);
		assert.ok(zPlakietka > 50 && zPlakietka < 400, `test musi mieć i mecze z plakietką, i bez (${zPlakietka})`);
	});
});

describe('reguły i bilans', () => {
	const rekord = (odds, { hint = 'home', result = { home: 2, away: 0 } } = {}) => ({
		markets: { home: 0.62, draw: 0.22, away: 0.16, dc1X: 0.84, dcX2: 0.38, homeScores: 0.85, awayScores: 0.55, over25: 0.5 },
		hint: { key: hint },
		odds: { open: odds, close: { ...odds, home: 1.6 } },
		result,
	});

	test('plakietka tylko przy kursie ≥ 1,50', () => {
		assert.equal(betFor(rekord({ home: 1.45 }), 'hint'), null);
		const b = betFor(rekord({ home: 1.7 }), 'hint');
		assert.deepEqual(b, { selection: 'home', p: 0.62, odds: 1.7, closeOdds: 1.6, won: true });
		// Klucz plakietki „X2" to selekcja `dcX2` w dzienniku.
		assert.equal(betFor(rekord({ dcX2: 2.2 }, { hint: 'X2' }), 'hint').selection, 'dcX2');
		assert.equal(betFor({ ...rekord({ home: 1.7 }), odds: {} }, 'hint'), null);
	});

	test('reguła wartości bierze największą wartość wg modelu, nie najwyższy kurs', () => {
		// home: 0,62 × 1,8 = 1,116 (+11,6%); away: 0,16 × 6 = 0,96; over25: 0,5 × 2,1 = 1,05.
		const odds = { home: 1.8, away: 6.0, over25: 2.1, draw: 3.5 };
		assert.equal(betFor(rekord(odds), 'edge5').selection, 'home');
		assert.equal(betFor(rekord(odds), 'edge20'), null);
	});

	test('zwrot, podatek 12% i CLV liczone po stałej stawce', () => {
		const s = summarize([
			{ p: 0.6, odds: 2.0, closeOdds: 1.8, won: true },
			{ p: 0.6, odds: 2.0, closeOdds: 2.2, won: false },
			{ p: 0.6, odds: 2.0, closeOdds: null, won: null }, // nierozliczony — poza bilansem
		]);
		assert.equal(s.n, 2);
		assert.equal(s.hitRate, 0.5);
		assert.equal(s.roi, 0);
		assert.ok(Math.abs(s.roiTaxed - (2 * (1 - PL_TAX) - 2) / 2) < 1e-12);
		assert.equal(s.clvN, 2);
		assert.equal(s.clvShare, 0.5);
		assert.ok(Math.abs(s.clv - (2 / 1.8 - 1 + 2 / 2.2 - 1) / 2) < 1e-12);
		assert.deepEqual(summarize([]), { n: 0 });
	});
});

describe('zadanie: kursy do dziennika prognoz', async () => {
	await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });
	const ModelForecast = (await import('@/models/ModelForecast')).default;
	const { snapshotOdds, openWindowEnd } = await import('@/lib/model/oddsShadowJob');

	const TERAZ = new Date('2099-03-10T08:10:00Z'); // 9:10 w Warszawie (zima)
	const PREFIX = `test-odds-${crypto.randomBytes(4).toString('hex')}`;
	const za = (min) => new Date(TERAZ.getTime() + min * 60_000);
	const mecz = (n, kickoff, extra = {}) => ({
		fixtureId: `${PREFIX}-${n}`,
		leagueId: 39,
		homeId: 1,
		awayId: 2,
		kickoff,
		forecastAt: TERAZ,
		markets: { home: 0.6 },
		...extra,
	});

	after(async () => {
		await ModelForecast.deleteMany({ fixtureId: { $regex: `^${PREFIX}-` } });
		await mongoose.disconnect();
	});

	test('okno otwarcia kończy się o 9:00 następnego dnia czasu polskiego', () => {
		assert.equal(openWindowEnd(TERAZ).toISOString(), '2099-03-11T08:00:00.000Z');
		assert.equal(openWindowEnd(new Date('2099-03-10T07:30:00Z')).toISOString(), '2099-03-10T08:00:00.000Z');
	});

	test('otwarcie i zamknięcie w swoich oknach, raz, a brak kursów zapisany', async () => {
		await ModelForecast.insertMany([
			mecz('zamkniecie', za(20)),
			mecz('otwarcie', za(180)),
			mecz('za-wczesnie', za(45)), // za blisko na otwarcie, za daleko na zamknięcie
			mecz('jutro-noc', za(60 * 20)), // 5:10 następnego dnia — jeszcze w oknie otwarcia
			mecz('pojutrze', za(60 * 30)), // po 9:00 następnego dnia — jeszcze nie
			mecz('bez-kursow', za(240)),
		]);
		const pytania = [];
		const fetchOdds = async (fixtureId) => {
			pytania.push(fixtureId.replace(`${PREFIX}-`, ''));
			return fixtureId.endsWith('bez-kursow') ? null : { at: TERAZ, bookmakers: 5, home: 1.7 };
		};

		const pierwszy = await snapshotOdds({ now: TERAZ, fetchOdds });
		assert.deepEqual(pytania.sort(), ['bez-kursow', 'jutro-noc', 'otwarcie', 'zamkniecie']);
		assert.deepEqual(pierwszy, { open: 3, close: 1, empty: 1, failed: 0 });

		const docs = Object.fromEntries(
			(await ModelForecast.find({ fixtureId: { $regex: `^${PREFIX}-` } }).lean()).map((d) => [d.fixtureId.replace(`${PREFIX}-`, ''), d])
		);
		assert.equal(docs.zamkniecie.odds.close.home, 1.7);
		assert.equal(docs.zamkniecie.odds.open ?? null, null);
		assert.equal(docs.otwarcie.odds.open.bookmakers, 5);
		assert.equal(docs['bez-kursow'].odds.open.bookmakers, 0);
		assert.equal(docs['za-wczesnie'].odds?.open ?? null, null);

		// Drugi przebieg w tej samej chwili nie pyta o nic.
		pytania.length = 0;
		const drugi = await snapshotOdds({ now: TERAZ, fetchOdds });
		assert.deepEqual(pytania, []);
		assert.deepEqual(drugi, { open: 0, close: 0, empty: 0, failed: 0 });
	});

	test('błąd dostawcy nie zapisuje niczego — następny przebieg spróbuje znowu', async () => {
		await ModelForecast.create(mecz('blad', za(300)));
		const wynik = await snapshotOdds({
			now: TERAZ,
			fetchOdds: async () => {
				throw new Error('429');
			},
		});
		assert.equal(wynik.failed, 1);
		const doc = await ModelForecast.findOne({ fixtureId: `${PREFIX}-blad` }).lean();
		assert.equal(doc.odds?.open ?? null, null);
	});
});
