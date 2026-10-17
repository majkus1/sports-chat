import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Typy z wyższym kursem — zasady wyboru (bez sieci) i cały obieg na prawdziwej bazie:
 * wyszukanie z podstawionym terminarzem, modelem i kursami, zapis raz na mecz i selekcję,
 * rozliczenie i bilans. Mecze o losowych identyfikatorach, ze sprzątaniem.
 *
 * Pilnujemy zasad z pomiaru (`lib/value/select.js`): kurs tuż nad progiem, model nie mniej
 * niż rynek, bez remisu, kolejność od najniższego kursu; liczby raportu zawsze z kandydata.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const ValuePick = (await import('@/models/ValuePick')).default;
const { valueSelections, oddsWindow, valueKickoffOk } = await import('@/lib/value/select');
const { findValuePicks, recordValuePicks, settleValuePicks, valueStats } = await import('@/lib/value/service');
const { bindValuePicks } = await import('@/lib/reports/value');

const PREFIX = `8${crypto.randomInt(10_000_000, 99_999_999)}`;
const TERAZ = new Date('2099-01-07T09:00:00Z'); // 10:00 w Polsce (CET)

after(async () => {
	await ValuePick.deleteMany({ fixtureId: { $regex: `^${PREFIX}` } });
	await mongoose.disconnect();
});

describe('zasady wyboru', () => {
	const model = { home: 0.52, away: 0.25, dc1X: 0.75, dcX2: 0.48, homeScores: 0.8, awayScores: 0.6, over25: 0.55 };

	test('kurs w oknie progu, model nie mniej niż rynek, od najniższego kursu', () => {
		const out = valueSelections({
			markets: model,
			odds: { home: 2.05, draw: 3.4, away: 2.2, dc1X: 1.3, dcX2: 2.25, homeScores: 1.2, awayScores: 1.6, over25: 2.1 },
		});
		// home 2,05: rynek 49%, model 52% ✓; over25 2,10: 48% / 55% ✓; dcX2 2,25: 44% / 48% ✓;
		// away 2,20: rynek 45% > model 25% ✗; remis pomijany; reszta poza przedziałem 2,0–2,3.
		assert.deepEqual(
			out.map((s) => s.key),
			['home', 'over25', 'X2']
		);
		assert.deepEqual(out[0], { key: 'home', odds: 2.05, market: 49, model: 52 });
	});

	test('próg użytkownika przesuwa okno; próg ograniczony do 1,5–5', () => {
		assert.deepEqual(oddsWindow(3), { lo: 3, hi: 3.3 });
		assert.deepEqual(oddsWindow(10), { lo: 5, hi: 5.3 });
		assert.deepEqual(oddsWindow(undefined), { lo: 2, hi: 2.3 });
		const out = valueSelections({ markets: { ...model, away: 0.34 }, odds: { home: 2.05, away: 3.1 }, minOdds: 3 });
		assert.deepEqual(out.map((s) => s.key), ['away']);
	});

	test('mecz za mniej niż 30 minut albo poza 12:00–23:00 odpada', () => {
		assert.equal(valueKickoffOk(new Date('2099-01-07T17:00:00Z'), TERAZ), true);
		assert.equal(valueKickoffOk(new Date('2099-01-07T09:20:00Z'), TERAZ), false);
		assert.equal(valueKickoffOk(new Date('2099-01-08T01:30:00Z'), TERAZ), false);
	});
});

