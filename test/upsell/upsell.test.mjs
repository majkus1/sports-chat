import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Okna zakupu: który baner w jakiej chwili i licznik bez danych osobowych.
 *
 * Licznik idzie do PRAWDZIWEJ bazy, ale wyłącznie z dniami z 2099 roku (podanymi wprost)
 * i jest sprzątany po przebiegu — produkcyjne zestawienie w panelu admina ich nie widzi.
 */

setupEnv();

const { default: mongoose } = await import('mongoose');
const { pickBanner, NEAR_LIMIT, WIN_FRESH_MS } = await import('@/lib/upsell/context');
const { UPSELL_PLACEMENTS, isPlacement, pricingHref } = await import('@/lib/upsell/placements');
const { recordUpsell, upsellSummary, shiftDay } = await import('@/lib/upsell/stats');
const { default: UpsellStat } = await import('@/models/UpsellStat');
const { POST } = await import('@/app/api/upsell/event/route.js');

const TERAZ = new Date('2099-05-10T12:00:00Z');
const usage = (used, limit) => ({ analysis: { used, limit }, aiChat: { used: 0, limit: 50 }, report: { used: 0, limit: 2 } });

describe('który baner', () => {
	test('płacący nie widzi żadnego', () => {
		assert.equal(pickBanner({ paid: true, trialDaysLeft: 1, usage: usage(15, 15) }), null);
	});

	test('ostatni dzień próby ma pierwszeństwo', () => {
		const win = { settledAt: TERAZ, homeName: 'A', awayName: 'B', selection: '1' };
		assert.equal(pickBanner({ paid: false, trialDaysLeft: 1, usage: usage(15, 15), recentWin: win, now: TERAZ }).placement, 'trial_last_day');
	});

	test('świeżo trafiony typ z analizy — przed progiem puli; po 72 h już nie', () => {
		const win = { settledAt: new Date(TERAZ.getTime() - 3600_000), homeName: 'Legia', awayName: 'Lech', selection: 'Powyżej 2,5' };
		const b = pickBanner({ paid: false, trialDaysLeft: 4, usage: usage(13, 15), recentWin: win, now: TERAZ });
		assert.equal(b.placement, 'analysis_win');
		assert.deepEqual(b.data, { home: 'Legia', away: 'Lech', selection: 'Powyżej 2,5' });
		const stary = { ...win, settledAt: new Date(TERAZ.getTime() - WIN_FRESH_MS - 1000) };
		assert.equal(pickBanner({ paid: false, trialDaysLeft: 0, usage: {}, recentWin: stary, now: TERAZ }), null);
	});

	test(`próba przy ${NEAR_LIMIT * 100}% puli — od 12 z 15 analiz, nie wcześniej`, () => {
		assert.equal(pickBanner({ paid: false, trialDaysLeft: 4, usage: usage(11, 15), now: TERAZ }), null);
		const b = pickBanner({ paid: false, trialDaysLeft: 4, usage: usage(12, 15), now: TERAZ });
		assert.equal(b.placement, 'trial_near_limit');
		assert.deepEqual(b.data, { kind: 'analysis', used: 12, limit: 15 });
	});

	test('po próbie próg puli nie działa (plan darmowy nie dostaje banera co miesiąc)', () => {
		assert.equal(pickBanner({ paid: false, trialDaysLeft: 0, usage: usage(5, 5), now: TERAZ }), null);
	});
});

describe('miejsca i adres cennika', () => {
	test('tylko miejsca z listy; adres niesie ofertę i źródło', () => {
		assert.ok(isPlacement('coupon_days3'));
		assert.ok(!isPlacement('__proto__'));
		assert.ok(!isPlacement('dowolne'));
		assert.equal(pricingHref('coupon_live'), '/cennik?oferta=pro_week&z=coupon_live');
		assert.equal(pricingHref('dowolne'), '/cennik?oferta=pro_week');
		for (const label of Object.values(UPSELL_PLACEMENTS)) assert.ok(label.trim());
		// Od 22.11.2026: wyczerpane limity, panel konta i maile próby też niosą źródło do pomiaru.
		for (const p of ['limit_analysis', 'limit_ai_chat', 'limit_analysis_view', 'limit_report', 'panel_plan', 'mail_trial_end', 'mail_morning_trial']) {
			assert.ok(isPlacement(p), p);
		}
		assert.equal(pricingHref('mail_trial_end'), '/cennik?oferta=pro_week&z=mail_trial_end');
	});
});

