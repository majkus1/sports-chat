'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Globe, Info, Minus, Target, TrendingUp, Trophy, User, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * Skuteczność typów — wspólny widok dla trzech miejsc: publicznej zakładki, huba raportów
 * i panelu użytkownika. Filtry można wyłączyć (`compact`), gdy komponent stoi w wąskim panelu.
 *
 * Świadomie pokazujemy też typy pominięte i oczekujące. Serwis, który chwali się wyłącznie
 * trafieniami, nie jest wiarygodny — a wiarygodność jest tu jedyną walutą.
 */

const KINDS = ['all', 'prematch', 'live', 'report'];
const AUTHORS = ['ai', 'user'];
const RANGES = ['30', '90', 'all'];

/**
 * Duży wskaźnik skuteczności — pierwsza rzecz, na którą patrzy odwiedzający.
 *
 * Pod procentem stoi przedział ufności, bo sam procent przy małej próbie kłamie: 47/68 to
 * nie „69%", tylko „gdzieś między 57 a 79%". Podawanie samej środkowej wartości jako faktu
 * byłoby obiecywaniem precyzji, której w tych danych nie ma.
 */
function HitRate({ value, settled, interval, reliable = true, baseline = null, t }) {
	const known = Number.isFinite(value);
	/*
	 * Kolor procentu zależy od przewagi nad normą, nie od samej wysokości.
	 *
	 * 80% trafień w rynku, w którym norma wynosi 79%, to nie sukces, tylko zgadywanie
	 * średniej. Dopóki nie ma typów z zapisaną normą, zostaje dawne kryterium bezwzględne.
	 */
	const edge = baseline?.edge;
	const ton = !known
		? 'text-muted'
		: Number.isFinite(edge)
			? edge >= 5
				? 'text-win'
				: edge >= 0
					? 'text-text'
					: 'text-loss'
			: value >= 55
				? 'text-win'
				: value >= 45
					? 'text-text'
					: 'text-loss';

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-baseline gap-3">
				<span className={cn('font-display text-5xl font-bold tabular-nums', ton)}>
					{known ? `${value}%` : '—'}
				</span>
				<span className="text-sm text-muted">
					{known ? t('accuracy_from_settled', { count: settled }) : t('accuracy_no_data')}
				</span>
			</div>

			{known && interval && (
				<p className="text-xs text-muted">
					{t('accuracy_interval', { low: interval.low, high: interval.high })}
					{!reliable && ` · ${t('accuracy_small_sample')}`}
				</p>
			)}

			{/* Norma tych samych typów obok trafności — bez niej procent nie ma punktu odniesienia. */}
			{known && baseline && (
				<p className="text-xs text-muted">
					{t('accuracy_baseline', {
						base: baseline.expectedHitRate,
						edge: `${baseline.edge > 0 ? '+' : ''}${baseline.edge}`,
					})}
				</p>
			)}
		</div>
	);
}

/** Poziomy pasek z podziałem trafione / chybione. */
function SplitBar({ won, lost }) {
	const total = won + lost;
	if (!total) return null;
	const pct = (won / total) * 100;
	return (
		<div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
			<div className="bg-win transition-[width] duration-500" style={{ width: `${pct}%` }} />
			<div className="bg-loss transition-[width] duration-500" style={{ width: `${100 - pct}%` }} />
		</div>
	);
}

function BreakdownRow({ row, t }) {
	return (
		<div className="flex items-center gap-3 py-2">
			<span className="w-28 shrink-0 truncate text-sm text-text sm:w-36">{row.label}</span>
			<div className="min-w-0 flex-1">
				<SplitBar won={row.won} lost={row.lost} />
			</div>
			{/* Przy garstce typów procent wprowadza w błąd — pokazujemy sam bilans.
			    Dziesięć typów i jedno trafienie więcej to skok o dziesięć punktów. */}
			<span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted">
				{row.settled >= 10 && <span className="font-bold text-text">{row.hitRate}% · </span>}
				{row.won}/{row.settled}
			</span>
		</div>
	);
}

