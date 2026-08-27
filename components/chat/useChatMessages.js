'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PAGE_SIZE = 50;

/** Identyfikator nadawany wiadomości przed wysyłką — pozwala dopasować potwierdzenie. */
export function newClientMsgId() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) {
		return crypto.randomUUID().replace(/-/g, '');
	}
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Wiadomość jest „tą samą", gdy zgadza się identyfikator z bazy albo ten nadany przez klienta. */
function isSameMessage(a, b) {
	if (a.clientMsgId && b.clientMsgId) return a.clientMsgId === b.clientMsgId;
	if (a._id && b._id) return a._id === b._id;
	return false;
}

/**
 * Stan listy wiadomości jednego pokoju.
 *
 * Skupia rzeczy, które wcześniej były rozsiane po komponencie czatu: pobranie historii,
 * doładowywanie starszych wiadomości, scalanie tego, co przyjdzie socketem, oraz statusy
 * własnych wysyłek. Dzięki temu widok zajmuje się wyłącznie rysowaniem.
 */
export function useChatMessages(chatId) {
	const [messages, setMessages] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [hasMore, setHasMore] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const oldestRef = useRef(null);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setMessages([]);
		oldestRef.current = null;

		(async () => {
			try {
				const res = await fetch(
					`/api/getMessages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE_SIZE}`,
					{ credentials: 'include' }
				);
				const data = await res.json();
				if (cancelled) return;

				const list = Array.isArray(data) ? data : [];
				setMessages(list);
				setHasMore(list.length === PAGE_SIZE);
				oldestRef.current = list[0]?.timestamp ?? null;
			} catch {
				if (!cancelled) setMessages([]);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [chatId]);

	/** Doładowanie starszej strony przy przewinięciu na górę listy. */
	const loadOlder = useCallback(async () => {
		if (!hasMore || isLoadingOlder || !oldestRef.current) return;
		setIsLoadingOlder(true);
		try {
			const res = await fetch(
				`/api/getMessages?chatId=${encodeURIComponent(chatId)}&limit=${PAGE_SIZE}&before=${encodeURIComponent(
					new Date(oldestRef.current).toISOString()
				)}`,
				{ credentials: 'include' }
			);
			const data = await res.json();
			const older = Array.isArray(data) ? data : [];

			setMessages((prev) => [...older, ...prev]);
			setHasMore(older.length === PAGE_SIZE);
			if (older.length) oldestRef.current = older[0].timestamp;
		} catch {
			setHasMore(false);
		} finally {
			setIsLoadingOlder(false);
		}
	}, [chatId, hasMore, isLoadingOlder]);

	/** Wiadomość z socketu — podmienia własny optymistyczny wpis zamiast dokładać drugi. */
	const upsert = useCallback((incoming) => {
		setMessages((prev) => {
			const index = prev.findIndex((msg) => isSameMessage(msg, incoming));
			if (index === -1) return [...prev, incoming];
			const next = [...prev];
			next[index] = { ...next[index], ...incoming, status: 'sent' };
			return next;
		});
	}, []);

	/** Optymistyczne dodanie wiadomości przed potwierdzeniem z serwera. */
	const appendPending = useCallback((message) => {
		setMessages((prev) => [...prev, { ...message, status: 'sending' }]);
	}, []);

	const setStatus = useCallback((clientMsgId, status) => {
		setMessages((prev) =>
			prev.map((msg) => (msg.clientMsgId === clientMsgId ? { ...msg, status } : msg))
		);
	}, []);

	const remove = useCallback((clientMsgId) => {
		setMessages((prev) => prev.filter((msg) => msg.clientMsgId !== clientMsgId));
	}, []);

	return {
		messages,
		isLoading,
		hasMore,
		isLoadingOlder,
		loadOlder,
		upsert,
		appendPending,
		setStatus,
		remove,
	};
}
