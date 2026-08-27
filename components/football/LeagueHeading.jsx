'use client';

import { useTranslations } from 'next-intl';
import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Nagłówek grupy meczów jednej ligi wraz z przyciskiem tabeli.
 * Wspólny dla listy przedmeczowej i live — wcześniej był skopiowany w obu.
 */
export default function LeagueHeading({ name, leagueId, onStandings }) {
	const t = useTranslations('common');

	return (
		<div className="mt-6 mb-1 flex items-center gap-2">
			<h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-muted">{name}</h2>
			{leagueId && (
				<button
					type="button"
					title={t('widget_standings_title')}
					aria-label={`${name}: ${t('widget_standings_title')}`}
					onClick={onStandings}
					className={cn(
						'inline-flex h-6 w-6 items-center justify-center rounded-md',
						'border-0 bg-surface-2 text-muted transition-colors',
						'hover:bg-accent hover:text-accent-fg',
						'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
					)}
				>
					<Table2 size={13} aria-hidden="true" />
				</button>
			)}
		</div>
	);
}
