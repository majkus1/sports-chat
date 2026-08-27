'use client';

import { useState, useEffect, useContext, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { UserContext } from '../context/UserContext';
import { useSocket } from '../context/SocketContext';
import { fetchWithAuthRefresh } from '@/lib/authFetch';
import { privateChatIdForUsers } from '@/lib/chatConstraints';
import MessageList from '@/components/chat/MessageList';
import Composer from '@/components/chat/Composer';
import { initialsFromName } from '@/components/ui/Avatar';

/**
 * Rozmowa prywatna.
 *
 * Widok korzysta z tych samych komponentów co czat meczowy (MessageList, Composer),
 * więc dostaje bąbelki, grupowanie po autorze, separatory dni i utrzymywanie pozycji
 * przewijania. Wcześniej była to płaska lista „nick: treść data", utrzymywana osobno
 * i rozjeżdżająca się z resztą aplikacji przy każdej zmianie.
 */

/** Okno, w którym echo z serwera uznajemy za powtórkę własnej wiadomości. */
const ECHO_WINDOW_MS = 10_000;

const PrivateChatComponent = ({ receiver }) => {
	const [messages, setMessages] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const { user, isAuthed } = useContext(UserContext);
	const { socket, isConnected, connectionError, sendWithAuthRetry } = useSocket();
	const username = user?.username;
	const t = useTranslations('common');
	const locale = useLocale();

	const fetchWithRefresh = useCallback((url, opts) => fetchWithAuthRefresh(url, opts), []);

	useEffect(() => {
		if (!socket || !receiver) return undefined;

		const sender = username || 'Anonim';
		// Serwer składa chatId przez localeCompare('pl'); zwykły .sort() daje inną kolejność
		// dla nicków z wielkich liter i polskich znaków, przez co wiadomości ginęły po cichu.
		const chatId = privateChatIdForUsers(sender, receiver);

		if (isConnected) socket.emit('join_chat', chatId);

		const fetchMessages = async () => {
			setIsLoading(true);
			try {
				const response = await fetchWithRefresh(
					`/api/getPrivateMessages?peer=${encodeURIComponent(receiver)}`
				);
				const data = await response.json();
				setMessages(Array.isArray(data) ? data : []);
			} catch (error) {
				if (process.env.NODE_ENV === 'development') {
					console.error('Błąd podczas pobierania wiadomości:', error);
				}
			} finally {
				setIsLoading(false);
			}
		};

		fetchMessages();

		const handleReceivePrivateMessage = (message) => {
			if (message.chatId !== chatId) return;

			setMessages((prev) => {
				// Identyfikator z bazy rozstrzyga jednoznacznie.
				if (message._id && prev.some((m) => m._id === message._id)) return prev;

				/*
				 * Wiadomość własną dopisujemy od razu po wysłaniu, więc echo z serwera trzeba
				 * pominąć. Kluczowe jest okno czasowe: samo porównanie autora i treści kasowało
				 * powtórzenie tego samego słowa wysłane później drugi raz.
				 */
				const last = prev[prev.length - 1];
				if (
					last &&
					!last._id &&
					last.username === message.username &&
					last.content === message.content &&
					Math.abs(new Date(message.timestamp) - new Date(last.timestamp)) < ECHO_WINDOW_MS
				) {
					return prev;
				}

				return [...prev, message];
			});
		};

		socket.on('receive_private_message', handleReceivePrivateMessage);
		return () => socket.off('receive_private_message', handleReceivePrivateMessage);
	}, [receiver, username, socket, isConnected, fetchWithRefresh]);

	const handleSend = async (content) => {
		const trimmed = content.trim();
		if (!trimmed || !receiver) return;

		const sender = username || 'Anonim';
		const chatId = privateChatIdForUsers(sender, receiver);

		try {
			const response = await fetchWithRefresh('/api/sendPrivateMessage', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: trimmed, peer: receiver }),
			});

			const data = await response.json().catch(() => ({}));

			if (response.ok && data.success !== false) {
				const displayName =
					typeof data.username === 'string' && data.username.trim()
						? data.username.trim()
						: sender;

				setMessages((prev) => [
					...prev,
					{ username: displayName, content: trimmed, timestamp: new Date().toISOString() },
				]);

				// Rozgłoszenie przez socket z potwierdzeniem: gdy sesja socketu wygasła,
				// dostajemy kod błędu i ponawiamy po odświeżeniu tokenu, zamiast milczeć.
				sendWithAuthRetry('send_private_message', {
					content: trimmed,
					chatId,
					peerUsername: receiver,
				}).catch(() => {});
			} else if (process.env.NODE_ENV === 'development') {
				console.error(data.message);
			}
		} catch (error) {
			if (process.env.NODE_ENV === 'development') {
				console.error('Błąd podczas wysyłania wiadomości:', error);
			}
		}
	};

	if (!isAuthed) {
		return <p className="p-4 text-sm text-muted">{t('mustlog')}</p>;
	}

	return (
		<div className="flex h-[70vh] max-h-[560px] flex-col">
			{/*
			 * Nagłówek z rozmówcą — dotąd nie było widać, z kim się właściwie pisze.
			 * Prawy margines robi miejsce przyciskowi zamykania okna, który jest pozycjonowany
			 * absolutnie w rogu; stan połączenia siedzi przy nazwie, żeby się z nim nie nakładał.
			 */}
			<div className="flex items-center gap-2.5 border-b border-border py-2.5 pl-3 pr-12">
				<span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
					{initialsFromName(receiver)}
				</span>
				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-bold text-text">{receiver}</p>
					<p className="flex items-center gap-1.5 text-xs text-muted">
						<span
							className={`h-1.5 w-1.5 shrink-0 rounded-full ${
								isConnected ? 'bg-accent' : 'bg-muted'
							}`}
							aria-hidden="true"
						/>
						{isConnected ? t('connected') : t('reconnecting')}
					</p>
				</div>
			</div>

			{connectionError && (
				<p className="bg-danger-soft px-3 py-2 text-xs text-loss">{connectionError}</p>
			)}

			<MessageList
				messages={messages}
				currentUsername={username}
				isLoading={isLoading}
				hasMore={false}
				locale={locale}
				className="flex-1"
			/>

			<Composer onSend={handleSend} disabled={!isAuthed} />
		</div>
	);
};

export default PrivateChatComponent;
