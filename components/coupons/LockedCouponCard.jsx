import { ArrowRight, Lock, Ticket } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Płatny kupon (3- albo 5-dniowy) przed rozliczeniem, oglądany bez planu z liczbami.
 *
 * Kurs łączny, szansa, liczba typów i zakres dni są odkryte — widać, co się dostaje. Mecze nie:
 * trasa w ogóle ich nie wysyła (`couponDto({ unlocked: false })`), a wiersze niżej to atrapa.
 *
 * @param {{ coupon: object, c: object, label: string, locale: string, guest?: boolean, className?: string }} props
 */
export default function LockedCouponCard({ coupon, c, label, locale, guest = false, className }) {
	if (!coupon?.locked) return null;
	const dzien = (iso) =>
		new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL', {
			timeZone: 'Europe/Warsaw',
			weekday: 'short',
			day: 'numeric',
			month: 'numeric',
		});
	const atrapy = Math.min(4, coupon.legsCount || 3);

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
					{label}
				</p>
				<div className="mt-3 flex flex-wrap items-end gap-x-7 gap-y-2">
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.totalOdds}</p>
						<p className="mt-1 font-display text-4xl font-bold leading-none tabular-nums text-text sm:text-5xl">
							{c.odds(coupon.totalOdds)}
						</p>
					</div>
					<div>
						<p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{c.chance}</p>
						<p className="mt-1 font-display text-3xl font-bold leading-none tabular-nums text-accent sm:text-4xl">
							{coupon.chance}%
						</p>
					</div>
				</div>
				<p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
					<Ticket size={14} aria-hidden="true" />
					{c.lockedLegs(coupon.legsCount, dzien(coupon.firstKickoff), dzien(coupon.lastKickoff))}
				</p>
			</div>

			<ul className="divide-y divide-border border-y border-border" aria-hidden="true">
				{Array.from({ length: atrapy }, (_, i) => (
					<li key={i} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
						<span className="h-3 w-10 shrink-0 rounded bg-surface-3" />
						<span className="min-w-0 flex-1">
							<span className="block h-3 w-3/4 select-none rounded bg-surface-3 blur-[2px]" />
							<span className="mt-1.5 block h-2.5 w-1/2 select-none rounded bg-surface-2 blur-[2px]" />
						</span>
						<span className="h-6 w-11 shrink-0 rounded-md bg-surface-2" />
					</li>
				))}
			</ul>

			<div className="mt-auto px-5 pb-5 pt-4 sm:px-6">
				<p className="text-sm leading-relaxed text-muted">{c.lockedNote}</p>
				<Link
					href="/cennik"
					className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
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
