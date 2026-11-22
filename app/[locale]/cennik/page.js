import PricingClient from '@/components/pricing/PricingClient';
import { buildMetadata } from '@/lib/seo/metadata';
import { pricingMetaDescription } from '@/lib/billing/planTexts';
import { PRO_WEEK } from '@/lib/billing/plans';

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
		// Tytuł w wynikach wyszukiwania mówi to samo co pierwsze zdanie strony: najtańsze wejście z ceną z planów.
		title:
			locale === 'en'
				? `Pricing — Pro for ${PRO_WEEK.days} days for ${PRO_WEEK.priceGrosze / 100} zł`
				: `Cennik — Pro na ${PRO_WEEK.days} dni za ${PRO_WEEK.priceGrosze / 100} zł`,
		// Liczby z planów — opis w wynikach wyszukiwania nie może obiecywać innych limitów niż karty.
		description: pricingMetaDescription(locale),
	});
}

export default function Page() {
	return <PricingClient />;
}
