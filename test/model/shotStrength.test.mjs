import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Siła drużyn ze strzałów celnych (`lib/model/shotStrength.js`, `dixon-coles/6`) — bez sieci i bazy.
 *
 * Pilnujemy tego, od czego zależy bezpieczeństwo wdrożenia: mieszanka liczy się dokładnie według
 * wzoru, reguła per mecz wpuszcza strzały tylko przy OBU drużynach z historią strzałów (ta sama
 * reguła co wariant `shots` regresji goli), wyłącznik działa, a liga bez strzałów daje DOKŁADNIE
 * prognozę modelu goli.
 */

setupEnv();
const {
	adjustedGoals,
	scaleFactors,
	fitShotModel,
	sotHistory,
	shotsApplyTo,
	matchExpectation,
	shotsConfig,
	DEFAULT_GOAL_WEIGHT,
	MIN_SCALE_SAMPLE,
} = await import('@/lib/model/shotStrength');
const { enoughShotHistory, pickVariant, MIN_SHOT_MATCHES, WINDOW } = await import('@/lib/model/goalsCalibration');
const { fitRatings, expectedGoals } = await import('@/lib/model/ratings');
const xg = await import('@/lib/model/xgFeatures');

/** Powtarzalny generator (mulberry32). */
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

/** Dwa sezony ligi 12 drużyn; `bezStrzalow` — zbiór drużyn, dla których dostawca nie ma strzałów. */
function liga({ seed = 11, bezStrzalow = new Set(), nikt = false } = {}) {
	const los = rng(seed);
	const mecze = [];
	const start = Date.UTC(2098, 7, 1);
	let dzien = 0;
	for (let sezon = 0; sezon < 2; sezon += 1) {
		for (let h = 1; h <= 12; h += 1) {
			for (let a = 1; a <= 12; a += 1) {
				if (h === a) continue;
				const lh = Math.exp(0.25 + 0.06 * (h - 6.5) - 0.04 * (a - 6.5));
				const la = Math.exp(0.05 + 0.06 * (a - 6.5) - 0.04 * (h - 6.5));
				const brak = nikt || bezStrzalow.has(h) || bezStrzalow.has(a);
				mecze.push({
					fixtureId: `t${mecze.length}`,
					date: new Date(start + dzien * 86_400_000).toISOString(),
					homeId: h,
					awayId: a,
					homeGoals: poisson(lh, los),
					awayGoals: poisson(la, los),
					hst: brak ? null : Math.round(lh * 3.2 + los()),
					ast: brak ? null : Math.round(la * 3.2 + los()),
				});
				dzien += 2;
			}
		}
	}
	return mecze;
}

describe('mieszanka goli i strzałów celnych', () => {
	test('a·gole + (1−a)·k·strzały celne, skala z danych uczących', () => {
		const m = { homeGoals: 2, awayGoals: 0, hst: 6, ast: 2 };
		const g = adjustedGoals(m, { a: 0.7, source: 'sot' }, { sot: 0.3 });
		assert.ok(Math.abs(g.homeGoals - (0.7 * 2 + 0.3 * 0.3 * 6)) < 1e-12);
		assert.ok(Math.abs(g.awayGoals - 0.3 * 0.3 * 2) < 1e-12);
		assert.equal(g.used, 'sot');
		// Mecz bez strzałów wchodzi z prawdziwymi golami — nigdy nie wypada z danych.
		assert.deepEqual(adjustedGoals({ homeGoals: 1, awayGoals: 1 }, { a: 0.7, source: 'sot' }, { sot: 0.3 }), {
			homeGoals: 1,
			awayGoals: 1,
			used: 'goals',
		});
	});

	test('podmiana zachowuje sumę goli w lidze — model nadal przewiduje gole', () => {
		const mecze = liga();
		const s = fitShotModel(mecze, { referenceDate: new Date(Date.UTC(2100, 0, 1)) });
		const skala = scaleFactors(mecze).sot;
		assert.equal(s.scale, skala);
		const suma = mecze.reduce((a, m) => a + m.homeGoals + m.awayGoals, 0);
		const zeStrzalow = mecze.reduce((a, m) => a + DEFAULT_GOAL_WEIGHT * (m.homeGoals + m.awayGoals) + (1 - DEFAULT_GOAL_WEIGHT) * skala * (m.hst + m.ast), 0);
		assert.ok(Math.abs(zeStrzalow - suma) / suma < 1e-9);
		assert.equal(s.used, 1);
	});

	test('eksperyment i produkcja liczą to samo — jedna implementacja', () => {
		assert.equal(xg.adjustedGoals, adjustedGoals);
		assert.equal(xg.scaleFactors, scaleFactors);
	});

	test('za mało meczów ze strzałami albo skala poza granicami → brak modelu ze strzałami', () => {
		const malo = liga().map((m, i) => (i < MIN_SCALE_SAMPLE - 1 ? m : { ...m, hst: null, ast: null }));
		assert.equal(fitShotModel(malo), null);
		assert.equal(fitShotModel(liga({ nikt: true })), null);
		const zepsute = liga().map((m) => ({ ...m, hst: m.hst * 40, ast: m.ast * 40 }));
		assert.equal(fitShotModel(zepsute), null);
	});
});

