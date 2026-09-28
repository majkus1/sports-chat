/**
 * Pamięć asystenta w przeglądarce — dłuższa niż życie komponentu strony.
 *
 * PO CO. Strona asystenta odmontowuje się przy każdym wyjściu: klik w mecz w odpowiedzi,
 * zakładka menu, link w stopce. Stan trzymany wyłącznie w komponencie przepadał — po „Wstecz"
 * wracała pusta rozmowa, znikał wpisany tekst, a odpowiedź, na którą się czekało, była już
 * w bazie, ale nie na ekranie. Tu żyje to, co ma przetrwać nawigację w obrębie karty:
 *
 *   - wczytane rozmowy i lista — powrót jest natychmiastowy, bez ponownego pobierania;
 *   - miejsce przewinięcia każdej rozmowy — wraca się tam, gdzie się czytało;
 *   - pytanie w toku — zapytanie biegnie dalej po wyjściu ze strony, a po powrocie widać
 *     „myślę…", potem odpowiedź;
 *   - szkice wiadomości — w `sessionStorage`, żeby przetrwały też odświeżenie strony.
 *
 * KTÓRA ROZMOWA JEST OTWARTA, mówi adres (`?c=<id>`), nie ta pamięć. Dzięki temu działają
 * „Wstecz", „Dalej", odświeżenie i link do rozmowy wysłany samemu sobie.
 *
 * Pamięć należy do jednego konta (`owner`) — przy innym zalogowanym czyścimy ją w całości.
 */

export const NEW_KEY = 'new';
const ID = /^[a-f0-9]{24}$/;
const DRAFT_PREFIX = 'czat-assistant-draft:';

export const memory = {
	owner: null,
	/** Ostatnio znana lista rozmów albo `null`, gdy jeszcze jej nie pobrano. */
	list: null,
	/** id rozmowy → wiadomości */
	conversations: new Map(),
	/** klucz rozmowy → `scrollTop` okna wiadomości */
	scroll: new Map(),
	/** `{ key, question, previous, promise }` — pytanie, na które czekamy, albo `null` */
	pending: null,
};

/** Klucz rozmowy: jej id albo `new` dla rozmowy, która jeszcze nie ma zapisu. */
export const conversationKey = (id) => id || NEW_KEY;

/** Czyści pamięć, gdy zmienia się zalogowane konto. Zwraca `true`, gdy wyczyściła. */
export function claimMemory(owner) {
	if (!owner || memory.owner === owner) return false;
	memory.owner = owner;
	memory.list = null;
	memory.conversations.clear();
	memory.scroll.clear();
	memory.pending = null;
	return true;
}

/** Id rozmowy z części `?…` adresu; nieprawidłowe traktujemy jak brak. */
export function idFromSearch(search) {
	const c = new URLSearchParams(search || '').get('c');
	return c && ID.test(c) ? c : null;
}

/** Ścieżka tej samej strony z inną (albo żadną) rozmową w adresie; pozostałe parametry zostają. */
export function hrefWithConversation(href, id) {
	const url = new URL(href);
	if (id) url.searchParams.set('c', id);
	else url.searchParams.delete('c');
	return url.pathname + url.search + url.hash;
}

/** Rozmowa na górę listy (nowa albo ta, w której właśnie padło pytanie). */
export function moveToTop(list, entry) {
	return [entry, ...(list || []).filter((c) => c.id !== entry.id)];
}

export function readDraft(key) {
	try {
		return window.sessionStorage.getItem(DRAFT_PREFIX + key) || '';
	} catch {
		return '';
	}
}

export function writeDraft(key, text) {
	try {
		if (text) window.sessionStorage.setItem(DRAFT_PREFIX + key, text);
		else window.sessionStorage.removeItem(DRAFT_PREFIX + key);
	} catch {
		/* tryb prywatny bywa bez zapisu — szkic po prostu nie przetrwa odświeżenia */
	}
}

/**
 * Wysyła pytanie tak, żeby odpowiedź nie zależała od tego, czy strona jest jeszcze otwarta.
 *
 * Wynik trafia do pamięci (rozmowa, lista) niezależnie od komponentu; komponent — jeśli żyje —
 * dostaje go przez `memory.pending.promise`. Nigdy nie rzuca.
 *
 * @returns {Promise<{ status: 'ok', conversationId: string, messages: Array } | { status: 'limit' | 'error', message: string|null }>}
 */
export function sendQuestion({ question, id, language, previous }) {
	const key = conversationKey(id);
	const withQuestion = [...previous, { role: 'user', content: question }];
	const promise = (async () => {
		try {
			const res = await fetch('/api/ai/assistant', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ question, language, conversationId: id }),
			});
			const data = await res.json().catch(() => ({}));
			if (res.status === 429) return { status: 'limit', message: data.message || null };
			if (!res.ok || !data.conversationId) return { status: 'error', message: data.message || null };

			const answer = (data.messages || []).find((m) => m.role === 'assistant');
			const messages = answer ? [...withQuestion, answer] : withQuestion;
			memory.conversations.set(data.conversationId, messages);
			const earlier = memory.list?.find((c) => c.id === data.conversationId);
			memory.list = moveToTop(memory.list, {
				id: data.conversationId,
				title: data.title || earlier?.title || question,
				updatedAt: new Date().toISOString(),
				messageCount: messages.length,
			});
			return { status: 'ok', conversationId: data.conversationId, messages };
		} catch {
			return { status: 'error', message: null };
		} finally {
			memory.pending = null;
		}
	})();
	memory.pending = { key, question, previous, promise };
	return memory.pending;
}
