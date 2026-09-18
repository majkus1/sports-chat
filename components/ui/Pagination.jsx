'use client';

import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Stronicowanie listy — jeden rząd, który mieści się na telefonie.
 *
 * Poprzednia wersja układała się na mobile w trzy piętra: „POPRZEDNIA" nad numerami,
 * „NASTĘPNA" pod nimi, a zdanie o zakresie jeszcze wyżej. Zajmowało to pół ekranu
 * i wyglądało jak trzy osobne kontrolki. Tu wszystko jest w jednej linii: strzałka,
 * numery, strzałka — 40-pikselowe pola trafiają się kciukiem, a siedem pól z odstępami
 * to ~320 px, czyli mieści się na najwęższym telefonie. Etykiety „Poprzednia/Następna"
 * pokazują się dopiero od szerokości `sm`, gdzie jest na nie miejsce.
 *
 * Numery to zawsze okno pięciu stron wokół bieżącej, bo wielokropki i skoki do
 * pierwszej/ostatniej niczego tu nie dodają — lista meczów rzadko ma więcej niż
 * dziesięć stron, a użytkownik i tak idzie po niej strzałkami.
 */
function pageWindow(current, total) {
	const size = Math.min(5, total);
	let start = 1;
	if (total > 5) {
		if (current <= 3) start = 1;
		else if (current >= total - 2) start = total - 4;
		else start = current - 2;
	}
	return Array.from({ length: size }, (_, i) => start + i);
}

export default function Pagination({ page, totalPages, total, pageSize, onChange, className }) {
	const t = useTranslations('common');
	if (!totalPages || totalPages <= 1) return null;

	const first = (page - 1) * pageSize + 1;
	const last = Math.min(page * pageSize, total);
	const isFirst = page <= 1;
	const isLast = page >= totalPages;

	const arrow =
		'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-[var(--radius-ui)] border border-border bg-surface px-2.5 text-sm font-semibold text-text transition-colors hover:border-brand hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-40';

	return (
		<nav aria-label={t('page')} className={cn('flex flex-col items-center gap-2', className)}>
			<p className="text-xs text-muted">
				{t('page')} <span className="font-semibold text-text">{page}</span> {t('of')} {totalPages}
				<span className="mx-1.5" aria-hidden="true">
					·
				</span>
				{first}–{last} {t('of')} {total} {t('matches')}
			</p>

			<div className="flex items-center gap-1.5">
				<button type="button" onClick={() => onChange(page - 1)} disabled={isFirst} className={arrow} aria-label={t('prev_page')}>
					<ChevronLeft size={18} aria-hidden="true" />
					<span className="hidden sm:inline">{t('prev_page')}</span>
				</button>

				{pageWindow(page, totalPages).map((n) => {
					const active = n === page;
					return (
						<button
							key={n}
							type="button"
							onClick={() => onChange(n)}
							aria-current={active ? 'page' : undefined}
							className={cn(
								'inline-flex h-10 min-w-10 items-center justify-center rounded-[var(--radius-ui)] border px-2 text-sm tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
								active
									? 'border-brand bg-brand font-bold text-brand-fg'
									: 'border-border bg-surface text-text hover:border-brand hover:bg-surface-2'
							)}
						>
							{n}
						</button>
					);
				})}

				<button type="button" onClick={() => onChange(page + 1)} disabled={isLast} className={arrow} aria-label={t('next_page')}>
					<span className="hidden sm:inline">{t('next_page')}</span>
					<ChevronRight size={18} aria-hidden="true" />
				</button>
			</div>
		</nav>
	);
}
