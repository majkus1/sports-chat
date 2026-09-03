'use client';

import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, ChevronRight, Target } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import LiftLabel from '@/components/picks/LiftLabel';
import { cn } from '@/lib/utils';

/**
 * Treść raportu: wstęp, karty typów, podsumowanie.
 *
 * Używane w dwóch miejscach — na hubie podczas generowania (strumień, dane niepełne)
 * i na stronie zapisanego raportu. Stąd każdy element znosi braki pól: w trakcie
 * pisania odpowiedzi ostatni typ bywa urwany w połowie.
 */

function ProbabilityBar({ value, label }) {
	if (!Number.isFinite(value)) return null;
	return (
		<div className="min-w-0 flex-1">
			<div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
				<span className="text-muted">{label}</span>
				<span className="font-bold tabular-nums text-text">{value}%</span>
			</div>
			<div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
				<div
					className="h-full rounded-full bg-accent transition-[width] duration-300"
					style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
				/>
			</div>
		</div>
	);
}

function PickCard({ pick, locale, t }) {
	const kickoff = pick.kickoffUtc ? new Date(pick.kickoffUtc) : null;
	const kickoffLabel =
		kickoff && !Number.isNaN(kickoff.getTime())
			? kickoff.toLocaleString(locale, {
					weekday: 'short',
					day: '2-digit',
					month: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
				})
			: null;

	return (
		<Card>
			<CardContent className="flex flex-col gap-4 px-5 py-5">
				<div className="flex flex-wrap items-start justify-between gap-2">
					<div className="min-w-0">
						<h3 className="font-display text-base font-bold text-text">{pick.match || '…'}</h3>
						<p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
							{pick.league && <span>{pick.league}</span>}
							{kickoffLabel && (
								<span className="inline-flex items-center gap-1">
									<CalendarClock size={12} aria-hidden="true" />
									{kickoffLabel}
								</span>
							)}
						</p>
					</div>

					{pick.market && (
						<Badge variant="accent" className="shrink-0">
							<Target size={12} aria-hidden="true" />
							{pick.market}: {pick.selection}
						</Badge>
					)}
				</div>

				<div className="flex flex-col gap-1.5">
					<div className="flex flex-wrap items-end gap-x-6 gap-y-3">
						<ProbabilityBar value={pick.probability} label={t('report_probability')} />
						<ProbabilityBar value={pick.confidence} label={t('report_confidence')} />
					</div>
					{/* „Gospodarze vs Goście" — nazwy potrzebne, gdy raport sprzed zapisu normy
					    nie ma jej przy typie i trzeba ją policzyć z rynku i selekcji. */}
					<LiftLabel
						market={pick.market}
						selection={pick.selection}
						homeName={String(pick.match || '').split(/\s+vs\s+/i)[0]?.trim() || null}
						awayName={String(pick.match || '').split(/\s+vs\s+/i)[1]?.trim() || null}
						probability={pick.probability}
						baseRate={pick.baseRate}
						lift={pick.lift}
					/>
				</div>

				{pick.analysis && <p className="text-sm leading-relaxed text-text">{pick.analysis}</p>}

				{pick.keyFacts?.length > 0 && (
					<ul className="flex flex-wrap gap-1.5">
						{pick.keyFacts.map((fact, index) => (
							<li
								key={index}
								className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted"
							>
								{fact}
							</li>
						))}
					</ul>
				)}

				{pick.fixtureId && (
					<Link
						href={`/mecz/${pick.fixtureId}`}
						className="inline-flex w-fit items-center gap-1 text-sm font-semibold text-accent no-underline transition-colors hover:text-text"
					>
						{t('report_open_match')}
						<ChevronRight size={15} aria-hidden="true" />
					</Link>
				)}
			</CardContent>
		</Card>
	);
}

export default function ReportPicks({ sections, isPartial = false, className }) {
	const t = useTranslations('common');
	const locale = useLocale();

	if (!sections) return null;
	const picks = sections.picks || [];

	return (
		<div className={cn('flex flex-col gap-5', className)}>
			{sections.intro && (
				<p className="text-sm leading-relaxed text-muted">{sections.intro}</p>
			)}

			{picks.map((pick, index) => (
				<PickCard key={pick.fixtureId || index} pick={pick} locale={locale} t={t} />
			))}

			{isPartial && (
				<p className="text-center text-xs text-muted motion-safe:animate-pulse">
					{t('report_writing')}
				</p>
			)}

			{!isPartial && sections.summary && (
				<p className="border-t border-border pt-4 text-sm leading-relaxed text-muted">
					{sections.summary}
				</p>
			)}
		</div>
	);
}
