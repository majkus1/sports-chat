import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Ligi w okresie próbnym (poziom 3) — bezpieczniki, które chronią to, co już działa.
 *
 * 1. Dopisanie ligi nie może zmienić prognoz w pucharach europejskich: pula `europe` uczy się
 *    na zamkniętej liście lig krajowych, więc liga poziomu 3 nie może się na niej znaleźć.
 * 2. Liga poziomu 3 nie idzie do typu dnia (kupony, raporty i kolejka używają tego samego
 *    `isEstablishedLeague`).
 * 3. Główna skuteczność filtruje poziom 3, ale przepuszcza typy bez zapisanego poziomu.
 */

setupEnv();
const { LEAGUE_TIERS, PROBATION_TIER, isEstablishedLeague, isProbationLeague, MAIN_STATS_LEAGUES } = await import(
	'@/lib/football/leagues'
);
const { POOLS } = await import('@/lib/model/pools');
const { orderCandidates } = await import('@/lib/daily/service');

describe('okres próbny lig', () => {
	test('poziomy tylko 1, 2 albo 3', () => {
		for (const [id, tier] of LEAGUE_TIERS) assert.ok([1, 2, PROBATION_TIER].includes(tier), `liga ${id}: poziom ${tier}`);
	});

	test('żadna liga w okresie próbnym nie uczy pul pucharowych', () => {
		const wPulach = new Set(Object.values(POOLS).flatMap((p) => p.fit));
		for (const [id, tier] of LEAGUE_TIERS) {
			if (tier === PROBATION_TIER) assert.equal(wPulach.has(id), false, `liga ${id} jest w puli`);
		}
	});

	test('pomocnicze: sprawdzona, próbna, spoza listy', () => {
		assert.equal(isEstablishedLeague(39), true); // Premier League
		assert.equal(isProbationLeague(39), false);
		assert.equal(isProbationLeague(136), true); // Serie B — dopuszczona 21.10.2026
		assert.equal(isEstablishedLeague(136), false);
		assert.equal(isEstablishedLeague(999999), false);
		assert.equal(isProbationLeague(999999), false);
		assert.deepEqual(MAIN_STATS_LEAGUES, { leagueTier: { $ne: PROBATION_TIER } });
	});

	test('typ dnia tylko z lig sprawdzonych', () => {
		const now = new Date('2099-01-01T08:00:00Z');
		const wpis = (leagueId, lift) => ({ leagueId, kickoff: '2099-01-01T18:00:00Z', hint: { lift } });
		const kolejka = orderCandidates([wpis(999999, 40), wpis(136, 35), wpis(140, 15), wpis(39, 20)], { now });
		assert.deepEqual(kolejka.map((w) => w.leagueId), [39, 140]);
	});
});
