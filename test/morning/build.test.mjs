import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Poranny mail — treść z gotowych danych, bez sieci.
 *
 * Trzy rzeczy, których nie wolno zepsuć: pusty dzień nie daje maila (inaczej ludzie się
 * wypisują), temat niesie liczby (inaczej mail nic nie mówi w skrzynce), i w treści nie ma
 * ani jednego słowa o zakładach (inaczej to reklama hazardu w skrzynce pocztowej).
 */

setupEnv();

const { buildMorningEmail } = await import('@/lib/morning/build');

const BAZA = {
	name: 'Michał',
	locale: 'pl',
	date: '2026-09-19',
	siteUrl: 'https://czatsportowy.pl',
	unsubscribeUrl: 'https://czatsportowy.pl/api/me/morning-email/unsubscribe?token=abc',
};

const typ = (i, over = {}) => ({
	fixtureId: String(1000 + i),
	home: `Gospodarz ${i}`,
	away: `Gość ${i}`,
	selection: 'X2 (Gość lub remis)',
	probability: 70 + i,
	base: 56.2,
	kickoffLocal: '20:45',
	...over,
});

const warte = (i) => ({
	fixtureId: String(2000 + i),
	home: `Real ${i}`,
	away: `Inter ${i}`,
	league: 'UEFA Champions League',
	kickoffLocal: '21:00',
	probabilities: { home: 48, draw: 26, away: 26 },
});

