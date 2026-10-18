import { Check, Clock, Minus, Radio, ShieldCheck, Ticket, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Karta kuponu (dnia, 3- albo 5-dniowego) — bez stanu, renderowana na serwerze („Typy na dziś")
 * i u klienta (strona główna, skuteczność). Kurs łączny i szansa modelu stoją obok siebie
 * tej samej wielkości co do wagi: kurs bez szansy sugerowałby pewniaka.
 *
 * @param {{ coupon: object, c: object, label: string, locale: string, compact?: boolean, className?: string }} props
 *   `coupon` z `couponDto`, `c` treść z `couponContent`
 */

/** Stan kuponu do wyświetlenia: „w grze" od pierwszego gwizdka, dopóki rozliczenie trwa. */
export function couponState(coupon, now = Date.now()) {
	if (coupon.status !== 'pending') return coupon.status;
	return coupon.legs.some((l) => Date.parse(l.kickoff) <= now) ? 'live' : 'pending';
}

const legState = (l, now) => (l.status === 'pending' && Date.parse(l.kickoff) <= now ? 'live' : l.status);

const IKONY = {
	won: { Ikona: Check, ton: 'bg-accent text-accent-fg' },
	lost: { Ikona: X, ton: 'bg-loss/15 text-loss' },
	void: { Ikona: Minus, ton: 'bg-surface-3 text-muted' },
	live: { Ikona: Radio, ton: 'bg-surface-3 text-text' },
	pending: { Ikona: Clock, ton: 'bg-surface-2 text-muted' },
};

export default function CouponCard({ coupon, c, label, locale, compact = false, className }) {
	if (!coupon?.legs?.length) return null;
	const teraz = Date.now();
	const stan = couponState(coupon, teraz);
	const loc = locale === 'en' ? 'en-GB' : 'pl-PL';
	// Kupony z kilku dni pokazują przy godzinie dzień tygodnia.
	const kilkaDni = coupon.type !== 'daily';
	const godzina = (iso) =>
		new Date(iso).toLocaleTimeString(loc, { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
	const dzien = (iso) => new Date(iso).toLocaleDateString(loc, { timeZone: 'Europe/Warsaw', weekday: 'short' }).replace('.', '');
	const { Ikona: IkonaStanu } = IKONY[stan] || IKONY.pending;

	return (
		<article
			className={cn(
				'flex flex-col overflow-hidden rounded-[var(--radius-ui)] border bg-surface shadow-[var(--shadow-soft)]',
				stan === 'won' ? 'border-accent' : 'border-accent/60',
				className
			)}
		>
			<div className="bg-gradient-to-b from-accent-soft/60 to-transparent px-5 pb-4 pt-4 sm:px-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
						<Ticket size={13} aria-hidden="true" />
						{label}
					</p>
					<p
						className={cn(
							'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
							stan === 'won' && 'bg-accent text-accent-fg',
							stan === 'lost' && 'bg-surface-2 text-loss',
							!['won', 'lost'].includes(stan) && 'bg-surface-2 text-muted'
						)}
					>
						<IkonaStanu size={13} aria-hidden="true" />
						{stan === 'won' && coupon.settledOdds ? c.wonWith(coupon.settledOdds) : c.status[stan]}
					</p>
				</div>

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
					<p className="pb-0.5 text-sm text-muted">{c.legs(coupon.legs.length)}</p>
				</div>

				{/* Płatne kupony: AI sprawdziło wiadomości przed publikacją — i co odsiało (`lib/coupons/news.js`). */}
				{coupon.newsCheck && (
					<div className="mt-3 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
						<p className="flex items-start gap-1.5 font-semibold text-text">
							<ShieldCheck size={14} aria-hidden="true" className="mt-px shrink-0 text-accent" />
							{c.newsChecked}
						</p>
						{!compact && coupon.newsCheck.dropped?.length > 0 && (
							<ul className="mt-1 flex flex-col gap-0.5 pl-5">
								{coupon.newsCheck.dropped.map((d) => (
									<li key={d.match}>
										{c.newsDropped} <span className="font-semibold text-text">{d.match}</span> ({d.selection})
										{d.reason ? ` — ${d.reason}` : ''}
									</li>
								))}
							</ul>
						)}
					</div>
				)}
			</div>

			<ul className="divide-y divide-border border-t border-border">
				{coupon.legs.map((l) => {
					const s = legState(l, teraz);
					const { Ikona, ton } = IKONY[s] || IKONY.pending;
					const mecz = `${l.home} – ${l.away}`;
					return (
						<li key={l.fixtureId} className="flex items-center gap-3 px-5 py-2.5 sm:px-6">
							<span className="w-11 shrink-0 text-center leading-tight">
								{kilkaDni && <span className="block text-[10px] font-semibold uppercase text-muted">{dzien(l.kickoff)}</span>}
								<span className="block text-xs font-bold tabular-nums text-text">{godzina(l.kickoff)}</span>
							</span>
							<span className="min-w-0 flex-1">
								{/* Nazwy drużyn łamią się do dwóch linii zamiast ucinać — na telefonie „Bayern – Ma…" nic nie mówi. */}
								<span className="block text-sm font-bold leading-snug text-text [overflow-wrap:anywhere]">
									{l.href ? (
										<Link href={l.href} className="text-text no-underline hover:underline">
											{mecz}
										</Link>
									) : (
										mecz
									)}
									{l.score && <span className="ml-1.5 whitespace-nowrap font-semibold tabular-nums text-muted">{l.score}</span>}
								</span>
								<span className="block truncate text-xs text-muted">
									<span className="font-semibold text-accent">{l.selection}</span> · {l.probability}%
									{!compact && l.league ? ` · ${l.league}` : ''}
								</span>
							</span>
							<span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-sm font-bold tabular-nums text-text">
								{c.odds(l.odds)}
							</span>
							<span
								className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full', ton)}
								title={c.legStatus[s]}
							>
								<Ikona size={13} aria-hidden="true" />
								<span className="sr-only">{c.legStatus[s]}</span>
							</span>
						</li>
					);
				})}
			</ul>

			{!compact && (
				<p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted sm:px-6">
					{c.honest(coupon.chance)} {c.disclaimer}
				</p>
			)}
		</article>
	);
}
