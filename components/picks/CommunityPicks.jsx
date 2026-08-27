'use client';

import { useCallback, useContext, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Lock, Trash2, Users, X } from 'lucide-react';
import { UserContext } from '@/context/UserContext';
import { USER_MARKETS } from '@/lib/picks/markets';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { initialsFromName } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

/**
 * Typowanie społeczności przy meczu.
 *
 * Rynki pochodzą z zamkniętej listy — typ wpisany ręcznie bywa nierozstrzygalny, a ranking
 * oparty na typach, których nie da się rozliczyć, nie byłby wart zaufania. Po pierwszym
 * gwizdku formularz znika: typ postawiony przy znanym wyniku to nie prognoza.
 */
export default function CommunityPicks({ fixtureId, kickoff, isStarted, className }) {
	const t = useTranslations('common');
	const { isAuthed, user } = useContext(UserContext);

	const [picks, setPicks] = useState(null);
	const [market, setMarket] = useState(USER_MARKETS[0].market);
	const [selection, setSelection] = useState(null);
	const [comment, setComment] = useState('');
	const [isSending, setIsSending] = useState(false);
	const [error, setError] = useState(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch(`/api/picks?fixtureId=${encodeURIComponent(fixtureId)}`, {
				credentials: 'include',
			});
			setPicks(res.ok ? (await res.json()).picks : []);
		} catch {
			setPicks([]);
		}
	}, [fixtureId]);

	useEffect(() => {
		load();
	}, [load]);

	const myPick = picks?.find((p) => p.isMine) || null;
	const activeMarket = USER_MARKETS.find((m) => m.market === market) || USER_MARKETS[0];

	const submit = async () => {
		if (!selection || isSending) return;
		setIsSending(true);
		setError(null);

		try {
			const res = await fetch('/api/picks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ fixtureId, market, selection, comment }),
			});
			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				setError(
					{
						already_picked: t('pick_error_already'),
						match_started: t('pick_error_started'),
						match_cancelled: t('pick_error_cancelled'),
					}[data.error] || t('something_wrong')
				);
				return;
			}

			setSelection(null);
			setComment('');
			await load();
		} catch {
			setError(t('something_wrong'));
		} finally {
			setIsSending(false);
		}
	};

	const removeMine = async () => {
		try {
			const res = await fetch(`/api/picks?fixtureId=${encodeURIComponent(fixtureId)}`, {
				method: 'DELETE',
				credentials: 'include',
			});
			if (res.ok) await load();
		} catch {
			/* typ zostaje na liście */
		}
	};

	const toggleFollow = async (pickId) => {
		try {
			const res = await fetch(`/api/picks/${pickId}/follow`, {
				method: 'POST',
				credentials: 'include',
			});
			if (!res.ok) return;
			const data = await res.json();
			setPicks((prev) =>
				prev.map((p) =>
					p.id === pickId
						? { ...p, followedByMe: data.following, followerCount: data.followerCount }
						: p
				)
			);
		} catch {
			/* licznik odświeży się przy następnym wejściu */
		}
	};

	return (
		<div className={cn('flex flex-col gap-5', className)}>
			{/* Formularz — tylko dla zalogowanych, tylko przed gwizdkiem, tylko raz. */}
			{!isStarted && isAuthed && !myPick && (
				<Card>
					<CardContent className="flex flex-col gap-4 px-5 py-5">
						<div>
							<h3 className="font-display text-base font-bold text-text">{t('pick_your_title')}</h3>
							<p className="mt-1 text-xs leading-relaxed text-muted">{t('pick_your_hint')}</p>
						</div>

						{/* Wybór rynku */}
						<div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{USER_MARKETS.map((m) => (
								<button
									key={m.market}
									type="button"
									onClick={() => {
										setMarket(m.market);
										setSelection(null);
									}}
									aria-pressed={market === m.market}
									className={cn(
										'whitespace-nowrap rounded-full border-0 px-3 py-1.5 text-xs font-semibold transition-colors',
										market === m.market
											? 'bg-brand text-brand-fg shadow-sm'
											: 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
									)}
								>
									{t(m.labelKey)}
								</button>
							))}
						</div>

						{/* Wybór selekcji w obrębie rynku */}
						<div className="flex flex-wrap gap-2">
							{activeMarket.options.map((o) => (
								<button
									key={o.value}
									type="button"
									onClick={() => setSelection(o.value)}
									aria-pressed={selection === o.value}
									className={cn(
										'rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
										selection === o.value
											? 'border-accent bg-accent text-accent-fg'
											: 'border-border bg-transparent text-text hover:border-accent'
									)}
								>
									{t(o.labelKey)}
								</button>
							))}
						</div>

						<textarea
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							rows={2}
							maxLength={280}
							placeholder={t('pick_comment_placeholder')}
							className="resize-none rounded-[var(--radius-ui)] border border-border bg-surface px-3 py-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-2 focus:outline-offset-2 focus:outline-ring"
						/>

						{error && <p className="text-sm text-loss">{error}</p>}

						<Button
							variant="accent"
							onClick={submit}
							disabled={!selection || isSending}
							className="w-fit rounded-full px-6"
						>
							{t('pick_submit')}
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Własny typ — z możliwością wycofania do gwizdka. */}
			{myPick && (
				<Card className="border-accent">
					<CardContent className="flex flex-wrap items-center gap-3 px-5 py-4">
						<Badge variant="accent">{t('pick_yours')}</Badge>
						<span className="font-semibold text-text">
							{myPick.market}: {myPick.selection}
						</span>
						{myPick.comment && (
							<span className="text-sm text-muted">&bdquo;{myPick.comment}&rdquo;</span>
						)}
						{!isStarted && (
							<button
								type="button"
								onClick={removeMine}
								aria-label={t('pick_remove')}
								className="ml-auto rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-loss"
							>
								<Trash2 size={15} aria-hidden="true" />
							</button>
						)}
					</CardContent>
				</Card>
			)}

			{isStarted && !myPick && (
				<p className="flex items-center gap-2 text-sm text-muted">
					<Lock size={14} aria-hidden="true" />
					{t('pick_closed')}
				</p>
			)}

			{!isAuthed && !isStarted && (
				<p className="text-sm text-muted">{t('pick_login_hint')}</p>
			)}

			{/* Typy pozostałych */}
			<section>
				<h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-text">
					<Users size={15} aria-hidden="true" className="text-accent" />
					{t('pick_community')}
					{picks?.length > 0 && <span className="text-muted">({picks.length})</span>}
				</h3>

				{picks === null ? (
					<div className="flex flex-col gap-2">
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
					</div>
				) : picks.length === 0 ? (
					<p className="py-3 text-sm text-muted">{t('pick_none_yet')}</p>
				) : (
					<div className="flex flex-col gap-2">
						{picks.map((p) => (
							<Card key={p.id}>
								<CardContent className="flex items-center gap-3 px-4 py-3">
									<span className="person-avatar shrink-0" aria-hidden="true">
										{initialsFromName(p.username)}
									</span>

									<div className="min-w-0 flex-1">
										<p className="flex flex-wrap items-center gap-x-2 text-sm">
											<span className="font-bold text-text">{p.username}</span>
											<span className="text-text">
												{p.market}: <strong>{p.selection}</strong>
											</span>
											{p.status === 'won' && <Badge variant="win">{t('accuracy_won')}</Badge>}
											{p.status === 'lost' && <Badge variant="loss">{t('accuracy_lost')}</Badge>}
										</p>
										{p.comment && (
											<p className="mt-0.5 truncate text-xs text-muted">{p.comment}</p>
										)}
									</div>

									{/* „Też biorę" — brak odpowiednika negatywnego jest świadomy. */}
									{isAuthed && !p.isMine && !isStarted && (
										<button
											type="button"
											onClick={() => toggleFollow(p.id)}
											aria-pressed={p.followedByMe}
											className={cn(
												'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
												p.followedByMe
													? 'border-accent bg-accent-soft text-accent'
													: 'border-border text-muted hover:border-accent hover:text-text'
											)}
										>
											{p.followedByMe ? <Check size={13} aria-hidden="true" /> : null}
											{t('pick_follow')}
											{p.followerCount > 0 && <span className="tabular-nums">{p.followerCount}</span>}
										</button>
									)}
									{(!isAuthed || p.isMine || isStarted) && p.followerCount > 0 && (
										<span className="shrink-0 text-xs text-muted">
											{t('pick_follow')} {p.followerCount}
										</span>
									)}
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
