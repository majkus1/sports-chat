import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Jedna prognoza na jedno zdarzenie liczy się raz — na prawdziwej bazie.
 *
 * Raport i analiza tego samego meczu potrafią wystawić tę samą selekcję; klucz unikalności
 * typu rozróżnia rodzaj i tekst, więc powstają dwa rekordy. Do września 2026 oba wchodziły
 * do skuteczności. Test odtwarza dokładnie ten scenariusz na meczu o losowym identyfikatorze
 * i sprząta po sobie; nie da się go napisać bez bazy, bo cała reguła jest w zapisie.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const Pick = (await import('@/models/Pick')).default;
const { recordPicks } = await import('@/lib/picks/service');

const FIXTURE = `test-dedupe-${crypto.randomBytes(6).toString('hex')}`;
const kontekst = () => ({ sectionsPresent: ['form', 'prediction'], playedHome: 10, playedAway: 10 });
const resolver = () => ({ fixtureId: FIXTURE, homeName: 'Dinamo Zagreb', awayName: 'HNK Gorica', kickoff: new Date(Date.now() + 86_400_000) });

after(async () => {
	await Pick.deleteMany({ fixtureId: FIXTURE });
	await mongoose.disconnect();
});

describe('ta sama selekcja z raportu i z analizy', () => {
	test('drugi zapis wskazuje pierwszy i nie liczy się do statystyki', async () => {
		await recordPicks({
			picks: [{ market: 'Wynik meczu', selection: 'Dinamo Zagreb (gospodarze)', probability: 81 }],
			kind: 'report',
			source: 'report',
			userId: null,
			fixtureResolver: resolver,
			context: kontekst,
		});
		await recordPicks({
			// Inny rodzaj i inne brzmienie — ta sama selekcja (wygrana gospodarza).
			picks: [{ market: 'Wynik meczu', selection: 'Dinamo Zagreb', probability: 79 }],
			kind: 'prematch',
			source: 'analysis',
			userId: null,
			fixtureResolver: resolver,
			context: kontekst,
		});

		const [raport, analiza] = await Promise.all([
			Pick.findOne({ fixtureId: FIXTURE, kind: 'report' }).lean(),
			Pick.findOne({ fixtureId: FIXTURE, kind: 'prematch' }).lean(),
		]);
		assert.equal(raport.countsToStats, true, 'pierwszy zapis liczy się');
		assert.equal(raport.duplicateOf, null);
		assert.equal(analiza.countsToStats, false, 'drugi zapis nie liczy się');
		assert.equal(String(analiza.duplicateOf), String(raport._id), 'drugi wskazuje pierwszy');
	});

	test('inna selekcja na ten sam mecz nie jest duplikatem', async () => {
		await recordPicks({
			picks: [{ market: 'Gole drużyny', selection: 'HNK Gorica powyżej 0.5 gola', probability: 85 }],
			kind: 'prematch',
			source: 'analysis',
			userId: null,
			fixtureResolver: resolver,
			context: kontekst,
		});
		const gol = await Pick.findOne({ fixtureId: FIXTURE, market: 'Gole drużyny' }).lean();
		assert.equal(gol.duplicateOf, null);
		assert.equal(gol.countsToStats, true);
	});

	test('typ na żywo to osobna prognoza — nie jest duplikatem przedmeczowego', async () => {
		await recordPicks({
			picks: [{ market: 'Wynik meczu', selection: 'Dinamo Zagreb (gospodarze)', probability: 70 }],
			kind: 'live',
			source: 'analysis',
			userId: null,
			fixtureResolver: resolver,
			context: kontekst,
		});
		const live = await Pick.findOne({ fixtureId: FIXTURE, kind: 'live' }).lean();
		assert.equal(live.duplicateOf, null);
		assert.equal(live.countsToStats, true);
	});

	test('ponowne wygenerowanie tej samej analizy nie robi z niej duplikatu samej siebie', async () => {
		await recordPicks({
			picks: [{ market: 'Gole drużyny', selection: 'HNK Gorica powyżej 0.5 gola', probability: 85 }],
			kind: 'prematch',
			source: 'analysis',
			userId: null,
			fixtureResolver: resolver,
			context: kontekst,
		});
		const ile = await Pick.countDocuments({ fixtureId: FIXTURE, market: 'Gole drużyny' });
		const gol = await Pick.findOne({ fixtureId: FIXTURE, market: 'Gole drużyny' }).lean();
		assert.equal(ile, 1);
		assert.equal(gol.countsToStats, true);
	});
});
