import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Wiadomości z internetu w rozmowie pod analizą meczu.
 *
 * Czat pod analizą ma cały pakiet meczu w prompcie, więc jedynym narzędziem, jakie dostaje,
 * są wiadomości. Test pilnuje dwóch rzeczy, które łatwo zgubić przy przebudowie: że zbiór
 * narzędzi tego czatu to dokładnie `aktualnosci` (żadne liczbowe — te podwoiłyby koszt
 * pytania bez pożytku) i że prompt prywatnej rozmowy mówi modelowi, kiedy i jak go użyć,
 * łącznie z regułą, że wiadomości nie zmieniają liczb.
 */

setupEnv();

const { NEWS_TOOLS, TOOLS } = await import('@/lib/assistant/tools');
const { ASSISTANT_SYSTEM_PROMPT, CHAT_REPLY_SYSTEM_PROMPT } = await import('@/lib/ai/prompts/chatReply');

describe('narzędzia czatu pod analizą', () => {
	test('dokładnie jedno narzędzie: aktualnosci', () => {
		assert.deepEqual(
			NEWS_TOOLS.map((t) => t.name),
			['aktualnosci']
		);
		// Ten sam obiekt co u asystenta całej oferty — jedna definicja, jeden limit.
		assert.equal(NEWS_TOOLS[0], TOOLS.find((t) => t.name === 'aktualnosci'));
	});
});

describe('prompt prywatnej rozmowy', () => {
	test('zna narzędzie i regułę o liczbach', () => {
		assert.match(ASSISTANT_SYSTEM_PROMPT, /narzędzie aktualnosci/);
		assert.match(ASSISTANT_SYSTEM_PROMPT, /WIADOMOŚCI NIE ZMIENIAJĄ LICZB/);
		assert.match(ASSISTANT_SYSTEM_PROMPT, /\[nazwa źródła\]\(https:\/\/…\)/);
		assert.match(ASSISTANT_SYSTEM_PROMPT, /"niedostepne"/);
	});

	test('czat pokoju (@AI) narzędzia nie dostaje', () => {
		assert.doesNotMatch(CHAT_REPLY_SYSTEM_PROMPT, /aktualnosci/);
	});
});
