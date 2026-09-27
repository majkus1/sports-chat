import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Okno limitów planu płatnego — 30 dni od zakupu, nie miesiąc kalendarzowy.
 *
 * Błąd, którego ten test pilnuje: limity „miesięczne" odnawiały się 1-go, a plan kupuje się
 * na 30 dni. Zakup 28 września dawał 100 analiz do 30-go i drugie 100 od 1 października —
 * dwa komplety za jedną płatność.
 */

setupEnv();
const { paidWindow } = await import('@/lib/billing/entitlements');

const DZIEN = 86_400_000;
const d = (s) => new Date(`${s}T12:00:00Z`);
const pro = (validUntil) => ({ plan: 'pro', planStatus: 'active', planValidUntil: validUntil });

describe('okno limitów planu płatnego', () => {
	const zakup = d('2026-09-28');
	const user = pro(new Date(zakup.getTime() + 30 * DZIEN));

	test('okno zaczyna się w dniu zakupu, a nie pierwszego dnia miesiąca', () => {
		const okno = paidWindow(user, d('2026-09-30'));
		assert.equal(okno.startsAt.getTime(), zakup.getTime());
	});

	test('1 października to NADAL to samo okno — bez drugiego kompletu limitów', () => {
		assert.equal(paidWindow(user, d('2026-09-30')).key, paidWindow(user, d('2026-10-01')).key);
		assert.equal(paidWindow(user, d('2026-09-30')).key, paidWindow(user, d('2026-10-27')).key);
	});

	test('przedłużenie przed terminem nie zeruje bieżącego okna, a kolejne 30 dni mają własne', () => {
		const przedluzony = pro(new Date(zakup.getTime() + 60 * DZIEN));
		assert.equal(paidWindow(przedluzony, d('2026-10-10')).key, paidWindow(user, d('2026-10-10')).key);
		assert.notEqual(paidWindow(przedluzony, d('2026-10-29')).key, paidWindow(przedluzony, d('2026-10-10')).key);
	});

	test('licznik wygasa z końcem okna', () => {
		const okno = paidWindow(user, d('2026-10-27'));
		assert.equal(okno.endsAt.getTime(), zakup.getTime() + 30 * DZIEN);
		assert.ok(okno.ttlSeconds > 0 && okno.ttlSeconds <= 24 * 3600);
	});

	test('plan darmowy, wygasły i administrator liczą się po miesiącu kalendarzowym', () => {
		assert.equal(paidWindow({ plan: 'free' }, d('2026-10-01')), null);
		assert.equal(paidWindow(pro(d('2026-09-01')), d('2026-10-01')), null);
		assert.equal(paidWindow({ role: 'admin', plan: 'pro', planValidUntil: d('2026-12-01') }, d('2026-10-01')), null);
	});
});
