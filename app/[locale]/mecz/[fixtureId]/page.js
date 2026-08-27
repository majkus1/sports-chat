import MatchPageClient from '@/components/match/MatchPageClient';
import { buildMetadata } from '@/lib/seo/metadata';
import { fixtureById } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';

/**
 * Trasa poza indeksem.
 *
 * Pokoi meczowych powstaje kilkaset dziennie i każdy traci wartość w ciągu doby.
 * Zaindeksowane zjadłyby budżet indeksowania i rozmyły strony, na których zależy nam
 * naprawdę — a wyszukiwarka i tak pokazywałaby wyniki sprzed tygodnia.
 *
 * `noindex` w metadanych działa niezależnie od `robots.txt`: plik prosi, żeby nie wchodzić,
 * ale nie usuwa z wyników adresu, który już się tam znalazł — a wejście z odnośnika
 * z zewnątrz nie podlega temu plikowi w ogóle.
 */
export async function generateMetadata({ params }) {
	const { locale, fixtureId } = await params;

	/*
	 * Nazwy drużyn w tytule karty przeglądarki.
	 *
	 * Strona jest poza indeksem, więc nie chodzi o wyszukiwarkę, tylko o użyteczność:
	 * przy kilku otwartych meczach naraz zakładki „Pokój meczowy" są nie do odróżnienia.
	 * Dane biorą się z tego samego, cache'owanego wywołania, którego strona i tak używa,
	 * więc koszt jest zerowy przy trafieniu w cache. Niepowodzenie cofa do nazwy ogólnej —
	 * brak tytułu byłby gorszy niż tytuł nijaki.
	 */
	let title = locale === 'en' ? 'Match room' : 'Pokój meczowy';
	try {
		const fixture = normalizeFixture((await fixtureById(fixtureId))?.[0]);
		if (fixture?.teams?.home?.name && fixture?.teams?.away?.name) {
			title = `${fixture.teams.home.name} – ${fixture.teams.away.name}`;
		}
	} catch {
		/* tytuł ogólny wystarczy */
	}

	return buildMetadata({ locale, path: `/mecz/${fixtureId}`, title, noindex: true });
}

export default function Page({ params }) {
	// Obietnicę przekazujemy dalej bez rozpakowywania — klient robi to przez `use()`.
	return <MatchPageClient params={params} />;
}
