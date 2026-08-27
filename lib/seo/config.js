/**
 * Stałe potrzebne do metadanych i danych strukturalnych.
 *
 * Adres bierzemy ze zmiennej środowiskowej, bo canonical wskazujący na `localhost` w wersji
 * produkcyjnej wyklucza stronę z indeksu skuteczniej niż jakikolwiek `noindex`.
 */

export const SITE_URL = (process.env.APP_URL || 'https://czatsportowy.pl').replace(/\/$/, '');

/** Języki serwisu w kolejności ważności; pierwszy jest domyślny. */
export const LOCALES = ['pl', 'en'];

export const SITE = {
	pl: {
		name: 'Czat Sportowy',
		tagline: 'Analizy AI i czat na żywo przy meczach',
		description:
			'Analizy meczów tworzone przez AI, czat na żywo przy każdym spotkaniu i typowanie ' +
			'ze statystyką skuteczności. Zacznij za darmo, bez karty.',
		ogLocale: 'pl_PL',
	},
	en: {
		name: 'Sports Chat',
		tagline: 'AI match analysis and live chat',
		description:
			'AI-written match analyses, live chat in every match room and picks with public ' +
			'accuracy statistics. Start free, no card required.',
		ogLocale: 'en_GB',
	},
};

export function siteFor(locale) {
	return SITE[locale] || SITE.pl;
}

/**
 * Ścieżki, które nigdy nie mają trafić do indeksu.
 *
 * Pokoje meczowe to dziesiątki tysięcy niemal identycznych adresów o krótkim życiu —
 * zjadłyby budżet indeksowania i rozmyły strony, na których naprawdę nam zależy.
 * Raporty i ekrany konta są prywatne z natury.
 */
export const NOINDEX_PREFIXES = ['/mecz/', '/pilka-nozna/raport/', '/reset-password', '/verify-email'];
