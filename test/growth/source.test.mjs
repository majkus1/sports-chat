import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Źródło rejestracji — przechwycenie i walidacja, bez sieci i bazy.
 *
 * Pilnujemy trzech rzeczy: (1) nic spoza wzorca nie przechodzi (znaczniki, cudzysłowy, operatory
 * Mongo, protokoły `javascript:`), (2) limity długości, (3) link z posta (`utmUrl`) daje przy
 * rejestracji dokładnie to źródło, które w nim wpisano.
 */

setupEnv();
const { cleanUtm, cleanHost, cleanPath, cleanDate, referrerHost, captureTouch, channelOf, normalizeSignupSource, utmUrl, UTM_MAX, PATH_MAX } =
	await import('@/lib/growth/source');
const { signupSourceFromRequest } = await import('@/lib/growth/signupSource');

const NOW = new Date('2099-03-10T12:00:00Z');

describe('utm', () => {
	test('poprawne wartości: małe litery, spacje na myślnik', () => {
		assert.equal(cleanUtm('X'), 'x');
		assert.equal(cleanUtm(' kupon-dnia '), 'kupon-dnia');
		assert.equal(cleanUtm('Grupa FB'), 'grupa-fb');
		assert.equal(cleanUtm('lato_2099.v2'), 'lato_2099.v2');
	});

	test('wstrzyknięcia i znaki spoza wzorca odrzucają całą wartość', () => {
		for (const zla of ['<script>alert(1)</script>', '"x"', "x'or'1", '$where', '{"$gt":""}', 'a;b', 'ą', 'x/../y', '.ukryte', '-', 'x%3Cy', 'x\u0000y', 'emoji😀']) {
			assert.equal(cleanUtm(zla), null, zla);
		}
	});

	test('nie-tekst i puste → null', () => {
		for (const v of [null, undefined, 1, {}, [], '', '   ', { $gt: '' }]) assert.equal(cleanUtm(v), null);
	});

	test(`limit ${UTM_MAX} znaków`, () => {
		assert.equal(cleanUtm('a'.repeat(UTM_MAX)), 'a'.repeat(UTM_MAX));
		assert.equal(cleanUtm('a'.repeat(UTM_MAX + 1)), null);
	});
});

describe('host i ścieżka', () => {
	test('host bez www i kropki, małe litery', () => {
		assert.equal(cleanHost('WWW.Google.PL.'), 'google.pl');
		assert.equal(cleanHost('l.facebook.com'), 'l.facebook.com');
		assert.equal(cleanHost('evil.com/path'), null);
		assert.equal(cleanHost('a'.repeat(101)), null);
		assert.equal(cleanHost('<b>'), null);
	});

	test('referrer: sam host, własna domena to nie źródło, obce protokoły odpadają', () => {
		assert.equal(referrerHost('https://www.google.com/search?q=legia+typ', ['czatsportowy.pl']), 'google.com');
		assert.equal(referrerHost('https://czatsportowy.pl/pl/typy-na-dzis', ['czatsportowy.pl']), null);
		assert.equal(referrerHost('https://www.czatsportowy.pl/pl', ['czatsportowy.pl']), null);
		assert.equal(referrerHost('android-app://com.google.android.gm/', []), 'com.google.android.gm');
		assert.equal(referrerHost('javascript:alert(1)', []), null);
		assert.equal(referrerHost('data:text/html,<b>', []), null);
		assert.equal(referrerHost('nie adres', []), null);
		assert.equal(referrerHost('', []), null);
	});

	test('ścieżka bez zapytania i kotwicy, bez `//` na początku, przycięta', () => {
		assert.equal(cleanPath('/pl/typ/legia-lech-123?utm_source=x#a'), '/pl/typ/legia-lech-123');
		assert.equal(cleanPath('//evil.com'), null);
		assert.equal(cleanPath('javascript:alert(1)'), null);
		assert.equal(cleanPath('/pl/<script>'), null);
		assert.equal(cleanPath('/pl/' + 'a'.repeat(300)).length, PATH_MAX);
	});

	test('data: nie z przyszłości, nie starsza niż 30 dni', () => {
		assert.ok(cleanDate('2099-03-10T11:00:00Z', NOW) instanceof Date);
		assert.equal(cleanDate('2099-03-11T12:00:00Z', NOW), null);
		assert.equal(cleanDate('2099-01-01T00:00:00Z', NOW), null);
		assert.equal(cleanDate('wczoraj', NOW), null);
	});
});

describe('przechwycenie pierwszego wejścia', () => {
	test('utm i ścieżka z adresu, host z referrera', () => {
		const t = captureTouch({
			href: 'https://czatsportowy.pl/pl/typy-na-dzis?utm_source=facebook&utm_medium=social&utm_campaign=rozliczenie&fbclid=abc',
			referrer: 'https://l.facebook.com/',
			ownHosts: ['czatsportowy.pl'],
			now: NOW,
		});
		assert.deepEqual(t, {
			referrerHost: 'l.facebook.com',
			utmSource: 'facebook',
			utmMedium: 'social',
			utmCampaign: 'rozliczenie',
			landingPath: '/pl/typy-na-dzis',
			at: NOW.toISOString(),
		});
	});

	test('przejście wewnątrz serwisu (referrer z tej samej domeny) nie jest źródłem', () => {
		const t = captureTouch({ href: 'https://czatsportowy.pl/pl/cennik', referrer: 'https://czatsportowy.pl/pl', now: NOW });
		assert.equal(t.referrerHost, null);
	});

	test('złośliwe utm w adresie znikają, reszta zostaje', () => {
		const t = captureTouch({ href: 'https://czatsportowy.pl/pl?utm_source=%3Cscript%3E&utm_campaign=ok', now: NOW });
		assert.equal(t.utmSource, null);
		assert.equal(t.utmCampaign, 'ok');
	});
});

