import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Skrót dnia dla n8n — trasa ujawnia dane operacyjne (wydatki AI, rejestracje), więc bez
 * sekretu musi odmówić. Do tego workflowy: poprawny JSON i węzły połączone po nazwach.
 */

setupEnv();
process.env.INTERNAL_API_SECRET = 'sekret-testowy-daily-brief';
const { GET } = await import('@/app/api/integrations/daily-brief/route');

describe('skrót dnia dla n8n', () => {
	test('bez sekretu albo z błędnym — 401', async () => {
		const bez = await GET(new Request('http://localhost/api/integrations/daily-brief'));
		assert.equal(bez.status, 401);
		const zly = await GET(
			new Request('http://localhost/api/integrations/daily-brief', { headers: { 'x-internal-secret': 'zly-sekret-tej-samej-dl' } })
		);
		assert.equal(zly.status, 401);
	});

	for (const plik of ['poranny-post-telegram.json', 'wieczorny-raport-wlasciciela.json']) {
		test(`workflow ${plik}: połączenia wskazują istniejące węzły`, () => {
			const wf = JSON.parse(readFileSync(new URL(`../../integrations/n8n/${plik}`, import.meta.url), 'utf8'));
			const nazwy = new Set(wf.nodes.map((n) => n.name));
			for (const [z, wyjscia] of Object.entries(wf.connections)) {
				assert.ok(nazwy.has(z), `nieznany węzeł ${z}`);
				for (const cel of wyjscia.main.flat()) assert.ok(nazwy.has(cel.node), `nieznany węzeł ${cel.node}`);
			}
			// Kod węzłów musi się parsować (n8n uruchamia go jako ciało funkcji asynchronicznej).
			for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
				assert.doesNotThrow(() => new Function('$', '$input', `return (async () => {${n.parameters.jsCode}})()`), n.name);
			}
		});
	}
});
