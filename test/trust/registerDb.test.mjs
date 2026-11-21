import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Rejestr typów na prawdziwej bazie: zdjęcia kursów w przebiegu, odczyt rejestru i trasa API.
 *
 * Dokumenty mają mecze w 2099 roku i losowy przedrostek identyfikatora — w tym oknie nie ma
 * prawdziwych meczów, więc zadanie nie dotknie produkcyjnych typów, a odczyt rejestru zawężamy
 * do przedrostka. Sprzątamy po sobie. Trasa API czyta produkcyjny rejestr (tylko odczyt) —
 * sprawdzamy kształt odpowiedzi i walidację parametrów, nie liczby.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Pick = (await import('@/models/Pick')).default;
const ModelForecast = (await import('@/models/ModelForecast')).default;
const RegisterOdds = (await import('@/models/RegisterOdds')).default;
const { snapshotRegisterOdds } = await import('@/lib/trust/oddsJob');
const { loadRegisterRows, registerResponse, registerTeaser } = await import('@/lib/trust/service');

const PREFIX = `test-register-${crypto.randomBytes(4).toString('hex')}`;
const NOW = new Date('2099-03-10T08:10:00Z'); // 9:10 w Warszawie
const za = (min) => new Date(NOW.getTime() + min * 60_000);
const id = (n) => `${PREFIX}-${n}`;

/** Typ AI zapisany bezpośrednio do kolekcji — żeby ustawić `createdAt` w przeszłości. */
const typ = (n, kickoff, createdAt, over = {}) => ({
	author: 'ai',
	kind: 'hint',
	source: 'hint',
	fixtureId: id(n),
	userId: null,
	market: 'Podwójna szansa',
	selection: `1X ${n}`,
	normalized: { type: 'doubleChance', value: '1X' },
	probability: 80,
	status: 'pending',
	countsToStats: true,
	homeName: `Dom ${n}`,
	awayName: `Gość ${n}`,
	leagueName: 'Liga testowa',
	leagueId: 990001,
	kickoff,
	createdAt,
	updatedAt: createdAt,
	...over,
});
const dziennik = (n, kickoff, odds = {}) => ({
	fixtureId: id(n),
	leagueId: 990001,
	homeId: 1,
	awayId: 2,
	kickoff,
	forecastAt: NOW,
	markets: { dc1X: 0.8 },
	odds,
});

async function sprzataj() {
	const filtr = { fixtureId: { $regex: `^${PREFIX}-` } };
	await Promise.all([Pick.deleteMany(filtr), ModelForecast.deleteMany(filtr), RegisterOdds.deleteMany(filtr)]);
}

after(async () => {
	await sprzataj();
	await mongoose.disconnect();
});

describe('zadanie: kursy rejestru w przebiegu co 20 minut', () => {
	before(async () => {
		await Pick.collection.insertMany([
			typ('bez-dziennika-zamkniecie', za(20), za(-600)),
			typ('bez-dziennika-poranek', za(180), za(-600)),
			typ('po-poranku', za(300), za(-10)),
			typ('przed-porankiem', za(300), za(-120)),
			typ('dziennik-bez-poranka', za(240), za(-10)),
			typ('za-blisko-na-poranek', za(45), za(-10)),
			typ('na-zywo', za(20), za(-10), { kind: 'live', source: 'analysis' }),
			typ('poza-statystyka', za(180), za(-600), { countsToStats: false }),
		]);
		await ModelForecast.insertMany([
			dziennik('po-poranku', za(300), { open: { at: za(-60), bookmakers: 5, dc1X: 1.3 } }),
			dziennik('przed-porankiem', za(300), { open: { at: za(-60), bookmakers: 5, dc1X: 1.3 } }),
			dziennik('dziennik-bez-poranka', za(240)),
		]);
	});

	test('każdy brak zdjęty raz, w swojej fazie; typy na żywo i poza statystyką pominięte', async () => {
		const pytania = [];
		const fetchOdds = async (fixtureId) => {
			pytania.push(fixtureId.replace(`${PREFIX}-`, ''));
			// Zdjęcie z chwili przebiegu (w teście: 2099), jak `fetchOddsSnapshot` w produkcji.
			return { at: NOW, bookmakers: 4, dc1X: 1.25 };
		};
		const pierwszy = await snapshotRegisterOdds({ now: NOW, fetchOdds });
		assert.deepEqual(pytania.sort(), ['bez-dziennika-poranek', 'bez-dziennika-zamkniecie', 'po-poranku', 'za-blisko-na-poranek']);
		assert.deepEqual(pierwszy, { open: 1, close: 1, after: 2, empty: 0, failed: 0 });

		const docs = Object.fromEntries(
			(await RegisterOdds.find({ fixtureId: { $regex: `^${PREFIX}-` } }).lean()).map((d) => [d.fixtureId.replace(`${PREFIX}-`, ''), d])
		);
		assert.equal(docs['bez-dziennika-zamkniecie'].close.dc1X, 1.25);
		assert.equal(docs['bez-dziennika-poranek'].open.bookmakers, 4);
		assert.equal(docs['po-poranku'].after.length, 1);
		assert.equal(docs['po-poranku'].open ?? null, null, 'mecz z dziennikiem nie dostaje drugiego poranka');

		// Drugi przebieg w tej samej chwili nie pyta o nic.
		pytania.length = 0;
		const drugi = await snapshotRegisterOdds({ now: NOW, fetchOdds });
		assert.deepEqual(pytania, []);
		assert.deepEqual(drugi, { open: 0, close: 0, after: 0, empty: 0, failed: 0 });
	});

	test('błąd dostawcy nie zapisuje niczego, a budżet ogranicza liczbę zapytań', async () => {
		await Pick.collection.insertMany([typ('blad-1', za(200), za(-600)), typ('blad-2', za(210), za(-600))]);
		let zapytan = 0;
		const wynik = await snapshotRegisterOdds({
			now: NOW,
			budget: 1,
			fetchOdds: async () => {
				zapytan += 1;
				throw new Error('429');
			},
		});
		assert.equal(zapytan, 1);
		assert.equal(wynik.failed, 1);
		assert.equal(await RegisterOdds.countDocuments({ fixtureId: { $in: [id('blad-1'), id('blad-2')] } }), 0);
	});
});

