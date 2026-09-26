import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Pule łączone — część czysta, bez sieci.
 *
 * Pilnuje czterech rzeczy: które rozgrywki idą do której puli (i że liga krajowa do żadnej),
 * że mecz na neutralnym boisku nie uczy przewagi gospodarza, że drużyna z krótką historią
 * zostaje „nieznana" zamiast dostać oceny z szumu, i że pula łączy ligi przez puchary —
 * mocna liga wychodzi mocniejsza, choć jej drużyny grały z tamtą tylko w pucharze.
 */

setupEnv();

const { POOLS, poolFor, rowsToPoolMatches, fitPoolModel, poolModelView } = await import('@/lib/model/pools');
const { expectedGoals } = await import('@/lib/model/ratings');
const { predictMarkets } = await import('@/lib/model/dixonColes');

const DZIEN = 86_400_000;
const T0 = Date.parse('2026-01-01T00:00:00Z');

/** Deterministyczne „losowanie" goli z oczekiwanej wartości. */
function gole(lambda, ziarno) {
	const u = ((ziarno * 9301 + 49297) % 233280) / 233280;
	let k = 0;
	let p = Math.exp(-lambda);
	let acc = p;
	while (u > acc && k < 8) {
		k += 1;
		p *= lambda / k;
		acc += p;
	}
	return k;
}

const mecz = (id, homeId, awayId, hg, ag, dni, extra = {}) => ({
	fixtureId: String(id),
	leagueId: 99,
	date: new Date(T0 + dni * DZIEN).toISOString(),
	t: T0 + dni * DZIEN,
	homeId,
	awayId,
	homeGoals: hg,
	awayGoals: ag,
	neutral: false,
	weight: 1,
	...extra,
});

describe('które rozgrywki liczy pula', () => {
	test('puchary europejskie i krajowe → kluby, reprezentacje → międzynarodowa, liga → żadna', () => {
		for (const id of [2, 3, 848, 45, 137]) assert.equal(poolFor(id)?.id, 'europe', String(id));
		for (const id of [1, 4, 5, 32, 960, 10]) assert.equal(poolFor(id)?.id, 'international', String(id));
		for (const id of [39, 140, 106, 71]) assert.equal(poolFor(id), null, String(id));
	});

	test('turnieje finałowe są na neutralnym terenie, Liga Narodów i eliminacje nie', () => {
		const pula = POOLS.international;
		assert.equal(pula.neutral.has(1), true);
		assert.equal(pula.neutral.has(4), true);
		assert.equal(pula.neutral.has(5), false);
		assert.equal(pula.neutral.has(32), false);
		const model = { homeAdvantage: 0.3, teams: new Map() };
		assert.equal(poolModelView(pula, 1, model).homeAdvantage, 0);
		assert.equal(poolModelView(pula, 5, model).homeAdvantage, 0.3);
	});

	test('wiersze dostawcy → mecze puli: tylko zakończone, z wagą i neutralnością rozgrywek', () => {
		const rows = [
			{ fixture: { id: 1, date: '2026-06-12T19:00:00Z', status: { short: 'FT' } }, teams: { home: { id: 10 }, away: { id: 20 } }, goals: { home: 2, away: 1 } },
			{ fixture: { id: 2, date: '2026-06-13T19:00:00Z', status: { short: 'NS' } }, teams: { home: { id: 10 }, away: { id: 30 } }, goals: { home: null, away: null } },
		];
		const wc = rowsToPoolMatches(POOLS.international, 1, rows);
		assert.equal(wc.length, 1);
		assert.equal(wc[0].neutral, true);
		const tow = rowsToPoolMatches(POOLS.international, 10, rows);
		assert.equal(tow[0].weight, 0.5);
		assert.equal(tow[0].neutral, false);
	});
});

