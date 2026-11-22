import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Strony SEO etapu „ruch" — bez bazy: strony lig, zapowiedzi meczów, mapa witryny, metadane.
 *
 * Najważniejsze: pusta strona (brak liczb modelu) ma `noindex` i nie trafia do mapy witryny,
 * a strony lig są wyłącznie dla lig sprawdzonych na produkcji.
 */

setupEnv();
const { LEAGUE_PAGES, leaguePageBySlug, leaguePath } = await import('@/lib/seo/leagues');
const { isEstablishedLeague } = await import('@/lib/football/leagues');
const { leaguePageModel, leaguePageContent } = await import('@/lib/seo/leaguePage');
const { leagueSitemapEntries } = await import('@/lib/seo/sitemapLeagues');
const { matchStory, teamForm, shotAverages, MIN_FORM } = await import('@/lib/seo/matchStory');
const { buildMetadata } = await import('@/lib/seo/metadata');
const { sportsEventData, sportsEventLd, matchPreviewContent } = await import('@/lib/seo/matchPreview');
const { SITE_URL } = await import('@/lib/seo/config');

const NOW = new Date('2099-03-10T10:00:00Z');
const forecast = (extra = {}) => ({
	fixtureId: '99000001',
	leagueId: 39,
	leagueName: 'Premier League',
	leagueCountry: 'England',
	homeId: 1,
	awayId: 2,
	homeName: 'Arsenal',
	awayName: 'Chelsea',
	kickoff: new Date('2099-03-10T17:30:00Z'),
	markets: { home: 0.55, draw: 0.25, away: 0.2, over25: 0.58, btts: 0.51 },
	lambdaHome: 1.8,
	lambdaAway: 1.0,
	hint: { key: 'home', selection: 'Arsenal wygra', probability: 55, base: 45, lift: 10 },
	result: { home: null, away: null, status: null },
	...extra,
});

