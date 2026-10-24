import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Cechy planów: każda coś odblokowuje i każdą widać w cenniku.
 *
 * Pro i VIP miały jeszcze `analysis_history` i `priority_generation` — nic ich nie sprawdzało,
 * cennik i regulamin o nich milczały, więc była to obietnica tylko w kodzie. Cecha, której nikt
 * nie czyta, prędzej czy później trafia do opisu planu jako funkcja, której nie ma.
 */

setupEnv();

const { ADMIN_PLAN, PLANS, TRIAL } = await import('@/lib/billing/plans');
const { FEATURE_ROWS } = await import('@/lib/billing/planTexts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Źródła aplikacji (bez testów i zależności), w których cecha może być sprawdzana. */
function zrodla(katalog) {
	const out = [];
	for (const wpis of readdirSync(katalog, { withFileTypes: true })) {
		const sciezka = path.join(katalog, wpis.name);
		if (wpis.isDirectory()) out.push(...zrodla(sciezka));
		else if (/\.(js|jsx)$/.test(wpis.name)) out.push(readFileSync(sciezka, 'utf8'));
	}
	return out;
}
const KOD = ['app', 'components', 'lib'].flatMap((k) => zrodla(path.join(ROOT, k))).join('\n');

const CECHY = [...new Set([...Object.values(PLANS), ADMIN_PLAN].flatMap((p) => p.features).concat(TRIAL.features))];

describe('plany: cechy', () => {
	test('każda cecha planu jest pozycją cennika', () => {
		const wCenniku = new Set(FEATURE_ROWS.map(([cecha]) => cecha));
		for (const cecha of CECHY) assert.ok(wCenniku.has(cecha), `${cecha}: brak w cenniku (FEATURE_ROWS)`);
	});

	test('każdą cechę planu coś sprawdza (`hasFeature`)', () => {
		for (const cecha of CECHY) {
			assert.match(KOD, new RegExp(`hasFeature\\(\\s*\\w+\\s*,\\s*'${cecha}'\\s*\\)`), `${cecha}: nic jej nie sprawdza`);
		}
	});

	test('bez cech, których nic nie używało', () => {
		for (const martwa of ['analysis_history', 'priority_generation']) {
			assert.ok(!CECHY.includes(martwa), martwa);
		}
	});

	test('administrator ma wszystko, co płatne plany', () => {
		for (const plan of Object.values(PLANS)) {
			for (const cecha of plan.features) assert.ok(ADMIN_PLAN.features.includes(cecha), `${plan.id}: ${cecha}`);
		}
	});
});
