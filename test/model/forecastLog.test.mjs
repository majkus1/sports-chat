import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Dziennik prognoz — na prawdziwej bazie, na meczach o losowych identyfikatorach, ze
 * sprzątaniem. Pilnuje trzech reguł: pierwsza prognoza zostaje (druga tego samego meczu
 * niczego nie nadpisuje), poza oknem `LEAD_HOURS` nic się nie zapisuje, a mecz bez
 * kalibracji „powyżej 2,5" dostaje `null`, nie zero.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const ModelForecast = (await import('@/models/ModelForecast')).default;
const { recordForecasts, LEAD_HOURS } = await import('@/lib/model/forecastLog');

const PREFIX = `test-forecast-${crypto.randomBytes(4).toString('hex')}`;
const ids = [];
const id = () => {
	const v = `${PREFIX}-${ids.length}`;
	ids.push(v);
	return v;
};

after(async () => {
	await ModelForecast.deleteMany({ fixtureId: { $in: ids } });
	await mongoose.disconnect();
});

const teraz = new Date('2026-09-20T10:00:00Z');
const mecz = (fixtureId, godzinDoMeczu) => ({
	id: fixtureId,
	date: new Date(teraz.getTime() + godzinDoMeczu * 3600_000).toISOString(),
	league: { id: 39, season: 2026 },
	teams: { home: { id: 1, name: 'A' }, away: { id: 2, name: 'B' } },
});
const prognoza = (over25 = { probability: 0.61, base: 0.53, variant: 'goals' }) => ({
	known: true,
	modelVersion: 'dixon-coles/4',
	matchesUsed: 500,
	lambdaHome: 1.6,
	lambdaAway: 1.1,
	matchWinner: { home: 0.5, draw: 0.25, away: 0.25 },
	doubleChance: { '1X': 0.75, X2: 0.5 },
	teamGoals: { home: { over: 0.8 }, away: { over: 0.67 } },
	over25,
	btts: over25 ? { probability: 0.55, base: 0.52, variant: 'goals' } : null,
});

describe('dziennik prognoz', () => {
	test('zapisuje prognozę w oknie, z rynkami i plakietką', async () => {
		const fid = id();
		const hint = { key: 'home', selection: 'A (gospodarze)', probability: 50, base: 44, lift: 6 };
		const n = await recordForecasts([{ fixture: mecz(fid, 6), prediction: prognoza(), hint }], teraz);
		assert.equal(n, 1);
		const doc = await ModelForecast.findOne({ fixtureId: fid }).lean();
		assert.equal(doc.markets.over25, 0.61);
		assert.equal(doc.over25.variant, 'goals');
		assert.equal(doc.hint.key, 'home');
		assert.equal(doc.leadHours, 6);
		assert.equal(doc.settledAt, null);
	});

	test('druga prognoza tego samego meczu niczego nie nadpisuje', async () => {
		const fid = id();
		await recordForecasts([{ fixture: mecz(fid, 20), prediction: prognoza(), hint: null }], teraz);
		const n = await recordForecasts(
			[{ fixture: mecz(fid, 2), prediction: { ...prognoza(), matchWinner: { home: 0.9, draw: 0.05, away: 0.05 } }, hint: null }],
			new Date(teraz.getTime() + 18 * 3600_000)
		);
		assert.equal(n, 0);
		const doc = await ModelForecast.findOne({ fixtureId: fid }).lean();
		assert.equal(doc.markets.home, 0.5, 'pierwsza prognoza zostaje');
		assert.equal(doc.leadHours, 20);
	});

	test('poza oknem i po meczu nic się nie zapisuje', async () => {
		const zaWczesnie = id();
		const poMeczu = id();
		const n = await recordForecasts(
			[
				{ fixture: mecz(zaWczesnie, LEAD_HOURS + 5), prediction: prognoza(), hint: null },
				{ fixture: mecz(poMeczu, -1), prediction: prognoza(), hint: null },
			],
			teraz
		);
		assert.equal(n, 0);
		assert.equal(await ModelForecast.countDocuments({ fixtureId: { $in: [zaWczesnie, poMeczu] } }), 0);
	});

	test('prognoza dla nieznanej drużyny nie wchodzi; bez kalibracji „powyżej 2,5" jest null', async () => {
		const nieznana = id();
		const bezKalibracji = id();
		const n = await recordForecasts(
			[
				{ fixture: mecz(nieznana, 6), prediction: { ...prognoza(), known: false }, hint: null },
				{ fixture: mecz(bezKalibracji, 6), prediction: prognoza(null), hint: null },
			],
			teraz
		);
		assert.equal(n, 1);
		const doc = await ModelForecast.findOne({ fixtureId: bezKalibracji }).lean();
		assert.equal(doc.markets.over25, null);
		assert.equal(doc.over25.variant, null);
		assert.equal(await ModelForecast.countDocuments({ fixtureId: nieznana }), 0);
	});
});