describe('lista stron lig', () => {
	test('tylko ligi sprawdzone (poziom 1 i 2), bez okresu próbnego', () => {
		for (const l of LEAGUE_PAGES) assert.ok(isEstablishedLeague(l.id), `${l.slug} (${l.id})`);
	});

	test('unikalne adresy i identyfikatory, adres z małych liter i myślników, nazwy pl i en', () => {
		assert.equal(new Set(LEAGUE_PAGES.map((l) => l.slug)).size, LEAGUE_PAGES.length);
		assert.equal(new Set(LEAGUE_PAGES.map((l) => l.id)).size, LEAGUE_PAGES.length);
		for (const l of LEAGUE_PAGES) {
			assert.match(l.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
			assert.ok(l.pl && l.en);
			assert.equal(leaguePageBySlug(l.slug), l);
		}
		assert.equal(leaguePageBySlug('nie-ma-takiej'), null);
	});
});

describe('strona ligi', () => {
	test('bez meczów — nieindeksowana, z rozliczeniem', () => {
		const m = leaguePageModel({ matches: [], settled: [{ fixtureId: '1', status: 'won', homeName: 'A', awayName: 'B', selection: '1', kickoff: NOW }], now: NOW });
		assert.equal(m.indexable, false);
		assert.deepEqual(m.record, { won: 1, total: 1 });
	});

	test('mecz bez liczb modelu nie czyni strony indeksowaną', () => {
		const m = leaguePageModel({ matches: [forecast({ markets: { home: null } })], now: NOW });
		assert.equal(m.indexable, false);
		assert.equal(m.today.length, 0);
	});

	test('mecz z liczbami: indeksowana, typ przed meczem za kłódką, typ dnia odkryty', () => {
		const m = leaguePageModel({ matches: [forecast()], now: NOW });
		assert.equal(m.indexable, true);
		assert.equal(m.today[0].pick.state, 'locked');
		assert.equal(m.today[0].href, '/typ/arsenal-chelsea-99000001');
		const dzienny = leaguePageModel({ matches: [forecast()], dailyIds: new Set(['99000001']), now: NOW });
		assert.equal(dzienny.today[0].pick.state, 'open');
		assert.equal(dzienny.today[0].pick.selection, 'Arsenal wygra');
	});

	test('mecz jutro trafia do „jutro", po pierwszym gwizdku typ odkryty z wynikiem', () => {
		const jutro = leaguePageModel({ matches: [forecast({ kickoff: new Date('2099-03-11T19:00:00Z') })], now: NOW });
		assert.equal(jutro.tomorrow.length, 1);
		const po = leaguePageModel({
			matches: [forecast({ kickoff: new Date('2099-03-10T08:00:00Z'), result: { home: 2, away: 0, status: 'FT' } })],
			now: NOW,
		});
		assert.equal(po.today[0].pick.state, 'open');
		assert.equal(po.today[0].pick.outcome, 'won');
		assert.equal(po.today[0].score, '2:0');
	});

	test('treść bez języka zakładów i z 18+', () => {
		for (const locale of ['pl', 'en']) {
			const c = leaguePageContent(locale);
			const tekst = [c.lead, c.how, c.empty, c.disclaimer, c.metaDescription(LEAGUE_PAGES[0], 3, { won: 7, total: 10 })].join(' ');
			assert.ok(!/obstaw|stawk|bukmach|kurs|\bodds\b|stake|wager/i.test(tekst), locale);
			assert.ok(c.disclaimer.includes('18+'));
		}
	});
});

describe('metadane: noindex z follow', () => {
	test('pusta strona: noindex, ale robot przechodzi linkami', () => {
		const m = buildMetadata({ locale: 'pl', path: '/typy-na-dzis/premier-league', noindex: true, follow: true });
		assert.deepEqual([m.robots.index, m.robots.follow], [false, true]);
	});

	test('domyślnie jak dotąd: noindex = nofollow; canonical i hreflang pl/en/x-default', () => {
		const m = buildMetadata({ locale: 'en', path: '/typy-na-dzis/premier-league', noindex: true });
		assert.equal(m.robots.follow, false);
		const ok = buildMetadata({ locale: 'en', path: '/typy-na-dzis/premier-league' });
		assert.equal(ok.alternates.canonical, `${SITE_URL}/en/typy-na-dzis/premier-league`);
		assert.deepEqual(Object.keys(ok.alternates.languages).sort(), ['en', 'pl', 'x-default']);
		assert.equal(ok.robots.index, true);
	});
});

describe('mapa witryny: strony lig', () => {
	test('tylko ligi z meczami, oba języki z alternatywami', () => {
		const pl = leaguePageBySlug('premier-league');
		const ek = leaguePageBySlug('ekstraklasa');
		const wpisy = leagueSitemapEntries([{ league: pl, matches: 4 }, { league: ek, matches: 0 }], NOW);
		assert.equal(wpisy.length, 2);
		assert.deepEqual(
			wpisy.map((w) => w.url),
			[`${SITE_URL}/pl${leaguePath(pl)}`, `${SITE_URL}/en${leaguePath(pl)}`]
		);
		assert.deepEqual(Object.keys(wpisy[0].alternates.languages), ['pl', 'en']);
	});

	test('brak aktywnych lig → brak wpisów (pusta strona nie trafia do mapy)', () => {
		assert.deepEqual(leagueSitemapEntries([], NOW), []);
		assert.deepEqual(leagueSitemapEntries(null, NOW), []);
	});
});

describe('zapowiedź meczu', () => {
	const mecz = (homeId, awayId, h, a, dni) => ({
		homeId,
		awayId,
		homeName: `T${homeId}`,
		awayName: `T${awayId}`,
		kickoff: new Date(NOW.getTime() - dni * 86_400_000),
		result: { home: h, away: a, status: 'FT' },
	});
	const formRows = [mecz(1, 3, 2, 0, 3), mecz(4, 1, 1, 1, 7), mecz(1, 5, 0, 1, 14), mecz(2, 6, 3, 1, 4), mecz(7, 2, 0, 0, 10), { ...mecz(1, 8, null, null, 1), result: { status: 'PST' } }];

	test('forma: od najnowszego, z perspektywy drużyny, bez meczów bez wyniku', () => {
		const f = teamForm(formRows, 1);
		assert.deepEqual(
			f.map((m) => `${m.result}${m.gf}:${m.ga}`),
			['W2:0', 'D1:1', 'L0:1']
		);
	});

	test('strzały: średnia z meczów ze statystykami', () => {
		const s = shotAverages(
			[
				{ homeId: 1, awayId: 2, hs: 10, as: 5, hst: 4, ast: 2, date: NOW },
				{ homeId: 3, awayId: 1, hs: 8, as: 14, hst: 3, ast: 6, date: NOW },
				{ homeId: 1, awayId: 4, hs: null, as: null, hst: null, ast: null, date: NOW },
			],
			1
		);
		assert.deepEqual([s.matches, s.shots, s.onTarget], [2, 12, 5]);
	});

	test('bez liczb modelu: enough = false (strona dostaje noindex)', () => {
		assert.equal(matchStory({ forecast: forecast({ markets: {}, lambdaHome: null }) }).enough, false);
	});

	test('z liczbami: faworyt, gole, forma od 2 meczów, kluczowe liczby', () => {
		const s = matchStory({ forecast: forecast(), homeForm: teamForm(formRows, 1), awayForm: teamForm(formRows, 2), locale: 'pl', now: NOW });
		assert.equal(s.enough, true);
		const tekst = s.paragraphs.join(' ');
		assert.ok(tekst.includes('Wyraźnym faworytem według modelu jest Arsenal: 55%'), tekst);
		assert.ok(tekst.includes('Spodziewane gole: 1,8 – 1,0 (łącznie 2,8)'));
		assert.ok(tekst.includes('58%'));
		assert.ok(tekst.includes('Arsenal: 1 wygrana, 1 remis, 1 porażka w ostatnich 3 meczach'));
		assert.ok(tekst.includes('Chelsea: 1 wygrana, 1 remis, 0 porażek'));
		assert.equal(s.form.length, 2);
		assert.ok(s.facts.some((f) => f.value === '58%'));
		assert.ok(!/obstaw|stawk|bukmach|kurs/i.test(tekst));
	});

	test('jeden mecz formy to za mało — bez akapitu o formie', () => {
		const s = matchStory({ forecast: forecast(), homeForm: teamForm(formRows, 1).slice(0, MIN_FORM - 1), locale: 'en', now: NOW });
		assert.equal(s.form.length, 0);
		assert.ok(s.paragraphs[0].includes('clear favourites'));
	});

	test('tytuł pod zapytanie „analiza A – B typ"', () => {
		assert.match(matchPreviewContent('pl').title('Legia', 'Lech', '10.03.2099'), /^Legia – Lech: analiza, typ/);
		assert.match(matchPreviewContent('en').title('Legia', 'Lech', '10.03.2099'), /analysis/);
	});
});

describe('dane strukturalne meczu', () => {
	test('SportsEvent: drużyny, rozgrywki, opis; przełożony mecz nie udaje zaplanowanego', () => {
		const d = sportsEventData({ forecast: forecast(), url: 'https://x', name: 'Arsenal – Chelsea', description: 'Opis' });
		assert.equal(d['@type'], 'SportsEvent');
		assert.equal(d.eventStatus, 'https://schema.org/EventScheduled');
		assert.equal(d.competitor.length, 2);
		assert.equal(d.superEvent.name, 'Premier League');
		assert.equal(d.description, 'Opis');
		assert.equal(sportsEventData({ forecast: forecast({ result: { status: 'PST' } }), url: 'x', name: 'x' }).eventStatus, 'https://schema.org/EventPostponed');
	});

	test('nazwa drużyny nie zamyka znacznika skryptu', () => {
		const html = sportsEventLd({ forecast: forecast({ homeName: '</script><b>' }), url: 'x', name: 'x' }).__html;
		assert.ok(!html.includes('</script>'));
		assert.equal(JSON.parse(html)['@context'], 'https://schema.org');
	});
});
