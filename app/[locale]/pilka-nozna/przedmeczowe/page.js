import PrematchClient from '@/components/football/PrematchClient';
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
		path: '/pilka-nozna/przedmeczowe',
		title: locale === 'en' ? 'Upcoming matches and AI previews' : 'Mecze przedmeczowe i analizy AI',
		description:
			locale === 'en'
				? 'Previews for the next five days: form, table, line-ups and AI analysis. Join the match room and talk to other fans live.'
				: 'Zapowiedzi meczów z pięciu najbliższych dni: forma, tabela, składy i analiza AI. Wejdź do pokoju meczowego i rozmawiaj z kibicami na żywo.',
	});
}

export default function Page() {
	return <PrematchClient />;
}
