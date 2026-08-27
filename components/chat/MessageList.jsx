'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown } from 'lucide-react';
import MessageBubble from '@/components/chat/MessageBubble';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/** Wiadomości tej samej osoby w tym oknie czasu tworzą jeden blok. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;
/** Od tylu pikseli od dołu uznajemy, że użytkownik czyta historię, a nie śledzi rozmowę. */
const STICKY_THRESHOLD_PX = 80;

function sameDay(a, b) {
	const d1 = new Date(a);
	const d2 = new Date(b);
	return d1.toDateString() === d2.toDateString();
}

function formatDay(timestamp, locale) {
	const date = new Date(timestamp);
	const today = new Date();
	const yesterday = new Date(today);
	yesterday.setDate(today.getDate() - 1);

	if (date.toDateString() === today.toDateString()) return 'today';
	if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
	return date.toLocaleDateString(locale, { day: '2-digit', month: 'long' });
}

/**
 * Lista wiadomości.
 *
 * Poprzednia wersja przewijała na sam dół po każdej zmianie tablicy — czytanie starszych
 * wiadomości przerywała każda nowa. Tutaj do dołu doskakujemy tylko wtedy, gdy użytkownik
 * już przy nim był; w przeciwnym razie pokazujemy plakietkę z liczbą nowych wiadomości.
 */
export default function MessageList({
	messages,
	currentUsername,
	isLoading,
	hasMore,
	isLoadingOlder,
	onLoadOlder,
	onOpenPrivateChat,
	onRetry,
	locale,
	className,
}) {
	const t = useTranslations('common');
	const viewportRef = useRef(null);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const [unseenCount, setUnseenCount] = useState(0);
	const previousCountRef = useRef(0);
	const previousHeightRef = useRef(0);

	const scrollToBottom = useCallback((behavior = 'smooth') => {
		const el = viewportRef.current;
		if (!el) return;
		el.scrollTo({ top: el.scrollHeight, behavior });
		setUnseenCount(0);
	}, []);

	const handleScroll = useCallback(() => {
		const el = viewportRef.current;
		if (!el) return;

		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		const atBottom = distanceFromBottom <= STICKY_THRESHOLD_PX;
		setIsAtBottom(atBottom);
		if (atBottom) setUnseenCount(0);

		if (el.scrollTop < 120 && hasMore && !isLoadingOlder) {
			previousHeightRef.current = el.scrollHeight;
			onLoadOlder?.();
		}
	}, [hasMore, isLoadingOlder, onLoadOlder]);

	// Po doładowaniu starszych wiadomości utrzymujemy pozycję czytania — bez tego
	// lista „uciekłaby" w górę o wysokość dołożonej strony.
	useLayoutEffect(() => {
		const el = viewportRef.current;
		if (!el || !previousHeightRef.current) return;
		const delta = el.scrollHeight - previousHeightRef.current;
		if (delta > 0) el.scrollTop += delta;
		previousHeightRef.current = 0;
	}, [messages.length]);

	useEffect(() => {
		const added = messages.length - previousCountRef.current;
		previousCountRef.current = messages.length;
		if (added <= 0) return;

		const last = messages[messages.length - 1];
		const isOwn = last?.username === currentUsername;

		if (isAtBottom || isOwn) {
			scrollToBottom(messages.length === added ? 'auto' : 'smooth');
		} else {
			setUnseenCount((count) => count + added);
		}
	}, [messages, currentUsername, isAtBottom, scrollToBottom]);

	if (isLoading) {
		return (
			<div className={cn('flex flex-col gap-3 p-3', className)}>
				{[70, 45, 60].map((width, idx) => (
					<div key={idx} className="flex gap-2">
						<Skeleton className="h-9 w-9 rounded-full" />
						<Skeleton className="h-12" style={{ width: `${width}%` }} />
					</div>
				))}
			</div>
		);
	}

	return (
		<div className={cn('relative min-h-0', className)}>
			<div
				ref={viewportRef}
				onScroll={handleScroll}
				className="h-full overflow-y-auto overscroll-contain pb-2"
			>
				{hasMore && (
					<div className="py-2 text-center text-xs text-muted">
						{isLoadingOlder ? t('loading_older') : t('scroll_for_older')}
					</div>
				)}

				{messages.length === 0 && (
					<p className="px-3 py-8 text-center text-sm text-muted">{t('chat_empty')}</p>
				)}

				{messages.map((message, index) => {
					const previous = messages[index - 1];
					const startsNewDay = !previous || !sameDay(previous.timestamp, message.timestamp);
					const showAuthor =
						startsNewDay ||
						previous.username !== message.username ||
						previous.authorType !== message.authorType ||
						new Date(message.timestamp) - new Date(previous.timestamp) > GROUP_WINDOW_MS;

					const dayKey = startsNewDay ? formatDay(message.timestamp, locale) : null;

					return (
						<div key={message._id || message.clientMsgId || index}>
							{startsNewDay && (
								<div className="my-4 flex items-center gap-3 px-3">
									<span className="h-px flex-1 bg-border" />
									<span className="text-xs font-semibold uppercase tracking-wide text-muted">
										{dayKey === 'today' || dayKey === 'yesterday' ? t(dayKey) : dayKey}
									</span>
									<span className="h-px flex-1 bg-border" />
								</div>
							)}
							<MessageBubble
								message={message}
								isOwn={message.username === currentUsername && message.authorType !== 'ai'}
								showAuthor={showAuthor}
								onOpenPrivateChat={onOpenPrivateChat}
								onRetry={onRetry}
							/>
						</div>
					);
				})}
			</div>

			{!isAtBottom && (
				<button
					type="button"
					onClick={() => scrollToBottom()}
					className={cn(
						'absolute bottom-3 left-1/2 -translate-x-1/2',
						'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg',
						unseenCount > 0 ? 'bg-accent text-accent-fg' : 'bg-surface-3 text-text'
					)}
				>
					<ArrowDown size={14} aria-hidden="true" />
					{unseenCount > 0 ? t('new_messages', { count: unseenCount }) : t('scroll_to_bottom')}
				</button>
			)}
		</div>
	);
}
