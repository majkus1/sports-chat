import test, { describe, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { register } from 'node:module';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Trasa `POST /api/coupons/generate` — prawdziwy `POST` z prawdziwą weryfikacją sesji (token JWT
 * w ciasteczku z atrapy `next/headers`, `test/helpers/nextHeadersHook.mjs`).
 *
 * Sprawdzamy tylko odpowiedzi, które powstają, ZANIM cokolwiek zostanie pobrane: zły JSON (400), brak
 * sesji (401), złe ustawienia (400), plan bez kreatora (403, także z `from` z przyjętej propozycji).
 * Ścieżki z kuponem i z propozycjami są w `customService.test.mjs` z podstawionymi plakietkami, kursami
 * i wiadomościami — tu trasa szłaby do prawdziwego API piłkarskiego i AI, czego testy nie robią.
 *
 * BAZA JEST PRODUKCYJNA: jedno konto `test-kreator-<losowe>` (darmowe, założone w 2020 — bez okresu
 * próbnego), kasowane w `after()`.
 */

setupEnv();
register(new URL('../helpers/nextHeadersHook.mjs', import.meta.url));
await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });

const User = (await import('@/models/User')).default;
const { signAccessToken } = await import('@/lib/auth');
const { POST } = await import('@/app/api/coupons/generate/route.js');
const { trialAllowance } = await import('@/lib/billing/entitlements');

const TAG = crypto.randomBytes(5).toString('hex');
const konto = await User.create({ username: `test-kreator-${TAG}`, email: `test-kreator-${TAG}@example.com`, createdAt: new Date('2020-01-01') });

after(async () => {
	await User.deleteMany({ username: `test-kreator-${TAG}` });
	await mongoose.disconnect();
});

const wyslij = (body) =>
	POST(
		new Request('http://localhost/api/coupons/generate', {
			method: 'POST',
			body: typeof body === 'string' ? body : JSON.stringify(body),
			headers: { 'Content-Type': 'application/json' },
		})
	);
const zalogowany = () => {
	globalThis.__testCookies = { accessToken: signAccessToken({ userId: String(konto._id), tokenVersion: konto.tokenVersion || 0 }) };
};

describe('POST /api/coupons/generate', () => {
	test('zły JSON — 400 i bez pamięci podręcznej', async () => {
		const r = await wyslij('{');
		assert.equal(r.status, 400);
		assert.equal((await r.json()).error, 'invalid_body');
		assert.equal(r.headers.get('cache-control'), 'private, no-store');
	});

	test('bez sesji — 401, także z `from` przyjętej propozycji', async () => {
		globalThis.__testCookies = {};
		const r = await wyslij({ params: { odds: 2.5, window: 'tomorrow' }, from: { attempt: 'x', index: 0 } });
		assert.equal(r.status, 401);
		assert.equal((await r.json()).error, 'login_required');
	});

	test('z sesją: złe ustawienia — 400 z polami; plan bez kreatora — 403 z zapowiedzią (nic się nie liczy)', async () => {
		zalogowany();
		const zle = await wyslij({ params: { odds: 7, window: 'tydzien' } });
		assert.equal(zle.status, 400);
		assert.deepEqual((await zle.json()).errors, ['odds', 'window']);

		// „Jutro" to poprawne okno; konto bez planu i po okresie próbnym — zapowiedź, nie liczenie.
		// Bezpiecznik: z okresem próbnym trasa poszłaby do prawdziwego API — wtedy test pada wcześniej.
		assert.equal(trialAllowance(await User.findById(konto._id).lean(), 'couponGen'), 0);
		const bezPlanu = await wyslij({ params: { odds: 2.5, legs: 3, window: 'tomorrow' }, from: { attempt: String(new mongoose.Types.ObjectId()), index: 0 } });
		assert.equal(bezPlanu.status, 403);
		const tresc = await bezPlanu.json();
		assert.equal(tresc.error, 'plan_required');
		assert.equal(tresc.quota.limit, 0);
	});
});
