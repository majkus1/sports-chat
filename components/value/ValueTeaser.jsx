import { ArrowRight, TrendingUp } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { accuracyHref } from '@/lib/urlState';
import { cn } from '@/lib/utils';

/**
 * Zapowiedź typów z wyższym kursem — wyjście z „Typów na dziś" i ze strony głównej do raportu
 * AI w wariancie „Wyższe kursy" (`?variant=value`).
 *
 * Funkcja siedziała dotąd wyłącznie w przełączniku wariantu na stronie raportu i w asystencie,
 * więc nikt na nią nie trafiał. Tu jest widoczna obok kuponów, a bilans idzie od razu z nią:
 * wyższy kurs to mniejsza szansa i strona ma to mówić, zanim ktoś kliknie.
 *
 * @param {{ c: object, stats?: object, compact?: boolean, className?: string }} props
 *   `c` z `valueContent`, `stats` z `valueStats` (bez nich — sam opis i przyciski)
 */
export const VALUE_REPORT_HREF = '/pilka-nozna/ai-agent?variant=value';

export default function ValueTeaser({ c, stats, compact = false, className }) {
	const s = stats?.summary;
	const bilans = s?.settled > 0 ? c.teaserRecord(s.won, s.settled, s.avgOdds) : null;

	return (
		<div
			className={cn(
				'rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]',
				compact ? 'px-5 py-4' : 'px-5 py-5 sm:px-6',
				className
			)}
		>
			<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
				<TrendingUp size={14} aria-hidden="true" />
				{c.teaserKicker}
			</p>
			<p className={cn('mt-1.5 font-display font-bold leading-tight text-text', compact ? 'text-lg' : 'text-xl')}>{c.teaserTitle}</p>
			<p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{compact ? c.teaserShort : c.teaserLead}</p>
			{bilans && <p className="mt-2 text-sm font-semibold tabular-nums text-text">{bilans}</p>}

			<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
				<Link
					href={VALUE_REPORT_HREF}
					className="inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
				>
					{c.teaserCta}
					<ArrowRight size={15} aria-hidden="true" />
				</Link>
				<Link href={accuracyHref({ kind: 'value', days: 'all' })} className="text-sm font-semibold text-accent no-underline hover:underline">
					{c.teaserRecordLink}
				</Link>
			</div>
			{!compact && (
				<p className="mt-3 text-xs leading-relaxed text-muted">
					{c.teaserAccess} {c.warning}
				</p>
			)}
		</div>
	);
}
