'use client';

import { useTranslations } from 'next-intl';
import { BarChart3, ChevronRight, Lock, Sparkles, Swords } from 'lucide-react';
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

/**
 * Plakietka modelu: „X2 +18" albo kłódka, gdy plan nie obejmuje liczb.
 *
 * Skrót idzie konwencją kuponową (1, X2, G1…), a pełne zdanie — selekcja, procent, o ile
 * ponad normę — w podpowiedzi po najechaniu, bo w wierszu nie ma na nie miejsca. Przewaga
 * stoi obok skrótu, nie procent: to ona mówi, czy ten mecz odstaje od przeciętnego.
 *
 * Wariant z kłódką jest odnośnikiem do cennika i ma włączone zdarzenia wskaźnika, tak jak
 * przyciski widgetów — inaczej kliknięcie przechwyciłby odnośnik pokrywający cały kafelek.
 */
function ModelHint({ hint, t }) {
	if (!hint) return null;

	const baza = 'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-bold uppercase tracking-wide';

	if (hint.locked) {
		return (
			<Link
				href="/cennik"
				title={t('model_hint_locked')}
				aria-label={t('model_hint_locked')}
				onClick={(event) => event.stopPropagation()}
				className={cn(
					baza,
					'pointer-events-auto border border-dashed border-border-strong text-muted no-underline',
					'transition-colors hover:border-accent hover:text-accent'
				)}
			>
				<Sparkles size={12} aria-hidden="true" />
				<Lock size={10} aria-hidden="true" />
			</Link>
		);
	}

	const opis = t('model_hint_title', {
		selection: hint.selection,
		probability: hint.probability,
		lift: hint.lift,
	});

	return (
		<span title={opis} aria-label={opis} className={cn(baza, 'bg-accent text-accent-fg tabular-nums')}>
			<Sparkles size={12} aria-hidden="true" />
			{hint.label}
			<span className="font-semibold opacity-90">+{hint.lift}</span>
		</span>
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

export default function FixtureRow({
	fixture,
	locale,
	isLive = false,
	onH2H,
	onTeamStats,
	modelHint = null,
}) {
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

			{/*
			 * Dwa układy w jednym: na telefonie nazwy drużyn jedna pod drugą, a plakietka
			 * i przyciski w osobnym rzędzie pod nimi; od `sm` wszystko w jednej linii.
			 * Wcześniej jedna linia była zawsze — i przy plakietce modelu plus dwóch
			 * przyciskach z nazw zostawało „U. – Seps…". Nazwy są tu najważniejsze,
			 * więc to one dostają całą szerokość, a narzędzia schodzą niżej.
			 */}
			<div className="pointer-events-none relative z-20 flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 sm:flex-nowrap">
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
					<div className="flex flex-col gap-0.5 text-sm font-semibold text-text sm:flex-row sm:items-center sm:gap-2">
						<span className="truncate">{home?.name}</span>
						{isLive ? (
							<span className="hidden shrink-0 rounded bg-live px-1.5 py-0.5 text-xs font-bold tabular-nums text-white sm:inline">
								{fixture.goals?.home ?? 0}:{fixture.goals?.away ?? 0}
							</span>
						) : (
							<span className="hidden shrink-0 text-xs text-muted sm:inline">–</span>
						)}
						<span className="truncate">{away?.name}</span>
					</div>
					{/* Data jest zbędna na telefonie (dzień wybiera zakładka wyżej); stan meczu na żywo — nie. */}
					<div className={cn('mt-0.5 truncate text-xs text-muted', !isLive && 'hidden sm:block')}>
						{isLive
							? fixture.fixture?.status?.long
							: formatDate(fixture.fixture.date, locale)}
					</div>
				</div>

				{/* Wynik na żywo na telefonie: obok nazw ustawionych w kolumnę, nie między nimi. */}
				{isLive && (
					<span className="shrink-0 rounded bg-live px-1.5 py-0.5 text-sm font-bold tabular-nums text-white sm:hidden">
						{fixture.goals?.home ?? 0}:{fixture.goals?.away ?? 0}
					</span>
				)}

				{/* Drugi rząd na telefonie, wcięty pod nazwy; od `sm` ciąg dalszy tej samej linii. */}
				<div className="flex basis-full items-center gap-1.5 pl-[calc(3rem+0.75rem)] sm:shrink-0 sm:basis-auto sm:pl-0">
					{/* Plakietka modelu przed widgetami: to ona niesie informację, widgety są narzędziami. */}
					<ModelHint hint={modelHint} t={t} />

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
						className="ml-auto shrink-0 text-border-strong transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:text-accent sm:ml-0"
					/>
				</div>
			</div>
		</div>
	);
}
