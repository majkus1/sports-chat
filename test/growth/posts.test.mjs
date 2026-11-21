import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Posty do ręcznej publikacji (kupon dnia, rozliczenie wczoraj, tydzień w liczbach) — bez sieci i bazy.
 *
 * Pilnujemy: limitu X (280, liczone jak X) także przy długich nazwach i wielu pudłach, limitu opisu
 * na TikToku/Instagramie, „18+" w każdym wariancie, linku z utm, który przechodzi walidację źródła
 * rejestracji (ten sam kanał i kampania), pudeł wymienionych z nazwy i braku zachęt do gry.
 */

setupEnv();
const { buildCouponVariants, buildRecapVariants, buildWeekVariants, LIMITS, POST_CAMPAIGNS } = await import('@/lib/growth/posts');
const { xLength, X_LIMIT } = await import('@/lib/social/posts');
const { captureTouch } = await import('@/lib/growth/source');

const SITE = 'https://czatsportowy.pl';
// Zachęty do gry i reklama zakładów — nie mogą się pojawić w żadnym poście.
const ZACHETY = /obstaw|postaw|zagraj|\bgraj\b|wygraj|stawk|bukmacher[a-z]* [A-Z]|bonus|promocj|kod promo|zarób|zarabiaj|freebet|\bbet\b/i;
// W rozliczeniu i tygodniu nie ma kursów — kurs stoi tylko w poście z kuponem.
const KURSY = /kurs|bukmach|odds/i;

const zaGodzine = new Date(Date.now() + 3600_000).toISOString();
const noga = (i, extra = {}) => ({
	fixtureId: String(9_000_000 + i),
	home: `Gospodarze ${i}`,
	away: `Goście ${i}`,
	league: 'Premier League, England',
	leagueId: 39,
	kickoff: zaGodzine,
	key: 'home',
	label: '1',
	selection: `Gospodarze ${i} wygra`,
	probability: 62,
	odds: 1.55,
	status: 'pending',
	...extra,
});
const KUPON = { type: 'daily', status: 'pending', totalOdds: 3.72, chance: 38, legs: [noga(1), noga(2), noga(3)] };

