import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kursy dostawcy → prawdopodobieństwa rynkowe po zdjęciu marży.
 *
 * To liczba, która decyduje o sufcie „to już wszyscy wiedzą". Testy pilnują, że marża jest
 * faktycznie zdejmowana (1,04 to nie 96%), że podwójna szansa wynika z odmarżowanego 1X2,
 * a nie z osobnego rynku, i że brak rynku daje `null`, a nie zero — zero odczytano by jako
 * „rynek uważa to za niemożliwe".
 */

setupEnv();

const { normalizeOddsFixture, impliedFromOdds } = await import('@/lib/football/normalize');

/** Odpowiedź `odds?fixture=` w kształcie dostawcy, dwóch bukmacherów. */
function odpowiedz({ home = 1.45, draw = 4.5, away = 7.0, awayOver05 = 1.25, awayUnder05 = 3.8 } = {}) {
	const bets = [
		{
			name: 'Match Winner',
			values: [
				{ value: 'Home', odd: String(home) },
				{ value: 'Draw', odd: String(draw) },
				{ value: 'Away', odd: String(away) },
			],
		},
		{
			name: 'Total - Away',
			values: [
				{ value: 'Over 0.5', odd: String(awayOver05) },
				{ value: 'Under 0.5', odd: String(awayUnder05) },
			],
		},
	];
	return {
		fixture: { id: 1, date: '2026-09-05T14:00:00+00:00' },
		league: { id: 39, name: 'Premier League', country: 'England' },
		bookmakers: [
			{ id: 1, name: 'A', bets },
			{ id: 2, name: 'B', bets },
		],
	};
}

describe('prawdopodobieństwa rynkowe', () => {
	test('1X2 po zdjęciu marży sumuje się do stu', () => {
		const implied = impliedFromOdds(normalizeOddsFixture(odpowiedz()).markets);

		assert.ok(Math.abs(implied.home + implied.draw + implied.away - 100) < 0.2);
		assert.ok(implied.home > 65 && implied.home < 69, `kurs 1,45 to około 67% po marży, wyszło ${implied.home}`);
	});

	test('kurs 1,04 to około 92%, nie 96%', () => {
		const implied = impliedFromOdds(normalizeOddsFixture(odpowiedz({ home: 1.04, draw: 17, away: 51 })).markets);

		assert.ok(implied.home > 91 && implied.home < 94, `wyszło ${implied.home}`);
	});

	test('podwójna szansa wynika z odmarżowanego 1X2', () => {
		const implied = impliedFromOdds(normalizeOddsFixture(odpowiedz()).markets);

		assert.ok(Math.abs(implied['1X'] - (implied.home + implied.draw)) < 0.11);
		assert.ok(Math.abs(implied.X2 - (implied.away + implied.draw)) < 0.11);
	});

	test('„gość strzeli" bierze próg 0.5 drużyny i zdejmuje marżę z pary tak/nie', () => {
		const implied = impliedFromOdds(normalizeOddsFixture(odpowiedz()).markets);

		assert.ok(implied.awayScores > 74 && implied.awayScores < 77, `wyszło ${implied.awayScores}`);
		assert.equal(implied.homeScores, null, 'rynku gospodarza nie było w odpowiedzi');
	});

	test('bez kursów nie ma sufitu — null, nie zero', () => {
		assert.equal(impliedFromOdds(null), null);
		assert.equal(impliedFromOdds(normalizeOddsFixture(null)?.markets), null);
		const bezRynkow = normalizeOddsFixture({ fixture: { id: 1 }, bookmakers: [] });
		assert.equal(impliedFromOdds(bezRynkow.markets), null);
	});

	test('mediana po bukmacherach, nie pierwszy z brzegu', () => {
		const raw = odpowiedz();
		raw.bookmakers[1].bets[0].values[0].odd = '1.55';
		const implied = impliedFromOdds(normalizeOddsFixture(raw).markets);
		const samo145 = impliedFromOdds(normalizeOddsFixture(odpowiedz()).markets);

		assert.ok(implied.home < samo145.home, 'wyższy kurs u drugiego bukmachera obniża medianę szans');
	});
});
