'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarRange, FileText, Loader2, Lock, Sparkles, Target, Trash2, Zap } from 'lucide-react';
import AccuracyPanel from '@/components/stats/AccuracyPanel';
import BallIcon from '@/components/icons/BallIcon';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import { UserContext } from '@/context/UserContext';
import { useReportStream } from '@/components/reports/useReportStream';
import ReportPicks from '@/components/reports/ReportPicks';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Link } from '@/i18n/routing';

/**
 * Hub Raportu AI.
 *
 * Zastępuje formularz „podaj maila" ze starego agenta: raport generuje się na miejscu,
 * typy pojawiają się na żywo w miarę pisania, a wynik zapisuje się na koncie w sekcji
 * „Moje raporty". Dostęp wymaga zalogowania — raport musi mieć właściciela.
 */
export default function ReportsHubClient() {
	const t = useTranslations('common');
	const locale = useLocale();
	const language = locale === 'pl' ? 'pl' : 'en';
	const { isAuthed } = useContext(UserContext);

	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
	const { gameId: detailsGameId, close: closeGameDetails } = useGameDetailsModal();

	const [myReports, setMyReports] = useState(null);
	const [usage, setUsage] = useState(null);

	const { report, isGenerating, isPartial, stage, candidateCount, start } = useReportStream({
		language,
		failedText: t('report_failed'),
	});

	const loadMyReports = useCallback(async () => {
		try {
			const res = await fetch('/api/reports', { credentials: 'include' });
			if (!res.ok) return;
			setMyReports((await res.json()).reports);
		} catch {
			/* lista wróci przy następnym odświeżeniu */
		}
	}, []);

	const loadUsage = useCallback(async () => {
		try {
			const res = await fetch('/api/me/entitlements', { credentials: 'include' });
			if (!res.ok) return;
			setUsage((await res.json()).usage?.report ?? null);
		} catch {
			/* pasek zużycia jest pomocniczy */
		}
	}, []);

	useEffect(() => {
		if (!isAuthed) return;
		loadMyReports();
		loadUsage();
	}, [isAuthed, loadMyReports, loadUsage]);

	// Po zakończonym generowaniu lista i licznik są nieaktualne.
	useEffect(() => {
		if (report.reportId) {
			loadMyReports();
			loadUsage();
		}
	}, [report.reportId, loadMyReports, loadUsage]);

	const removeReport = async (id) => {
		try {
			const res = await fetch(`/api/reports/${id}`, { method: 'DELETE', credentials: 'include' });
			if (res.ok) setMyReports((prev) => (prev || []).filter((r) => r.id !== id));
		} catch {
			/* nieusunięty raport zostaje na liście */
		}
	};

	const typeLabel = (type) => (type === 'threeDays' ? t('report_type_3d') : t('report_type_24h'));

	const generationCards = [
		{
			type: 'soon',
			icon: Zap,
			title: t('report_type_24h'),
			description: t('report_type_24h_desc'),
		},
		{
			type: 'threeDays',
			icon: CalendarRange,
			title: t('report_type_3d'),
			description: t('report_type_3d_desc'),
		},
	];

	return (
		<>
			<NavBar />
			<div className="content-league">
				<h1 className="h1-football">
					<BallIcon className="icon-sport" />
					{t('footbal')}
				</h1>

				<FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

				<div className="mx-auto w-full max-w-3xl">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
							{t('report_hub_title')}
						</h2>
						{isAuthed && usage && usage.limit !== null && (
							<Badge variant="outline">
								{t('report_usage', { used: usage.used, limit: usage.limit })}
							</Badge>
						)}
					</div>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
						{t('report_hub_intro')}
					</p>

					{!isAuthed ? (
						<Card className="mt-6">
							<CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
								<span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-muted">
									<Lock size={18} aria-hidden="true" />
								</span>
								<p className="text-sm font-semibold text-text">{t('report_login_title')}</p>
								<p className="max-w-sm text-sm leading-relaxed text-muted">{t('report_login_hint')}</p>
							</CardContent>
						</Card>
					) : (
						<>
							{/* Wybór okna czasowego — dwie karty zamiast formularza z mailem. */}
							<div className="mt-6 grid gap-4 sm:grid-cols-2">
								{generationCards.map(({ type, icon: Icon, title, description }) => (
									<Card key={type}>
										<CardContent className="flex h-full flex-col gap-3 px-5 py-5">
											<span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
												<Icon size={18} aria-hidden="true" />
											</span>
											<h3 className="font-display text-base font-bold text-text">{title}</h3>
											<p className="flex-1 text-sm leading-relaxed text-muted">{description}</p>
											<Button
												variant="accent"
												onClick={() => start(type)}
												disabled={isGenerating}
												className="rounded-full"
											>
												{isGenerating ? (
													<Loader2 size={16} aria-hidden="true" className="motion-safe:animate-spin" />
												) : (
													<Sparkles size={16} aria-hidden="true" />
												)}
												{t('report_generate')}
											</Button>
										</CardContent>
									</Card>
								))}
							</div>

							{/* Stan generowania: etapy selekcji i pisania, typy wpadają na żywo. */}
							{(isGenerating || report.sections || report.error) && (
								<div className="mt-8">
									{isGenerating && !report.sections && (
										<Card>
											<CardContent className="flex flex-col items-center gap-3 px-6 py-8 text-center">
												<Loader2
													size={22}
													aria-hidden="true"
													className="text-accent motion-safe:animate-spin"
												/>
												<p className="text-sm font-semibold text-text">
													{stage === 'generating'
														? t('report_stage_generating', { count: candidateCount ?? '…' })
														: t('report_stage_selecting')}
												</p>
												<p className="max-w-sm text-xs leading-relaxed text-muted">
													{t('report_stage_hint')}
												</p>
											</CardContent>
										</Card>
									)}

									{report.error && (
										<Card>
											<CardContent className="flex flex-col items-center gap-3 px-6 py-6 text-center">
												<p className="text-sm text-loss">{report.error}</p>
												{report.limitReached && (
													<Button asChild variant="accent" className="rounded-full">
														<Link href="/cennik">{t('see_plans')}</Link>
													</Button>
												)}
											</CardContent>
										</Card>
									)}

									{report.sections && (
										<ReportPicks sections={report.sections} isPartial={isPartial} />
									)}
								</div>
							)}

							{/* Skuteczność własnych raportów — dowód zamiast obietnicy. */}
							<section className="mt-10">
								<h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-text">
									<Target size={18} aria-hidden="true" className="text-accent" />
									{t('accuracy_my_reports')}
								</h3>
								<AccuracyPanel scope="me" defaultKind="report" compact />
							</section>

							{/* Moje raporty — historia zapisana na koncie. */}
							<section className="mt-10">
								<h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-text">
									<FileText size={18} aria-hidden="true" className="text-accent" />
									{t('report_my_reports')}
								</h3>

								{myReports === null ? (
									<div className="flex flex-col gap-2">
										<Skeleton className="h-16 w-full" />
										<Skeleton className="h-16 w-full" />
									</div>
								) : myReports.length === 0 ? (
									<p className="py-4 text-sm text-muted">{t('report_none_yet')}</p>
								) : (
									<div className="flex flex-col gap-2">
										{myReports.map((r) => (
											<Card key={r.id}>
												<CardContent className="flex items-center gap-3 px-4 py-3">
													<Link
														href={`/pilka-nozna/raport/${r.id}`}
														className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 no-underline"
													>
														<Badge variant={r.type === 'threeDays' ? 'outline' : 'accent'}>
															{typeLabel(r.type)}
														</Badge>
														<span className="text-sm font-semibold text-text">
															{t('report_pick_count', { count: r.fixtureCount })}
														</span>
														<span className="text-xs text-muted">
															{new Date(r.createdAt).toLocaleString(locale, {
																day: '2-digit',
																month: '2-digit',
																year: 'numeric',
																hour: '2-digit',
																minute: '2-digit',
															})}
														</span>
													</Link>
													<button
														type="button"
														onClick={() => removeReport(r.id)}
														aria-label={t('report_delete')}
														className="shrink-0 rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-loss"
													>
														<Trash2 size={15} aria-hidden="true" />
													</button>
												</CardContent>
											</Card>
										))}
									</div>
								)}
							</section>
						</>
					)}
				</div>
			</div>

			<Footer className="mx-5" />

			{isResultsModalOpen && (
				<FullScreenModal
					onClose={() => setIsResultsModalOpen(false)}
					src={`/api/widgets/games?locale=${locale}`}
				/>
			)}
			{detailsGameId && (
				<FullScreenModal
					onClose={closeGameDetails}
					src={`/api/widgets/game?gameId=${detailsGameId}&locale=${locale}`}
				/>
			)}
		</>
	);
}
