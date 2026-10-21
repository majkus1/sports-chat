import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Kursy w czacie meczu (pokój i rozmowa pod analizą): sekcja KURSY w prompcie z medianą
 * bukmacherów i szansą z kursu; bez kursów — bez sekcji, a zasada mówi, co wtedy powiedzieć.
 */

setupEnv();
const { formatOdds, buildChatReplyPrompt, CHAT_REPLY_SYSTEM_PROMPT, ASSISTANT_SYSTEM_PROMPT } = await import('@/lib/ai/prompts/chatReply');

describe('kursy w czacie meczu', () => {
	test('sekcja z kursem i szansą z kursu, tylko rynki z kursem', () => {
		const s = formatOdds({ bookmakers: 7, home: 1.45, draw: 4.2, away: 7.5, dcX2: null, over25: 1.8 });
		assert.match(s, /mediana 7 bukmacherów/);
		assert.match(s, /wygrana gospodarzy: 1,45 \(szansa z kursu ≈69%\)/);
		assert.match(s, /powyżej 2,5 gola: 1,80/);
		assert.doesNotMatch(s, /X2/);
		assert.equal(formatOdds({ bookmakers: 0, home: 1.5 }), null);
		assert.equal(formatOdds(null), null);
	});

	test('prompt dostaje kursy; zasada pozwala na kursy tylko z sekcji, bez nazw bukmacherów i stawek', () => {
		const p = buildChatReplyPrompt({ question: 'jaki kurs?', history: [], bundle: null, analysisText: null, language: 'pl', odds: { bookmakers: 5, home: 2.1 } });
		assert.match(p, /KURSY \(mediana 5 bukmacherów/);
		assert.doesNotMatch(buildChatReplyPrompt({ question: 'x', history: [], bundle: null, analysisText: null, language: 'pl' }), /KURSY/);
		for (const sys of [CHAT_REPLY_SYSTEM_PROMPT, ASSISTANT_SYSTEM_PROMPT]) {
			assert.match(sys, /WYŁĄCZNIE z sekcji KURSY/);
			assert.match(sys, /nigdy nie wymieniaj nazw bukmacherów/);
			assert.doesNotMatch(sys, /Nie podawaj kursów bukmacherskich/);
		}
	});
});
