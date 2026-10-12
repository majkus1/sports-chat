import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Strony „typ na mecz" — części czyste: adres, odczyt identyfikatora, rozliczenie typu,
 * liczby i treść. Adres musi być stabilny (to po nim Google zna stronę), a z każdego
 * adresu ma dać się odczytać mecz, nawet gdy dostawca poprawi pisownię drużyny.
 */

setupEnv();
const {
	slugify, matchSlug, matchPath, fixtureIdFromSlug, pickOutcome, previewNumbers, previewLeague, matchPreviewContent, sportsEventLd,
} = await import('@/lib/seo/matchPreview');

const F = {
	fixtureId: '1498865',
	homeName: 'Galatasaray',
	awayName: 'Barcelona',
	leagueId: 2,
	kickoff: '2026-10-13T19:00:00Z',
	lambdaHome: 1.08,
	lambdaAway: 1.94,
	markets: { home: 0.231, draw: 0.238, away: 0.531 },
	hint: { key: 'away', selection: 'Barcelona (goście)', probability: 53, base: 30.7, lift: 22 },
	result: { home: null, away: null, status: null },
};

describe('adres strony meczu', () => {
	test('nazwy bez znaków diakrytycznych, małe litery, myślniki', () => {
		assert.equal(slugify('Górnik Zabrze'), 'gornik-zabrze');
		assert.equal(slugify('Wisła Płock'), 'wisla-plock');
		assert.equal(slugify('Bodø/Glimt'), 'bodo-glimt');
		assert.equal(slugify('Borussia Mönchengladbach'), 'borussia-monchengladbach');
		assert.equal(slugify('Brighton & Hove Albion'), 'brighton-and-hove-albion');
		assert.equal(slugify('1. FC Köln'), '1-fc-koln');
		assert.equal(slugify(''), 'druzyna');
	});

	test('adres niesie obie drużyny i id; id da się z niego odczytać', () => {
		assert.equal(matchPath(F), '/typ/galatasaray-barcelona-1498865');
		assert.equal(fixtureIdFromSlug(matchSlug(F)), '1498865');
		// Inna pisownia nazw w starym linku nie gubi meczu — strona przekieruje na właściwy adres.
		assert.equal(fixtureIdFromSlug('galatasaray-sk-fc-barcelona-1498865'), '1498865');
		assert.equal(fixtureIdFromSlug('bez-identyfikatora'), null);
	});
});

describe('typ po meczu', () => {
	test('trafiony i chybiony po wyniku z 90 minut', () => {
		assert.equal(pickOutcome({ ...F, result: { home: 1, away: 2, status: 'FT' } }), 'won');
		assert.equal(pickOutcome({ ...F, result: { home: 2, away: 2, status: 'FT' } }), 'lost');
		assert.equal(pickOutcome({ ...F, hint: { ...F.hint, key: 'X2' }, result: { home: 2, away: 2, status: 'FT' } }), 'won');
	});

	test('bez wyniku, bez typu albo po dogrywce — bez werdyktu', () => {
		assert.equal(pickOutcome(F), null);
		assert.equal(pickOutcome({ ...F, hint: { key: null }, result: { home: 1, away: 0, status: 'FT' } }), null);
		assert.equal(pickOutcome({ ...F, result: { home: 1, away: 2, status: 'AET' } }), null);
	});
});

describe('liczby i treść', () => {
	test('szanse w procentach, gole z przecinkiem po polsku i kropką po angielsku', () => {
		assert.deepEqual(previewNumbers(F, 'pl'), { home: 23, draw: 24, away: 53, lambdaHome: '1,1', lambdaAway: '1,9' });
		assert.equal(previewNumbers(F, 'en').lambdaAway, '1.9');
	});

	test('rozgrywki: polska nazwa dla znanych, inaczej nazwa i kraj od dostawcy', () => {
		assert.equal(previewLeague(F), 'Liga Mistrzów');
		assert.equal(previewLeague({ leagueId: 71, leagueName: 'Serie A', leagueCountry: 'Brazil' }), 'Serie A, Brazil');
		assert.equal(previewLeague({ leagueId: 999 }), null);
	});

	for (const locale of ['pl', 'en']) {
		test(`${locale}: tytuł i opis z liczb, bez języka zakładów`, () => {
			const c = matchPreviewContent(locale);
			const when = c.when(F.kickoff, locale);
			const tytul = c.title(F.homeName, F.awayName, when.data);
			const opis = c.description(F.homeName, F.awayName, previewNumbers(F, locale), previewLeague(F), when);
			assert.ok(tytul.includes('Galatasaray'));
			assert.ok(tytul.includes(locale === 'en' ? '13/10/2026' : '13.10.2026'), tytul);
			assert.ok(opis.includes('53%'));
			assert.ok(opis.includes('21:00'));
			const calosc = JSON.stringify(c) + tytul + opis + c.locked + c.how;
			assert.equal(/kurs|obstaw|stawk|odds|stake|wager|bookmaker|bukmach/i.test(calosc), false);
		});
	}

	test('dane strukturalne: nazwa drużyny nie zamknie znacznika skryptu', () => {
		const ld = sportsEventLd({ forecast: { ...F, homeName: '</script><b>x' }, url: 'https://x/pl/typ/a-1', name: 'a' }).__html;
		assert.equal(ld.includes('</script>'), false);
		assert.ok(JSON.parse(ld).homeTeam.name.startsWith('</script>'));
	});
});
