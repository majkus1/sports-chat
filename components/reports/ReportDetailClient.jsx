'use client';

import { use, useContext, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import { UserContext } from '@/context/UserContext';
import ReportPicks from '@/components/reports/ReportPicks';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Zapisany raport z sekcji „Moje raporty".
 *
 * Trasa jest prywatna — API i tak odda wyłącznie raport zalogowanego właściciela,
 * a cudzy identyfikator kończy się nieodróżnialnym 404.
 */
export default function ReportDetailClient({ params }) {
	const { reportId } = use(params);
	const t = useTranslations('common');
	const locale = useLocale();
	const { isAuthed } = useContext(UserContext);

	const [report, setReport] = useState(null);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!isAuthed) return;
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, {
					credentials: 'include',
				});
				if (cancelled) return;
				if (!res.ok) {
					setError(t('report_not_found'));
					return;
				}
				setReport(await res.json());
			} catch {
				if (!cancelled) setError(t('report_not_found'));
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [reportId, isAuthed, t]);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<BackLink href="/pilka-nozna/ai-agent" label={t('report_back')} />

			{!isAuthed || error ? (
				<p className="py-10 text-center text-sm text-muted">{error || t('mustlog')}</p>
			) : !report ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-8 w-2/3" />
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-40 w-full" />
				</div>
			) : (
				<>
					<div className="flex flex-wrap items-center gap-3">
						<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
							{t('report_hub_title')}
						</h1>
						<Badge variant={report.type === 'threeDays' ? 'outline' : 'accent'}>
							{report.type === 'threeDays' ? t('report_type_3d') : t('report_type_24h')}
						</Badge>
					</div>
					<p className="mt-1 text-xs text-muted">
						{t('report_generated_at', {
							date: new Date(report.createdAt).toLocaleString(locale, {
								day: '2-digit',
								month: '2-digit',
								year: 'numeric',
								hour: '2-digit',
								minute: '2-digit',
							}),
						})}
					</p>

					<ReportPicks sections={report.sections} className="mt-6" />
				</>
			)}
		</AppShell>
	);
}
