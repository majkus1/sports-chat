import AccuracyPageClient from '@/components/stats/AccuracyPageClient';
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
		path: '/pilka-nozna/skutecznosc',
		title: locale === 'en' ? 'AI accuracy — hits and misses' : 'Skuteczność analiz AI — trafienia i chyby',
		description:
			locale === 'en'
				? 'We publish everything: hits, misses and skipped picks. Every pick is settled automatically after the match against the official result.'
				: 'Pokazujemy wszystko: trafienia, chybienia i typy pominięte. Każdy typ rozliczamy automatycznie po meczu na podstawie oficjalnego wyniku.',
	});
}

export default function Page() {
	return <AccuracyPageClient />;
}
