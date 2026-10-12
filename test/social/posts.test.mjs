import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Post na X z typem dnia — bez sieci i bazy.
 *
 * Pilnujemy limitu 280 znaków liczonego tak jak X (link = 23, emoji = 2), tego, że przy długich
 * nazwach odpadają dodatki, a nie mecz, typ, link i „18+", oraz że w treści nie ma słowa
 * o zakładach — post idzie publicznie, pod marką serwisu.
 */

setupEnv();
const { buildDailyPost, xLength, xIntentUrl, leagueLabel, X_LIMIT } = await import('@/lib/social/posts');
const { buildMorningEmail } = await import('@/lib/morning/build');

const ZAKAZANE = /kurs|zak[łl]ad|obstaw|stawk|bukmach|\bbet\b|odds|stake|wager|bookmaker/i;
const SITE = 'https://czatsportowy.pl';
const TYP = {
	fixtureId: '1',
	home: 'Galatasaray',
	away: 'Barcelona',
	league: 'UEFA Champions League, World',
	leagueId: 2,
	kickoff: '2026-10-13T19:00:00Z',
	selection: 'Barcelona (goście)',
	probability: 68,
	base: 31,
	status: 'pending',
};
const WCZORAJ = { home: 'Atalanta', away: 'Venezia', status: 'won', score: '2:0' };

describe('długość jak w X', () => {
	test('link liczy się jako 23 znaki, emoji po 2, polskie litery po 1', () => {
		assert.equal(xLength('https://czatsportowy.pl/pl/typy-na-dzis?utm_source=x&utm_medium=social'), 23);
		assert.equal(xLength('⚽'), 2);
		assert.equal(xLength('✅'), 2);
		assert.equal(xLength('zażółć'), 6);
	});
});

