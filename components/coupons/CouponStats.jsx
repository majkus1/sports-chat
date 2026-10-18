import { Check, Clock, Minus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import CouponCard from '@/components/coupons/CouponCard';
import { cn } from '@/lib/utils';

/**
 * Skuteczność kuponów (zakładki „Kupon dnia", „Kupon 3-dniowy" i „Kupon 5-dniowy" w skuteczności).
 *
 * Najważniejsze zestawienie: ile kuponów weszło wobec tego, ile zapowiadał model. Kupon ~2,0
 * z szansą 45% wchodzi mniej niż co drugi dzień — i to jest w porządku, jeśli wchodzi tyle,
 * ile obiecano. Dlatego kolor procentu zależy od obietnicy, nie od tego, czy przekracza 50%.
 *
 * @param {{ stats: object, c: object, locale: string, type: 'daily'|'weekend' }} props
 *   `stats` z `couponStats`, `c` z `couponContent`
 */
export default function CouponStats({ stats, c, locale, type }) {
	const s = stats?.summary;
	if (!s) return null;
	const znane = s.settled > 0;
	const ton = !znane
		? 'text-muted'
		: s.hitRate >= s.avgChance
			? 'text-win'
			: s.hitRate >= s.avgChance - 10
				? 'text-text'
				: 'text-loss';
	const data = (iso) =>
		new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL', { day: '2-digit', month: '2-digit' });

	return (
		<div className="flex flex-col gap-4">
			<Card>
				<CardContent className="flex flex-col gap-4 px-5 py-5">
					<div className="flex flex-col gap-1">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className={cn('font-display text-5xl font-bold tabular-nums', ton)}>{znane ? `${s.hitRate}%` : '—'}</span>
							<span className="text-sm text-muted">{znane ? c.statsEntered(s.won, s.settled) : c.statsEmpty}</span>
						</div>
						{znane && (
							<p className="text-xs text-muted">
								{c.statsPromised(s.avgChance, s.avgOdds)}
								{s.settled < 20 && ` · ${c.statsSmall}`}
							</p>
						)}
					</div>

					{znane && (
						<div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
							<div className="bg-win" style={{ width: `${(100 * s.won) / s.settled}%` }} />
							<div className="bg-loss" style={{ width: `${(100 * s.lost) / s.settled}%` }} />
						</div>
					)}

					<div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
						<span className="inline-flex items-center gap-1.5 text-win">
							<Check size={13} aria-hidden="true" />
							{c.statsCounts.won}: <strong className="tabular-nums">{s.won}</strong>
						</span>
						<span className="inline-flex items-center gap-1.5 text-loss">
							<X size={13} aria-hidden="true" />
							{c.statsCounts.lost}: <strong className="tabular-nums">{s.lost}</strong>
						</span>
						<span className="inline-flex items-center gap-1.5 text-muted">
							<Clock size={13} aria-hidden="true" />
							{c.statsCounts.pending}: <strong className="tabular-nums">{s.pending}</strong>
						</span>
						<span className="inline-flex items-center gap-1.5 text-muted">
							<Minus size={13} aria-hidden="true" />
							{c.statsCounts.none}: <strong className="tabular-nums">{s.none}</strong>
						</span>
					</div>
				</CardContent>
			</Card>

			<p className="text-xs leading-relaxed text-muted">{c.statsHint}</p>

			{stats.recent?.length > 0 && (
				<section className="flex flex-col gap-3">
					<h3 className="text-sm font-bold text-text">{c.statsRecent}</h3>
					{stats.recent.map((k) => (
						<CouponCard key={k.key} coupon={k} c={c} label={`${c.tab[type]} · ${data(k.date)}`} locale={locale} compact />
					))}
				</section>
			)}

			<p className="text-xs leading-relaxed text-muted">{c.how}</p>
			<p className="text-xs leading-relaxed text-muted">{c.disclaimer}</p>
		</div>
	);
}
