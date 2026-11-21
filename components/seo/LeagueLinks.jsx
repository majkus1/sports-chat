import { Link } from '@/i18n/routing';
import { leagueName, leaguePath } from '@/lib/seo/leagues';
import { cn } from '@/lib/utils';

/**
 * Linki do stron „typy na dziś [liga]" — tylko lig, które dziś albo jutro grają (`activeLeaguePages`).
 *
 * Linkowanie wewnętrzne to dla robota mapa ważności: strona ligi bez żadnego linku z serwisu
 * istnieje tylko w mapie witryny i trafia do indeksu późno albo wcale. Linki prowadzą wyłącznie do
 * stron z treścią — link do pustej strony ligi (z `noindex`) marnowałby to, co przekazuje.
 *
 * @param {{ items: Array<{ league: object, matches: number }>, locale: string, title: string, currentId?: number }} props
 */
export default function LeagueLinks({ items, locale, title, currentId = null, className }) {
	const lista = (items || []).filter((x) => x.league.id !== currentId);
	if (!lista.length) return null;
	return (
		<nav aria-label={title} className={cn('mt-8', className)}>
			<h2 className="text-[11px] font-bold uppercase tracking-wide text-muted">{title}</h2>
			<ul className="mt-3 flex flex-wrap gap-2">
				{lista.map(({ league, matches }) => (
					<li key={league.id}>
						<Link
							href={leaguePath(league)}
							className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm font-semibold text-text no-underline transition-colors hover:border-accent hover:bg-accent-soft"
						>
							{leagueName(league, locale)}
							<span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-bold tabular-nums text-muted">{matches}</span>
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
