import test, { describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Wiadomości o okresie próbnym — 2. dzień i ostatni dzień próby.
 *
 * Najpierw bez sieci: kto dostaje który mail (potwierdzony adres, wypis, poranny mail, wiek konta),
 * co jest w treści, zero słów o zakładach, bezpieczny HTML, odnośnik wypisu. Potem przebieg
 * na prawdziwej bazie w trybie `dryRun` — na kontach testowych o losowych adresach, sprzątanych
 * po teście; nic nie jest wysyłane ani zapisywane.
 */

setupEnv();
const { buildDayTwoEmail, buildTrialEndEmail, dayTwoEligible, trialEndEligible, trialEndsAt, sendLifecycleEmails } = await import('@/lib/onboarding/lifecycle');
const { TRIAL, PLANS, PRO_WEEK } = await import('@/lib/billing/plans');

const H = 3600 * 1000;
const NOW = new Date('2026-11-22T07:00:00Z'); // 8:00 w Warszawie
const ZAKAZANE = /kurs|zak[łl]ad|obstaw|stawk|bukmach|\bbet\b|odds|stake|wager|bookmaker/i;
const OPT = 'https://czatsportowy.pl/api/me/account-email/unsubscribe?token=abc';

const konto = (over = {}) => ({
	email: 'a@example.com',
	username: 'Tester',
	role: 'user',
	plan: 'free',
	isEmailVerified: true,
	welcomeSentAt: new Date(NOW.getTime() - 20 * H),
	createdAt: new Date(NOW.getTime() - 20 * H),
	morningEmail: { enabled: false, enabledAt: null },
	lifecycleEmail: {},
	...over,
});

describe('kto dostaje mail 2. dnia', () => {
	test('świeże, potwierdzone konto bez porannego maila — tak', () => {
		assert.equal(dayTwoEligible(konto(), NOW), true);
	});
	test('za młode (15 h) i za stare (4 dni) — nie', () => {
		assert.equal(dayTwoEligible(konto({ createdAt: new Date(NOW.getTime() - 15 * H) }), NOW), false);
		assert.equal(dayTwoEligible(konto({ createdAt: new Date(NOW.getTime() - 96 * H) }), NOW), false);
	});
	test('poranny mail włączony albo kiedyś wyłączony — nie', () => {
		assert.equal(dayTwoEligible(konto({ morningEmail: { enabled: true, enabledAt: new Date() } }), NOW), false);
		assert.equal(dayTwoEligible(konto({ morningEmail: { enabled: false, enabledAt: new Date() } }), NOW), false);
	});
	test('niepotwierdzony adres, bez maila powitalnego, wypisany, już wysłany, admin, plan płatny — nie', () => {
		for (const over of [
			{ isEmailVerified: false },
			{ welcomeSentAt: null },
			{ lifecycleEmail: { optOut: true } },
			{ lifecycleEmail: { dayTwoSentAt: new Date() } },
			{ role: 'admin' },
			{ plan: 'pro' },
			{ email: null },
		]) {
			assert.equal(dayTwoEligible(konto(over), NOW), false, JSON.stringify(over));
		}
	});
});

describe('kto dostaje mail ostatniego dnia próby', () => {
	const ostatni = new Date(NOW.getTime() - (TRIAL.days * 24 - 10) * H); // koniec za 10 h
	test('próba kończy się w ciągu doby — tak, także z porannym mailem', () => {
		assert.equal(trialEndEligible(konto({ createdAt: ostatni }), NOW), true);
		assert.equal(trialEndEligible(konto({ createdAt: ostatni, morningEmail: { enabled: true, enabledAt: new Date() } }), NOW), true);
	});
	test('dwa dni przed końcem, po końcu, już wysłany, wypisany — nie', () => {
		assert.equal(trialEndEligible(konto({ createdAt: new Date(NOW.getTime() - 4 * 24 * H) }), NOW), false);
		assert.equal(trialEndEligible(konto({ createdAt: new Date(NOW.getTime() - (TRIAL.days * 24 + 1) * H) }), NOW), false);
		assert.equal(trialEndEligible(konto({ createdAt: ostatni, lifecycleEmail: { trialEndSentAt: new Date() } }), NOW), false);
		assert.equal(trialEndEligible(konto({ createdAt: ostatni, lifecycleEmail: { optOut: true } }), NOW), false);
	});
	test('koniec próby = założenie + dni próby', () => {
		assert.equal(trialEndsAt({ createdAt: ostatni }).getTime(), ostatni.getTime() + TRIAL.days * 24 * H);
	});
});

describe('treść maila 2. dnia', () => {
	const WCZORAJ = {
		won: 2,
		total: 3,
		picks: [
			{ home: 'Legia', away: 'Lech', selection: 'Powyżej 1,5 gola', status: 'won' },
			{ home: 'Raków', away: 'Pogoń', selection: 'Raków (gospodarze)', status: 'won' },
			{ home: 'Górnik', away: 'Cracovia', selection: 'Obie strzelą', status: 'lost' },
		],
	};
	const DAILY = { fixtureId: '123', home: 'Arsenal', away: 'Chelsea', selection: 'Arsenal (gospodarze)', probability: 61, base: 45 };

	test('wczorajsze wyniki, typ dnia, niesprawdzone funkcje z odnośnikami, poranny mail, wypis', () => {
		const m = buildDayTwoEmail({ name: 'Tester', locale: 'pl', trialDaysLeft: 6, yesterday: WCZORAJ, daily: DAILY, untried: ['report', 'custom'], siteUrl: 'https://x.pl', optOutUrl: OPT });
		assert.ok(m.subject.includes('6 dni'));
		assert.ok(m.text.includes('Wczoraj model: 2 z 3 typów trafionych.'));
		assert.ok(m.text.includes('✗ Górnik – Cracovia: Obie strzelą'));
		assert.ok(m.text.includes('Arsenal – Chelsea: Arsenal (gospodarze) · 61% (zwykle 45%)'));
		assert.ok(m.text.includes('https://x.pl/pl/pilka-nozna/ai-agent'));
		assert.ok(m.text.includes('https://x.pl/pl/typy-na-dzis#kreator-kuponu'));
		assert.equal(m.text.includes('/pilka-nozna/asystent'), false, 'asystenta użył — nie podsuwamy');
		assert.ok(m.text.includes('https://x.pl/pl/pilka-nozna/przedmeczowe'));
		assert.ok(m.text.includes(OPT));
		assert.ok(m.html.includes(OPT));
	});

	test('bez wczorajszych typów i bez typu dnia — mail nadal ma sens', () => {
		const m = buildDayTwoEmail({ locale: 'en', trialDaysLeft: 5, yesterday: { won: 0, total: 0, picks: [] }, daily: null, untried: [], optOutUrl: OPT });
		assert.ok(m.text.includes('no settled picks yesterday'));
		assert.equal(m.text.includes('pick of the day'), false);
	});

	test('ani słowa o zakładach, nazwa użytkownika bezpieczna w HTML', () => {
		for (const locale of ['pl', 'en']) {
			const m = buildDayTwoEmail({ name: '<b>x</b>', locale, trialDaysLeft: 6, yesterday: WCZORAJ, daily: DAILY, untried: ['analysis', 'report', 'aiChat', 'custom'], optOutUrl: OPT });
			assert.equal(ZAKAZANE.test(m.subject + m.text), false, locale);
			assert.equal(ZAKAZANE.test(m.html), false, locale);
			assert.ok(m.html.includes('&lt;b&gt;x&lt;/b&gt;'));
		}
	});
});

describe('treść maila ostatniego dnia', () => {
	const endsAt = new Date('2026-11-22T20:14:00Z'); // 21:14 w Warszawie, ten sam dzień

	test('kiedy się kończy, zużycie, wyniki modelu, co zostaje, co się kończy, cena Pro z planów', () => {
		const m = buildTrialEndEmail({ name: 'Tester', locale: 'pl', endsAt, now: NOW, usage: { analysis: 4, aiChat: 7, report: 0, custom: 1 }, model: { won: 30, total: 40, base: 62 }, coupons: { won: 3, total: 7 }, siteUrl: 'https://x.pl', optOutUrl: OPT });
		assert.ok(m.subject.includes('dziś o 21:14'));
		assert.ok(m.text.includes('4 × analiza AI meczu'));
		assert.ok(m.text.includes('1 × kupon z kreatora'));
		assert.equal(m.text.includes('× raport AI'), false, 'zera nie wypisujemy');
		assert.ok(m.text.includes('30 z 40 trafionych (75%, zwykle 62%)'));
		assert.ok(m.text.includes('3 z 7 weszło'), 'słaby wynik kuponów też pokazujemy');
		assert.ok(m.text.includes(`${PLANS.free.limits.analysis} analiz AI i ${PLANS.free.limits.aiChat} pytań`));
		assert.ok(m.text.includes(`Pro to ${PLANS.pro.priceMonthlyPln} zł za 30 dni`));
		assert.ok(m.text.includes('https://x.pl/pl/cennik'));
		// Pierwsza opcja to Pro na 7 dni: zdanie i przycisk z ceną z planów, adres z wyróżnioną kartą i źródłem.
		const cena = PRO_WEEK.priceGrosze / 100;
		assert.ok(m.text.includes(`Na start: Pro na ${PRO_WEEK.days} dni za ${cena} zł`));
		assert.ok(m.text.indexOf(`Pro na ${PRO_WEEK.days} dni`) < m.text.indexOf(`Pro to ${PLANS.pro.priceMonthlyPln} zł`), 'przepustka przed planem na 30 dni');
		assert.ok(m.text.includes(`Kup ${PRO_WEEK.days} dni za ${cena} zł: https://x.pl/pl/cennik?oferta=pro_week&z=mail_trial_end`));
		assert.ok(m.html.includes(`>Kup ${PRO_WEEK.days} dni za ${cena} zł</a>`));
		assert.ok(m.html.includes('cennik?oferta=pro_week&amp;z=mail_trial_end'));
		assert.ok(m.text.includes(OPT));
	});

	test('jutro, bez zużycia i bez rozliczonych typów — uczciwe zdania zamiast zer', () => {
		const m = buildTrialEndEmail({ locale: 'en', endsAt: new Date('2026-11-23T06:30:00Z'), now: NOW, usage: {}, model: null, coupons: null, optOutUrl: OPT });
		assert.ok(m.subject.includes('tomorrow at 07:30'));
		assert.ok(m.text.includes('You have not used the AI yet'));
		assert.ok(m.text.includes('No picks were settled'));
	});

	test('ani słowa o zakładach', () => {
		for (const locale of ['pl', 'en']) {
			const m = buildTrialEndEmail({ name: 'x', locale, endsAt, now: NOW, usage: { analysis: 1, aiChat: 1, report: 1, custom: 1 }, model: { won: 1, total: 2, base: 50 }, coupons: { won: 1, total: 2 }, optOutUrl: OPT });
			assert.equal(ZAKAZANE.test(m.subject + m.text), false, locale);
			assert.equal(ZAKAZANE.test(m.html), false, locale);
		}
	});
});

describe('przebieg na bazie (dryRun — bez wysyłki i zapisu)', () => {
	const TAG = crypto.randomBytes(5).toString('hex');
	const mail = (n) => `test-lifecycle-${TAG}-${n}@example.com`;
	const teraz = new Date();
	let User;

	before(async () => {
		await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });
		User = (await import('@/models/User')).default;
	});

	after(async () => {
		await User.deleteMany({ email: { $regex: `^test-lifecycle-${TAG}-` } });
		await mongoose.disconnect();
	});

	test('2. dzień i ostatni dzień wybrane, reszta pominięta; nic się nie zapisuje', async () => {
		const baza = { isEmailVerified: true, termsAcceptedAt: teraz, role: 'user', plan: 'free' };
		await User.collection.insertMany([
			{ ...baza, email: mail(1), username: `lc${TAG}1`, createdAt: new Date(teraz.getTime() - 30 * H), welcomeSentAt: teraz },
			{ ...baza, email: mail(2), username: `lc${TAG}2`, createdAt: new Date(teraz.getTime() - (TRIAL.days * 24 - 5) * H), welcomeSentAt: teraz, morningEmail: { enabled: true, enabledAt: teraz, locale: 'en' } },
			{ ...baza, email: mail(3), username: `lc${TAG}3`, createdAt: new Date(teraz.getTime() - 30 * H), welcomeSentAt: teraz, lifecycleEmail: { optOut: true } },
			{ ...baza, email: mail(4), username: `lc${TAG}4`, createdAt: new Date(teraz.getTime() - 30 * H), welcomeSentAt: null },
		]);

		const wynik = await sendLifecycleEmails({ now: teraz, dryRun: true });
		const moje = wynik.previews.filter((p) => p.to.startsWith(`test-lifecycle-${TAG}-`));
		const rodzaj = Object.fromEntries(moje.map((p) => [p.to, p.kind]));
		assert.equal(rodzaj[mail(1)], 'dayTwoSentAt');
		assert.equal(rodzaj[mail(2)], 'trialEndSentAt');
		assert.equal(rodzaj[mail(3)], undefined, 'wypisany');
		assert.equal(rodzaj[mail(4)], undefined, 'bez maila powitalnego (adres niepotwierdzony)');
		assert.ok(moje.find((p) => p.to === mail(2)).subject.startsWith('Your trial ends'), 'język z porannego maila');

		const zapisane = await User.find({ email: { $in: [mail(1), mail(2)] } }).select('lifecycleEmail').lean();
		for (const u of zapisane) {
			assert.equal(u.lifecycleEmail?.dayTwoSentAt ?? null, null);
			assert.equal(u.lifecycleEmail?.trialEndSentAt ?? null, null);
		}
	});
});
