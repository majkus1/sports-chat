import LiveClient from '@/components/football/LiveClient';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Trasa serwerowa: dostarcza metadane, treść renderuje komponent kliencki.
 *
 * Rozdzielenie jest wymuszone przez Next.js — komponent oznaczony `'use client'` nie może
 * eksportować metadanych, więc dopóki cała strona była kliencka, nie miała ani tytułu,
 * ani opisu, ani adresu kanonicznego.
 */
export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/pilka-nozna/live',
		title: locale === 'en' ? 'Live matches — scores and analysis' : 'Mecze na żywo — wyniki i analizy AI',
		description:
			locale === 'en'
				? 'Follow matches in play: live scores, statistics and events, plus AI analysis updated as the game develops. Chat in every match room.'
				: 'Śledź trwające mecze: wyniki, statystyki i wydarzenia na żywo oraz analizę AI aktualizowaną w trakcie gry. Czat przy każdym spotkaniu.',
	});
}

export default function Page() {
	return <LiveClient />;
}
