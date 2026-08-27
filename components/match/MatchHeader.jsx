'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/Badge';
import TeamCrest from '@/components/football/TeamCrest';
import { statusLabel } from '@/lib/football/matchStatus';
import { cn } from '@/lib/utils';

function TeamSide({ team, align }) {
	return (
		<div className={cn('flex min-w-0 flex-1 items-center gap-2', align === 'right' && 'flex-row-reverse')}>
			<TeamCrest name={team.name} />
			<span className={cn('truncate text-base font-bold text-text', align === 'right' && 'text-right')}>
				{team.name}
			</span>
		</div>
	);
}

/**
 * Nagłówek pokoju meczowego: drużyny, wynik i status.
 *
 * Wynik pokazujemy tylko dla meczów rozpoczętych — przed pierwszym gwizdkiem
 * w tym miejscu jest godzina rozpoczęcia.
 */
export default function MatchHeader({ fixture, action = null, className }) {
	const t = useTranslations('common');
	const { teams, goals, status, league } = fixture;
	const started = status.isLive || status.isFinished;

	return (
		<header
			className={cn(
				'rounded-[var(--radius-ui)] border border-border bg-surface px-4 py-3',
				className
			)}
		>
			<div className="flex flex-wrap items-center gap-2 text-xs text-muted">
				<span className="truncate">
					{league?.name}
					{league?.country ? ` · ${league.country}` : ''}
				</span>
				{/* Slot na akcję (np. gwiazdka ulubionych) — dosunięty do prawej. */}
				{action && <span className="ml-auto">{action}</span>}
				{status.isLive && (
					<Badge variant="live" dot>
						{t('live_now')}
						{status.elapsed ? ` ${status.elapsed}'` : ''}
					</Badge>
				)}
				{(status.isPostponed || status.isCancelled || status.isInterrupted) && (
					<Badge variant="draw">{statusLabel(status, t)}</Badge>
				)}
			</div>

			<div className="mt-2 flex items-center gap-3">
				<TeamSide team={teams.home} align="left" />

				<div className="shrink-0 text-center">
					{started ? (
						<div className="font-display text-2xl font-bold tabular-nums text-text">
							{goals.home ?? 0}
							<span className="mx-1 text-muted">:</span>
							{goals.away ?? 0}
						</div>
					) : (
						<div className="text-sm font-semibold text-muted">
							{new Date(fixture.date).toLocaleTimeString([], {
								hour: '2-digit',
								minute: '2-digit',
							})}
						</div>
					)}
					{status.isFinished && (
						<div className="text-[0.65rem] uppercase tracking-wide text-muted">
							{statusLabel(status, t)}
						</div>
					)}
				</div>

				<TeamSide team={teams.away} align="right" />
			</div>
		</header>
	);
}
