'use client';

import { useTranslations } from 'next-intl';
import { ChevronRight, Lock, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * „Model widzi" — najmocniejsze typy modelu na wybrany dzień, obok listy meczów.
 *
 * Ta sama piątka, którą dostaje poranny mail, tylko na stronie i dla każdego dnia
 * z zakładek. Powód: lista 400 meczów z plakietkami mówi „model ma tu coś", ale trzeba
 * ją przewinąć, żeby to znaleźć. Tu konkret jest od razu — mecz, selekcja, procent,
 * godzina — i prowadzi jednym kliknięciem do analizy.
 *
 * Na telefonie pasek do przewijania w bok nad listą (pięć kart, każda na ~2/3 ekranu,
 * z przyciąganiem), na szerokim ekranie kolumna z prawej, przyklejona przy przewijaniu.
 * Plan darmowy widzi mecze i godziny, ale zamiast selekcji kłódkę — tak samo jak na
 * plakietkach listy: wiadomo ILE model ma do powiedzenia, nie CO.
 */

function czas(iso, locale) {
	return new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function Pick({ pick, locale, t }) {
	const locked = !pick.hint || pick.hint.locked;
	return (
		<Link
			href={`/mecz/${pick.fixtureId}`}
			className={cn(
				'group flex h-full flex-col gap-1 rounded-[var(--radius-ui)] border border-border bg-surface-2 px-3.5 py-3 no-underline',
				'transition-colors hover:border-accent',
				'lg:rounded-none lg:border-0 lg:border-t lg:border-border lg:bg-transparent lg:px-4 lg:hover:bg-surface-2'
			)}
		>
			<p className="truncate text-sm font-bold text-text">
				{pick.home} – {pick.away}
			</p>
			{locked ? (
				<p className="inline-flex items-center gap-1.5 text-xs text-muted">
					<Lock size={11} aria-hidden="true" />
					{t('model_sees_locked')}
				</p>
			) : (
				<p className="text-sm text-text">
					<span className="font-semibold text-accent">{pick.hint.selection}</span>
					<span className="tabular-nums"> · {pick.hint.probability}%</span>
					<span className="text-muted"> ({t('model_sees_usual', { base: Math.round(pick.hint.base) })})</span>
				</p>
			)}
			<p className="mt-auto flex items-center gap-1 text-xs text-muted">
				<span className="tabular-nums">{czas(pick.kickoff, locale)}</span>
				{pick.league && (
					<>
						<span aria-hidden="true">·</span>
						<span className="truncate">{pick.league}</span>
					</>
				)}
				<ChevronRight
					size={14}
					aria-hidden="true"
					className="ml-auto shrink-0 text-border-strong transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-accent"
				/>
			</p>
		</Link>
	);
}

export default function ModelPicksPanel({ picks, count, full, dateLabel, locale, className }) {
	const t = useTranslations('common');
	if (!picks?.length) return null;

	return (
		<aside
			aria-labelledby="model-sees-title"
			className={cn('rounded-[var(--radius-ui)] border border-border bg-surface', className)}
		>
			<div className="px-4 pb-3 pt-3.5">
				<div className="flex items-center gap-2">
					<Sparkles size={15} aria-hidden="true" className="shrink-0 text-accent" />
					<h2 id="model-sees-title" className="text-sm font-bold uppercase tracking-wide text-text">
						{t('model_sees_title')}
					</h2>
					<span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">
						{dateLabel}
					</span>
				</div>
				<p className="mt-1 text-xs leading-relaxed text-muted">
					{count > picks.length
						? t('model_sees_top', { shown: picks.length, count })
						: t('model_sees_all', { count })}
				</p>
			</div>

			<ol
				className={cn(
					// Telefon: pasek w bok. Szeroki ekran: kolumna — pozycje oddziela górna krawędź.
					'flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-4 [scrollbar-width:thin]',
					'lg:flex-col lg:gap-0 lg:overflow-visible lg:px-0 lg:pb-0'
				)}
			>
				{picks.map((pick) => (
					<li key={pick.fixtureId} className="w-[68vw] max-w-[260px] shrink-0 snap-start lg:w-auto lg:max-w-none">
						<Pick pick={pick} locale={locale} t={t} />
					</li>
				))}
			</ol>

			<p className="border-t border-border px-4 py-3 text-xs leading-relaxed text-muted">
				{full ? (
					t('model_sees_note')
				) : (
					<>
						{t('model_sees_locked_note')}{' '}
						<Link href="/cennik" className="font-semibold text-accent underline">
							{t('see_plans')}
						</Link>
					</>
				)}
			</p>
		</aside>
	);
}
