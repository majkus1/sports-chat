import { Check, Clock, Minus, Radio, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Skuteczność typów z wyższym kursem (zakładka „Wyższy kurs").
 *
 * Kolor procentu zależy od tego, co dawał RYNEK, nie od 50%: typ po kursie 2,1 trafiający
 * w 47% robi dokładnie to, co obiecano. Obok zawsze procent modelu — żeby było widać, o ile
 * przy tych kursach się mylił.
 *
 * @param {{ stats: object, c: object, locale: string }} props `stats` z `valueStats`, `c` z `valueContent`
 */

const IKONY = {
	won: { Ikona: Check, ton: 'bg-accent text-accent-fg' },
	lost: { Ikona: X, ton: 'bg-loss/15 text-loss' },
	void: { Ikona: Minus, ton: 'bg-surface-3 text-muted' },
	live: { Ikona: Radio, ton: 'bg-surface-3 text-text' },
	pending: { Ikona: Clock, ton: 'bg-surface-2 text-muted' },
};

export default function ValueStats({ stats, c, locale }) {
	const s = stats?.summary;
	if (!s) return null;
	const znane = s.settled > 0;
	const ton = !znane ? 'text-muted' : s.hitRate >= s.avgMarket ? 'text-win' : s.hitRate >= s.avgMarket - 8 ? 'text-text' : 'text-loss';
	const teraz = Date.now();
	const loc = locale === 'en' ? 'en-GB' : 'pl-PL';
	const kiedy = (iso) =>
		new Date(iso).toLocaleString(loc, { timeZone: 'Europe/Warsaw', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

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
								{c.statsPromised(s.avgMarket, s.avgModel, s.avgOdds)}
								{s.settled < 30 && ` · ${c.statsSmall}`}
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
							{c.counts.won}: <strong className="tabular-nums">{s.won}</strong>
						</span>
						<span className="inline-flex items-center gap-1.5 text-loss">
							<X size={13} aria-hidden="true" />
							{c.counts.lost}: <strong className="tabular-nums">{s.lost}</strong>
						</span>
						<span className="inline-flex items-center gap-1.5 text-muted">
							<Clock size={13} aria-hidden="true" />
							{c.counts.pending}: <strong className="tabular-nums">{s.pending}</strong>
						</span>
					</div>
				</CardContent>
			</Card>

			<p className="text-xs leading-relaxed text-muted">{c.statsHint}</p>

			{stats.recent?.length > 0 && (
				<Card>
					<CardContent className="px-5 py-4">
						<h3 className="mb-2 text-sm font-bold text-text">{c.statsRecent}</h3>
						<ul className="flex flex-col divide-y divide-border">
							{stats.recent.map((p) => {
								const stan = p.status === 'pending' && Date.parse(p.kickoff) <= teraz ? 'live' : p.status;
								const { Ikona, ton: tonIkony } = IKONY[stan] || IKONY.pending;
								return (
									<li key={`${p.fixtureId}-${p.key}`} className="flex items-center gap-3 py-2.5">
										<span className="min-w-0 flex-1">
											<span className="block text-sm font-bold leading-snug text-text [overflow-wrap:anywhere]">
												<Link href={`/mecz/${p.fixtureId}`} className="text-text no-underline hover:underline">
													{p.home} – {p.away}
												</Link>
												{p.score && <span className="ml-1.5 whitespace-nowrap font-semibold tabular-nums text-muted">{p.score}</span>}
											</span>
											<span className="block truncate text-xs text-muted">
												<span className="font-semibold text-accent">{p.selection}</span> · {c.chances(p.market, p.model)} · {kiedy(p.kickoff)}
											</span>
										</span>
										<span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-sm font-bold tabular-nums text-text">
											{c.odds(p.odds)}
										</span>
										<span className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full', tonIkony)} title={c.legStatus[stan]}>
											<Ikona size={13} aria-hidden="true" />
											<span className="sr-only">{c.legStatus[stan]}</span>
										</span>
									</li>
								);
							})}
						</ul>
					</CardContent>
				</Card>
			)}

			<p className="text-xs leading-relaxed text-muted">{c.warning}</p>
		</div>
	);
}
