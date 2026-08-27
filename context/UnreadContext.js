'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { UserContext } from '@/context/UserContext';
import { useSocket } from '@/context/SocketContext';
import { fetchWithAuthRefresh } from '@/lib/authFetch';
import { playNotificationSound } from '@/lib/notificationSound';

/**
 * Nieprzeczytane wiadomości prywatne — jedno źródło dla całej aplikacji.
 *
 * Stan trzymamy tutaj, a nie w panelu konta, bo plakietkę pokazuje też ikona użytkownika
 * w nagłówku, która jest widoczna zawsze. Panel bywa zamknięty i i tak licznik musi rosnąć.
 */

const UnreadContext = createContext({
	unreadByUser: {},
	totalUnread: 0,
	chats: [],
	refresh: () => {},
	markRead: () => {},
});

export function UnreadProvider({ children }) {
	const { isAuthed, user } = useContext(UserContext);
	const { socket, isConnected } = useSocket();

	const [chats, setChats] = useState([]);
	/** Rozmowa otwarta w tej chwili — jej wiadomości nie podbijają licznika. */
	const openPeerRef = useRef(null);

	const refresh = useCallback(async () => {
		if (!isAuthed) return;
		try {
			const res = await fetchWithAuthRefresh('/api/getChatHistory');
			if (!res.ok) return;
			const data = await res.json();
			setChats(Array.isArray(data) ? data : []);
		} catch {
			/* licznik odświeży się przy kolejnej wiadomości */
		}
	}, [isAuthed]);

	useEffect(() => {
		if (!isAuthed) {
			setChats([]);
			return;
		}
		refresh();
	}, [isAuthed, refresh]);

	/** Oznacza rozmowę jako przeczytaną i zeruje jej licznik lokalnie. */
	const markRead = useCallback(
		async (peer, { open = false } = {}) => {
			if (!peer) return;
			openPeerRef.current = open ? peer : null;

			setChats((prev) => prev.map((c) => (c.username === peer ? { ...c, unreadCount: 0 } : c)));

			try {
				await fetchWithAuthRefresh('/api/privateChats/read', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ peer }),
				});
			} catch {
				/* przy błędzie licznik wróci po odświeżeniu listy */
			}
		},
		[]
	);

	/** Rozmowa zamknięta — od tej chwili nowe wiadomości znów są „nieprzeczytane". */
	const closeChat = useCallback(() => {
		openPeerRef.current = null;
	}, []);

	useEffect(() => {
		if (!isAuthed || !socket || !isConnected) return undefined;

		const onNotice = (notice) => {
			if (!notice?.from || notice.from === user?.username) return;

			// Patrzy właśnie na tę rozmowę — nie ma czego zgłaszać, ale znacznik odczytu
			// trzeba przesunąć, żeby wiadomość nie wróciła jako nieprzeczytana po odświeżeniu.
			if (openPeerRef.current === notice.from) {
				markRead(notice.from, { open: true });
				return;
			}

			setChats((prev) => {
				const existing = prev.find((c) => c.username === notice.from);
				const updated = existing
					? prev.map((c) =>
							c.username === notice.from
								? {
										...c,
										unreadCount: (c.unreadCount || 0) + 1,
										lastMessageDate: notice.timestamp,
										lastMessagePreview: notice.preview,
									}
								: c
						)
					: [
							{
								username: notice.from,
								unreadCount: 1,
								lastMessageDate: notice.timestamp,
								lastMessagePreview: notice.preview,
							},
							...prev,
						];

				// Nieprzeczytane na górze, potem od najświeższej.
				return [...updated].sort((a, b) => {
					if (Boolean(b.unreadCount) !== Boolean(a.unreadCount)) {
						return b.unreadCount - a.unreadCount;
					}
					return new Date(b.lastMessageDate || 0) - new Date(a.lastMessageDate || 0);
				});
			});

			playNotificationSound();
		};

		socket.on('private_message_notice', onNotice);
		return () => socket.off('private_message_notice', onNotice);
	}, [isAuthed, socket, isConnected, user?.username, markRead]);

	const value = useMemo(() => {
		const unreadByUser = {};
		let totalUnread = 0;
		for (const chat of chats) {
			const count = chat.unreadCount || 0;
			unreadByUser[chat.username] = count;
			totalUnread += count;
		}
		return { unreadByUser, totalUnread, chats, refresh, markRead, closeChat };
	}, [chats, refresh, markRead, closeChat]);

	return <UnreadContext.Provider value={value}>{children}</UnreadContext.Provider>;
}

export const useUnread = () => useContext(UnreadContext);
export default UnreadContext;
