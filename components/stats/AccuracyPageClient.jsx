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
import { useUrlState } from '@/lib/hooks/useUrlState';

/**
 * Publiczna skuteczność wszystkich typów wygenerowanych w serwisie.
 *
 * Strona jest dostępna bez logowania i celowo pokazuje też typy chybione, pominięte
 * i oczekujące. To jedyny sposób, żeby uzasadnić płatny plan czymś innym niż obietnicą.
 *
 * Zakładka i okres są w adresie (`?kind=coupon_3d&days=30`): wejście w mecz z listy kuponów
 * i „Wstecz" wraca do tej samej zakładki, a z innych stron można linkować prosto do niej.
 */
export default function AccuracyPageClient() {
	const t = useTranslations('common');
	const locale = useLocale();
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
