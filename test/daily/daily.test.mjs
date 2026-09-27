import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Typ dnia i okres próbny — części czyste.
 *
 * Kolejność kandydatów decyduje, który mecz zobaczą wszyscy za darmo: ma to być mecz, o którym
 * ludzie mówią (pierwszy poziom rozgrywek), a dopiero potem największa przewaga — i nigdy mecz,
 * który startuje za chwilę. Okres próbny ma dawać liczby i poranny mail dokładnie przez 7 dni.
 */

setupEnv();

const { orderCandidates } = await import('@/lib/daily/service');
const { trialDaysLeft, getEntitlements } = await import('@/lib/billing/entitlements');
const { todayPicksContent } = await import('@/lib/landing/todayPicks');
const { MIN_LIFT, MIN_PROBABILITY } = await import('@/lib/picks/policy');

const TERAZ = new Date('2026-09-27T10:00:00Z');
const za = (min) => new Date(TERAZ.getTime() + min * 60_000).toISOString();
const w = (fixtureId, leagueId, lift, kickoffMin) => ({ fixtureId, leagueId, kickoff: za(kickoffMin), hint: { key: 'home', lift } });

describe('kolejność kandydatów na typ dnia', () => {
	test('pierwszy poziom rozgrywek przed większą przewagą w niższym', () => {
		// 39 = Premier League i 2 = Liga Mistrzów (poziom 1), 218 = Bundesliga austriacka (poziom 2).
		const wynik = orderCandidates([w('a', 218, 30, 300), w('b', 2, 14, 300), w('c', 39, 20, 300)], { now: TERAZ });
		assert.deepEqual(
			wynik.map((x) => x.fixtureId),
			['c', 'b', 'a']
		);
	});

	test('mecz startujący za mniej niż 45 minut odpada', () => {
		const wynik = orderCandidates([w('teraz', 39, 40, 30), w('pozniej', 39, 15, 120)], { now: TERAZ });
		assert.deepEqual(
			wynik.map((x) => x.fixtureId),
			['pozniej']
		);
	});

	test('bez typu nie ma kandydata', () => {
		assert.deepEqual(orderCandidates([{ fixtureId: 'x', leagueId: 39, kickoff: za(300), hint: null }], { now: TERAZ }), []);
	});
});

describe('okres próbny', () => {
	test('nowe konto: dni do końca oraz liczby przy typach i poranny mail', () => {
		assert.equal(trialDaysLeft({ plan: 'free', createdAt: new Date(TERAZ.getTime() - 2 * 86_400_000) }, TERAZ), 5);
		const f = getEntitlements({ plan: 'free', createdAt: new Date(Date.now() - 2 * 86_400_000) }).features;
		assert.ok(f.includes('model_hints'));
		assert.ok(f.includes('morning_email'));
	});

	test('po tygodniu nic z tego nie zostaje', () => {
		const stary = { plan: 'free', createdAt: new Date(Date.now() - 8 * 86_400_000) };
		assert.equal(trialDaysLeft(stary), 0);
		assert.equal(getEntitlements(stary).features.includes('morning_email'), false);
	});

	test('konto, które miało plan płatny, okresu próbnego nie dostaje', () => {
		assert.equal(trialDaysLeft({ plan: 'pro', createdAt: new Date() }), 0);
	});
});

describe('strona „Typy na dziś"', () => {
	for (const locale of ['pl', 'en']) {
		test(`${locale}: próg z kodu i bez języka zakładów`, () => {
			const c = todayPicksContent(locale);
			const tekst = JSON.stringify(c) + c.how + c.metaTitle('27.09') + c.edge(44, 24) + c.chances(50, 25, 25);
			assert.ok(c.how.includes(`${MIN_PROBABILITY}%`));
			assert.ok(c.how.includes(`${MIN_LIFT} `));
			assert.equal(/kurs|obstaw|stawk|odds|stake|wager/i.test(tekst), false);
		});
	}

	test('polska odmiana liczby typów', () => {
		const c = todayPicksContent('pl');
		assert.equal(c.listTitle(1), 'Model widzi dziś 1 typ');
		assert.equal(c.listTitle(3), 'Model widzi dziś 3 typy');
		assert.equal(c.listTitle(12), 'Model widzi dziś 12 typów');
		assert.equal(c.listTitle(22), 'Model widzi dziś 22 typy');
	});
});
