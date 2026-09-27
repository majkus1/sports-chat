import { ArrowRight, Lock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Druga karta obok typu dnia na stronie głównej — najmocniejszy INNY typ modelu na ten dzień,
 * za kłódką.
 *
 * Mecz, godzina i liga są odkryte, typ i procent nie: widać, że model ma więcej, niż daje za
 * darmo, i dokładnie przy którym meczu. W planie z liczbami (Pro, VIP, okres próbny) ten sam
 * typ jest odkryty — wtedy zamiast tej karty stoi zwykła `DailyPickCard`.
 *
 * Zamazane kropki to atrapa, nie ukryty typ: przy kłódce trasa w ogóle nie wysyła selekcji,
 * więc nie da się jej odczytać z kodu strony.
 */
export default function LockedPickCard({ pick, c, locale, guest = false, className }) {
	const godzina = new Date(pick.kickoff).toLocaleTimeString(locale === 'en' ? 'en-GB' : 'pl-PL', {
		timeZone: 'Europe/Warsaw',
		hour: '2-digit',
		minute: '2-digit',
	});

	return (
		<article
			className={cn(
				'flex flex-col overflow-hidden rounded-[var(--radius-ui)] border border-border bg-surface shadow-[var(--shadow-soft)]',
				className
			)}
		>
			<div className="px-5 pb-4 pt-4 sm:px-6">
				<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
					<Lock size={12} aria-hidden="true" />
					{c.lockedLabel}
				</p>
				<h2 className="mt-2 font-display text-2xl font-bold leading-tight text-text sm:text-3xl">
					{pick.home} – {pick.away}
				</h2>
				<p className="mt-1 text-sm text-muted">
					{godzina}
					{pick.league ? ` · ${pick.league}` : ''}
				</p>

				<div className="mt-4 flex flex-wrap items-center gap-2" aria-hidden="true">
					<span className="select-none rounded-[var(--radius-ui)] border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-base font-bold tracking-widest text-muted blur-[3px]">
						●●●●●●●●
					</span>
					<span className="select-none text-2xl font-bold text-muted blur-[3px]">●●%</span>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-muted">{c.lockedNote}</p>
			</div>

			<div className="mt-auto px-5 pb-5 sm:px-6">
				<Link
					href="/cennik"
					className="inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
				>
					<Lock size={14} aria-hidden="true" />
					{c.unlock}
					<ArrowRight size={15} aria-hidden="true" />
				</Link>
				{guest && <p className="mt-2 text-xs leading-relaxed text-muted">{c.trialNote}</p>}
			</div>
		</article>
	);
}
