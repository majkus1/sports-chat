import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Zapis źródła rejestracji przy koncie — na prawdziwej bazie, konta o losowych adresach
 * `@example.com`, sprzątane po teście.
 *
 * Rejestracja przez Google: `googleSignIn` to ta sama funkcja, którą woła trasa po weryfikacji
 * tokenu. Rejestracja mailem: trasa wysyła prawdziwy mail weryfikacyjny, więc jej nie wołamy —
 * sprawdzamy, że to, co trasa zapisuje (`signupSourceFromRequest`), przechodzi przez schemat konta.
 */

setupEnv();
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const User = (await import('@/models/User')).default;
const { googleSignIn } = await import('@/lib/auth/googleSignIn');
const { signupSourceFromRequest } = await import('@/lib/growth/signupSource');

const TAG = crypto.randomBytes(5).toString('hex');
const mail = (n) => `test-zrodlo-${TAG}-${n}@example.com`;
const token = (n) => ({ sub: `test-zrodlo-sub-${TAG}-${n}`, email: mail(n), email_verified: true, name: `Zrodlo ${TAG}${n}` });
const zadanie = () => new Request('https://czatsportowy.pl/api/auth/google', { headers: { host: 'czatsportowy.pl' } });
const surowe = () => ({
	referrerHost: 'l.facebook.com',
	utmSource: 'facebook',
	utmMedium: 'social',
	utmCampaign: 'rozliczenie',
	landingPath: '/pl/typy-na-dzis',
	at: new Date(Date.now() - 5 * 60_000).toISOString(),
});

after(async () => {
	await User.deleteMany({ email: { $regex: `^test-zrodlo-${TAG}-` } });
	await mongoose.disconnect();
});

describe('źródło przy rejestracji przez Google', () => {
	test('nowe konto dostaje zwalidowane źródło z kanałem', async () => {
		const { user, created } = await googleSignIn(token(1), { acceptedTerms: true, signupSource: signupSourceFromRequest(surowe(), zadanie()) });
		assert.equal(created, true);
		const zapis = await User.findById(user._id).lean();
		assert.equal(zapis.signupSource.channel, 'social');
		assert.equal(zapis.signupSource.utmCampaign, 'rozliczenie');
		assert.equal(zapis.signupSource.referrerHost, 'l.facebook.com');
		assert.equal(zapis.signupSource.landingPath, '/pl/typy-na-dzis');
		assert.ok(zapis.signupSource.firstSeenAt instanceof Date);
	});

	test('logowanie na istniejące konto niczego w źródle nie zmienia', async () => {
		const inne = signupSourceFromRequest({ ...surowe(), utmSource: 'x', utmCampaign: 'tydzien' }, zadanie());
		const { created } = await googleSignIn(token(1), { signupSource: inne });
		assert.equal(created, false);
		const zapis = await User.findOne({ email: mail(1) }).lean();
		assert.equal(zapis.signupSource.utmCampaign, 'rozliczenie');
	});

	test('bez źródła z przeglądarki konto ma `unknown`, nie pusty wpis', async () => {
		const { user } = await googleSignIn(token(2), { acceptedTerms: true, signupSource: signupSourceFromRequest(undefined, zadanie()) });
		const zapis = await User.findById(user._id).lean();
		assert.equal(zapis.signupSource.channel, 'unknown');
		assert.equal(zapis.signupSource.utmSource, null);
	});

	test('złośliwe źródło trafia do bazy oczyszczone (bez operatorów i znaczników)', async () => {
		const zle = { utmSource: { $ne: null }, utmCampaign: '<script>', referrerHost: 'czatsportowy.pl', landingPath: '/pl', at: new Date().toISOString() };
		const { user } = await googleSignIn(token(3), { acceptedTerms: true, signupSource: signupSourceFromRequest(zle, zadanie()) });
		const zapis = await User.findById(user._id).lean();
		assert.equal(zapis.signupSource.utmSource, null);
		assert.equal(zapis.signupSource.utmCampaign, null);
		assert.equal(zapis.signupSource.referrerHost, null);
		assert.equal(zapis.signupSource.channel, 'direct');
	});
});

describe('źródło przy rejestracji mailem', () => {
	test('to, co zapisuje trasa, przechodzi przez schemat konta', async () => {
		const user = await User.create({
			email: mail(4),
			username: `zrodlo${TAG}4`,
			password: 'x',
			signupSource: signupSourceFromRequest(surowe(), new Request('https://czatsportowy.pl/api/auth/register')),
		});
		const zapis = await User.findById(user._id).lean();
		assert.equal(zapis.signupSource.channel, 'social');
		assert.equal(zapis.signupSource.utmSource, 'facebook');
	});

	test('konto bez źródła (sprzed zmiany) ma `null`, nie obiekt z pustymi polami', async () => {
		const user = await User.create({ email: mail(5), username: `zrodlo${TAG}5`, password: 'x' });
		const zapis = await User.findById(user._id).lean();
		assert.equal(zapis.signupSource ?? null, null);
	});
});