describe('reguła per mecz', () => {
	test('jedna reguła dla regresji goli i dla siły drużyn: obie drużyny ≥ 6 z 10', () => {
		assert.equal(enoughShotHistory(MIN_SHOT_MATCHES, MIN_SHOT_MATCHES), true);
		assert.equal(enoughShotHistory(MIN_SHOT_MATCHES - 1, 10), false);
		assert.equal(enoughShotHistory(10, MIN_SHOT_MATCHES - 1), false);
		// Wariant regresji goli korzysta z tej samej funkcji.
		const league = { sf: 12, stf: 4 };
		const profil = (shotMatches) => ({ n: 10, shotMatches });
		assert.equal(pickVariant({ league, home: profil(6), away: profil(6) }), 'shots');
		assert.equal(pickVariant({ league, home: profil(5), away: profil(10) }), 'goals');
	});

	test('liczy strzały z ostatnich 10 meczów drużyny, nie z całej historii', () => {
		// 20 meczów drużyny 1: pierwsze 15 ze strzałami, ostatnie 5 bez — w oknie 10 jest 5 ze strzałami.
		const mecze = Array.from({ length: 20 }, (_, i) => ({
			date: new Date(Date.UTC(2099, 0, 1 + i)).toISOString(),
			homeId: 1,
			awayId: 100 + i,
			hst: i < 15 ? 4 : null,
			ast: i < 15 ? 3 : null,
		}));
		const h = sotHistory([...mecze].reverse());
		assert.equal(h.get(1), WINDOW - 5);
		assert.equal(enoughShotHistory(h.get(1), 10), false);
	});

	test('drużyna bez strzałów → mecz liczy się samym modelem goli, reszta ligi ze strzałami', () => {
		const mecze = liga({ bezStrzalow: new Set([12]) });
		const referenceDate = new Date(Date.UTC(2100, 0, 1));
		const model = fitRatings(mecze, { referenceDate });
		model.shots = fitShotModel(mecze, { referenceDate });
		assert.ok(model.shots, 'liga ma model ze strzałami');

		assert.equal(shotsApplyTo(model.shots, 1, 2), true);
		assert.equal(shotsApplyTo(model.shots, 1, 12), false);
		assert.equal(shotsApplyTo(model.shots, 12, 3), false);

		const zeStrzalami = matchExpectation(model, 1, 2);
		assert.equal(zeStrzalami.strength, 'shots');
		assert.notEqual(zeStrzalami.lambdaHome, zeStrzalami.goals.lambdaHome, 'siła ze strzałów różni się od goli');
		assert.deepEqual(zeStrzalami.goals, expectedGoals(model, 1, 2), 'rynki goli zawsze z modelu goli');

		const bez = matchExpectation(model, 12, 3);
		assert.equal(bez.strength, 'goals');
		assert.equal(bez.lambdaHome, expectedGoals(model, 12, 3).lambdaHome);
	});

	test('model bez strzałów (pula, wyłącznik, brak bazy) — dokładnie dzisiejsza prognoza', () => {
		const mecze = liga();
		const model = fitRatings(mecze, { referenceDate: new Date(Date.UTC(2100, 0, 1)) });
		const e = matchExpectation(model, 3, 4);
		const g = expectedGoals(model, 3, 4);
		assert.equal(e.strength, 'goals');
		assert.equal(e.lambdaHome, g.lambdaHome);
		assert.equal(e.lambdaAway, g.lambdaAway);
		assert.equal(matchExpectation(null, 1, 2), null);
	});

	test('siła ze strzałów lepiej odtwarza prawdziwe siły, gdy gole są zaszumione', () => {
		// W lidze syntetycznej strzały celne to średnia bramkowa ×3,2 — czystszy pomiar niż gole.
		const mecze = liga({ seed: 5 });
		const referenceDate = new Date(Date.UTC(2100, 0, 1));
		const blad = (model) => {
			const prawda = Array.from({ length: 12 }, (_, i) => 0.06 * (i + 1 - 6.5));
			const atak = prawda.map((_, i) => model.teams.get(i + 1).attack);
			const sr = atak.reduce((a, b) => a + b, 0) / 12;
			return atak.reduce((a, v, i) => a + (v - sr - prawda[i]) ** 2, 0);
		};
		assert.ok(blad(fitShotModel(mecze, { referenceDate }).model) < blad(fitRatings(mecze, { referenceDate })));
	});
});

