'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Trophy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { initialsFromName } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

/**
 * Ranking typerów, z AI jako punktem odniesienia.
 *
 * Sortowanie po skuteczności, nie po liczbie trafień — i z progiem minimalnej liczby
 * rozliczonych typów, żeby jeden szczęśliwy strzał nie stawiał kogoś nad kimś, kto typuje
 * regularnie. Ten próg jest tu wyjaśniony wprost, bo inaczej brak własnej pozycji
 * w rankingu wyglądałby jak błąd.
 */
export default function Leaderboard({ className }) {
	const t = useTranslations('common');
	const [data, setData] = useState(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch('/api/stats/leaderboard?days=all', { credentials: 'include' });
				if (!cancelled) setData(res.ok ? await res.json() : null);
			} catch {
				if (!cancelled) setData(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	if (!data) {
		return (
			<div className={cn('flex flex-col gap-2', className)}>
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</div>
		);
	}

	const medal = (rank) => (rank === 1 ? 'text-draw' : rank === 2 ? 'text-muted' : rank === 3 ? 'text-loss' : 'text-muted');

	return (
		<div className={cn('flex flex-col gap-3', className)}>
			{/* AI jako osobny wiersz odniesienia — to samo źródło danych i ta sama metoda. */}
			{data.ai?.hitRate !== null && data.ai && (
				<Card className="border-accent">
					<CardContent className="flex items-center gap-3 px-4 py-3">
						<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
							<Bot size={17} aria-hidden="true" />
						</span>
						<div className="min-w-0 flex-1">
							<p className="font-bold text-text">{t('leaderboard_ai')}</p>
							<p className="text-xs text-muted">{t('leaderboard_ai_hint')}</p>
						</div>
						<div className="shrink-0 text-right">
							<p className="font-display text-xl font-bold tabular-nums text-accent">
								{data.ai.hitRate}%
							</p>
							<p className="text-xs tabular-nums text-muted">
								{data.ai.won}/{data.ai.settled}
							</p>
						</div>
					</CardContent>
				</Card>
			)}

			{data.entries.length === 0 ? (
				<p className="py-4 text-sm leading-relaxed text-muted">
					{t('leaderboard_empty', { min: data.minSettled })}
				</p>
			) : (
				<div className="flex flex-col gap-2">
					{data.entries.map((e) => (
						<Card key={e.userId} className={e.isMe ? 'border-accent' : undefined}>
							<CardContent className="flex items-center gap-3 px-4 py-3">
								<span
									className={cn(
										'w-6 shrink-0 text-center font-display text-lg font-bold tabular-nums',
										medal(e.rank)
									)}
								>
									{e.rank}
								</span>
								<span className="person-avatar shrink-0" aria-hidden="true">
									{initialsFromName(e.username)}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate font-semibold text-text">
										{e.username}
										{e.isMe && (
											<Badge variant="accent" className="ml-2">
												{t('leaderboard_you')}
											</Badge>
										)}
									</p>
								</div>
								<div className="shrink-0 text-right">
									<p className="font-display text-lg font-bold tabular-nums text-text">{e.hitRate}%</p>
									<p className="text-xs tabular-nums text-muted">
										{e.won}/{e.settled}
									</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}

			<p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
				<Trophy size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
				{t('leaderboard_rules', { min: data.minSettled })}
			</p>
		</div>
	);
}