describe('poranny mail', () => {
	test('pusty dzień nie daje maila', () => {
		const wynik = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [], favorites: [], round: null });
		assert.equal(wynik, null);
	});

	test('kolejka w pełni wytypowana nie jest powodem do maila', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [],
			favorites: [],
			round: { closesLocal: '16:00', picked: 12, total: 12 },
		});
		assert.equal(wynik, null);
	});

	test('temat niesie liczby: typy na dziś i rozliczenie wczoraj', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: {
				model: [
					{ home: 'A', away: 'B', selection: '1X', status: 'won' },
					{ home: 'C', away: 'D', selection: 'X2', status: 'won' },
					{ home: 'E', away: 'F', selection: 'G1', status: 'lost' },
				],
				mine: [],
			},
			today: [typ(1), typ(2), typ(3)],
			favorites: [],
			round: null,
		});
		assert.equal(wynik.subject, 'Model widzi 3 typy na dziś · wczoraj 2/3 trafione');
	});

	test('pokazuje najwyżej pięć typów, z odnośnikami do meczów', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [1, 2, 3, 4, 5, 6, 7].map((i) => typ(i)),
			favorites: [],
			round: null,
		});
		const odnosniki = wynik.text.match(/\/pl\/mecz\/\d+/g) || [];
		assert.equal(odnosniki.length, 5);
		assert.ok(wynik.html.includes('https://czatsportowy.pl/pl/mecz/1001'));
	});

	test('ulubiony mecz bez typu dostaje uczciwy dopisek, nie wymyślony procent', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [],
			favorites: [{ fixtureId: '7', home: 'Legia', away: 'Jagiellonia', kickoffLocal: '17:30' }],
			round: null,
		});
		assert.ok(wynik.text.includes('bez mocnego typu'));
		assert.equal(/\d+%/.test(wynik.text), false, 'żadnego procentu bez typu');
	});

	test('przypomnienie o kolejce tylko gdy brakuje typów', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [],
			favorites: [],
			round: { closesLocal: '16:00', picked: 5, total: 12 },
		});
		assert.ok(wynik.text.includes('masz 5 z 12 typów'));
		assert.equal(wynik.subject, 'Twój poranny przegląd meczów');
	});

	test('ani słowa o zakładach, kursach i graniu — po polsku i po angielsku', () => {
		const dane = {
			yesterday: { model: [{ home: 'A', away: 'B', selection: '1X', status: 'won' }], mine: [] },
			today: [typ(1)],
			tomorrow: [typ(8)],
			featured: [warte(1)],
			accuracy: { won: 30, total: 42, base: 55.4 },
			favorites: [],
			round: { closesLocal: '16:00', picked: 0, total: 12 },
		};
		const ZAKAZANE = /kurs|zak[łl]ad|obstaw|stawk|bukmach|\bbet\b|odds|stake|wager|bookmaker/i;
		for (const locale of ['pl', 'en']) {
			const wynik = buildMorningEmail({ ...BAZA, ...dane, locale });
			assert.equal(ZAKAZANE.test(wynik.text), false, `${locale}: tekst`);
			assert.equal(ZAKAZANE.test(wynik.html), false, `${locale}: html`);
		}
	});

	test('każdy mail ma odnośnik do wypisania i zdanie o szacunkach', () => {
		const wynik = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [typ(1)], favorites: [], round: null });
		assert.ok(wynik.text.includes(BAZA.unsubscribeUrl));
		assert.ok(wynik.html.includes(BAZA.unsubscribeUrl));
		assert.ok(wynik.text.includes('To szacunki, nie pewniki'));
	});

	test('mail z samym rozliczeniem nie pyta o wiadomości sprzed meczów, które już były', () => {
		const tylkoWczoraj = buildMorningEmail({
			...BAZA,
			yesterday: { model: [{ home: 'A', away: 'B', selection: '1X', status: 'won' }], mine: [] },
			today: [],
			favorites: [],
			round: null,
		});
		assert.equal(tylkoWczoraj.text.includes('Zapytaj asystenta'), false);
		assert.equal(tylkoWczoraj.text.includes('po kliknięciu meczu'), false);
		assert.ok(tylkoWczoraj.text.includes('To szacunki, nie pewniki.'));

		const zDzis = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [typ(1)], favorites: [], round: null });
		assert.ok(zDzis.text.includes('Zapytaj asystenta'));
		assert.ok(zDzis.text.includes('po kliknięciu meczu'));
	});

	test('nazwy drużyn są w HTML-u bezpieczne', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [typ(1, { home: '<b>Zły</b> & Spółka' })],
			favorites: [],
			round: null,
		});
		assert.ok(wynik.html.includes('&lt;b&gt;Zły&lt;/b&gt; &amp; Spółka'));
		assert.equal(wynik.html.includes('<b>Zły</b>'), false);
	});

	/*
	 * Mail ma przychodzić CODZIENNIE z czymś konkretnym — także we wtorek z samą Ligą
	 * Mistrzów bez typów. Te testy pilnują, że dzień bez typów i rozliczeń nadal daje treść.
	 */
	test('dzień bez typów, ale z ważnymi meczami: mail idzie, szanse podpisane jako bez typu', () => {
		const wynik = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [], favorites: [], round: null, featured: [warte(1), warte(2)] });
		assert.ok(wynik);
		assert.equal(wynik.subject, 'Dziś 2 mecze wartych uwagi');
		assert.ok(wynik.text.includes('Warte uwagi dziś — bez typu'));
		assert.ok(wynik.text.includes('model: gospodarze 48% · remis 26% · goście 26%'));
		assert.ok(wynik.text.includes('/pl/mecz/2001'));
		assert.ok(wynik.text.includes('nie widzi przewagi wystarczającej na typ'));
	});

	test('mało typów na dziś — dochodzą jutrzejsze, łącznie najwyżej pięć', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [typ(1), typ(2)],
			tomorrow: [5, 6, 7, 8, 9].map((i) => typ(i)),
			favorites: [],
			round: null,
		});
		assert.ok(wynik.text.includes('Jutro model widzi'));
		assert.equal((wynik.text.match(/\/pl\/mecz\/\d+/g) || []).length, 5);
		assert.equal(wynik.subject, 'Model widzi 2 typy na dziś');
	});

	test('dużo typów na dziś — jutra nie pokazujemy', () => {
		const wynik = buildMorningEmail({
			...BAZA,
			yesterday: { model: [], mine: [] },
			today: [1, 2, 3].map((i) => typ(i)),
			tomorrow: [typ(9)],
			favorites: [],
			round: null,
		});
		assert.equal(wynik.text.includes('Jutro model widzi'), false);
	});

	test('tylko jutro: temat mówi o jutrze', () => {
		const wynik = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [], tomorrow: [typ(1), typ(2), typ(3), typ(4), typ(5)], favorites: [], round: null });
		assert.equal(wynik.subject, 'Jutro model widzi 5 typów');
	});

	test('skuteczność z 30 dni: linia z normą; przy małej próbie jej nie ma', () => {
		const zSkutecznoscia = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [], favorites: [], round: null, accuracy: { won: 30, total: 42, base: 55.4 } });
		assert.ok(zSkutecznoscia);
		assert.ok(zSkutecznoscia.text.includes('30 z 42 typów trafionych (71%)'));
		assert.ok(zSkutecznoscia.text.includes('dałoby 55%'));
		assert.equal(zSkutecznoscia.subject, 'Skuteczność modelu: 71% w 30 dni');
		const malaProba = buildMorningEmail({ ...BAZA, yesterday: { model: [], mine: [] }, today: [], favorites: [], round: null, accuracy: { won: 5, total: 6, base: 50 } });
		assert.equal(malaProba, null);
	});
});
