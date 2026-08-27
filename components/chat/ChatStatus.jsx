'use client';

import { useTranslations } from 'next-intl';
import { Users, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Pasek nad listą: ilu jest w pokoju i czy połączenie działa. */
export function PresenceBar({ total, isConnected, className }) {
	const t = useTranslations('common');

	return (
		<div
			className={cn(
				'flex items-center gap-3 border-b border-border px-3 py-2 text-xs text-muted',
				className
			)}
		>
			<span className="inline-flex items-center gap-1.5">
				<Users size={14} aria-hidden="true" />
				{t('online_count', { count: total ?? 0 })}
			</span>
			<span className="ml-auto inline-flex items-center gap-1.5">
				<span
					aria-hidden="true"
					className={cn(
						'h-2 w-2 rounded-full',
						isConnected ? 'bg-win' : 'bg-loss motion-safe:animate-pulse'
					)}
				/>
				{isConnected ? t('connected') : t('reconnecting')}
			</span>
		</div>
	);
}

/** Baner błędu połączenia — pokazywany tylko wtedy, gdy jest co pokazać. */
export function ConnectionBanner({ error, className }) {
	if (!error) return null;
	return (
		<div
			role="status"
			className={cn(
				'flex items-start gap-2 border-b border-border bg-[var(--danger-soft)] px-3 py-2 text-sm text-loss',
				className
			)}
		>
			<WifiOff size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
			<span>{error}</span>
		</div>
	);
}

/**
 * „X pisze…". Lista jest ograniczona do trzech nicków — przy większym ruchu
 * wyliczanie wszystkich i tak przestaje cokolwiek wnosić.
 */
export function TypingIndicator({ usernames, className }) {
	const t = useTranslations('common');
	if (!usernames?.length) return null;

	const shown = usernames.slice(0, 3).join(', ');
	const label =
		usernames.length > 3 ? t('typing_many', { names: shown }) : t('typing', { names: shown });

	return (
		<div className={cn('flex items-center gap-2 px-3 pb-1 text-xs text-muted', className)}>
			<span className="flex gap-0.5" aria-hidden="true">
				{[0, 150, 300].map((delay) => (
					<span
						key={delay}
						className="h-1.5 w-1.5 rounded-full bg-muted motion-safe:animate-bounce"
						style={{ animationDelay: `${delay}ms` }}
					/>
				))}
			</span>
			{label}
		</div>
	);
}
