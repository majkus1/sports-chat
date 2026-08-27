'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UserContext } from '@/context/UserContext';
import { useSocket } from '@/context/SocketContext';
import { fetchWithAuthRefresh } from '@/lib/authFetch';
import MessageList from '@/components/chat/MessageList';
import Composer from '@/components/chat/Composer';
import { ConnectionBanner, PresenceBar, TypingIndicator } from '@/components/chat/ChatStatus';
import { useChatMessages, newClientMsgId } from '@/components/chat/useChatMessages';
import Modal from '@/components/Modal';
import PrivateChatComponent from '@/components/PrivateChatComponent';
import { cn } from '@/lib/utils';

/** Po tylu milisekundach bez kolejnego sygnału uznajemy, że rozmówca przestał pisać. */
const TYPING_TTL_MS = 4000;

/**
 * Czat jednego pokoju.
 *
 * Zastępuje monolityczny ChatComponent: tutaj zostało wyłącznie połączenie z socketem
 * i składanie widoków. Historia, paginacja i statusy wysyłki siedzą w useChatMessages,
 * rysowanie w MessageList, pisanie w Composer.
 */
export default function ChatPanel({ chatId, className }) {
	const t = useTranslations('common');
	const locale = useLocale();
	const { user, isAuthed } = useContext(UserContext);
	const { socket, isConnected, connectionError, sendWithAuthRetry } = useSocket();
	const username = user?.username;

	const chat = useChatMessages(chatId);
	const { upsert, appendPending, setStatus, remove } = chat;

	const [presence, setPresence] = useState({ total: 0, users: [] });
	const [typingUsers, setTypingUsers] = useState([]);
	const [isAiThinking, setIsAiThinking] = useState(false);
	const [aiNotice, setAiNotice] = useState(null);
	const [privateChatWith, setPrivateChatWith] = useState(null);
	const typingTimersRef = useRef(new Map());

	// Dołączenie do pokoju i nasłuch. `isConnected` w zależnościach jest istotne:
	// po reconnekcie socket.io nie pamięta pokoi, więc trzeba dołączyć ponownie.
	useEffect(() => {
		if (!socket) return undefined;

		if (isConnected) socket.emit('join_chat', chatId);

		const onMessage = (message) => {
			if (message.chatId !== chatId) return;
			upsert(message);
		};

		const onPresence = (payload) => {
			if (payload.chatId !== chatId) return;
			setPresence({ total: payload.total, users: payload.users || [] });
		};

		const onTyping = ({ chatId: room, username: who }) => {
			if (room !== chatId || who === username) return;
			setTypingUsers((prev) => (prev.includes(who) ? prev : [...prev, who]));

			clearTimeout(typingTimersRef.current.get(who));
			typingTimersRef.current.set(
				who,
				setTimeout(() => {
					setTypingUsers((prev) => prev.filter((name) => name !== who));
					typingTimersRef.current.delete(who);
				}, TYPING_TTL_MS)
			);
		};

		const onStopTyping = ({ chatId: room, username: who }) => {
			if (room !== chatId) return;
			clearTimeout(typingTimersRef.current.get(who));
			typingTimersRef.current.delete(who);
			setTypingUsers((prev) => prev.filter((name) => name !== who));
		};

		const onAiTyping = ({ chatId: room }) => {
			if (room === chatId) setIsAiThinking(true);
		};
		const onAiDone = ({ chatId: room }) => {
			if (room === chatId) setIsAiThinking(false);
		};
		/** Powód odmowy jest widoczny tylko dla osoby, która wywołała asystenta. */
		const onAiLimit = ({ chatId: room, code, retryInMs }) => {
			if (room !== chatId) return;
			setIsAiThinking(false);
			setAiNotice(
				code === 'cooldown'
					? t('ai_cooldown', { seconds: Math.ceil((retryInMs || 0) / 1000) })
					: code === 'daily_limit'
						? t('ai_daily_limit')
						: t('ai_unavailable')
			);
		};

		socket.on('receive_message', onMessage);
		socket.on('presence', onPresence);
		socket.on('peer_typing', onTyping);
		socket.on('peer_stop_typing', onStopTyping);
		socket.on('ai_typing', onAiTyping);
		socket.on('ai_done', onAiDone);
		socket.on('ai_limit', onAiLimit);

		const timers = typingTimersRef.current;
		return () => {
			socket.off('receive_message', onMessage);
			socket.off('presence', onPresence);
			socket.off('peer_typing', onTyping);
			socket.off('peer_stop_typing', onStopTyping);
			socket.off('ai_typing', onAiTyping);
			socket.off('ai_done', onAiDone);
			socket.off('ai_limit', onAiLimit);
			if (isConnected) socket.emit('leave_chat', chatId);
			timers.forEach((timer) => clearTimeout(timer));
			timers.clear();
		};
	}, [socket, isConnected, chatId, username, upsert, t]);

	// Komunikat o limicie sam znika — to informacja przelotna, nie stan do zamykania.
	useEffect(() => {
		if (!aiNotice) return undefined;
		const id = setTimeout(() => setAiNotice(null), 6000);
		return () => clearTimeout(id);
	}, [aiNotice]);

	const deliver = useCallback(
		async (content, clientMsgId) => {
			// `language` decyduje, w jakim języku odpowie asystent wywołany przez @AI.
			const result = await sendWithAuthRetry('send_message', {
				chatId,
				content,
				clientMsgId,
				language: locale === 'en' ? 'en' : 'pl',
			});
			if (result.ok) {
				setStatus(clientMsgId, 'sent');
				return;
			}

			// Socket niedostępny — zapis przez HTTP, żeby wiadomość nie przepadła.
			if (result.code === 'disconnected' || result.code === 'timeout') {
				const response = await fetchWithAuthRefresh('/api/sendMessage', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ chatId, content, clientMsgId }),
				});
				setStatus(clientMsgId, response.ok ? 'sent' : 'failed');
				return;
			}

			setStatus(clientMsgId, 'failed');
		},
		[chatId, locale, sendWithAuthRetry, setStatus]
	);

	const handleSend = useCallback(
		(content) => {
			if (!isAuthed || !username) return;
			const clientMsgId = newClientMsgId();
			appendPending({ chatId, username, content, timestamp: new Date(), clientMsgId });
			deliver(content, clientMsgId).catch(() => setStatus(clientMsgId, 'failed'));
		},
		[isAuthed, username, chatId, appendPending, deliver, setStatus]
	);

	const handleRetry = useCallback(
		(message) => {
			remove(message.clientMsgId);
			handleSend(message.content);
		},
		[remove, handleSend]
	);

	const handleTyping = useCallback(
		(active = true) => {
			if (!socket?.connected || !isAuthed) return;
			socket.emit(active ? 'typing' : 'stop_typing', chatId);
		},
		[socket, isAuthed, chatId]
	);

	return (
		<div className={cn('flex min-h-0 flex-col overflow-hidden bg-surface', className)}>
			<PresenceBar total={presence.total} isConnected={isConnected} />
			<ConnectionBanner error={connectionError} />

			<MessageList
				className="flex-1"
				messages={chat.messages}
				currentUsername={username}
				isLoading={chat.isLoading}
				hasMore={chat.hasMore}
				isLoadingOlder={chat.isLoadingOlder}
				onLoadOlder={chat.loadOlder}
				onOpenPrivateChat={setPrivateChatWith}
				onRetry={handleRetry}
				locale={locale}
			/>

			<TypingIndicator usernames={isAiThinking ? [t('ai_assistant'), ...typingUsers] : typingUsers} />

			{aiNotice && (
				<p role="status" className="px-3 pb-1 text-xs text-loss">
					{aiNotice}
				</p>
			)}

			{isAuthed ? (
				<Composer onSend={handleSend} onTyping={handleTyping} roomUsers={presence.users} />
			) : (
				<p className="border-t border-border px-3 py-4 text-center text-sm text-muted">
					{t('mustlog')}
				</p>
			)}

			{privateChatWith && privateChatWith !== username && (
				<Modal onClose={() => setPrivateChatWith(null)}>
					<PrivateChatComponent receiver={privateChatWith} />
				</Modal>
			)}
		</div>
	);
}
