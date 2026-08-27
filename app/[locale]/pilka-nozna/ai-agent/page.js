import ReportsHubClient from '@/components/reports/ReportsHubClient';
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
		path: '/pilka-nozna/ai-agent',
		title: locale === 'en' ? 'AI report — selected matches' : 'Raport AI — wybrane mecze',
		description:
			locale === 'en'
				? 'The report highlights a handful of fixtures worth attention over the next hours or three days, each with a short data-based reason.'
				: 'Raport wskazuje kilka spotkań wartych uwagi z najbliższych godzin lub trzech dni, każde z krótkim uzasadnieniem opartym na danych.',
	});
}

export default function Page() {
	return <ReportsHubClient />;
}
