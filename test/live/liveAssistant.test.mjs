import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Generator live od strony asystenta — część bez sieci i bez AI.
 *
 * Pilnujemy dwóch rzeczy, które asystent czyta, a panel nie: listy `top` (przyjęte typy z różnych
 * meczów obok kuponu — „3 mecze z live i typy") i tabeli jednego meczu (`liveMarketsTable`), w której
 * „zgodne z rynkiem" ma znaczyć dokładnie to samo co w generatorze. Kupon i pojedynczy typ mają
 * wyjść takie same jak przed dodaniem listy.
 */

setupEnv();
const { liveMarketsTable, LIVE_TOP } = await import('@/lib/live/select');
const { liveShortlist, liveResult } = await import('@/lib/live/service');

/** Kandydat z `kandydaci()` — z polami pomocniczymi, które do wyniku nie mogą wyjść. */
const k = (id, model, odds, key = 'home', extra = {}) => ({
	fixtureId: String(id),
	homeName: `Gospodarz ${id}`,
	awayName: `Gość ${id}`,
	league: 'Liga, Kraj',
	minute: 55,
	liveScore: '1:0',
	key,
	selection: `${key} ${id}`,
	odds,
	market: Math.round(100 / odds),
	model,
	probability: model,
	source: 'model',
	events: [{ type: 'Goal' }],
	red: { home: 0, away: 0 },
	homeId: 1,
	awayId: 2,
	...extra,
});

describe('lista przyjętych typów (`top`)', () => {
	const now = new Date('2099-01-01T18:00:00Z');

	test('po jednym typie na mecz, od najwyższej szansy, bez odrzuconych przez AI i bez pól pomocniczych', () => {
		const lista = liveShortlist([
			k(1, 95, 1.06),
			k(1, 90, 1.1, 'X2'), // drugi typ tego samego meczu — odpada na krótkiej liście
			k(2, 90, 1.2),
			k(3, 88, 1.3, 'over25', { source: 'market' }),
			k(4, 86, 1.35),
			k(5, 66, 1.6),
			k(6, 40, 3.5), // kurs poza oboma przedziałami — w ogóle nie jest kandydatem
		]);
		const oceny = new Map([
			['2:home', { decyzja: 'odrzuc', powod: 'rywal dominuje', uzasadnienie: '' }],
			['1:home', { decyzja: 'ok', powod: '', uzasadnienie: 'Strzały 12–3, xG 1,8–0,4.' }],
		]);
		const w = liveResult({ now, lista, oceny, analyzed: 9, withOdds: 7, modelMatches: 3 });

		assert.deepEqual(w.top.map((t) => t.fixtureId), ['1', '3', '4', '5']);
		assert.equal(w.top[0].why, 'Strzały 12–3, xG 1,8–0,4.');
		assert.equal(w.top[1].source, 'market');
		for (const t of w.top) {
			for (const pole of ['events', 'red', 'homeId', 'awayId']) assert.equal(t[pole], undefined, `${pole} wyciekło do wyniku`);
		}
		assert.deepEqual(w.rejected, [{ match: 'Gospodarz 2 – Gość 2', selection: 'home 2', reason: 'rywal dominuje' }]);
		assert.equal(w.shortlisted, 5);
		assert.equal(w.analyzed, 9);
		assert.equal(w.aiChecked, true);
	});

	test('kupon i pojedynczy typ jak dotąd — lista `top` niczego w nich nie zmienia', () => {
		const lista = liveShortlist([k(1, 95, 1.06), k(2, 90, 1.2), k(3, 88, 1.3), k(4, 86, 1.35), k(5, 66, 1.6)]);
		const w = liveResult({ now, lista, oceny: null, analyzed: 5, withOdds: 5, modelMatches: 5 });
		assert.equal(w.mode, 'coupon');
		assert.ok(w.coupon.totalOdds >= 2);
		assert.equal(w.single, null);
		assert.equal(w.aiChecked, false);
		// Bez AI uzasadnienia nie ma — asystent ma to powiedzieć, a nie zmyślić.
		assert.ok(w.top.every((t) => t.why === null));

		const tylkoPojedynczy = liveResult({ now, lista: liveShortlist([k(7, 66, 1.6)]), oceny: null, analyzed: 1, withOdds: 1, modelMatches: 1 });
		assert.equal(tylkoPojedynczy.mode, 'single');
		assert.equal(tylkoPojedynczy.single.fixtureId, '7');
		assert.deepEqual(tylkoPojedynczy.top.map((t) => t.fixtureId), ['7']);
	});

	test(`najwyżej ${LIVE_TOP} typów, a przy braku kandydatów — pusta lista i tryb „nic"`, () => {
		const duzo = liveShortlist(Array.from({ length: 12 }, (_, i) => k(i + 1, 95 - i, 1.06 + i * 0.02)));
		assert.equal(liveResult({ now, lista: duzo, oceny: null, analyzed: 12, withOdds: 12, modelMatches: 12 }).top.length, LIVE_TOP);

		const pusto = liveResult({ now, lista: [], oceny: null, analyzed: 4, withOdds: 2, modelMatches: 1 });
		assert.equal(pusto.mode, 'none');
		assert.deepEqual(pusto.top, []);
		assert.equal(pusto.shortlisted, 0);
	});
});

describe('tabela jednego meczu', () => {
	test('każda selekcja z kursem albo wyliczeniem; zgoda i weto jak w generatorze', () => {
		const tabela = liveMarketsTable({
			odds: { home: 1.2, away: 3.0, X2: 2.5, over25: null },
			model: { home: 0.86, away: 0.2, X2: 0.38, over25: 0.55, homeScores: 0.97 },
			redCards: { home: 0, away: 1 },
		});
		const wg = Object.fromEntries(tabela.map((r) => [r.key, r]));

		// home: rynek 83%, wyliczenie 86% → zgodne. away: 33% vs 20% → niezgodne i weto (czerwona kartka gości).
		assert.deepEqual(wg.home, { key: 'home', odds: 1.2, market: 83, model: 86, source: 'model', agrees: true, veto: false });
		assert.equal(wg.away.agrees, false);
		assert.equal(wg.away.veto, true);
		// X2: rynek 40%, wyliczenie 38% (w granicy 3 pkt), ale goście grają w osłabieniu — weto zdejmuje zgodę.
		assert.equal(wg.X2.veto, true);
		assert.equal(wg.X2.agrees, false);
		// Bez kursu: wyliczenie jest, szansy rynku nie ma i zgody też nie.
		assert.deepEqual(wg.over25, { key: 'over25', odds: null, market: null, model: 55, source: 'model', agrees: false, veto: false });
		assert.equal(wg.homeScores.odds, null);
		// Selekcja bez kursu i bez wyliczenia w ogóle się nie pojawia.
		assert.equal(wg['1X'], undefined);
	});

	test('liga poza modelem — zgoda dwustronna (wyliczenie za wysokie wobec rynku też odpada)', () => {
		const tabela = liveMarketsTable({ odds: { home: 1.2, away: 3.0 }, model: { home: 0.86, away: 0.45 }, source: 'market' });
		assert.deepEqual(
			tabela.map((r) => [r.key, r.agrees, r.source]),
			[
				['home', true, 'market'],
				['away', false, 'market'],
			]
		);
	});
});