function sprawdzWspolne(warianty, kind) {
	assert.deepEqual(
		warianty.map((v) => v.id),
		['x', 'facebook', 'tiktok', 'instagram']
	);
	for (const v of warianty) {
		assert.ok(v.text.includes('18+'), `${v.id}: brak 18+`);
		assert.ok(!ZACHETY.test(v.text), `${v.id}: zachęta do gry: ${v.text.match(ZACHETY)?.[0]}`);
		assert.ok(v.length <= LIMITS[v.id], `${v.id}: ${v.length} > ${LIMITS[v.id]}`);
		// Link z utm: przechwycony przy wejściu daje dokładnie ten kanał i kampanię.
		const t = captureTouch({ href: v.link });
		assert.equal(t.utmSource, v.id, v.id);
		assert.equal(t.utmMedium, 'social');
		assert.equal(t.utmCampaign, POST_CAMPAIGNS[kind]);
	}
	const x = warianty.find((v) => v.id === 'x');
	assert.equal(x.length, xLength(x.text));
	assert.ok(x.length <= X_LIMIT);
	assert.ok(x.text.includes(x.link), 'X: link w treści');
	assert.ok(warianty.find((v) => v.id === 'facebook').text.includes(warianty.find((v) => v.id === 'facebook').link));
	for (const id of ['tiktok', 'instagram']) {
		const v = warianty.find((w) => w.id === id);
		assert.equal(v.bioLink, true);
		assert.ok(v.text.includes('link w bio'));
		assert.ok(!/https?:\/\//.test(v.text), `${id}: link w opisie i tak nie działa`);
	}
}

describe('kupon dnia', () => {
	test('cztery formaty, kursy i szansa modelu, link z utm', () => {
		const w = buildCouponVariants({ coupon: KUPON, previous: { status: 'lost' }, siteUrl: SITE });
		sprawdzWspolne(w, 'coupon');
		const fb = w.find((v) => v.id === 'facebook').text;
		assert.ok(fb.includes('kurs łączny 3,72'));
		assert.ok(fb.includes('model 62%'));
		assert.ok(fb.includes('Wczorajszy kupon: ❌ nie wszedł'));
		assert.ok(fb.includes('bywa chybiony'));
	});

	test('X to dokładnie post z `lib/social/posts.js` (ten sam link i kampania)', () => {
		const x = buildCouponVariants({ coupon: KUPON, siteUrl: SITE })[0];
		assert.ok(x.text.includes(`${SITE}/pl/typy-na-dzis?utm_source=x&utm_medium=social&utm_campaign=kupon-dnia`));
	});

	test('długie nazwy i osiem nóg — X nadal w limicie', () => {
		const dlugie = Array.from({ length: 8 }, (_, i) =>
			noga(i, { home: `Club Atlético Independiente de Avellaneda ${i}`, away: `Asociación Atlética Argentinos Juniors ${i}`, selection: `X2 (Asociación Atlética Argentinos Juniors ${i} lub remis)` })
		);
		const w = buildCouponVariants({ coupon: { ...KUPON, legs: dlugie }, siteUrl: SITE });
		sprawdzWspolne(w, 'coupon');
	});

	test('brak kuponu albo pierwszy mecz już trwa → nic', () => {
		assert.equal(buildCouponVariants({ coupon: null, siteUrl: SITE }), null);
		assert.equal(buildCouponVariants({ coupon: { ...KUPON, legs: [noga(1, { kickoff: new Date(Date.now() - 60_000).toISOString() })] }, siteUrl: SITE }), null);
	});
});

describe('rozliczenie wczoraj', () => {
	const typy = [
		{ home: 'Legia', away: 'Lech', selection: '1X', status: 'lost', score: '0:2' },
		{ home: 'Arsenal', away: 'Chelsea', selection: 'Arsenal wygra', status: 'won', score: '2:0' },
		{ home: 'Milan', away: 'Inter', selection: 'Gole obu drużyn', status: 'won', score: '1:1' },
	];

	test('bilans z pudłami, pudła z nazwy, bez kursów', () => {
		const w = buildRecapVariants({ date: '2099-03-09', picks: typy, daily: { status: 'won', home: 'Arsenal', away: 'Chelsea', score: '2:0' }, coupon: { status: 'lost' }, siteUrl: SITE });
		sprawdzWspolne(w, 'recap');
		for (const v of w) {
			assert.ok(v.text.includes('2 z 3 trafionych, 1 pudło'), v.id);
			assert.ok(v.text.includes('Legia – Lech'), `${v.id}: pudło z nazwy`);
			assert.ok(!KURSY.test(v.text), `${v.id}: kurs w rozliczeniu`);
		}
		assert.ok(w[0].text.includes('Kupon dnia: ❌ nie wszedł'));
		// Na Facebooku pełna lista, także trafienia.
		assert.ok(w[1].text.includes('✅ Milan – Inter'));
	});

	test('trzydzieści pudeł z długimi nazwami: X w limicie, liczba pudeł zostaje', () => {
		const duzo = Array.from({ length: 30 }, (_, i) => ({
			home: `Club Atlético Independiente de Avellaneda ${i}`,
			away: `Asociación Atlética Argentinos Juniors ${i}`,
			selection: 'X2',
			status: i < 20 ? 'lost' : 'won',
			score: '2:0',
		}));
		const w = buildRecapVariants({ date: '2099-03-09', picks: duzo, siteUrl: SITE });
		sprawdzWspolne(w, 'recap');
		assert.ok(w[0].text.includes('10 z 30 trafionych, 20 pudeł'));
	});

	test('nic rozliczonego → nic', () => {
		assert.equal(buildRecapVariants({ date: '2099-03-09', picks: [{ home: 'A', away: 'B', selection: '1', status: 'void' }], daily: { status: 'pending' }, siteUrl: SITE }), null);
	});
});

describe('tydzień w liczbach', () => {
	test('trafione z obietnicą i normą, typ dnia, kupon; pudła policzone', () => {
		const w = buildWeekVariants({
			from: '2099-03-03',
			to: '2099-03-09',
			picks: { won: 52, total: 68, promised: 74.3, base: 61.2 },
			daily: { won: 4, total: 7 },
			coupon: { won: 2, total: 6 },
			siteUrl: SITE,
		});
		sprawdzWspolne(w, 'week');
		assert.ok(w[0].text.includes('Typy modelu: 52 z 68 trafionych (76%)'));
		assert.ok(w[1].text.includes('Model zapowiadał średnio 74%'));
		assert.ok(w[1].text.includes('Nie weszło: 16 typów modelu'));
		assert.ok(w[1].text.includes('61%'));
		for (const v of w) assert.ok(!KURSY.test(v.text), v.id);
	});

	test('pusty tydzień → nic', () => {
		assert.equal(buildWeekVariants({ from: '2099-03-03', to: '2099-03-09', picks: { won: 0, total: 0 }, siteUrl: SITE }), null);
	});
});
