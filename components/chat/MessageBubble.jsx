'use client';

import { useTranslations } from 'next-intl';
import { AlertCircle, Bot, MessageSquare, RotateCw } from 'lucide-react';
import { Avatar, AvatarFallback, initialsFromName } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

/** Wzmianki są podświetlane; `@AI` dodatkowo wyróżnione, bo wywołuje asystenta. */
const MENTION_RE = /(@[\p{L}\p{N}_-]{2,32})/gu;

function renderContent(text) {
	return text.split(MENTION_RE).map((part, idx) => {
		if (!part.startsWith('@')) return part;
		const isAi = part.toLowerCase() === '@ai';
		return (
			<span
				key={idx}
				className={cn(
					'rounded px-1 font-semibold',
					isAi ? 'bg-accent/20 text-accent' : 'bg-brand/15 text-brand'
				)}
			>
				{part}
			</span>
		);
	});
}

function formatTime(timestamp) {
	return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Pojedyncza wiadomość.
 *
 * `showAuthor` jest sterowane z listy — kolejne wiadomości tej samej osoby w krótkim
 * odstępie tworzą jeden blok, zamiast powtarzać nick przy każdej linii.
 */
export default function MessageBubble({ message, isOwn, showAuthor, onOpenPrivateChat, onRetry }) {
	const t = useTranslations('common');
	const isAi = message.authorType === 'ai';
	const failed = message.status === 'failed';

	return (
		<div
			className={cn(
				'flex gap-2 px-3',
				showAuthor ? 'mt-3' : 'mt-0.5',
				isOwn ? 'flex-row-reverse' : 'flex-row'
			)}
		>
			<div className="w-9 shrink-0">
				{showAuthor && (
					<Avatar className={cn('h-9 w-9', isAi && 'bg-accent/15')}>
						<AvatarFallback className={cn(isAi && 'text-accent')}>
							{isAi ? <Bot size={16} aria-hidden="true" /> : initialsFromName(message.username)}
						</AvatarFallback>
					</Avatar>
				)}
			</div>

			<div className={cn('flex min-w-0 max-w-[min(36rem,78%)] flex-col', isOwn && 'items-end')}>
				{showAuthor && (
					<div className={cn('mb-1 flex items-center gap-2', isOwn && 'flex-row-reverse')}>
						{isAi ? (
							<span className="text-sm font-bold text-accent">{t('ai_assistant')}</span>
						) : (
							<button
								type="button"
								onClick={() => onOpenPrivateChat?.(message.username)}
								className="text-sm font-bold text-text transition-colors hover:text-brand"
							>
								{message.username}
							</button>
						)}
						<span className="text-xs text-muted">{formatTime(message.timestamp)}</span>
					</div>
				)}

				<div
					className={cn(
						'w-fit whitespace-pre-wrap break-words rounded-[var(--radius-ui)] px-3 py-2 text-sm leading-relaxed',
						isAi
							? 'border border-accent/40 bg-accent/10 text-text'
							: isOwn
								? 'bg-brand text-brand-fg'
								: 'bg-surface-2 text-text',
						message.status === 'sending' && 'opacity-60'
					)}
				>
					{renderContent(message.content)}
				</div>

				{failed && (
					<button
						type="button"
						onClick={() => onRetry?.(message)}
						className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-loss hover:underline"
					>
						<AlertCircle size={12} aria-hidden="true" />
						{t('message_not_sent')}
						<RotateCw size={12} aria-hidden="true" />
						{t('retry')}
					</button>
				)}

				{isAi && message.aiMeta?.model && (
					<span className="mt-1 inline-flex items-center gap-1 text-[0.65rem] text-muted">
						<MessageSquare size={10} aria-hidden="true" />
						{message.aiMeta.model}
					</span>
				)}
			</div>
		</div>
	);
}
