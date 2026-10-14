'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { matchPath } from '@/lib/seo/matchPreview';
import { cn } from '@/lib/utils';

/**
 * Skuteczność WSZYSTKICH plakietek modelu z listy meczów — nie tylko tych, do których ktoś
 * zrobił analizę. Osobna sekcja obok głównej statystyki: tamta liczba się nie zmienia,
 * a ta pokazuje pełny obraz tego, co użytkownik widzi jako „typy modelu". Dane: `/api/stats/model-hints`.
 */

/** Pasek trafione / chybione — ten sam wygląd co w głównym panelu skuteczności. */
function Pasek({ won, lost }) {
	const n = won + lost;
	if (!n) return null;
	const pct = (won / n) * 100;
	return (
		<div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
			<div className="bg-win" style={{ width: `${pct}%` }} />
			<div className="bg-loss" style={{ width: `${100 - pct}%` }} />
		</div>
	);
}

/**
 * Nazwa i liczby w jednej linii, pasek pod nimi na całą szerokość — długie nazwy rynków
 * („1X (gospodarz lub remis)") mieszczą się na telefonie bez ucinania.
 */
function Wiersz({ label, row, t }) {
	return (
		<div className="py-2">
			<div className="flex items-baseline justify-between gap-3">
				<span className="min-w-0 text-sm text-text">{label}</span>
				<span className="shrink-0 text-right text-xs tabular-nums text-muted">
					{/* Przy garstce typów procent wprowadza w błąd — wtedy sam bilans. */}
					{row.settled >= 10 && <span className="font-bold text-text">{row.hitRate}% · </span>}
					{row.won}/{row.settled}
					{row.settled >= 10 && ` · ${t('hints_acc_promised_short', { promised: row.promised })}`}
				</span>
			</div>
			<div className="mt-1.5">
				<Pasek won={row.won} lost={row.lost} />
			</div>
		</div>
	);
}

export default function ModelHintsAccuracy({ className }) {
	const t = useTranslations('common');
	const locale = useLocale();
	const [data, setData] = useState(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let anulowane = false;
		fetch('/api/stats/model-hints')
			.then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
			.then((d) => {
				if (!anulowane) setData(d);
			})
			.catch(() => {
				if (!anulowane) setError(true);
			});
		return () => {
			anulowane = true;
		};
	}, []);

	if (error) return null;
	if (!data) return <Skeleton className={cn('h-40 w-full', className)} />;
	const { all, recent, byMarket, calibration, last, since } = data;
	if (!all?.settled) return null;

	const odKiedy = since
		? new Date(since).toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long' })
		: null;

	return (
		<div className={cn('flex flex-col gap-4', className)}>
			<Card>
				<CardContent className="flex flex-col gap-2 px-5 py-5">
					<p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-accent">
						<Sparkles size={13} aria-hidden="true" />
						{t('hints_acc_badge')}
					</p>
					<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<span className="font-display text-4xl font-bold tabular-nums text-text">{all.hitRate}%</span>
						<span className="text-sm text-muted">{t('hints_acc_hits', { won: all.won, settled: all.settled })}</span>
					</div>
					{all.interval && <p className="text-xs text-muted">{t('accuracy_interval', { low: all.interval.low, high: all.interval.high })}</p>}
					<p className="text-sm text-text">
						{t('hints_acc_vs', { promised: all.promised, base: all.base, edge: `${all.edge > 0 ? '+' : ''}${all.edge}` })}
					</p>
					{/* „Ostatnio" tylko, gdy to coś innego niż całość — na starcie dziennika obie liczby są te same. */}
					{recent?.settled > 0 && recent.settled < all.settled && (
						<p className="text-xs text-muted">
							{t('hints_acc_recent', { days: recent.days, rate: recent.hitRate, won: recent.won, settled: recent.settled, promised: recent.promised })}
						</p>
					)}
					{odKiedy && <p className="text-xs text-muted">{t('hints_acc_since', { date: odKiedy })}</p>}
				</CardContent>
			</Card>

			{byMarket?.length > 0 && (
				<Card>
					<CardContent className="flex flex-col gap-1 px-5 py-4">
						<h3 className="mb-1 text-sm font-bold text-text">{t('hints_acc_by_market')}</h3>
						{byMarket.map((row) => (
							<Wiersz key={row.key} label={t(`hints_key_${row.key}`)} row={row} t={t} />
						))}
					</CardContent>
				</Card>
			)}

			{calibration?.length > 0 && (
				<Card>
					<CardContent className="flex flex-col gap-1 px-5 py-4">
						<h3 className="text-sm font-bold text-text">{t('hints_acc_calibration')}</h3>
						<p className="mb-1 text-xs leading-relaxed text-muted">{t('hints_acc_calibration_hint')}</p>
						{calibration.map((row) => (
							<Wiersz key={row.bucket} label={t('hints_acc_bucket', { bucket: row.bucket })} row={row} t={t} />
						))}
					</CardContent>
				</Card>
			)}

			{last?.length > 0 && (
				<Card>
					<CardContent className="px-0 py-2">
						<h3 className="px-5 pb-1 pt-2 text-sm font-bold text-text">{t('hints_acc_last')}</h3>
						<ul className="divide-y divide-border">
							{last.map((m) => (
								<li key={m.fixtureId}>
									<Link
										href={matchPath(m)}
										className="flex items-center gap-3 px-5 py-2.5 no-underline transition-colors hover:bg-surface-2"
									>
										<span
											className={cn(
												'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
												m.won ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-loss'
											)}
											aria-label={m.won ? t('hints_acc_won') : t('hints_acc_lost')}
										>
											{m.won ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
										</span>
										<span className="min-w-0 flex-1">
											<span className="block truncate text-sm font-semibold text-text">
												{m.homeName} – {m.awayName} <span className="font-normal tabular-nums text-muted">{m.score}</span>
											</span>
											<span className="block truncate text-xs text-muted">
												{m.selection} · {m.probability}%
											</span>
										</span>
									</Link>
								</li>
							))}
						</ul>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