describe('obieg na bazie', () => {
	const wiersz = (n, godzUtc) => ({
		fixture: { id: Number(`${PREFIX}${n}`), date: `2099-01-07T${godzUtc}:00:00+00:00`, status: { short: 'NS' } },
		league: { id: 39, name: 'Premier League', country: 'England', season: 2098 },
		teams: { home: { id: 100 + n, name: `Gospodarz ${n}` }, away: { id: 200 + n, name: `Gość ${n}` } },
	});
	const prognoza = (home) => ({
		known: true,
		matchWinner: { home, draw: 0.25, away: 0.75 - home },
		doubleChance: { '1X': home + 0.25, X2: 1 - home },
		teamGoals: { home: { over: 0.8 }, away: { over: 0.7 } },
		over25: { probability: 0.5 },
	});
	const kursy = {
		[`${PREFIX}1`]: { bookmakers: 8, home: 2.02, away: 3.6 }, // rynek 50%, model 55% ✓
		[`${PREFIX}2`]: { bookmakers: 8, home: 2.2, away: 3.2 }, // rynek 45%, model 40% ✗
		[`${PREFIX}3`]: { bookmakers: 8, home: 2.12, away: 3.4 }, // rynek 47%, model 50% ✓
	};
	const opcje = {
		now: TERAZ,
		fixturesFor: async (d) => (d === '2099-01-07' ? [wiersz(1, '17'), wiersz(2, '18'), wiersz(3, '19')] : []),
		predict: async ({ homeId }) => prognoza({ 101: 0.55, 102: 0.4, 103: 0.5 }[homeId]),
		fetchOdds: async (id) => kursy[id] || null,
	};

	test('wybiera mecze, w których model zgadza się z rynkiem, od najniższego kursu', async () => {
		const { picks, stats } = await findValuePicks({ ...opcje, hours: 24, limit: 5 });
		assert.deepEqual(
			picks.map((p) => p.fixtureId),
			[`${PREFIX}1`, `${PREFIX}3`]
		);
		assert.equal(picks[0].selection, 'Gospodarz 1 (gospodarze)');
		assert.equal(stats.fixtures, 3);
		assert.equal(stats.fetched, 3);
		assert.equal(stats.failed, 0);
	});

	test('zapis raz na mecz i selekcję; rozliczenie i bilans', async () => {
		const { picks } = await findValuePicks({ ...opcje, hours: 24, limit: 5 });
		assert.equal(await recordValuePicks(picks, { source: 'assistant' }), 2);
		assert.equal(await recordValuePicks(picks, { source: 'report' }), 0);
		assert.equal((await ValuePick.findOne({ fixtureId: `${PREFIX}1` }).lean()).source, 'assistant');

		const wyniki = (ids) =>
			ids.map((id) => ({
				fixture: { id, status: { short: 'FT' } },
				goals: id === `${PREFIX}1` ? { home: 2, away: 1 } : { home: 0, away: 0 },
			}));
		const r = await settleValuePicks({
			now: new Date('2099-01-07T23:00:00Z'),
			fetchRows: async (ids) => wyniki(ids),
			query: { fixtureId: { $regex: `^${PREFIX}` } },
		});
		assert.equal(r.settled, 2);
		const s = await valueStats({ recent: 500 });
		const nasze = s.recent.filter((p) => p.fixtureId.startsWith(PREFIX));
		assert.deepEqual(
			nasze.map((p) => [p.fixtureId, p.status, p.score]).sort(),
			[
				[`${PREFIX}1`, 'won', '2:1'],
				[`${PREFIX}3`, 'lost', '0:0'],
			]
		);
		assert.ok(s.summary.won >= 1 && s.summary.lost >= 1);
	});
});

describe('raport „Wyższe kursy"', () => {
	test('liczby, typ i mecz zawsze z kandydata; zmyślony mecz wypada', () => {
		const kandydaci = [
			{ fixtureId: '5', homeName: 'Lech', awayName: 'Legia', league: 'Ekstraklasa, Poland', kickoff: '2099-01-07T17:00:00.000Z', key: 'home', selection: 'Lech (gospodarze)', odds: 2.08, market: 48, model: 53 },
		];
		const odAi = [
			{ fixtureId: 5, match: 'Lech vs Legia', market: 'Cokolwiek', selection: 'Legia wygra', probability: 80, confidence: 61, analysis: 'x', keyFacts: [] },
			{ fixtureId: 999, match: 'Zmyślony', market: 'x', selection: 'y', probability: 70, confidence: 50, analysis: 'x', keyFacts: [] },
		];
		const [typ, ...reszta] = bindValuePicks(odAi, kandydaci);
		assert.equal(reszta.length, 0);
		assert.equal(typ.selection, 'Lech (gospodarze)');
		assert.equal(typ.market, 'Wyższy kurs');
		assert.equal(typ.odds, 2.08);
		assert.equal(typ.probability, 48);
		assert.equal(typ.marketProbability, 48);
		assert.equal(typ.modelProbability, 53);
		assert.equal(typ.confidence, 61);
	});
});
