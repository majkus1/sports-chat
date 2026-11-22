import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Eksperyment „xG w siłach drużyn" (`lib/model/xgFeatures.js`) — na lidze syntetycznej, bez sieci.
 *
 * Pilnujemy tego, od czego zależy uczciwość pomiaru i bezpieczeństwo ewentualnego wdrożenia:
 * brak xG daje DOKŁADNIE dzisiejszy model, skala nie przepuszcza zepsutych danych, a wariant
 * z xG wygrywa wtedy (i tylko wtedy), gdy xG naprawdę niesie informację o sile drużyn.
 */

setupEnv();
const { fitRatings } = await import('@/lib/model/ratings');
const { VARIANTS, hasXg, hasSot, scaleFactors, adjustedGoals, adjustMatches, coverage, evaluateVariants, summarize, pairedT, brier, MIN_SCALE_SAMPLE } =
	await import('@/lib/model/xgFeatures');

const wariant = (key) => VARIANTS.find((v) => v.key === key);

/** Powtarzalny generator (mulberry32) — test nie może raz przechodzić, a raz nie. */
function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function poisson(lambda, los) {
	const L = Math.exp(-lambda);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= los();
	} while (p > L);
	return k - 1;
}

/**
 * Trzy sezony ligi 16 drużyn. xG = prawdziwa średnia bramkowa meczu z niewielkim szumem,
 * czyli idealny przypadek dla hipotezy: gole są zaszumionym pomiarem tego, co xG mierzy czysto.
 * `bezXg` — liga, w której dostawca xG nie podaje; `skalaXg` — xG w innych jednostkach.
 */
function liga({ seed = 7, skalaXg = 1, bezXg = false } = {}) {
	const los = rng(seed);
	const sila = Array.from({ length: 16 }, (_, i) => ({ atak: 0.5 * (i / 15 - 0.5) * 2 * 0.6, obrona: 0.5 * ((15 - i) / 15 - 0.5) * -1.2 }));
	const mecze = [];
	const start = Date.UTC(2023, 7, 1);
	let dzien = 0;
	for (let sezon = 0; sezon < 3; sezon += 1) {
		for (let h = 0; h < 16; h += 1) {
			for (let a = 0; a < 16; a += 1) {
				if (h === a) continue;
				const lh = Math.exp(0.2 + sila[h].atak - sila[a].obrona + 0.25);
				const la = Math.exp(0.2 + sila[a].atak - sila[h].obrona);
				const maXg = !bezXg;
				mecze.push({
					date: new Date(start + dzien * 86_400_000).toISOString(),
					homeId: h + 1,
					awayId: a + 1,
					homeGoals: poisson(lh, los),
					awayGoals: poisson(la, los),
					hxg: maXg ? Math.round(100 * skalaXg * lh * (0.85 + 0.3 * los())) / 100 : null,
					axg: maXg ? Math.round(100 * skalaXg * la * (0.85 + 0.3 * los())) / 100 : null,
					hst: Math.round(lh * 3 + los()),
					ast: Math.round(la * 3 + los()),
				});
				dzien += 1.25;
			}
		}
	}
	return mecze;
}

describe('hasXg / hasSot — co uznajemy za dane', () => {
	test('para 0:0 w xG to brak danych, jednostronne zero jest prawdziwe', () => {
		assert.equal(hasXg({ hxg: 0, axg: 0 }), false);
		assert.equal(hasXg({ hxg: 0, axg: 0.4 }), true);
		assert.equal(hasXg({ hxg: 1.2, axg: null }), false);
		assert.equal(hasXg({ hxg: Number.NaN, axg: 1 }), false);
		assert.equal(hasXg({ hxg: -1, axg: 1 }), false);
		assert.equal(hasXg({}), false);
	});

	test('strzały celne 0:0 zostają — taki mecz się zdarza', () => {
		assert.equal(hasSot({ hst: 0, ast: 0 }), true);
		assert.equal(hasSot({ hst: 3, ast: null }), false);
	});
});

describe('scaleFactors — wyrównanie skali do goli', () => {
	test('skala to gole / xG z meczów, które xG mają', () => {
		const mecze = Array.from({ length: 40 }, () => ({ homeGoals: 2, awayGoals: 1, hxg: 1.5, axg: 1, hst: 5, ast: 3 }));
		const s = scaleFactors(mecze);
		assert.ok(Math.abs(s.xg - 3 / 2.5) < 1e-9);
		assert.ok(Math.abs(s.sot - 3 / 8) < 1e-9);
		assert.equal(s.nXg, 40);
	});

	test('za mała próba albo skala poza rozsądkiem → null (wariant spadnie na gole)', () => {
		const malo = Array.from({ length: MIN_SCALE_SAMPLE - 1 }, () => ({ homeGoals: 1, awayGoals: 1, hxg: 1, axg: 1 }));
		assert.equal(scaleFactors(malo).xg, null);
		// xG w innych jednostkach (np. ×10) — skala 0,1 jest poza granicami.
		const zepsute = Array.from({ length: 60 }, () => ({ homeGoals: 1, awayGoals: 1, hxg: 10, axg: 10 }));
		assert.equal(scaleFactors(zepsute).xg, null);
		assert.equal(scaleFactors([]).xg, null);
	});
});

