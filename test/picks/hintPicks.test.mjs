import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Plakietki modelu w publicznej skuteczności — na prawdziwej bazie, na meczach o losowych
 * identyfikatorach, ze sprzątaniem.
 *
 * Reguły: jedna plakietka na mecz (pierwsza), tylko mecze w ciągu 48 godzin; plakietka ustępuje
 * typowi dnia, analizie i raportowi z tą samą selekcją — niezależnie od kolejności zapisu —
 * a inna selekcja liczy się osobno.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Pick = (await import('@/models/Pick')).default;
const { recordPicks } = await import('@/lib/picks/service');
const { recordHintPicks } = await import('@/lib/picks/hintPicks');
const { SELECTION_SHAPES } = await import('@/lib/picks/markets');

const PREFIX = `test-hint-${crypto.randomBytes(5).toString('hex')}`;
const TERAZ = new Date();
const za = (h) => new Date(TERAZ.getTime() + h * 3600_000).toISOString();
const nazwy = { homeName: 'Lech Poznan', awayName: 'Jagiellonia' };

const mecz = (n, kickoffH = 20) => ({
	id: `${PREFIX}-${n}`,
	date: za(kickoffH),
	teams: { home: { id: 1, name: nazwy.homeName }, away: { id: 2, name: nazwy.awayName } },
	league: { id: 106, name: 'Ekstraklasa' },
});
const plakietka = (key, probability = 70, base = 44) => ({ key, selection: SELECTION_SHAPES[key].label(nazwy), probability, base });
const wpis = (n, key, kickoffH) => ({ fixture: mecz(n, kickoffH), prediction: { modelVersion: 'dixon-coles/5' }, hint: plakietka(key) });

/** Typ z analizy (albo typ dnia) na ten sam mecz. */
const typ = (n, key, kind = 'prematch') =>
	recordPicks({
		picks: [{ market: SELECTION_SHAPES[key].market, selection: SELECTION_SHAPES[key].label(nazwy), probability: 72, baseRate: 44 }],
		kind,
		source: kind === 'daily' ? 'daily' : 'analysis',
		userId: null,
		fixtureResolver: () => ({ fixtureId: `${PREFIX}-${n}`, ...nazwy, kickoff: za(20) }),
		context: { sectionsPresent: ['form', 'prediction'] },
	});

const pobierz = (n) => Pick.find({ fixtureId: `${PREFIX}-${n}` }).lean();
const rodzaj = (rows, kind) => rows.find((r) => r.kind === kind);

after(async () => {
	await Pick.deleteMany({ fixtureId: { $regex: `^${PREFIX}-` } });
	await mongoose.disconnect();
});

describe('plakietka ustępuje', () => {
	test('analiza z tą samą selekcją po plakietce: liczy się analiza, plakietka jest duplikatem', async () => {
		await recordHintPicks([wpis(1, 'home')], { now: TERAZ });
		await typ(1, 'home');
		const rows = await pobierz(1);
		const h = rodzaj(rows, 'hint');
		const a = rodzaj(rows, 'prematch');
		assert.equal(a.countsToStats, true);
		assert.equal(h.countsToStats, false);
		assert.equal(String(h.duplicateOf), String(a._id));
	});

	test('typ dnia przed plakietką: typ dnia zostaje w statystyce, plakietka jako duplikat', async () => {
		await typ(2, 'X2', 'daily');
		await recordHintPicks([wpis(2, 'X2')], { now: TERAZ });
		const rows = await pobierz(2);
		const d = rodzaj(rows, 'daily');
		const h = rodzaj(rows, 'hint');
		assert.equal(d.countsToStats, true);
		assert.equal(d.duplicateOf ?? null, null);
		assert.equal(h.countsToStats, false);
		assert.equal(String(h.duplicateOf), String(d._id));
	});

	test('inna selekcja w analizie — obie liczą się osobno', async () => {
		await recordHintPicks([wpis(3, 'X2')], { now: TERAZ });
		await typ(3, 'home');
		const rows = await pobierz(3);
		assert.equal(rodzaj(rows, 'hint').countsToStats, true);
		assert.equal(rodzaj(rows, 'prematch').countsToStats, true);
	});
});

describe('zapis plakietek', () => {
	test('jedna na mecz: późniejsza plakietka z inną selekcją niczego nie dopisuje', async () => {
		assert.equal(await recordHintPicks([wpis(4, 'home')], { now: TERAZ }), 1);
		assert.equal(await recordHintPicks([wpis(4, 'X2')], { now: TERAZ }), 0);
		const rows = await pobierz(4);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].normalized.value, 'home');
		assert.equal(rows[0].kind, 'hint');
		assert.equal(rows[0].source, 'hint');
	});

	test('tylko mecze w ciągu 48 godzin i jeszcze nierozpoczęte; bez plakietki nic', async () => {
		const zapisane = await recordHintPicks(
			[wpis(5, 'home', 60), wpis(6, 'home', -1), { fixture: mecz(7), prediction: {}, hint: null }],
			{ now: TERAZ }
		);
		assert.equal(zapisane, 0);
		assert.equal((await Pick.countDocuments({ fixtureId: { $in: [5, 6, 7].map((n) => `${PREFIX}-${n}`) } })), 0);
	});
});