describe('post z typem dnia', () => {
	test('komplet: mecz, godzina po polsku, typ z normą, wczoraj, dorobek, link ze źródłem, hashtagi ligi', () => {
		const { text, length } = buildDailyPost({ daily: TYP, yesterday: WCZORAJ, record: { won: 12, total: 15 }, siteUrl: SITE });
		assert.ok(text.startsWith('⚽ Typ dnia · 13.10'));
		assert.ok(text.includes('Galatasaray – Barcelona, 21:00 · Liga Mistrzów'));
		assert.ok(text.includes('Model: Barcelona (goście) · 68% (zwykle 31%)'));
		assert.ok(text.includes('Wczoraj: Atalanta – Venezia ✅ 2:0'));
		assert.ok(text.includes('Typ dnia dotąd: 12/15 trafionych'));
		assert.ok(text.includes(`${SITE}/pl/typy-na-dzis?utm_source=x&utm_medium=social&utm_campaign=typ-dnia`));
		assert.ok(text.includes('18+'));
		assert.ok(text.endsWith('#LigaMistrzów #typdnia'));
		assert.ok(length <= X_LIMIT);
		assert.equal(length, xLength(text));
	});

	test('pudło też idzie do posta; mecz nierozegrany wczoraj — bez linii', () => {
		const pudlo = buildDailyPost({ daily: TYP, yesterday: { ...WCZORAJ, status: 'lost', score: '2:2' }, siteUrl: SITE }).text;
		assert.ok(pudlo.includes('Wczoraj: Atalanta – Venezia ❌ 2:2'));
		const odwolany = buildDailyPost({ daily: TYP, yesterday: { ...WCZORAJ, status: 'void' }, siteUrl: SITE }).text;
		assert.equal(odwolany.includes('Wczoraj'), false);
	});

	test('długie nazwy: odpadają dodatki, a mecz, typ, link i 18+ zostają w limicie', () => {
		const dlugi = {
			...TYP,
			home: 'Club Atlético Independiente de Avellaneda Reserves',
			away: 'Asociación Atlética Argentinos Juniors Reserves',
			selection: 'X2 (Asociación Atlética Argentinos Juniors Reserves lub remis)',
			leagueId: 999,
			league: 'Torneo de Reserva, Argentina',
		};
		const post = buildDailyPost({
			daily: dlugi,
			yesterday: { home: 'Deportivo Riestra Reserves', away: 'Gimnasia y Esgrima La Plata Reserves', status: 'won', score: '1:0' },
			record: { won: 120, total: 150 },
			siteUrl: SITE,
		});
		assert.ok(post.length <= X_LIMIT, `${post.length}`);
		assert.ok(post.text.includes(dlugi.home));
		assert.ok(post.text.includes(dlugi.selection));
		assert.ok(post.text.includes('/pl/typy-na-dzis'));
		assert.ok(post.text.includes('18+'));
		// Dodatki poszły pierwsze: ani wczorajszego wyniku, ani dorobku.
		assert.equal(post.text.includes('Wczoraj'), false);
		assert.equal(post.text.includes('dotąd'), false);
	});

	test('długie, ale realne nazwy: gdy wczorajszy wynik się nie mieści, zostaje krótszy dorobek', () => {
		const post = buildDailyPost({
			daily: { ...TYP, home: 'Borussia Mönchengladbach', away: 'Eintracht Frankfurt', selection: 'X2 (Eintracht Frankfurt lub remis)', leagueId: 78 },
			yesterday: { home: 'Atletico Madrid', away: 'Manchester United', status: 'won', score: '1:2' },
			record: { won: 12, total: 15 },
			siteUrl: SITE,
		});
		assert.ok(post.length <= X_LIMIT, `${post.length}`);
		assert.equal(post.text.includes('Wczoraj'), false);
		assert.ok(post.text.includes('Typ dnia dotąd: 12/15 trafionych'));
		assert.ok(post.text.includes('#Bundesliga #typdnia'));
	});

	test('bez typu dnia nie ma posta', () => {
		assert.equal(buildDailyPost({ daily: null, siteUrl: SITE }), null);
	});

	test('ani słowa o zakładach', () => {
		const { text } = buildDailyPost({ daily: TYP, yesterday: WCZORAJ, record: { won: 1, total: 2 }, siteUrl: SITE });
		assert.equal(ZAKAZANE.test(text), false);
	});

	test('nazwa rozgrywek: polska dla znanych, inaczej z nazwy dostawcy', () => {
		assert.equal(leagueLabel(106, 'Ekstraklasa, Poland'), 'Ekstraklasa');
		assert.equal(leagueLabel(71, 'Serie A, Brazil'), 'Serie A');
		assert.equal(leagueLabel(null, null), null);
	});

	test('odnośnik do X niesie cały tekst, z nowymi liniami i emoji', () => {
		const url = xIntentUrl('⚽ a\nb & c');
		assert.ok(url.startsWith('https://x.com/intent/tweet?text='));
		assert.equal(decodeURIComponent(url.split('text=')[1]), '⚽ a\nb & c');
	});
});

describe('ramka w porannym mailu', () => {
	const BAZA = {
		name: 'mld',
		locale: 'pl',
		date: '2026-10-13',
		siteUrl: SITE,
		unsubscribeUrl: `${SITE}/u`,
		yesterday: { model: [], mine: [] },
		today: [{ fixtureId: '1', home: 'A', away: 'B', selection: '1X', probability: 80, base: 69, kickoffLocal: '20:00' }],
		favorites: [],
		round: null,
	};

	test('tylko gdy usługa ją poda (administrator) — w HTML i w wersji tekstowej', () => {
		const post = buildDailyPost({ daily: TYP, siteUrl: SITE });
		const socialPost = { ...post, intentUrl: xIntentUrl(post.text) };
		const z = buildMorningEmail({ ...BAZA, socialPost });
		assert.ok(z.html.includes('Opublikuj na X'));
		assert.ok(z.html.includes('https://x.com/intent/tweet?text='));
		assert.ok(z.text.includes('Post na X'));
		const bez = buildMorningEmail(BAZA);
		assert.equal(bez.html.includes('Opublikuj na X'), false);
		assert.equal(bez.text.includes('Post na X'), false);
	});
});
