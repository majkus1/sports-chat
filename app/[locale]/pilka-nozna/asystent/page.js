import AssistantClient from '@/components/assistant/AssistantClient';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * Asystent całej oferty — strona rozmowy o wszystkich meczach dnia.
 *
 * Treść jest kliencka (rozmowa wymaga sesji), metadane serwerowe — ten sam podział co
 * przy kolejce i raporcie. Strona jest w mapie witryny, bo opis tego, co asystent potrafi,
 * jest publiczny; sama rozmowa wymaga konta.
 */

export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/pilka-nozna/asystent',
		title: locale === 'en' ? 'Assistant — ask about any match today' : 'Asystent — zapytaj o dowolny dzisiejszy mecz',
		description:
			locale === 'en'
				? 'One conversation about the whole day: which matches the model rates, what it sees in a given game, and how our picks have been doing. Numbers straight from the model, explained in plain words.'
				: 'Jedna rozmowa o całym dniu: gdzie model widzi typ, co mówi o konkretnym meczu i jak idzie naszym typom. Liczby prosto z modelu, wytłumaczone po ludzku.',
	});
}

export default function Page() {
	return <AssistantClient />;
}