describe('odczyt rejestru', () => {
	const PO_MECZU = new Date('2099-04-02T12:00:00Z');
	const KICK = new Date('2099-04-01T18:00:00Z');
	const h = (x) => new Date(KICK.getTime() + x * 3600_000);

	before(async () => {
		await Pick.collection.insertMany([
			typ('rejestr-a', KICK, h(-30), { status: 'lost', finalScore: { home: 0, away: 2 } }),
			typ('rejestr-po-starcie', KICK, h(0.25), { status: 'won', finalScore: { home: 1, away: 0 } }),
			typ('rejestr-live', KICK, h(0.5), { kind: 'live', source: 'analysis', status: 'won' }),
		]);
		await ModelForecast.insertMany([
			dziennik('rejestr-a', KICK, {
				open: { at: h(-9), bookmakers: 6, dc1X: 1.5 },
				close: { at: h(-0.3), bookmakers: 6, dc1X: 1.4 },
			}),
		]);
	});

	test('typ zapisany po starcie meczu odrzucony i policzony; przegrany jak wygrany, z CLV', async () => {
		const match = { fixtureId: { $regex: `^${PREFIX}-rejestr-` } };
		const data = await loadRegisterRows({ now: PO_MECZU, match });
		assert.equal(data.rules.checked, 2);
		assert.equal(data.rules.afterKickoff, 1);
		assert.equal(data.rules.live, 1);
		assert.equal(data.rows.length, 1);

		const v = await registerResponse({ period: 'all', market: 'all', league: 'all', page: 1 }, { now: PO_MECZU, data });
		assert.equal(v.items.length, 1);
		const [r] = v.items;
		assert.equal(r.status, 'lost');
		assert.equal(r.refOdds, 1.5);
		assert.equal(r.closeOdds, 1.4);
		assert.ok(Math.abs(r.clv - (1.5 / 1.4 - 1)) < 1e-4);
		assert.equal(v.summary.settled, 1);
		assert.equal(v.summary.roi, -1);
		assert.equal(v.rules.afterKickoff, 1);

		// Przed meczem: ten sam typ zamknięty, poza sumami.
		const przed = await registerResponse({ period: 'all' }, { now: h(-2), data: await loadRegisterRows({ now: h(-2), match }) });
		assert.equal(przed.items[0].locked, true);
		assert.equal(przed.items[0].normalized, undefined);
		assert.equal(przed.summary.total, 0);
		assert.equal(przed.upcoming, 1);

		const skrot = await registerTeaser({ now: PO_MECZU, data });
		assert.equal(skrot.recent.length, 1);
		assert.equal(skrot.recent[0].status, 'lost', 'strona główna pokazuje też przegrane');
	});
});

describe('trasa /api/stats/register', () => {
	test('nieznane parametry wracają do domyślnych, odpowiedź publiczna z pamięcią', async () => {
		const { GET } = await import('@/app/api/stats/register/route');
		const res = await GET(new Request('http://localhost/api/stats/register?period=abc&market=x&league=1;drop&page=0'));
		assert.equal(res.status, 200);
		assert.match(res.headers.get('cache-control'), /public/);
		const body = await res.json();
		assert.deepEqual(body.filters, { period: '30', market: 'all', league: 'all', page: 1 });
		assert.ok(body.items.length <= body.pageSize);
		assert.ok(Array.isArray(body.leagues));
		assert.equal(typeof body.rules.afterKickoff, 'number');
		for (const item of body.items) {
			if (item.locked) assert.equal(item.normalized, undefined, 'typ przed meczem nie zdradza selekcji');
		}

		const teaser = await (await GET(new Request('http://localhost/api/stats/register?teaser=1'))).json();
		assert.ok(teaser.all && teaser.last30 && Array.isArray(teaser.recent));
		assert.ok(teaser.recent.every((r) => r.status === 'won' || r.status === 'lost'));
	});
});
