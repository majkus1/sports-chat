'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import BallIcon from '@/components/icons/BallIcon';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import AccuracyPanel, {
	ACCURACY_RANGES,
	DEFAULT_KIND,
	DEFAULT_RANGE,
	PUBLIC_KINDS,
} from '@/components/stats/AccuracyPanel';
import Leaderboard from '@/components/stats/Leaderboard';
import RegisterPanel from '@/components/trust/RegisterPanel';
import { replaceSearchParams, useUrlState } from '@/lib/hooks/useUrlState';
import { ACCURACY_VIEWS, DEFAULT_VIEW } from '@/lib/trust/params';
import { cn } from '@/lib/utils';

/**
 * Publiczna skuteczność wszystkich typów wygenerowanych w serwisie.
 *
 * Strona jest dostępna bez logowania i celowo pokazuje też typy chybione, pominięte
 * i oczekujące. To jedyny sposób, żeby uzasadnić płatny plan czymś innym niż obietnicą.
 *
 * Zakładka i okres są w adresie (`?kind=coupon_3d&days=30`): wejście w mecz z listy kuponów
 * i „Wstecz" wraca do tej samej zakładki, a z innych stron można linkować prosto do niej.
 *
 * Dwa widoki (`?view=register`): statystyka skuteczności i rejestr typów (`components/trust`)
 * — każdy typ z godziną publikacji, kursem z rana i zamknięcia, CLV i wynikiem. Osobny widok,
 * nie kolejna pigułka rodzaju: rejestr ma własne filtry (okres, rynek, liga) i własną listę.
 */
export default function AccuracyPageClient() {
	const t = useTranslations('common');
	const tt = useTranslations('trust');
	const locale = useLocale();
	const [view] = useUrlState('view', { allowed: ACCURACY_VIEWS, fallback: DEFAULT_VIEW });
	// Przełączenie widoku zeruje stronę listy rejestru — numer strony nie ma sensu w drugim widoku.
	const setView = (v) => replaceSearchParams({ view: v === DEFAULT_VIEW ? null : v, page: null });
	const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
	const { gameId: detailsGameId, close: closeGameDetails } = useGameDetailsModal();
	const [kind, setKind] = useUrlState('kind', { allowed: PUBLIC_KINDS, fallback: DEFAULT_KIND });
	const [days, setDays] = useUrlState('days', { allowed: ACCURACY_RANGES, fallback: DEFAULT_RANGE });

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
					{/* Przełącznik widoków — u góry, żeby rejestr był widoczny bez przewijania statystyk. */}
					<div
						role="tablist"
						aria-label={tt('tabs_label')}
						className="mb-6 inline-flex max-w-full items-center gap-0.5 rounded-full border border-border bg-surface-2 p-1"
					>
						{ACCURACY_VIEWS.map((v) => (
							<button
								key={v}
								type="button"
								role="tab"
								aria-selected={view === v}
								onClick={() => setView(v)}
								className={cn(
									'whitespace-nowrap rounded-full border-0 px-4 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
									view === v ? 'bg-brand text-brand-fg shadow-sm' : 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
								)}
							>
								{v === 'register' ? tt('tab_register') : tt('tab_stats')}
							</button>
						))}
					</div>

					{view === 'register' ? (
						<RegisterPanel rememberScroll />
					) : (
						<>
							<h2 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
								{t('accuracy_title')}
							</h2>
							<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('accuracy_intro')}</p>

							<AccuracyPanel
								scope="global"
								className="mt-6"
								view={{ kind, setKind, days, setDays }}
								rememberScroll
							/>

							<section className="mt-10">
								<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">
									{t('leaderboard_title')}
								</h2>
								<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('leaderboard_intro')}</p>
								<Leaderboard className="mt-4" />
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