describe('adjustedGoals — podmiana goli', () => {
	const m = { homeGoals: 3, awayGoals: 0, hxg: 1, axg: 2, hst: 4, ast: 6 };
	const skale = { xg: 1.2, sot: 0.3 };

	test('wariant „gole" i waga 1 niczego nie zmieniają', () => {
		assert.deepEqual(adjustedGoals(m, wariant('G'), skale), { homeGoals: 3, awayGoals: 0, used: 'goals' });
	});

	test('mieszanka: a·gole + (1−a)·k·xG', () => {
		const g = adjustedGoals(m, wariant('X50'), skale);
		assert.ok(Math.abs(g.homeGoals - (0.5 * 3 + 0.5 * 1.2 * 1)) < 1e-9);
		assert.ok(Math.abs(g.awayGoals - 0.5 * 1.2 * 2) < 1e-9);
		assert.equal(g.used, 'xg');
		const czyste = adjustedGoals(m, wariant('X0'), skale);
		assert.ok(Math.abs(czyste.homeGoals - 1.2) < 1e-9);
	});

	test('brak xG albo brak skali → prawdziwe gole', () => {
		assert.equal(adjustedGoals({ ...m, hxg: null }, wariant('X50'), skale).used, 'goals');
		assert.equal(adjustedGoals(m, wariant('X50'), { xg: null, sot: 0.3 }).used, 'goals');
		assert.equal(adjustedGoals({ ...m, hxg: 0, axg: 0 }, wariant('X0'), skale).homeGoals, 3);
	});

	test('wariant łączony: xG, potem strzały celne, na końcu gole', () => {
		assert.equal(adjustedGoals(m, wariant('XS50'), skale).used, 'xg');
		const zeStrzalow = adjustedGoals({ ...m, hxg: null, axg: null }, wariant('XS50'), skale);
		assert.equal(zeStrzalow.used, 'sot');
		assert.ok(Math.abs(zeStrzalow.homeGoals - (0.5 * 3 + 0.5 * 0.3 * 4)) < 1e-9);
		assert.equal(adjustedGoals({ homeGoals: 1, awayGoals: 1 }, wariant('XS50'), skale).used, 'goals');
	});

	test('podmiana zachowuje sumę goli w danych uczących (model nadal przewiduje gole)', () => {
		const mecze = liga();
		const suma = (xs) => xs.reduce((a, x) => a + x.homeGoals + x.awayGoals, 0);
		for (const key of ['X50', 'X0', 'S50']) {
			const po = adjustMatches(mecze, wariant(key));
			assert.ok(Math.abs(suma(po) - suma(mecze)) / suma(mecze) < 1e-9, key);
		}
	});
});

describe('coverage — udział xG w wadze danych', () => {
	test('xG tylko w świeżych meczach waży więcej niż ich udział w liczbie', () => {
		const dzis = Date.UTC(2026, 0, 1);
		const mecze = Array.from({ length: 100 }, (_, i) => ({
			date: new Date(dzis - (i + 1) * 5 * 86_400_000).toISOString(),
			hxg: i < 20 ? 1 : null,
			axg: i < 20 ? 1 : null,
		}));
		const c = coverage(mecze, new Date(dzis));
		assert.ok(c.xg > 0.3 && c.xg < 0.6, `udział ${c.xg}`);
		assert.equal(c.sot, 0);
	});
});

