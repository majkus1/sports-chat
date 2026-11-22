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
		title: locale === 'en' ? 'AI accuracy and pick register — hits, misses, CLV' : 'Skuteczność analiz AI i rejestr typów — trafienia, chyby, CLV',
		/*
		 * Opis wspólny dla obu widoków (`?view=register` nie zmienia adresu kanonicznego — parametry
		 * widoku nie trafiają do metadanych, jak przy zakładkach `kind` i `days`).
		 */
		description:
			locale === 'en'
				? 'We publish everything: hits, misses and skipped picks. The pick register shows every AI pick with its publication time before kick-off, the odds in the morning and at the close, CLV and the result.'
				: 'Pokazujemy wszystko: trafienia, chybienia i typy pominięte. Rejestr typów: każdy typ AI z godziną publikacji przed meczem, kursem z rana i zamknięcia, CLV i wynikiem.',
	});
}

export default function Page() {
	return <AccuracyPageClient />;
}
