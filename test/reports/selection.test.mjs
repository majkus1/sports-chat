import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Selekcja meczów do raportu — część deterministyczna, bez AI i bez sieci.
 *
 * Testy pilnują trzech rzeczy naraz. Że raport NIE patrzy na kursy: żadna funkcja tutaj
 * nie przyjmuje danych rynkowych i nie ma jak ich przyjąć. Że progi pewności działają,
 * bo po usunięciu przewagi nad rynkiem to jedyne sito. I że bezpieczniki bramkowe są te
 * same, które obowiązują model w analizie pojedynczego meczu — obie ścieżki produkują
 * typy do tej samej statystyki skuteczności, więc nie mogą mieć różnych reguł.
 */

// Rejestruje alias `@/` — bazy ani sieci ten plik nie dotyka.
setupEnv();

const { evaluateMarkets, selectionScore } = await import('@/lib/reports/service');

/**
 * Forma drużyny w kształcie, jaki daje `normalizeTeamForm`.
 *
 * `wDomu` i `naWyjezdzie` pozwalają zbudować drużynę o różnych średnich w obu rolach —
 * bez tego nie da się sprawdzić, czy selekcja faktycznie sięga po właściwy rozkład.
 */
function forma({ strzelone, stracone, rozegrane = 10, wDomu, naWyjezdzie }) {
	const avg = (lacznie, dom, wyjazd) => ({
		total: String(lacznie),
		home: dom == null ? String(lacznie) : String(dom),
		away: wyjazd == null ? String(lacznie) : String(wyjazd),
	});

	return {
		played: { total: rozegrane, home: Math.ceil(rozegrane / 2), away: Math.floor(rozegrane / 2) },
		goals: {
			for: { average: avg(strzelone, wDomu?.strzelone, naWyjezdzie?.strzelone) },
			against: { average: avg(stracone, wDomu?.stracone, naWyjezdzie?.stracone) },
		},
	};
}

/** Domyślny mecz: wyraźny faworyt gospodarzy, dużo goli po obu stronach. */
function mecz({ home = 70, draw = 20, away = 10, gospodarz, gosc } = {}) {
	return {
		prediction: { percent: { home, draw, away } },
		formHome: forma(gospodarz ?? { strzelone: 1.8, stracone: 1.0 }),
		formAway: forma(gosc ?? { strzelone: 1.4, stracone: 1.3 }),
	};
}

const znajdz = (rynki, market, selection) =>
	rynki.find((r) => r.market === market && r.selection === selection) ?? null;

