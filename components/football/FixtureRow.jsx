'use client';

import { useTranslations } from 'next-intl';
import { BarChart3, ChevronRight, Swords } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Wiersz meczu na listach przedmeczowej i live.
 *
 * Wcześniej ten sam układ był wklejony w obu plikach, po ~90 linii stylów inline z ręczną
 * obsługą hoveru. Poza duplikacją miał realny problem UX: kursor „pointer" obejmował całą
 * kartę, ale klikalny był wyłącznie tekst — kliknięcie w puste miejsce nic nie robiło.
 * Tutaj odnośnik jest rozciągnięty na cały kafelek, a przyciski widgetów leżą nad nim.
 */

/** Mały przycisk otwierający widget. Celowo dyskretny — główną akcją jest wejście do meczu. */
function WidgetButton({ title, onClick, children }) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			className={cn(
				'inline-flex h-7 items-center justify-center gap-1 rounded-md px-2',
				// `border-0` nie jest ozdobne: bez preflightu Tailwinda przeglądarka
				// dokłada przyciskom własną ramkę `outset`.
				'border-0 bg-accent-soft text-[11px] font-bold uppercase tracking-wide text-accent',
				'transition-colors hover:bg-accent hover:text-accent-fg',
				'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
			)}
		>
			{children}
		</button>
	);
}

function formatTime(value, locale) {
	return new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value, locale) {
	return new Date(value).toLocaleDateString(locale, {
		day: '2-digit',
		month: '2-digit',
		weekday: 'short',
	});
}

export default function FixtureRow({ fixture, locale, isLive = false, onH2H, onTeamStats }) {
	const t = useTranslations('common');

	const home = fixture.teams?.home;
	const away = fixture.teams?.away;
	const hasTeamIds = Boolean(home?.id && away?.id);
	const elapsed = fixture.fixture?.status?.elapsed;

	return (
		<div
			className={cn(
				'group relative mt-2 rounded-[var(--radius-ui)] border border-border bg-surface',
				'transition-[border-color,background-color] duration-150',
				'hover:border-accent hover:bg-surface-2'
			)}
		>
			{/*
			 * Odnośnik przykrywa cały kafelek, więc kliknięcie w dowolne miejsce otwiera mecz.
			 * Treść niżej ma wyłączone zdarzenia wskaźnika, żeby nie przechwytywała kliknięć;
			 * przyciski widgetów włączają je z powrotem i leżą warstwę wyżej.
			 */}
			<Link
				href={`/mecz/${fixture.fixture.id}`}
				aria-label={`${home?.name} – ${away?.name}: ${t('open_match_room')}`}
				className={cn(
					'absolute inset-0 z-10 rounded-[var(--radius-ui)]',
					'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
				)}
			/>

			<div className="pointer-events-none relative z-20 flex items-center gap-3 px-3.5 py-2.5">
				{/* Znacznik czasu albo minuta meczu — stała szerokość trzyma nazwy w jednej osi. */}
				<div className="w-12 shrink-0 text-center">
					{isLive ? (
						<span className="inline-flex items-center gap-1 text-xs font-bold text-live">
							<span className="h-1.5 w-1.5 rounded-full bg-live motion-safe:animate-pulse" />
							{Number.isFinite(elapsed) ? `${elapsed}'` : t('live_now')}
						</span>
					) : (
						<span className="text-sm font-bold tabular-nums text-text">
							{formatTime(fixture.fixture.date, locale)}
						</span>
					)}
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2 text-sm font-semibold text-text">
						<span className="truncate">{home?.name}</span>
						{isLive ? (
							<span className="shrink-0 rounded bg-live px-1.5 py-0.5 text-xs font-bold tabular-nums text-white">
								{fixture.goals?.home ?? 0}:{fixture.goals?.away ?? 0}
							</span>
						) : (
							<span className="shrink-0 text-xs text-muted">–</span>
						)}
						<span className="truncate">{away?.name}</span>
					</div>
					<div className="mt-0.5 truncate text-xs text-muted">
						{isLive
							? fixture.fixture?.status?.long
							: formatDate(fixture.fixture.date, locale)}
					</div>
				</div>

				{hasTeamIds && (
					<div className="pointer-events-auto flex shrink-0 items-center gap-1.5">
						<WidgetButton title={t('widget_h2h_title')} onClick={() => onH2H(fixture)}>
							<Swords size={12} aria-hidden="true" />
							H2H
						</WidgetButton>
						<WidgetButton
							title={t('widget_team_stats_title')}
							onClick={() => onTeamStats(fixture)}
						>
							<BarChart3 size={13} aria-hidden="true" />
						</WidgetButton>
					</div>
				)}

				<ChevronRight
					size={16}
					aria-hidden="true"
					className="shrink-0 text-border-strong transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent"
				/>
			</div>
		</div>
	);
}
