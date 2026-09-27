import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Mail powitalny — treść bez sieci: co dostaje nowe konto, typ dnia, gdy jest, dwa przyciski,
 * zero słów o zakładach, bezpieczny HTML. I poranny mail w okresie próbnym: mówi, ile zostało.
 */

setupEnv();
const { buildWelcomeEmail } = await import('@/lib/onboarding/welcome');
const { buildMorningEmail } = await import('@/lib/morning/build');
const { TRIAL } = await import('@/lib/billing/plans');

const DAILY = { fixtureId: '123', home: 'Legia', away: 'Lech', selection: 'Legia (gospodarze)', probability: 66, base: 44 };
const ZAKAZANE = /kurs|zak[łl]ad|obstaw|stawk|bukmach|\bbet\b|odds|stake|wager|bookmaker/i;

describe('mail powitalny', () => {
	test('mówi, co jest w okresie próbnym, i prowadzi do typów na dziś', () => {
		const m = buildWelcomeEmail({ name: 'LukZen', locale: 'pl', daily: DAILY, siteUrl: 'https://czatsportowy.pl' });
		assert.ok(m.subject.includes(`${TRIAL.days} dni`));
		assert.ok(m.text.includes(`${TRIAL.limits.analysis} analiz AI`));
		assert.ok(m.text.includes('https://czatsportowy.pl/pl/typy-na-dzis'));
		assert.ok(m.text.includes('Legia – Lech: Legia (gospodarze) · 66% (zwykle 44%)'));
		assert.ok(m.html.includes('https://czatsportowy.pl/pl/mecz/123'));
	});

	test('bez typu dnia — bez tej sekcji, reszta zostaje', () => {
		const m = buildWelcomeEmail({ locale: 'en', daily: null, siteUrl: 'https://x.pl' });
		assert.equal(m.text.includes('pick of the day'), false);
		assert.ok(m.text.includes('https://x.pl/en/typy-na-dzis'));
	});

	test('ani słowa o zakładach, nazwa użytkownika bezpieczna w HTML', () => {
		for (const locale of ['pl', 'en']) {
			const m = buildWelcomeEmail({ name: '<b>x</b>', locale, daily: DAILY });
			assert.equal(ZAKAZANE.test(m.text), false, locale);
			assert.equal(ZAKAZANE.test(m.html), false, locale);
			assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt;'));
		}
	});
});

describe('poranny mail w okresie próbnym', () => {
	const BAZA = { name: null, locale: 'pl', date: '2026-09-27', siteUrl: 'https://czatsportowy.pl', unsubscribeUrl: 'https://czatsportowy.pl/u' };
	const typ = { fixtureId: '1', home: 'A', away: 'B', selection: '1X', probability: 80, base: 69, kickoffLocal: '20:00' };

	test('mówi, ile dni zostało, i prowadzi do cennika', () => {
		const m = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [typ], favorites: [], round: null, trialDaysLeft: 3 });
		assert.ok(m.text.includes('zostało 3 dni'));
		assert.ok(m.text.includes('https://czatsportowy.pl/pl/cennik'));
		assert.equal(m.text.includes('masz plan Pro lub VIP'), false);
	});

	test('ostatni dzień mówi to wprost', () => {
		const m = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [typ], favorites: [], round: null, trialDaysLeft: 1 });
		assert.ok(m.text.includes('ostatni dzień'));
	});
});