describe('dopasowanie puli', () => {
	/*
	 * Dwie „ligi" po 8 drużyn (A: 100–107 mocna, B: 200–207 słaba), każda gra u siebie
	 * dwa razy każdy z każdym, plus mecze pucharowe między nimi. Puchar łączy ligi — to on
	 * mówi modelowi, że A jest mocniejsza, choć w swoich ligach obie wyglądają podobnie.
	 */
	const mecze = [];
	let id = 0;
	const sila = (team) => (team < 200 ? 0.35 : -0.35);
	for (const liga of [100, 200]) {
		for (let runda = 0; runda < 2; runda += 1) {
			for (let i = 0; i < 8; i += 1) {
				for (let j = 0; j < 8; j += 1) {
					if (i === j) continue;
					id += 1;
					const h = liga + i;
					const a = liga + j;
					mecze.push(mecz(id, h, a, gole(1.5, id), gole(1.15, id * 7), id % 300));
				}
			}
		}
	}
	for (let k = 0; k < 120; k += 1) {
		id += 1;
		const h = k % 2 ? 100 + (k % 8) : 200 + (k % 8);
		const a = k % 2 ? 200 + ((k + 3) % 8) : 100 + ((k + 3) % 8);
		mecze.push(mecz(id, h, a, gole(1.35 * Math.exp(sila(h) - sila(a)), id), gole(1.35 * Math.exp(sila(a) - sila(h)), id * 3), 10 + k * 2));
	}
	// Drużyna z dwoma meczami — ma zostać nieznana.
	mecze.push(mecz(++id, 999, 100, 0, 3, 50), mecz(++id, 100, 999, 4, 0, 60));

	const pula = { ...POOLS.europe, minTeamMatches: 8 };
	const model = fitPoolModel(pula, mecze, { referenceDate: new Date(T0 + 400 * DZIEN) });

	test('drużyna z krótką historią jest dla puli nieznana', () => {
		assert.ok(model);
		assert.equal(model.teams.has(999), false);
		assert.equal(expectedGoals(model, 999, 100).known, false);
		assert.equal(expectedGoals(model, 100, 200).known, true);
	});

	test('puchar łączy ligi: drużyna mocnej ligi jest faworytem u siebie i na wyjeździe', () => {
		const dom = predictMarkets(...Object.values(expectedGoals(model, 101, 201)).slice(0, 2), model.rho).matchWinner;
		const wyjazd = predictMarkets(...Object.values(expectedGoals(model, 201, 101)).slice(0, 2), model.rho).matchWinner;
		assert.ok(dom.home > dom.away, `u siebie ${dom.home} vs ${dom.away}`);
		assert.ok(wyjazd.away > wyjazd.home, `na wyjeździe ${wyjazd.away} vs ${wyjazd.home}`);
	});

	test('„rozegrane" to mecze w puli z ostatniego roku', () => {
		assert.ok(model.teamMatches.get(100) >= 8);
		assert.equal(model.pool, 'europe');
	});

	test('mecz na neutralnym boisku nie uczy przewagi gospodarza', () => {
		/*
		 * Drużyny równe, wyniki symetryczne: w każdej parze raz wygrywa „gospodarz" X, raz Y,
		 * zawsze 2:0. Jako mecze u siebie to czysta przewaga boiska; jako neutralne — nic
		 * o niej nie mówią, a tło (mecze bez przewagi) zostawia ją blisko zera.
		 */
		const tlo = [];
		for (let k = 0; k < 400; k += 1) tlo.push(mecz(8000 + k, 300 + (k % 10), 300 + ((k + 1 + (k % 9)) % 10), gole(1.3, k), gole(1.3, k * 5), k % 300));
		const symetryczne = (neutral) =>
			Array.from({ length: 80 }, (_, k) => {
				const x = 300 + (k % 10);
				const y = 300 + ((k + 5) % 10);
				return k % 2 ? mecz(9000 + k, x, y, 2, 0, 5 + k, { neutral }) : mecz(9000 + k, y, x, 2, 0, 5 + k, { neutral });
			});
		const przewaga = (neutral) =>
			fitPoolModel(pula, [...tlo, ...symetryczne(neutral)], { referenceDate: new Date(T0 + 400 * DZIEN) }).homeAdvantage;
		const zPrzewaga = przewaga(false);
		const neutralne = przewaga(true);
		assert.ok(zPrzewaga > neutralne + 0.1, `${zPrzewaga} vs ${neutralne}`);
		assert.ok(Math.abs(neutralne) < 0.15, `neutralne ${neutralne}`);
	});

	test('za mało meczów w oknie — brak modelu zamiast modelu z szumu', () => {
		assert.equal(fitPoolModel(pula, mecze.slice(0, 50), { referenceDate: new Date(T0 + 400 * DZIEN) }), null);
	});
});