describe('analiza meczu liczy tak samo jak plakietka', () => {
	test('przed meczem 1X2 ze strzałów, gole i kafelki z modelu goli; w trakcie — sam model goli', async () => {
		const { buildAnalysisModel, toPercentTriple } = await import('@/lib/analysis/model');
		const { predictMarkets } = await import('@/lib/model/dixonColes');
		const mecze = liga({ seed: 9 });
		const referenceDate = new Date(Date.UTC(2100, 0, 1));
		const model = fitRatings(mecze, { referenceDate });
		model.shots = fitShotModel(mecze, { referenceDate });
		const fixture = { teams: { home: { id: 1, name: 'A' }, away: { id: 9, name: 'B' } }, status: { isLive: false } };

		const e = matchExpectation(model, 1, 9);
		assert.equal(e.strength, 'shots');
		const a = buildAnalysisModel({ leagueModel: model, fixture });
		assert.deepEqual(a.probabilities, toPercentTriple(predictMarkets(e.lambdaHome, e.lambdaAway, model.rho).matchWinner));
		assert.equal(a.goals.expectedTotal, Math.round((e.goals.lambdaHome + e.goals.lambdaAway) * 10) / 10, 'kafelek goli z modelu goli');

		const wTrakcie = buildAnalysisModel({
			leagueModel: model,
			fixture: { ...fixture, status: { isLive: true, code: '1H', elapsed: 1 }, goals: { home: 0, away: 0 } },
		});
		const bezStrzalow = buildAnalysisModel({
			leagueModel: { ...model, shots: undefined },
			fixture: { ...fixture, status: { isLive: true, code: '1H', elapsed: 1 }, goals: { home: 0, away: 0 } },
		});
		assert.deepEqual(wTrakcie.probabilities, bezStrzalow.probabilities);
	});
});

describe('wyłącznik i waga ze zmiennych środowiskowych', () => {
	test('domyślnie włączone z wagą goli 0,7', () => {
		assert.deepEqual(shotsConfig({}), { enabled: true, a: DEFAULT_GOAL_WEIGHT });
		assert.equal(DEFAULT_GOAL_WEIGHT, 0.7);
	});

	test('MODEL_SHOTS=off wyłącza; waga spoza 0,3–0,9 wraca do domyślnej', () => {
		for (const v of ['off', 'OFF', 'false', '0', 'no']) assert.equal(shotsConfig({ MODEL_SHOTS: v }).enabled, false, v);
		assert.equal(shotsConfig({ MODEL_SHOTS: 'on' }).enabled, true);
		assert.equal(shotsConfig({ MODEL_SHOTS_WEIGHT: '0.5' }).a, 0.5);
		assert.equal(shotsConfig({ MODEL_SHOTS_WEIGHT: '0.1' }).a, DEFAULT_GOAL_WEIGHT);
		assert.equal(shotsConfig({ MODEL_SHOTS_WEIGHT: 'abc' }).a, DEFAULT_GOAL_WEIGHT);
	});
});

describe('eksperyment: wariant z regułą per mecz (to, co wdraża produkcja)', () => {
	test('drużyna bez strzałów → wiersz S70R równy modelowi goli, pozostałe mecze ze strzałami', () => {
		const mecze = liga({ seed: 21, bezStrzalow: new Set([12]) });
		const variants = xg.VARIANTS.filter((v) => ['G', 'S70', 'S70R'].includes(v.key));
		const { rows } = xg.evaluateVariants(mecze, { leagueId: 999, split: new Date(Date.UTC(2099, 3, 1)), refitDays: 30, variants });
		assert.ok(rows.length > 50);
		const bez = rows.filter((r) => !r.shotsRule);
		const z = rows.filter((r) => r.shotsRule);
		assert.ok(bez.length > 0 && z.length > 0);
		for (const r of bez) assert.deepEqual(r.p.S70R, r.p.G);
		for (const r of z) assert.deepEqual(r.p.S70R, r.p.S70);
	});
});
