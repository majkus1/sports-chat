import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Wyciąganie tekstu i źródeł z odpowiedzi wyszukiwania — u obu dostawców, bez sieci.
 *
 * Każdy fakt z wiadomości ma iść do użytkownika ze źródłem. Jeśli ten kod zgubi adresy
 * (inny kształt odpowiedzi po zmianie API), asystent zacznie podawać fakty bez źródeł —
 * cicho, bo nic się nie wywróci. Te testy pilnują kształtu, który dziś zwracają API.
 */

setupEnv();

const openai = await import('@/lib/ai/providers/openai');
const anthropic = await import('@/lib/ai/providers/anthropic');

describe('OpenAI Responses — tekst, cytowania, liczba wyszukań', () => {
	test('zbiera tekst z output_text i unikalne url_citation', () => {
		const response = {
			output: [
				{ type: 'web_search_call', status: 'completed' },
				{
					type: 'message',
					content: [
						{
							type: 'output_text',
							text: 'Napastnik wraca po kontuzji (12.09).',
							annotations: [
								{ type: 'url_citation', url: 'https://a.pl/1', title: 'Portal A' },
								{ type: 'url_citation', url: 'https://a.pl/1', title: 'Portal A (dubel)' },
								{ type: 'url_citation', url: 'https://b.pl/2', title: 'Portal B' },
							],
						},
					],
				},
			],
		};
		const wynik = openai.extractSearchResult(response);

		assert.equal(wynik.text, 'Napastnik wraca po kontuzji (12.09).');
		assert.equal(wynik.searches, 1);
		assert.deepEqual(
			wynik.sources.map((s) => s.url),
			['https://a.pl/1', 'https://b.pl/2'],
			'ten sam adres liczy się raz'
		);
	});

	test('pusta odpowiedź nie wywraca', () => {
		assert.deepEqual(openai.extractSearchResult({}), { text: '', sources: [], searches: 0 });
	});
});

describe('Anthropic — cytowania przy blokach tekstu, wyszukania w usage', () => {
	test('zbiera tekst i cytowania z bloków text', () => {
		const response = {
			content: [
				{ type: 'server_tool_use', name: 'web_search' },
				{ type: 'web_search_tool_result', content: [] },
				{
					type: 'text',
					text: 'Trener zawieszony na dwa mecze (14.09).',
					citations: [{ type: 'web_search_result_location', url: 'https://c.pl/3', title: 'Portal C' }],
				},
			],
			usage: { server_tool_use: { web_search_requests: 2 } },
		};
		const wynik = anthropic.extractSearchResult(response);

		assert.equal(wynik.text, 'Trener zawieszony na dwa mecze (14.09).');
		assert.equal(wynik.searches, 2);
		assert.deepEqual(wynik.sources, [{ title: 'Portal C', url: 'https://c.pl/3' }]);
	});

	test('brak cytowań to pusta lista źródeł, nie wyjątek', () => {
		const wynik = anthropic.extractSearchResult({ content: [{ type: 'text', text: 'Brak wiadomości.' }] });
		assert.equal(wynik.sources.length, 0);
		assert.equal(wynik.text, 'Brak wiadomości.');
	});
});
