import PricingClient from '@/components/pricing/PricingClient';
import { buildMetadata } from '@/lib/seo/metadata';
import { pricingMetaDescription } from '@/lib/billing/planTexts';

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
		// Liczby z planów — opis w wynikach wyszukiwania nie może obiecywać innych limitów niż karty.
		description: pricingMetaDescription(locale),
	});
}

export default function Page() {
	return <PricingClient />;
}
