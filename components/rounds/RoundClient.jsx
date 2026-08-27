'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, Lock, Trophy } from 'lucide-react';
import BallIcon from '@/components/icons/BallIcon';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import TeamCrest from '@/components/football/TeamCrest';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import { UserContext } from '@/context/UserContext';
import { USER_MARKETS } from '@/lib/picks/markets';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { initialsFromName } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

/**
 * Kolejka tygodniowa — wspólny zestaw meczów dla wszystkich.
 *
 * Sens tej strony jest porównawczy: przy swobodnym typowaniu ktoś obstawiający samych
 * faworytów ma wyższy procent, choć nie typuje lepiej. Tu wszyscy dostają te same
 * spotkania i jeden termin zamknięcia, więc wynik naprawdę coś znaczy.
 */
export default function RoundClient() {
	const t = useTranslations('common');
	const locale = useLocale();
	const { isAuthed } = useContext(UserContext);

	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
	const { gameId: detailsGameId, close: closeGameDetails } = useGameDetailsModal();

	const [data, setData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	const [busyFixture, setBusyFixture] = useState(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch('/api/rounds/current', { credentials: 'include' });
			setData(res.ok ? await res.json() : null);
		} catch {
			setData(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const round = data?.round;
	const isOpen = round?.status === 'open';
	// Rozliczona kolejka dostaje własną plakietkę: ranking jest wtedy ostateczny,
	// a „typowanie zamknięte" sugerowałoby, że na wyniki wciąż się czeka.
	const isSettled = round?.status === 'settled';
	const pickByFixture = Object.fromEntries((data?.myPicks || []).map((p) => [p.fixtureId, p]));

	const submit = async (fixtureId, market, selection) => {
		setBusyFixture(fixtureId);
		try {
			await fetch('/api/picks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ fixtureId, market, selection }),
			});
			await load();
		} finally {
			setBusyFixture(null);
		}
	};

	// W kolejce zostawiamy wyłącznie rynek wyniku — dwanaście meczów z pełnym wyborem
	// rynków byłoby męczące, a porównywalność wymaga tej samej stawki dla wszystkich.
	const resultMarket = USER_MARKETS[0];

	return (
		<>
			<NavBar />
			<div className="content-league">
				<h1 className="h1-football">
					<BallIcon className="icon-sport" />
					{t('footbal')}
				</h1>

				<FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

				<div className="mx-auto w-full max-w-5xl">
					<div className="flex flex-wrap items-center gap-3">
						<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
							{t('round_title')}
						</h2>
						{round && (
							<Badge variant={isOpen ? 'accent' : 'outline'}>
								{isOpen ? t('round_open') : isSettled ? t('round_settled') : t('round_closed')}
							</Badge>
						)}
					</div>
					<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('round_intro')}</p>

					{isLoading ? (
						<div className="mt-6 flex flex-col gap-2">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : !round ? (
						<p className="py-10 text-center text-sm text-muted">{t('round_none')}</p>
					) : (
						<>
							<p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm text-text">
								<CalendarClock size={15} aria-hidden="true" className="text-accent" />
								{isOpen ? t('round_closes') : t('round_closed_at')}{' '}
								<strong>
									{new Date(round.closesAt).toLocaleString(locale, {
										weekday: 'short',
										day: '2-digit',
										month: '2-digit',
										hour: '2-digit',
										minute: '2-digit',
									})}
								</strong>
							</p>

							<div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
								{/* Zestaw meczów z typowaniem w jednym kliknięciu */}
								<div className="flex flex-col gap-2">
									{round.fixtures.map((f) => {
										const mine = pickByFixture[f.fixtureId];
										return (
											<Card key={f.fixtureId}>
												<CardContent className="flex flex-col gap-3 px-4 py-3">
													<div className="flex flex-wrap items-center justify-between gap-2">
														<Link
															href={`/mecz/${f.fixtureId}`}
															className="min-w-0 no-underline"
														>
															<p className="flex items-center gap-2 truncate font-semibold text-text">
																<TeamCrest name={f.homeName} size="sm" />
																<span className="truncate">{f.homeName}</span>
																<span className="shrink-0 text-muted">–</span>
																<TeamCrest name={f.awayName} size="sm" />
																<span className="truncate">{f.awayName}</span>
															</p>
															<p className="truncate text-xs text-muted">
																{f.leagueName}
																{f.country ? ` · ${f.country}` : ''} ·{' '}
																{new Date(f.kickoff).toLocaleString(locale, {
																	weekday: 'short',
																	hour: '2-digit',
																	minute: '2-digit',
																})}
															</p>
														</Link>

														{mine && (
															<Badge
																variant={
																	mine.status === 'won'
																		? 'win'
																		: mine.status === 'lost'
																			? 'loss'
																			: 'accent'
																}
															>
																{mine.status === 'pending' && <Check size={12} aria-hidden="true" />}
																{mine.selection === 'home'
																	? t('pick_sel_home')
																	: mine.selection === 'draw'
																		? t('pick_sel_draw')
																		: mine.selection === 'away'
																			? t('pick_sel_away')
																			: mine.selection}
															</Badge>
														)}
													</div>

													{isAuthed && isOpen && !mine && (
														<div className="flex flex-wrap gap-2">
															{resultMarket.options.map((o) => (
																<button
																	key={o.value}
																	type="button"
																	disabled={busyFixture === f.fixtureId}
																	onClick={() => submit(f.fixtureId, resultMarket.market, o.value)}
																	className="flex-1 rounded-full border border-border bg-transparent px-3 py-2 text-xs font-semibold text-text transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
																>
																	{o.value === 'home'
																		? f.homeName
																		: o.value === 'away'
																			? f.awayName
																			: t('pick_sel_draw')}
																</button>
															))}
														</div>
													)}
												</CardContent>
											</Card>
										);
									})}
								</div>

								{/* Ranking kolejki */}
								<section>
									<h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold uppercase tracking-wide text-text">
										<Trophy size={18} aria-hidden="true" className="text-draw" />
										{t('round_leaderboard')}
									</h3>

									{data.leaderboard.length === 0 ? (
										<p className="text-sm text-muted">{t('round_no_picks')}</p>
									) : (
										<div className="flex flex-col gap-2">
											{data.leaderboard.map((e) => (
												<Card key={e.userId} className={e.isMe ? 'border-accent' : undefined}>
													<CardContent className="flex items-center gap-3 px-4 py-2.5">
														<span className="w-5 shrink-0 text-center font-display font-bold tabular-nums text-muted">
															{e.rank}
														</span>
														<span className="person-avatar shrink-0" aria-hidden="true">
															{initialsFromName(e.username)}
														</span>
														<span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">
															{e.username}
														</span>
														<span className="shrink-0 text-sm tabular-nums text-text">
															<strong>{e.won}</strong>
															<span className="text-muted">/{e.picked}</span>
														</span>
													</CardContent>
												</Card>
											))}
										</div>
									)}

									{!isAuthed && (
										<p className="mt-3 text-sm text-muted">{t('pick_login_hint')}</p>
									)}
									{!isOpen && (
										<p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
											<Lock size={12} aria-hidden="true" />
											{t('round_locked_hint')}
										</p>
									)}
								</section>
							</div>
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
