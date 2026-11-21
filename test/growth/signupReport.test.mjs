import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Panel źródeł rejestracji — rachunek aktywacji bez bazy.
 *
 * „Wrócił 2. dnia" liczy się tylko dla kont, których następny dzień już minął: konto z dziś nie
 * może jeszcze „nie wrócić", więc nie zaniża wyniku.
 */

setupEnv();
const { summarizeSignups, sourceLabel } = await import('@/lib/growth/signupReport');

const NOW = new Date('2099-03-10T12:00:00Z');
const users = [
	{ _id: 'a', username: 'a', createdAt: '2099-03-01T10:00:00Z', signupSource: { channel: 'social', utmSource: 'facebook', utmMedium: 'social', utmCampaign: 'rozliczenie' } },
	{ _id: 'b', username: 'b', createdAt: '2099-03-02T10:00:00Z', signupSource: { channel: 'search', referrerHost: 'google.pl' } },
	{ _id: 'c', username: 'c', createdAt: '2099-03-10T08:00:00Z', signupSource: { channel: 'search', referrerHost: 'google.pl' } },
	{ _id: 'd', username: 'd', createdAt: '2099-02-20T10:00:00Z', signupSource: null },
];
const activity = new Map([
	['a', new Set(['2099-03-01', '2099-03-02'])],
	['b', new Set(['2099-03-02', '2099-03-05'])],
	['c', new Set(['2099-03-10'])],
]);

describe('aktywacja według źródła', () => {
	const r = summarizeSignups(users, activity, { now: NOW });

	test('razem: konta, AI, D1 tylko dla kont z minionym następnym dniem, powroty', () => {
		assert.deepEqual(r.total, { accounts: 4, usedAi: 3, returnedD1: 1, d1Eligible: 3, returnedLater: 2 });
	});

	test('kanały w stałej kolejności, konta sprzed zapisu źródeł na końcu', () => {
		assert.deepEqual(
			r.byChannel.map((g) => [g.channel, g.accounts]),
			[
				['search', 2],
				['social', 1],
				['legacy', 1],
			]
		);
	});

	test('źródło z utm opisane kampanią, z referrera — hostem', () => {
		assert.ok(r.bySource.some((g) => g.source === 'facebook / social / rozliczenie' && g.returnedD1 === 1));
		assert.ok(r.bySource.some((g) => g.source === 'google.pl' && g.accounts === 2 && g.returnedLater === 1));
		assert.equal(sourceLabel(null), 'legacy');
		assert.equal(sourceLabel({ channel: 'direct' }), 'direct');
	});

	test('ostatnie rejestracje od najnowszej', () => {
		assert.deepEqual(
			r.recent.map((w) => w.username),
			['c', 'b', 'a', 'd']
		);
		assert.equal(r.recent[0].d1Eligible, false);
	});
});