describe('kanał', () => {
	const przypadki = [
		[{ referrerHost: 'google.pl' }, 'search'],
		[{ referrerHost: 'gemini.google.com' }, 'ai'],
		[{ referrerHost: 'chatgpt.com' }, 'ai'],
		[{ referrerHost: 'mail.google.com' }, 'email'],
		[{ referrerHost: 'l.facebook.com' }, 'social'],
		[{ referrerHost: 't.co' }, 'social'],
		[{ referrerHost: 'forum.example.pl' }, 'referral'],
		[{}, 'direct'],
		[{ utmSource: 'x', utmMedium: 'social' }, 'social'],
		[{ utmSource: 'newsletter', utmMedium: 'email' }, 'email'],
		[{ utmSource: 'partner' }, 'campaign'],
		[{ utmSource: 'google', utmMedium: 'cpc', referrerHost: 'google.com' }, 'paid'],
	];
	for (const [src, kanal] of przypadki) test(`${JSON.stringify(src)} → ${kanal}`, () => assert.equal(channelOf(src), kanal));
});

describe('normalizacja po stronie serwera', () => {
	const surowe = { referrerHost: 'google.pl', utmSource: 'x', utmMedium: 'social', utmCampaign: 'kupon-dnia', landingPath: '/pl/typy-na-dzis', at: '2099-03-10T11:00:00Z' };

	test('poprawne źródło przechodzi, kanał liczy serwer (nie klient)', () => {
		const s = normalizeSignupSource({ ...surowe, channel: 'paid' }, { now: NOW, ownHosts: ['czatsportowy.pl'] });
		assert.equal(s.channel, 'social');
		assert.equal(s.utmCampaign, 'kupon-dnia');
		assert.equal(s.referrerHost, 'google.pl');
		assert.ok(s.firstSeenAt instanceof Date);
		assert.equal('at' in s, false);
	});

	test('nie-obiekt, tablica, za duży obiekt → unknown', () => {
		for (const raw of [null, undefined, 'x', 5, [surowe], { ...surowe, smiec: 'a'.repeat(2000) }]) {
			assert.equal(normalizeSignupSource(raw, { now: NOW }).channel, 'unknown');
		}
	});

	test('operatory Mongo i znaczniki w polach nie przechodzą', () => {
		const s = normalizeSignupSource(
			{ utmSource: { $ne: null }, utmMedium: '<b>', utmCampaign: '"; drop', referrerHost: { $gt: '' }, landingPath: '/pl', at: '2099-03-10T11:00:00Z' },
			{ now: NOW }
		);
		assert.deepEqual([s.utmSource, s.utmMedium, s.utmCampaign, s.referrerHost], [null, null, null, null]);
		assert.equal(s.channel, 'direct');
	});

	test('własna domena jako referrer to wejście bezpośrednie', () => {
		const s = normalizeSignupSource({ referrerHost: 'czatsportowy.pl', landingPath: '/pl', at: NOW.toISOString() }, { now: NOW, ownHosts: ['czatsportowy.pl'] });
		assert.equal(s.referrerHost, null);
		assert.equal(s.channel, 'direct');
	});

	test('same śmieci (nic poprawnego) → unknown, nie „direct"', () => {
		assert.equal(normalizeSignupSource({ landingPath: 'x', at: 'y' }, { now: NOW }).channel, 'unknown');
	});

	test('host żądania i adres serwisu to własne domeny', () => {
		const request = new Request('http://localhost:3001/api/auth/register', { headers: { host: 'localhost:3001' } });
		const s = signupSourceFromRequest({ referrerHost: 'localhost', landingPath: '/pl', at: new Date().toISOString() }, request);
		assert.equal(s.referrerHost, null);
	});
});

describe('link z utm', () => {
	test('link posta daje przy przechwyceniu dokładnie swoje utm', () => {
		const link = utmUrl('https://czatsportowy.pl/', '/pl/typy-na-dzis', { source: 'tiktok', campaign: 'kupon-dnia' });
		assert.equal(link, 'https://czatsportowy.pl/pl/typy-na-dzis?utm_source=tiktok&utm_medium=social&utm_campaign=kupon-dnia');
		const t = captureTouch({ href: link, now: NOW });
		assert.deepEqual([t.utmSource, t.utmMedium, t.utmCampaign, t.landingPath], ['tiktok', 'social', 'kupon-dnia', '/pl/typy-na-dzis']);
	});

	test('wartość, której walidacja by nie przepuściła, rzuca przy budowaniu', () => {
		assert.throws(() => utmUrl('https://x.pl', '/pl', { source: 'Grupa FB', campaign: 'a' }));
		assert.throws(() => utmUrl('https://x.pl', '/pl', { source: 'x', campaign: '<b>' }));
	});
});