describe('licznik (daty 2099)', () => {
	const DZIEN = '2099-12-30';

	before(async () => {
		await mongoose.connect(process.env.DATABASE_URL, { serverSelectionTimeoutMS: 20000 });
		await UpsellStat.deleteMany({ day: { $gte: '2099-12-01', $lte: '2099-12-31' } });
	});

	after(async () => {
		await UpsellStat.deleteMany({ day: { $gte: '2099-12-01', $lte: '2099-12-31' } });
		await mongoose.disconnect();
	});

	test('sumy per dzień i miejsce, bez żadnego pola o osobie', async () => {
		assert.equal(await recordUpsell({ placement: 'coupon_days3', event: 'view', day: DZIEN }), true);
		await recordUpsell({ placement: 'coupon_days3', event: 'view', day: DZIEN });
		await recordUpsell({ placement: 'coupon_days3', event: 'click', day: DZIEN });
		await recordUpsell({ placement: 'coupon_days3', event: 'checkout', day: DZIEN });
		await recordUpsell({ placement: 'coupon_days3', event: 'purchase', day: DZIEN });

		const wpis = await UpsellStat.findOne({ day: DZIEN, placement: 'coupon_days3' }).lean();
		assert.deepEqual(
			{ views: wpis.views, clicks: wpis.clicks, checkouts: wpis.checkouts, purchases: wpis.purchases },
			{ views: 2, clicks: 1, checkouts: 1, purchases: 1 }
		);
		assert.deepEqual(Object.keys(wpis).sort(), ['_id', 'checkouts', 'clicks', 'day', 'placement', 'purchases', 'views']);
	});

	test('nieznane miejsce albo zdarzenie nie zapisuje nic', async () => {
		assert.equal(await recordUpsell({ placement: 'hack', event: 'view', day: DZIEN }), false);
		assert.equal(await recordUpsell({ placement: 'coupon_days3', event: 'delete', day: DZIEN }), false);
		assert.equal(await UpsellStat.countDocuments({ day: DZIEN, placement: 'hack' }), 0);
	});

	test('zestawienie: konwersje z sum, wszystkie miejsca w tabeli', async () => {
		await recordUpsell({ placement: 'coupon_days3', event: 'view', day: shiftDay(DZIEN, -1) });
		const s = await upsellSummary({ days: 14, today: DZIEN });
		const k = s.placements.find((p) => p.placement === 'coupon_days3');
		assert.equal(k.views, 3);
		assert.equal(k.ctr, 33.3);
		assert.equal(k.purchaseRate, 100);
		assert.equal(s.placements.length, Object.keys(UPSELL_PLACEMENTS).length);
		assert.equal(s.from, '2099-12-17');
	});

	test('trasa zdarzeń: serwer przyjmuje z przeglądarki tylko wyświetlenie i kliknięcie', async () => {
		const zadanie = (body) =>
			new Request('http://localhost/api/upsell/event', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: typeof body === 'string' ? body : JSON.stringify(body),
			});
		// `purchase` z przeglądarki nie może nabić zakupów — odpowiedź 204, zapisu brak.
		const przed = await UpsellStat.countDocuments({ placement: 'coupon_days3', purchases: { $gt: 0 } });
		assert.equal((await POST(zadanie({ placement: 'coupon_days3', event: 'purchase' }))).status, 204);
		assert.equal((await POST(zadanie('nie-json'))).status, 204);
		assert.equal(await UpsellStat.countDocuments({ placement: 'coupon_days3', purchases: { $gt: 0 } }), przed);
	});
});
