import { ArrowRight, Check, Clock, Radio, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Karta typu dnia — bez stanu, renderowana na serwerze (strona „Typy na dziś") i u klienta
 * (strona główna). Wszystko, co mówi „dlaczego", to liczby modelu zapisane przy wyborze.
 *
 * @param {{ pick: object, c: object, label: string, locale: string, compact?: boolean, className?: string }} props
 *   `pick` z `toDto`, `c` treść z `todayPicksContent`
 */
export default function DailyPickCard({ pick, c, label, locale, compact = false, className }) {
	if (!pick) return null;
	const godzina = new Date(pick.kickoff).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		hour: '2-digit',
		minute: '2-digit',
	});
	const trwa = pick.status === 'pending' && new Date(pick.kickoff).getTime() <= Date.now();
	const stan = trwa ? 'live' : pick.status;
	const ikona = { won: Check, lost: X, live: Radio, pending: Clock, void: X }[stan] || Clock;
	const Ikona = ikona;
	const e = pick.explanation || {};

	return (
		<article className={cn('flex flex-col overflow-hidden rounded-[var(--radius-ui)] border border-accent/60 bg-surface shadow-[var(--shadow-soft)]', className)}>
			<div className="bg-gradient-to-b from-accent-soft/60 to-transparent px-5 pb-4 pt-4 sm:px-6">
				<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
					<Sparkles size={13} aria-hidden="true" />
					{label}
				</p>
				<h2 className="mt-2 font-display text-2xl font-bold leading-tight text-text sm:text-3xl">
					{pick.home} – {pick.away}
				</h2>
				<p className="mt-1 text-sm text-muted">
					{godzina}
					{pick.league ? ` · ${pick.league}` : ''}
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<span className="rounded-[var(--radius-ui)] bg-accent px-3 py-2 text-base font-bold text-accent-fg">
						{pick.selection}
					</span>
					<span className="text-2xl font-bold tabular-nums text-text">{pick.probability}%</span>
					<span className="text-sm text-muted">
						({c.usually} {pick.base}%)
					</span>
					<span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-bold tabular-nums text-accent">+{pick.lift}</span>
				</div>

				<p
					className={cn(
						'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
						stan === 'won' && 'bg-accent-soft text-accent',
						stan === 'lost' && 'bg-surface-2 text-loss',
						(stan === 'pending' || stan === 'live' || stan === 'void') && 'bg-surface-2 text-muted'
					)}
				>
					<Ikona size={13} aria-hidden="true" />
					{c.status[stan]}
					{pick.score ? ` · ${pick.score}` : ''}
				</p>
			</div>

			{!compact && (
				<div className="px-5 pb-5 sm:px-6">
					<h3 className="text-[11px] font-bold uppercase tracking-wide text-muted">{c.why}</h3>
					<ul className="mt-2 flex flex-col gap-1.5 text-sm leading-relaxed text-text">
						{Number.isFinite(e.home) && <li>{c.chances(e.home, e.draw, e.away)}</li>}
						{Number.isFinite(e.lambdaHome) && (
							<li>{c.goals(String(e.lambdaHome).replace('.', locale === 'en' ? '.' : ','), String(e.lambdaAway).replace('.', locale === 'en' ? '.' : ','))}</li>
						)}
						{Number.isFinite(e.over25) && <li>{c.over25(e.over25)}</li>}
						<li className="font-semibold">{c.edge(pick.base, pick.lift)}</li>
					</ul>
				</div>
			)}

			<div className={cn('mt-auto px-5 pb-5 sm:px-6', compact && 'pt-1')}>
				<Link
					href={`/mecz/${pick.fixtureId}`}
					className="inline-flex items-center gap-1.5 text-sm font-bold text-accent no-underline hover:underline"
				>
					{c.openMatch}
					<ArrowRight size={15} aria-hidden="true" />
				</Link>
			</div>
		</article>
	);
}
