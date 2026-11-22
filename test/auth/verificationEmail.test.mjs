import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Próba od razu (22.11.2026): konto działa bez potwierdzenia adresu, mail z linkiem tylko o to prosi.
 * Treść bez sieci i bramki, których już nie ma: logowanie nie odrzuca niepotwierdzonego konta,
 * rejestracja od razu ustawia sesję.
 */

setupEnv();
const { buildVerificationEmail, newVerificationToken } = await import('@/lib/auth/verificationEmail');

describe('mail z linkiem potwierdzającym', () => {
	test('mówi, że konto już działa, i niesie link', () => {
		const link = 'https://czatsportowy.pl/pl/verify-email?token=abc';
		const m = buildVerificationEmail({ username: 'Tester', locale: 'pl', link });
		assert.match(m.text, /Konto już działa/);
		assert.ok(m.text.includes(link));
		assert.ok(m.html.includes(link));
		const en = buildVerificationEmail({ username: 'Tester', locale: 'en', link });
		assert.match(en.text, /already works/);
	});

	test('nazwa użytkownika bezpieczna w HTML', () => {
		const m = buildVerificationEmail({ username: '<b>x</b>', locale: 'pl', link: 'https://x.pl' });
		assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt;'));
		assert.equal(m.html.includes('<b>x</b>'), false);
	});

	test('token: jawny 64 znaki, w bazie skrót, ważny dobę', () => {
		const now = new Date('2099-01-01T00:00:00Z');
		const t = newVerificationToken(now);
		assert.match(t.plain, /^[a-f0-9]{64}$/);
		assert.match(t.hash, /^[a-f0-9]{64}$/);
		assert.notEqual(t.plain, t.hash);
		assert.equal(t.exp.getTime() - now.getTime(), 24 * 3600 * 1000);
	});
});

describe('bez bramki potwierdzenia', () => {
	const kod = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

	test('logowanie nie odrzuca niepotwierdzonego adresu', () => {
		assert.doesNotMatch(kod('app/api/auth/login/route.js'), /email_not_verified/);
	});

	test('rejestracja ustawia sesję i mówi o tym klientowi', () => {
		const r = kod('app/api/auth/register/route.js');
		assert.match(r, /setAuthCookiesRouteHandler/);
		assert.match(r, /loggedIn: true/);
	});
});