describe('evaluateVariants — walk-forward', () => {
	const split = new Date(Date.UTC(2024, 7, 1));
	// Trzy warianty i rzadsze przeliczanie — test ma trwać ułamek sekundy, nie odtwarzać eksperymentu.
	const opcje = { leagueId: 999, split, refitDays: 30, variants: VARIANTS.filter((v) => ['G', 'X50', 'X0', 'XS50'].includes(v.key)) };
	const podsumuj = (rows) => summarize(rows, { variants: opcje.variants });

	test('liga bez xG: warianty xG dają DOKŁADNIE prognozy dzisiejszego modelu', () => {
		const { rows } = evaluateVariants(liga({ bezXg: true }), opcje);
		assert.ok(rows.length > 150);
		for (const r of rows) {
			for (const key of ['X50', 'X0']) assert.deepEqual(r.p[key], r.p.G);
			assert.equal(r.cov.xg, 0);
		}
		const s = podsumuj(rows);
		assert.equal(s.variants.X50.gain, 0);
		assert.equal(s.variants.X50.t, 0);
	});

	test('xG w zepsutych jednostkach nie wchodzi do modelu', () => {
		const { rows } = evaluateVariants(liga({ skalaXg: 10 }), opcje);
		for (const r of rows.slice(0, 50)) assert.deepEqual(r.p.X50, r.p.G);
	});

	test('gdy xG niesie prawdziwą informację, wariant z xG prognozuje lepiej niż gole', () => {
		const { rows } = evaluateVariants(liga(), opcje);
		const s = podsumuj(rows);
		// Kierunek, nie istotność: t na kilkuset meczach syntetycznych zależy od ziarna losowania.
		assert.ok(s.variants.X50.gain > 0, `zysk X50 ${s.variants.X50.gain}`);
		assert.ok(s.variants.X0.gain > 0, `zysk X0 ${s.variants.X0.gain}`);
		assert.ok(s.variants.X0.logLoss < s.variants.G.logLoss);
		// Wszystkie warianty oceniane na tych samych meczach, a odniesienie ma zysk 0.
		assert.equal(s.variants.G.gain, 0);
		assert.ok(s.variants.G.logLoss < s.base.logLoss, 'model na golach bije częstości ligi');
	});

	test('xG odtwarza prawdziwe siły drużyn dokładniej niż gole (to jest mechanizm zysku)', () => {
		const mecze = liga();
		const referenceDate = new Date(Date.parse(mecze.at(-1).date) + 86_400_000);
		// Prawdziwe siły z generatora ligi — ten sam wzór co w `liga()`.
		const prawdziwe = Array.from({ length: 16 }, (_, i) => 0.5 * (i / 15 - 0.5) * 2 * 0.6);
		const blad = (key) => {
			const model = fitRatings(adjustMatches(mecze, wariant(key)), { referenceDate });
			const atak = prawdziwe.map((_, i) => model.teams.get(i + 1).attack);
			const sr = atak.reduce((a, b) => a + b, 0) / atak.length;
			const srP = prawdziwe.reduce((a, b) => a + b, 0) / prawdziwe.length;
			return atak.reduce((a, v, i) => a + (v - sr - (prawdziwe[i] - srP)) ** 2, 0);
		};
		assert.ok(blad('X0') < blad('G'), `błąd X0 ${blad('X0')} vs G ${blad('G')}`);
		assert.ok(blad('X50') < blad('G'));
	});

	test('uczenie tylko z przeszłości: mecze po dacie testowej nie zmieniają prognozy', () => {
		const mecze = liga();
		const until = new Date(Date.UTC(2024, 9, 1));
		const pelne = evaluateVariants(mecze, { ...opcje, until }).rows;
		// Te same mecze testowe, ale przyszłość z wywróconymi wynikami i xG.
		const zepsutaPrzyszlosc = mecze.map((m) => (Date.parse(m.date) >= until.getTime() ? { ...m, homeGoals: 9, awayGoals: 0, hxg: 9, axg: 0.1 } : m));
		const drugie = evaluateVariants(zepsutaPrzyszlosc, { ...opcje, until }).rows;
		assert.equal(pelne.length, drugie.length);
		assert.ok(pelne.length > 10);
		pelne.forEach((r, i) => assert.deepEqual(r.p, drugie[i].p));
	});

	test('rynek i dane dodatkowe meczu przechodzą do wiersza, typy mają procent i wynik', () => {
		const mecze = liga().map((m) => ({ ...m, market: { home: 0.5, draw: 0.25, away: 0.25 }, extra: { id: 1 } }));
		const { rows } = evaluateVariants(mecze, opcje);
		assert.deepEqual(rows[0].market, { home: 0.5, draw: 0.25, away: 0.25 });
		assert.deepEqual(rows[0].extra, { id: 1 });
		const s = podsumuj(rows);
		assert.equal(s.market.n, rows.length);
		assert.ok(s.variants.G.picks > 0);
		assert.ok(s.variants.G.promised >= 55 && s.variants.G.hit > 40);
	});

	test('liga z za krótką historią nie dostaje prognoz', () => {
		const { rows } = evaluateVariants(liga().slice(0, 40), { ...opcje, split: new Date(Date.UTC(2023, 7, 20)) });
		assert.equal(rows.length, 0);
		assert.equal(summarize(rows).n, 0);
	});
});

describe('miary', () => {
	test('pairedT: stała różnica ma t = 0 (brak rozrzutu), mieszana — znak średniej', () => {
		assert.equal(pairedT([]).t, 0);
		assert.equal(pairedT([0.5, 0.5, 0.5]).t, 0);
		const t = pairedT([0.2, 0.1, 0.3, 0.15, 0.25]);
		assert.ok(t.mean > 0 && t.t > 2);
		assert.ok(pairedT([-0.2, -0.1, -0.3]).t < 0);
	});

	test('Brier wieloklasowy: 0 dla pewnej trafionej, 2/3 dla „po jednej trzeciej"', () => {
		assert.equal(brier({ home: 1, draw: 0, away: 0 }, 'home'), 0);
		assert.ok(Math.abs(brier({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 }, 'draw') - 2 / 3) < 1e-9);
	});
});
