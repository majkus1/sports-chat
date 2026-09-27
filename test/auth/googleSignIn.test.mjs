import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Logowanie i rejestracja przez Google — na prawdziwej bazie, bez prawdziwego tokenu.
 *
 * Trasa weryfikuje podpis tokenu u Google; wszystko, co dzieje się potem (nowe konto, łączenie
 * z istniejącym, zgoda na regulamin, przejęcie konta), siedzi w `googleSignIn` i tu jest
 * sprawdzane na kontach o losowych adresach, sprzątanych po teście.
 *
 * Do tego zapis zgód: przycisk „Włącz logowanie Google" nie może kasować zgody na analitykę.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const User = (await import('@/models/User')).default;
const { googleSignIn } = await import('@/lib/auth/googleSignIn');

const TAG = crypto.randomBytes(5).toString('hex');
const mail = (n) => `test-google-${TAG}-${n}@example.com`;
const sub = (n) => `test-sub-${TAG}-${n}`;
const token = (n, extra = {}) => ({ sub: sub(n), email: mail(n), email_verified: true, name: `Test Google ${TAG}${n}`, ...extra });

after(async () => {
	await User.deleteMany({ email: { $regex: `^test-google-${TAG}-` } });
	await mongoose.disconnect();
});

describe('nowe konto przez Google', () => {
	test('z okna logowania (bez zgody na regulamin) konto nie powstaje', async () => {
		const wynik = await googleSignIn(token(1));
		assert.equal(wynik.error, 'google_terms_required');
		assert.equal(await User.exists({ email: mail(1) }), null);
	});

	test('z okna rejestracji (zgoda zaznaczona) powstaje potwierdzone, bez hasła, ze śladem zgody', async () => {
		const { user, created } = await googleSignIn(token(2), { acceptedTerms: true });
		assert.equal(created, true);
		assert.equal(user.email, mail(2));
		assert.equal(user.googleId, sub(2));
		assert.equal(user.password, null);
		assert.equal(user.isEmailVerified, true);
		assert.ok(user.termsAcceptedAt instanceof Date);
		assert.ok(user.termsVersion);
	});

	test('potem loguje się także z okna logowania — zgoda nie jest już potrzebna', async () => {
		const { user, created } = await googleSignIn(token(2));
		assert.equal(created, false);
		assert.equal(user.email, mail(2));
	});

	test('krótkie imię z Google („Jo") nie wywraca zakładania konta', async () => {
		const { user } = await googleSignIn(token(3, { name: 'Jo' }), { acceptedTerms: true });
		assert.ok(user.username.length >= 3);
		assert.ok(user.username.startsWith('user'));
	});

	test('adres niepotwierdzony przez Google — odmowa', async () => {
		const wynik = await googleSignIn(token(4, { email_verified: false }), { acceptedTerms: true });
		assert.equal(wynik.error, 'google_email_not_verified');
	});
});

describe('łączenie z istniejącym kontem', () => {
	test('konto z hasłem na NIEPOTWIERDZONY adres: hasło skasowane, sesje unieważnione', async () => {
		// Ktoś obcy założył konto na cudzy adres i zna hasło; właściciel adresu loguje się Google.
		await User.create({ email: mail(5), username: `tg${TAG}5`, password: 'hash-napastnika', isEmailVerified: false, tokenVersion: 3 });
		const { user, created } = await googleSignIn(token(5));
		assert.equal(created, false);
		assert.equal(user.googleId, sub(5));
		assert.equal(user.password, null);
		assert.equal(user.tokenVersion, 4);
		assert.equal(user.isEmailVerified, true);
	});

	test('konto z hasłem na POTWIERDZONY adres: hasło i sesje zostają', async () => {
		await User.create({ email: mail(6), username: `tg${TAG}6`, password: 'hash-wlasciciela', isEmailVerified: true, tokenVersion: 2 });
		const { user } = await googleSignIn(token(6));
		assert.equal(user.googleId, sub(6));
		assert.equal(user.password, 'hash-wlasciciela');
		assert.equal(user.tokenVersion, 2);
	});

	test('adres już połączony z INNYM kontem Google — konflikt, bez zmian', async () => {
		await User.create({ email: mail(7), username: `tg${TAG}7`, googleId: `${sub(7)}-inne`, isEmailVerified: true });
		const wynik = await googleSignIn(token(7));
		assert.equal(wynik.error, 'google_account_conflict');
		assert.equal((await User.findOne({ email: mail(7) }).lean()).googleId, `${sub(7)}-inne`);
	});
});

describe('zgody w przeglądarce', () => {
	test('włączenie logowania Google nie kasuje zgody na analitykę', async () => {
		const magazyn = new Map();
		globalThis.window = {
			localStorage: { getItem: (k) => magazyn.get(k) ?? null, setItem: (k, v) => magazyn.set(k, v), removeItem: (k) => magazyn.delete(k) },
			dispatchEvent: () => true,
		};
		globalThis.CustomEvent ??= class extends Event {};
		try {
			const { writeConsent, readConsent } = await import('@/lib/consent');
			writeConsent({ google: false, analytics: true });
			writeConsent({ google: true });
			const zgoda = readConsent();
			assert.equal(zgoda.google, true);
			assert.equal(zgoda.analytics, true);
		} finally {
			delete globalThis.window;
		}
	});
});