describe('progi pewności', () => {
	test('typ poniżej progu nie wchodzi do raportu', () => {
		// 58% to więcej niż rzut monetą, ale mniej niż wymagane 62.
		const rynki = evaluateMarkets(mecz({ home: 58, draw: 22, away: 20 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home'), null);
	});

	test('typ powyżej progu wchodzi', () => {
		const rynki = evaluateMarkets(mecz({ home: 66, draw: 20, away: 14 }));

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home')?.pModel, 66);
	});

	test('prawdopodobieństwo bliskie pewności odrzucamy jako artefakt danych', () => {
		const rynki = evaluateMarkets(mecz({ home: 95, draw: 3, away: 2 }));

		assert.equal(
			znajdz(rynki, 'Wynik meczu', 'home'),
			null,
			'95% z prognozy dostawcy to błąd danych, nie pewniak'
		);
	});

	test('podwójna szansa ma wyższy próg niż rynki pojedyncze', () => {
		// 1X = 45+25 = 70: powyżej progu ogólnego (62), poniżej progu dla podwójnej (74).
		const rynki = evaluateMarkets(mecz({ home: 45, draw: 25, away: 30 }));

		assert.equal(
			znajdz(rynki, 'Podwójna szansa', '1X'),
			null,
			'suma dwóch zgrubnych procentów zawyża pewność — stąd osobny, wyższy próg'
		);
	});
});

describe('bezpieczniki bramkowe — te same co w analizie meczu', () => {
	test('nie proponujemy Under 2.5 przy wysokiej sumie średnich goli', () => {
		const rynki = evaluateMarkets(
			mecz({ gospodarz: { strzelone: 2.2, stracone: 1.6 }, gosc: { strzelone: 2.0, stracone: 1.8 } })
		);

		assert.equal(znajdz(rynki, 'Suma goli', 'Under 2.5'), null);
	});

	test('nie proponujemy Over 2.5 przy niskiej sumie średnich goli', () => {
		const rynki = evaluateMarkets(
			mecz({ gospodarz: { strzelone: 0.7, stracone: 0.6 }, gosc: { strzelone: 0.6, stracone: 0.7 } })
		);

		assert.equal(znajdz(rynki, 'Suma goli', 'Over 2.5'), null);
	});

	test('zerowe średnie z początku sezonu nie dają „pewnego Under”', () => {
		const rynki = evaluateMarkets(
			mecz({ gospodarz: { strzelone: 0, stracone: 0 }, gosc: { strzelone: 0, stracone: 0 } })
		);

		assert.equal(znajdz(rynki, 'Suma goli', 'Under 2.5'), null);
		assert.equal(znajdz(rynki, 'Obie strzelą', 'Nie'), null);
	});
});

describe('wsparcie niezależnych rachunków', () => {
	test('zgodność prognozy z bilansem bramkowym podnosi wsparcie do dwóch', () => {
		const rynki = evaluateMarkets(
			mecz({
				home: 68,
				gospodarz: { strzelone: 2.1, stracone: 0.8 },
				gosc: { strzelone: 0.9, stracone: 1.9 },
			})
		);

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').support, 2);
	});

	test('brak zgodności zostawia wsparcie na jednym rachunku', () => {
		// Prognoza wskazuje gospodarzy, ale z bilansu bramek nie wynika ich przewaga.
		const rynki = evaluateMarkets(
			mecz({
				home: 68,
				gospodarz: { strzelone: 1.2, stracone: 1.3 },
				gosc: { strzelone: 1.3, stracone: 1.2 },
			})
		);

		assert.equal(znajdz(rynki, 'Wynik meczu', 'home').support, 1);
	});
});

describe('ranking selekcji', () => {
	const slabsze = { pModel: 70, support: 1 };
	const mocniejsze = { pModel: 70, support: 2 };

	test('przy równym procencie wygrywa typ potwierdzony dwoma rachunkami', () => {
		const a = selectionScore(mocniejsze, { tier: 2, played: 10 });
		const b = selectionScore(slabsze, { tier: 2, played: 10 });

		assert.ok(a > b, 'samo prawdopodobieństwo nie może być jedynym kryterium');
	});

	test('mecz z czołowych rozgrywek wyprzedza taki sam typ z niższego poziomu', () => {
		const a = selectionScore(mocniejsze, { tier: 1, played: 10 });
		const b = selectionScore(mocniejsze, { tier: 2, played: 10 });

		assert.ok(a > b);
	});

	test('dłuższa próba meczowa podnosi wynik, ale z sufitem', () => {
		const krotka = selectionScore(mocniejsze, { tier: 1, played: 4 });
		const dluga = selectionScore(mocniejsze, { tier: 1, played: 12 });
		const bardzoDluga = selectionScore(mocniejsze, { tier: 1, played: 30 });

		assert.ok(dluga > krotka);
		assert.equal(bardzoDluga, dluga, 'powyżej dwunastu meczów próba nic już nie dokłada');
	});
});

describe('rozkład dom / wyjazd', () => {
	test('gospodarza oceniamy jego wynikami u siebie, nie średnią łączną', () => {
		/*
		 * Drużyna strzelecko rozdwojona: 2.6 gola u siebie, 0.4 na wyjeździe — średnia
		 * łączna 1.5. Rywal równie słaby w obronie na wyjeździe. Ze średnich łącznych
		 * wychodzi mecz nijaki; z rozkładów — wyraźne Over.
		 */
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 50, draw: 25, away: 25 } },
			formHome: forma({
				strzelone: 1.5,
				stracone: 1.5,
				wDomu: { strzelone: 2.6, stracone: 1.4 },
				naWyjezdzie: { strzelone: 0.4, stracone: 1.6 },
			}),
			formAway: forma({
				strzelone: 1.5,
				stracone: 1.5,
				wDomu: { strzelone: 2.4, stracone: 0.5 },
				naWyjezdzie: { strzelone: 1.6, stracone: 2.6 },
			}),
		});

		assert.ok(
			znajdz(rynki, 'Suma goli', 'Over 2.5'),
			'przy 2.6 u siebie i 2.6 straconych na wyjeździe Over musi się pojawić'
		);
		assert.equal(
			znajdz(rynki, 'Suma goli', 'Under 2.5'),
			null,
			'średnia łączna 1.5 nie może przeważyć nad rozkładem z tej roli'
		);
	});

	test('przy jednym meczu w danej roli wracamy do średniej łącznej', () => {
		// Dwa mecze rozegrane to po jednym u siebie i na wyjeździe — za mało, żeby split
		// cokolwiek znaczył. Wtedy wartość skrajna nie może zdominować rachunku.
		const rynki = evaluateMarkets({
			prediction: { percent: { home: 50, draw: 25, away: 25 } },
			formHome: forma({
				strzelone: 1.0,
				stracone: 1.0,
				rozegrane: 2,
				wDomu: { strzelone: 5.0, stracone: 0 },
			}),
			formAway: forma({ strzelone: 1.0, stracone: 1.0, rozegrane: 2 }),
		});

		assert.equal(
			znajdz(rynki, 'Suma goli', 'Over 2.5'),
			null,
			'pojedynczy mecz z pięcioma golami nie jest przesłanką'
		);
	});
});

describe('brak danych rynkowych', () => {
	test('selekcja działa bez jakiejkolwiek informacji o kursach', () => {
		const rynki = evaluateMarkets(mecz({ home: 70 }));

		assert.ok(rynki.length > 0);
		for (const wpis of rynki) {
			assert.deepEqual(
				Object.keys(wpis).sort(),
				['market', 'pModel', 'selection', 'support'],
				'wpis selekcji nie może nieść pola pochodzącego z rynku zakładów'
			);
		}
	});
});
