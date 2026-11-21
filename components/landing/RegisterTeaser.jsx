'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import Verdict from '@/components/trust/Verdict';
import { useSelectionText } from '@/components/trust/useSelectionText';
import { cn } from '@/lib/utils';
import { clvTone, formatDateTime, formatOdds, formatShare, formatSignedPct, leadMessage } from '@/lib/trust/format';

/**
 * Żywy fragment rejestru typów na stronie głównej — wysepka kliencka (`/api/stats/register?teaser=1`).
 *
 * CO POKAZUJEMY: CLV i udział typów, przy których rynek poszedł za nami, trafienia i liczbę typów
 * w rejestrze — plus pięć OSTATNICH rozliczonych typów po kolei, bez wybierania. Jeśli ostatnie
 * pięć to trzy chybienia, strona główna pokazuje trzy chybienia.
 *
 * CZEGO NIE: zwrotu ani niczego, co czyta się jak „ile zarobisz". Strona główna to reklama
 * serwisu w rozumieniu przepisów o hazardzie, a model nie bije rynku. Zwrot jest w rejestrze,
 * obok podatku i przedziałów — tam, gdzie da się go przeczytać w kontekście.
 *
 * Bez JavaScriptu i dla robota zostaje tekst sekcji i odnośnik (`fallback` w treści landingu).
 */
function Tile({ label, value, hint, tone = 'text-text' }) {
	return (
		<div className="flex flex-col gap-0.5 rounded-[var(--radius-ui)] border border-border bg-surface px-4 py-3">
			<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
			<span className={cn('font-display text-3xl font-bold tabular-nums', tone)}>{value}</span>
			{hint && <span className="text-xs leading-snug text-muted">{hint}</span>}
		</div>
	);
}

export default function RegisterTeaser({ fallback }) {
	const t = useTranslations('trust');
	const locale = useLocale();
	const selectionText = useSelectionText();
	const [data, setData] = useState(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/stats/register?teaser=1')
			.then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
			.then((json) => {
				if (!cancelled) setData(json);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (failed) return <p className="mt-5 text-sm leading-relaxed text-muted">{fallback}</p>;
	if (!data) {
		return (
			<div className="mt-6 flex flex-col gap-3" aria-label={t('landing_loading')}>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-24 w-full" />
					))}
				</div>
				<Skeleton className="h-48 w-full" />
			</div>
		);
	}

	const s = data.all;
	return (
		<div className="mt-6 flex flex-col gap-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
				<Tile
					label={t('landing_clv_label')}
					value={s.clv.n ? formatSignedPct(s.clv.mean, locale, 2) : '—'}
					tone={clvTone(s.clv.mean)}
					hint={s.clv.n ? t('landing_clv_hint', { n: s.clv.n, beat: formatShare(s.clv.beat, locale) }) : null}
				/>
				<Tile
					label={t('landing_hits_label')}
					value={s.settled ? formatShare(s.hitRate, locale) : '—'}
					hint={s.settled ? t('landing_hits_hint', { won: s.won, settled: s.settled }) : null}
				/>
				<Tile label={t('landing_count_label')} value={s.total} hint={t('landing_count_hint')} />
			</div>

			<Verdict clv={s.clv} />

			{data.recent?.length > 0 && (
				<Card>
					<CardContent className="px-4 py-3 sm:px-5">
						<h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{t('landing_recent')}</h3>
						<ul className="mt-1 flex flex-col divide-y divide-border">
							{data.recent.map((row) => {
								const lead = leadMessage(row.leadMinutes);
								return (
									<li key={row.id} className="flex items-center gap-3 py-2.5">
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-semibold text-text">
												{row.homeName}{' '}
												<span className="tabular-nums">
													{row.score ? `${row.score.home}–${row.score.away}` : '–'}
												</span>{' '}
												{row.awayName}
											</p>
											<p className="truncate text-xs text-muted">
												{selectionText(row)}
												{row.refOdds && row.closeOdds ? (
													<>
														{' · '}
														{t('landing_market_move', {
															from: formatOdds(row.refOdds, locale),
															to: formatOdds(row.closeOdds, locale),
														})}{' '}
														<span className={cn('font-semibold', clvTone(row.clv))}>
															{formatSignedPct(row.clv, locale)}
														</span>
													</>
												) : null}
											</p>
											<p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
												<Clock size={11} aria-hidden="true" className="shrink-0" />
												{formatDateTime(row.publishedAt, locale)}
												{lead ? ` · ${t('lead', { lead: t(lead.key, lead.values) })}` : ''}
											</p>
										</div>
										<Badge variant={row.status === 'won' ? 'win' : 'loss'} className="shrink-0">
											{row.status === 'won' ? t('status_won') : t('status_lost')}
										</Badge>
									</li>
								);
							})}
						</ul>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
