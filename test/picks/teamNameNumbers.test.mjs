import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Liczby w nazwach klubów nie są progiem goli.
 *
 * POWÓD ISTNIENIA TEGO PLIKU. Parser brał próg z PIERWSZEJ liczby w selekcji. Plakietka
 * „1899 Hoffenheim powyżej 0.5 gola" (Mönchengladbach – Hoffenheim, 17.10.2026; Werder –
 * Hoffenheim, 30.10.2026) zapisała się jako „gość powyżej 1899 goli", tak samo „FSV Mainz 05"
 * (próg 5), „RED Star FC 93" (93) i „FC Basel 1893" (1893). Rozliczenie liczy `gole > próg`,
 * więc każdy z nich przegrał bez względu na wynik — i wszedł do publicznej skuteczności.
 */

setupEnv();

const { normalizePick, settlePick } = await import('@/lib/picks/markets');

const RYWAL = 'Werder Bremen';
const KLUBY = ['1899 Hoffenheim', 'FSV Mainz 05', 'RED Star FC 93', 'FC Basel 1893'];

const BRZMIENIA = [
	{ jezyk: 'PL', powyzej: (n) => `${n} powyżej 0.5 gola`, ponizej: (n) => `${n} poniżej 1.5 gola` },
	{ jezyk: 'EN', powyzej: (n) => `${n} over 0.5 goals`, ponizej: (n) => `${n} under 1.5 goals` },
];

describe('gole drużyny: liczba z nazwy klubu nie jest progiem', () => {
	for (const klub of KLUBY) {
		for (const strona of ['home', 'away']) {
			const druzyny = strona === 'home' ? { homeName: klub, awayName: RYWAL } : { homeName: RYWAL, awayName: klub };

			for (const { jezyk, powyzej, ponizej } of BRZMIENIA) {
				test(`${klub} (${strona}), ${jezyk}, powyżej 0.5`, () => {
					assert.deepEqual(normalizePick({ market: 'Gole drużyny', selection: powyzej(klub), ...druzyny }), {
						type: 'teamGoals',
						side: strona,
						dir: 'over',
						line: 0.5,
					});
				});

				test(`${klub} (${strona}), ${jezyk}, poniżej 1.5`, () => {
					assert.deepEqual(normalizePick({ market: 'Team goals', selection: ponizej(klub), ...druzyny }), {
						type: 'teamGoals',
						side: strona,
						dir: 'under',
						line: 1.5,
					});
				});
			}
		}
	}

	test('próg wpisany przed nazwą klubu też czytamy dobrze', () => {
		assert.deepEqual(
			normalizePick({
				market: 'Gole drużyny',
				selection: 'Powyżej 0,5 gola: FC Basel 1893',
				homeName: 'FC Basel 1893',
				awayName: 'FC Zürich',
			}),
			{ type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 }
		);
	});
});

describe('rozliczenie po naprawie — trafienie zależy od wyniku, nie od nazwy', () => {
	const typ = normalizePick({
		market: 'Gole drużyny',
		selection: '1899 Hoffenheim powyżej 0.5 gola',
		homeName: 'Borussia Mönchengladbach',
		awayName: '1899 Hoffenheim',
	});

	test('gość strzelił → wygrana (wcześniej przegrana, bo 1 > 1899 to fałsz)', () => {
		assert.equal(settlePick(typ, { home: 2, away: 1 }), 'won');
	});

	test('gość nie strzelił → przegrana', () => {
		assert.equal(settlePick(typ, { home: 1, away: 0 }), 'lost');
	});
});

describe('kierunek nie z nazwy klubu („Rovers" zawiera „over", „Sunderland" — „under")', () => {
	test('Blackburn Rovers poniżej 1.5 gola → under', () => {
		assert.deepEqual(
			normalizePick({
				market: 'Gole drużyny',
				selection: 'Blackburn Rovers poniżej 1.5 gola',
				homeName: 'Blackburn Rovers',
				awayName: 'Sunderland',
			}),
			{ type: 'teamGoals', side: 'home', dir: 'under', line: 1.5 }
		);
	});

	test('Sunderland powyżej 0.5 gola → over', () => {
		assert.deepEqual(
			normalizePick({
				market: 'Gole drużyny',
				selection: 'Sunderland powyżej 0.5 gola',
				homeName: 'Blackburn Rovers',
				awayName: 'Sunderland',
			}),
			{ type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 }
		);
	});
});

describe('suma goli: ta sama zasada', () => {
	test('liczba z nazwy w selekcji sumy nie jest progiem', () => {
		assert.deepEqual(
			normalizePick({
				market: 'Suma goli',
				selection: 'FSV Mainz 05 – 1899 Hoffenheim: powyżej 2.5 gola',
				homeName: 'FSV Mainz 05',
				awayName: '1899 Hoffenheim',
			}),
			{ type: 'totalGoals', dir: 'over', line: 2.5 }
		);
	});

	test('zapis użytkownika „Over 2.5" / „Under 2.5" bez zmian', () => {
		const druzyny = { homeName: 'FSV Mainz 05', awayName: '1899 Hoffenheim' };
		assert.deepEqual(normalizePick({ market: 'Suma goli', selection: 'Over 2.5', ...druzyny }), {
			type: 'totalGoals',
			dir: 'over',
			line: 2.5,
		});
		assert.deepEqual(normalizePick({ market: 'Suma goli', selection: 'Under 2.5', ...druzyny }), {
			type: 'totalGoals',
			dir: 'under',
			line: 2.5,
		});
	});

	test('próg spoza oferty (jedyna liczba to rok założenia) → typ nierozpoznany, nie przegrany', () => {
		assert.equal(
			normalizePick({ market: 'Suma goli', selection: 'powyżej 1893', homeName: 'FC Basel 1893', awayName: 'FC Zürich' }),
			null
		);
	});
});
