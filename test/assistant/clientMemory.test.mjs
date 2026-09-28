import test, { describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv } from '../helpers/setup.mjs';

/**
 * Pamięć asystenta w przeglądarce — to, co ma przetrwać wyjście ze strony i „Wstecz".
 *
 * Bez przeglądarki: `fetch` i `sessionStorage` podstawione. Pilnujemy, że rozmowa jest
 * w adresie i tylko tam, że pytanie w toku kończy się zapisem w pamięci także wtedy, gdy
 * nikt już nie słucha, że błąd niczego do pamięci nie wpisuje, i że inne konto dostaje
 * pamięć czystą.
 */

setupEnv();
const {
	memory, conversationKey, claimMemory, idFromSearch, hrefWithConversation, moveToTop, readDraft, writeDraft, sendQuestion, NEW_KEY,
} = await import('@/lib/assistant/clientMemory');

const ID_A = 'a'.repeat(24);
const ID_B = 'b'.repeat(24);
const oryginalnyFetch = globalThis.fetch;

function odpowiedz(status, body) {
	globalThis.fetch = async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
	memory.owner = null;
	claimMemory('user-1');
	const magazyn = new Map();
	globalThis.window = {
		sessionStorage: {
			getItem: (k) => magazyn.get(k) ?? null,
			setItem: (k, v) => magazyn.set(k, v),
			removeItem: (k) => magazyn.delete(k),
		},
	};
});

after(() => {
	globalThis.fetch = oryginalnyFetch;
	delete globalThis.window;
});

describe('adres rozmowy', () => {
	test('id z `?c=`; śmieci i brak to nowa rozmowa', () => {
		assert.equal(idFromSearch(`?c=${ID_A}`), ID_A);
		assert.equal(idFromSearch('?c=../../x'), null);
		assert.equal(idFromSearch(''), null);
		assert.equal(conversationKey(null), NEW_KEY);
		assert.equal(conversationKey(ID_A), ID_A);
	});

	test('zmiana rozmowy w adresie zostawia ścieżkę języka i inne parametry', () => {
		assert.equal(
			hrefWithConversation('https://czatsportowy.pl/pl/pilka-nozna/asystent?utm=x', ID_A),
			`/pl/pilka-nozna/asystent?utm=x&c=${ID_A}`
		);
		assert.equal(hrefWithConversation(`https://czatsportowy.pl/en/pilka-nozna/asystent?c=${ID_A}`, null), '/en/pilka-nozna/asystent');
	});

	test('rozmowa z pytaniem idzie na górę listy, bez dubli', () => {
		const lista = moveToTop([{ id: ID_A }, { id: ID_B }], { id: ID_B, title: 'nowy' });
		assert.deepEqual(lista.map((c) => c.id), [ID_B, ID_A]);
		assert.equal(lista[0].title, 'nowy');
		assert.deepEqual(moveToTop(null, { id: ID_A }).map((c) => c.id), [ID_A]);
	});
});

describe('szkice', () => {
	test('osobno dla każdej rozmowy; pusty tekst kasuje szkic', () => {
		writeDraft(NEW_KEY, 'co gra Legia?');
		writeDraft(ID_A, 'a Lech?');
		assert.equal(readDraft(NEW_KEY), 'co gra Legia?');
		assert.equal(readDraft(ID_A), 'a Lech?');
		writeDraft(ID_A, '');
		assert.equal(readDraft(ID_A), '');
	});

	test('bez dostępu do zapisu nic się nie wywraca', () => {
		globalThis.window = {
			sessionStorage: {
				getItem: () => {
					throw new Error('blocked');
				},
				setItem: () => {
					throw new Error('blocked');
				},
			},
		};
		assert.equal(readDraft(NEW_KEY), '');
		assert.doesNotThrow(() => writeDraft(NEW_KEY, 'x'));
	});
});

describe('pytanie w toku', () => {
	test('nowa rozmowa: odpowiedź trafia do pamięci i listy, a pytanie w toku znika', async () => {
		odpowiedz(200, {
			conversationId: ID_A,
			title: 'Gdzie model widzi typy?',
			messages: [
				{ role: 'user', content: 'Gdzie model widzi typy?' },
				{ role: 'assistant', content: 'Trzy mecze…' },
			],
		});
		const pending = sendQuestion({ question: 'Gdzie model widzi typy?', id: null, language: 'pl', previous: [] });
		assert.equal(memory.pending, pending);
		assert.equal(pending.key, NEW_KEY);

		const wynik = await pending.promise;
		assert.equal(wynik.status, 'ok');
		assert.equal(wynik.conversationId, ID_A);
		assert.deepEqual(wynik.messages.map((m) => m.role), ['user', 'assistant']);
		assert.equal(memory.conversations.get(ID_A), wynik.messages);
		assert.equal(memory.list[0].id, ID_A);
		assert.equal(memory.pending, null);
	});

	test('dalsza rozmowa: poprzednie wiadomości zostają, rozmowa wraca na górę listy', async () => {
		memory.list = [{ id: ID_B, title: 'B' }, { id: ID_A, title: 'A' }];
		odpowiedz(200, { conversationId: ID_A, title: 'A', messages: [{ role: 'user', content: 'i?' }, { role: 'assistant', content: 'odp' }] });
		const wczesniej = [{ role: 'user', content: 'p1' }, { role: 'assistant', content: 'o1' }];
		const wynik = await sendQuestion({ question: 'i?', id: ID_A, language: 'pl', previous: wczesniej }).promise;
		assert.deepEqual(wynik.messages.map((m) => m.content), ['p1', 'o1', 'i?', 'odp']);
		assert.deepEqual(memory.list.map((c) => c.id), [ID_A, ID_B]);
	});

	test('limit i błąd niczego nie zapisują w pamięci', async () => {
		odpowiedz(429, { message: 'Limit.' });
		const limit = await sendQuestion({ question: 'x', id: null, language: 'pl', previous: [] }).promise;
		assert.deepEqual(limit, { status: 'limit', message: 'Limit.' });

		odpowiedz(500, {});
		const blad = await sendQuestion({ question: 'x', id: ID_A, language: 'pl', previous: [] }).promise;
		assert.deepEqual(blad, { status: 'error', message: null });

		globalThis.fetch = async () => {
			throw new Error('offline');
		};
		assert.equal((await sendQuestion({ question: 'x', id: null, language: 'pl', previous: [] }).promise).status, 'error');
		assert.equal(memory.conversations.size, 0);
		assert.equal(memory.pending, null);
	});
});

describe('właściciel pamięci', () => {
	test('inne konto dostaje czystą pamięć; to samo konto — nietkniętą', () => {
		memory.conversations.set(ID_A, [{ role: 'user', content: 'moje' }]);
		memory.list = [{ id: ID_A }];
		assert.equal(claimMemory('user-1'), false);
		assert.equal(memory.conversations.size, 1);
		assert.equal(claimMemory('user-2'), true);
		assert.equal(memory.conversations.size, 0);
		assert.equal(memory.list, null);
		assert.equal(claimMemory(null), false);
	});
});
