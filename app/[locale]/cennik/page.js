import PricingClient from '@/components/pricing/PricingClient';
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
		path: '/cennik',
		title: locale === 'en' ? 'Plans, limits and credit packs' : 'Plany i limity — darmowy start',
		description:
			locale === 'en'
				? 'Start free: 5 analyses and 20 assistant questions a month plus a welcome week. Need more — buy credits once or pick a monthly plan.'
				: 'Zacznij za darmo: 5 analiz i 20 pytań miesięcznie plus tydzień powitalny. Potrzebujesz więcej — dokup kredyty albo wybierz plan miesięczny.',
	});
}

export default function Page() {
	return <PricingClient />;
}