export default function AccuracyPanel({ scope = 'global', compact = false, defaultKind = 'all', className }) {
	const t = useTranslations('common');
	const locale = useLocale();

	const [kind, setKind] = useState(defaultKind);
	const [days, setDays] = useState('90');
	/*
	 * Czyje typy liczymy: własnoręcznie wystawione czy pochodzące z wygenerowanych analiz.
	 *
	 * To dwie zupełnie różne rzeczy i nigdy nie wolno ich zsumować w jedną liczbę — trafność
	 * modelu nie jest zasługą użytkownika, a jego własne typy nie świadczą o modelu. Zakładka
	 * publiczna dotyczy wyłącznie AI, więc przełącznik pojawia się tylko we własnym profilu.
	 *
	 * Domyślnie pokazujemy analizy: mają dorobek od pierwszego dnia korzystania, podczas gdy
	 * własne typy świeżego konta są puste i widget otwierałby się komunikatem o braku danych.
	 */
	const [author, setAuthor] = useState('ai');
	const [data, setData] = useState(null);
	const [isLoading, setIsLoading] = useState(true);
	/** Pozycja w rankingu typerów — dotyczy wyłącznie własnych statystyk. */
	const [myRank, setMyRank] = useState(null);

	useEffect(() => {
		if (scope !== 'me') return undefined;
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch('/api/stats/leaderboard?days=all', { credentials: 'include' });
				if (!res.ok || cancelled) return;
				setMyRank((await res.json()).myRank);
			} catch {
				/* brak pozycji nie może psuć reszty panelu */
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [scope]);

	const load = useCallback(async () => {
		setIsLoading(true);
		try {
			const params = new URLSearchParams({ scope, days, author });
			// Typy użytkownika są zawsze przedmeczowe — filtr rodzaju byłby tu martwy.
			if (author === 'ai' && kind !== 'all') params.set('kind', kind);
			const res = await fetch(`/api/stats/picks?${params}`, { credentials: 'include' });
			setData(res.ok ? await res.json() : null);
		} catch {
			setData(null);
		} finally {
			setIsLoading(false);
		}
	}, [scope, kind, days, author]);

	useEffect(() => {
		load();
	}, [load]);

	const s = data?.summary;

	const kindLabel = {
		all: t('accuracy_kind_all'),
		prematch: t('accuracy_kind_prematch'),
		live: t('accuracy_kind_live'),
		report: t('accuracy_kind_report'),
	};

	return (
		<div className={cn('flex flex-col gap-4', className)}>
			{/*
			 * Jawne oznaczenie zakresu danych.
			 *
			 * Bez tego widget w profilu i publiczna zakładka wyglądają identycznie — a przy
			 * jednym aktywnym użytkowniku pokazują nawet te same liczby, więc nie da się
			 * poznać, czy patrzy się na swoje typy, czy na cały serwis.
			 */}
			<div className="flex items-center gap-2">
				<Badge variant={scope === 'me' ? 'accent' : 'outline'}>
					{scope === 'me' ? <User size={12} aria-hidden="true" /> : <Globe size={12} aria-hidden="true" />}
					{scope === 'me' ? t('accuracy_scope_mine') : t('accuracy_scope_global')}
				</Badge>
				<span className="text-xs text-muted">
					{scope !== 'me'
						? t('accuracy_scope_global_hint')
						: author === 'user'
							? t('accuracy_author_user_hint')
							: t('accuracy_scope_mine_hint')}
				</span>
			</div>

			{/*
			 * Każda grupa filtrów ma podpis.
			 *
			 * Trzy rzędy identycznie wyglądających pigułek jeden pod drugim nie mówiły, co która
			 * grupa przełącza — czytelnik widział siedem przycisków i musiał zgadywać z ich treści.
			 * Podpis kosztuje jeden wiersz i usuwa całe zgadywanie.
			 */}
			{scope === 'me' && (
				<div className="flex flex-col gap-1">
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
						{t('accuracy_filter_author')}
					</span>
					<div className="inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-full border border-border bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{AUTHORS.map((a) => (
							<button
								key={a}
								type="button"
								onClick={() => setAuthor(a)}
								aria-pressed={author === a}
								className={cn(
									'whitespace-nowrap rounded-full border-0 px-3 py-1 text-xs font-semibold transition-colors',
									author === a
										? 'bg-brand text-brand-fg shadow-sm'
										: 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
								)}
							>
								{a === 'user' ? t('accuracy_author_user') : t('accuracy_author_ai')}
							</button>
						))}
					</div>
				</div>
			)}

			{/* Rodzaj typu i okno czasowe. W wąskim panelu przewijają się poziomo,
			    zamiast łamać w dwie linie. */}
			<div className="flex flex-wrap items-end gap-x-4 gap-y-3">
				<div className={cn('flex flex-col gap-1', author === 'user' && 'hidden')}>
					<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
						{t('accuracy_filter_kind')}
					</span>
					<div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
						{KINDS.map((k) => (
							<button
								key={k}
								type="button"
								onClick={() => setKind(k)}
								aria-pressed={kind === k}
								className={cn(
									'whitespace-nowrap rounded-full border-0 px-3 py-1 text-xs font-semibold transition-colors',
									kind === k
										? 'bg-brand text-brand-fg shadow-sm'
										: 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
								)}
							>
								{kindLabel[k]}
							</button>
						))}
					</div>
				</div>

				{!compact && (
					<div className="flex flex-col gap-1">
						<span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
							{t('accuracy_filter_range')}
						</span>
						<div className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-2 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{RANGES.map((r) => (
								<button
									key={r}
									type="button"
									onClick={() => setDays(r)}
									aria-pressed={days === r}
									className={cn(
										'whitespace-nowrap rounded-full border-0 px-3 py-1 text-xs font-semibold transition-colors',
										days === r
											? 'bg-brand text-brand-fg shadow-sm'
											: 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
									)}
								>
									{r === 'all' ? t('accuracy_range_all') : t('accuracy_range_days', { days: r })}
								</button>
							))}
						</div>
					</div>
				)}
			</div>

			{/*
			 * Pozycja w rankingu typerów — poza blokiem statystyk, bo dotyczy całego dorobku,
			 * a nie wybranego filtra. Osobno też dlatego, że najbardziej przydaje się wtedy,
			 * gdy statystyk jeszcze nie ma: świeże konto ma zobaczyć, ilu typów mu brakuje,
			 * zamiast pustego „brak danych". Pokazujemy ją w obu zakładkach, bo przy domyślnym
			 * widoku analiz zniknęłaby z profilu — a sam komunikat mówi wprost, że chodzi
			 * o typy WŁASNE, więc nie da się go pomylić ze skutecznością modelu.
			 */}
			{scope === 'me' && myRank && (
				<div className="flex items-center gap-2 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2">
					<Trophy size={15} aria-hidden="true" className="shrink-0 text-draw" />
					{myRank.rank ? (
						<span className="text-sm text-text">
							{t('accuracy_rank', { rank: myRank.rank, total: myRank.total })}
						</span>
					) : (
						<span className="text-sm text-muted">
							{t('accuracy_rank_pending', { settled: myRank.settled, required: myRank.settled + myRank.needed })}
						</span>
					)}
				</div>
			)}

			{isLoading ? (
				<div className="flex flex-col gap-3">
					<Skeleton className="h-28 w-full" />
					{!compact && <Skeleton className="h-40 w-full" />}
				</div>
			) : !s ? (
				<p className="py-6 text-center text-sm text-muted">{t('accuracy_no_data')}</p>
			) : (
				<>
					<Card>
						<CardContent className="flex flex-col gap-4 px-5 py-5">
							<HitRate
								value={s.hitRate}
								settled={s.settled}
								interval={s.interval}
								reliable={s.reliable !== false}
								baseline={s.baseline ?? null}
								t={t}
							/>
							<SplitBar won={s.won} lost={s.lost} />

							<div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
								<span className="inline-flex items-center gap-1.5 text-win">
									<Check size={13} aria-hidden="true" />
									{t('accuracy_won')}: <strong className="tabular-nums">{s.won}</strong>
								</span>
								<span className="inline-flex items-center gap-1.5 text-loss">
									<X size={13} aria-hidden="true" />
									{t('accuracy_lost')}: <strong className="tabular-nums">{s.lost}</strong>
								</span>
								<span className="inline-flex items-center gap-1.5 text-muted">
									<Minus size={13} aria-hidden="true" />
									{t('accuracy_pending')}: <strong className="tabular-nums">{s.pending}</strong>
								</span>
								<span className="inline-flex items-center gap-1.5 text-muted">
									<Info size={13} aria-hidden="true" />
									{t('accuracy_skipped')}: <strong className="tabular-nums">{s.skipped}</strong>
								</span>
							</div>
						</CardContent>
					</Card>

					{!compact && data.byKind?.length > 1 && (
						<Card>
							<CardContent className="flex flex-col gap-1 px-5 py-4">
								<h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
									<Target size={14} aria-hidden="true" className="text-accent" />
									{t('accuracy_by_kind')}
								</h3>
								{data.byKind.map((row) => (
									<BreakdownRow key={row.key} row={{ ...row, label: kindLabel[row.key] ?? row.key }} t={t} />
								))}
							</CardContent>
						</Card>
					)}

					{/* Podział po rynkach pokazujemy także w wersji kompaktowej — sam procent
					    bez informacji, na czym się trafia, niewiele daje. */}
					{data.byMarket?.length > 0 && (
						<Card>
							<CardContent className="flex flex-col gap-1 px-5 py-4">
								<h3 className="mb-1 flex items-center gap-1.5 text-sm font-bold text-text">
									<TrendingUp size={14} aria-hidden="true" className="text-accent" />
									{t('accuracy_by_market')}
								</h3>
								{data.byMarket.map((row) => (
									<BreakdownRow key={row.key} row={row} t={t} />
								))}
							</CardContent>
						</Card>
					)}

					{/* Kalibracja: czy deklarowana pewność ma pokrycie w wynikach. */}
					{!compact && data.byConfidence?.length > 0 && (
						<Card>
							<CardContent className="flex flex-col gap-1 px-5 py-4">
								<h3 className="text-sm font-bold text-text">{t('accuracy_by_confidence')}</h3>
								<p className="mb-1 text-xs leading-relaxed text-muted">
									{t('accuracy_by_confidence_hint')}
								</p>
								{data.byConfidence.map((row) => (
									<BreakdownRow key={row.key} row={row} t={t} />
								))}
							</CardContent>
						</Card>
					)}

					{!compact && data.recent?.length > 0 && (
						<Card>
							<CardContent className="px-5 py-4">
								<h3 className="mb-2 text-sm font-bold text-text">{t('accuracy_recent')}</h3>
								<div className="flex flex-col divide-y divide-border">
									{data.recent.map((p, i) => (
										<div key={i} className="flex items-center gap-3 py-2">
											<Badge variant={p.status === 'won' ? 'win' : 'loss'} className="shrink-0">
												{p.status === 'won' ? t('accuracy_won') : t('accuracy_lost')}
											</Badge>
											<div className="min-w-0 flex-1">
												<p className="truncate text-sm text-text">
													{p.homeName} {p.finalScore?.home ?? '?'}–{p.finalScore?.away ?? '?'} {p.awayName}
												</p>
												<p className="truncate text-xs text-muted">
													{p.market}: {p.selection}
													{p.leagueName ? ` · ${p.leagueName}` : ''}
												</p>
											</div>
											<span className="shrink-0 text-xs text-muted">
												{p.kickoff
													? new Date(p.kickoff).toLocaleDateString(locale, {
															day: '2-digit',
															month: '2-digit',
														})
													: ''}
											</span>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					)}

					<p className="text-xs leading-relaxed text-muted">{t('accuracy_disclaimer')}</p>
				</>
			)}
		</div>
	);
}
