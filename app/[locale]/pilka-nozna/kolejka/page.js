import RoundClient from '@/components/rounds/RoundClient';
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
		path: '/pilka-nozna/kolejka',
		title: locale === 'en' ? 'Weekly round and leaderboard' : 'Kolejka tygodniowa i ranking',
		description:
			locale === 'en'
				? 'The same twelve matches for everyone, one closing time and a leaderboard that resets each week. See how you compare with others.'
				: 'Ten sam zestaw dwunastu meczów dla wszystkich, jeden termin zamknięcia i ranking liczony od nowa co tydzień. Sprawdź, jak wypadasz.',
	});
}

export default function Page() {
	return <RoundClient />;
}
