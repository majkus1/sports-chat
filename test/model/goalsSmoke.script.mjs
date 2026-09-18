/**
 * Skrypt pomocniczy testu dymnego rynku „powyżej 2,5" — uruchamiany w procesie potomnym
 * z atrapą endpointów (`stubLoader.mjs`). Wypisuje JSON z prognozą; ocenia go test.
 *
 * Bez bazy: `bufferCommands=false` sprawia, że zapytanie o strzały pada od razu zamiast
 * czekać 10 s na połączenie — a `goalsContext` ma to przełknąć i policzyć wariant `goals`.
 */
import mongoose from 'mongoose';
import { setupEnv } from '../helpers/setup.mjs';

setupEnv();
mongoose.set('bufferCommands', false);

const { predictFixture } = await import('@/lib/model');
const { evaluateMarkets } = await import('@/lib/reports/service');
const { bestHint } = await import('@/lib/model/hints');
const { leagueFixtures } = await import('@/lib/football/endpoints');

const rows = await leagueFixtures({ leagueId: 39, season: 2025 });
const ostatni = rows[rows.length - 1];
const homeId = ostatni.teams.home.id;
const awayId = ostatni.teams.away.id;

const prognoza = await predictFixture({ leagueId: 39, season: 2025, homeId, awayId });
const rynki = prognoza ? evaluateMarkets({ modelPrediction: prognoza, homeName: 'A', awayName: 'B' }) : [];

console.log(
	JSON.stringify({
		over25: prognoza?.over25 ?? null,
		selekcje: rynki.map((r) => ({ market: r.market, selection: r.selection, p: r.pModel, base: r.base, lift: r.lift })),
		hint: bestHint(rynki),
		modelVersion: prognoza?.modelVersion ?? null,
	})
);
process.exit(0);
