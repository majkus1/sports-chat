import { LOCALES, SITE_URL } from '@/lib/seo/config';
import { leaguePath } from '@/lib/seo/leagues';

/**
 * Wpisy mapy witryny dla stron „typy na dziś [liga]" — tylko lig, które dziś albo jutro grają.
 *
 * Mapa wskazuje to, co ma się znaleźć w indeksie. Strona ligi bez meczów ma `noindex`, więc gdyby
 * stała w mapie, wysyłalibyśmy wyszukiwarce sprzeczne sygnały („zaindeksuj" i „nie indeksuj"),
 * a Search Console zgłasza to jako błąd. Lista aktywnych lig przychodzi z `activeLeaguePages`.
 *
 * @param {Array<{ league: object, matches: number }>} active
 */
export function leagueSitemapEntries(active, now = new Date()) {
	return (active || [])
		.filter((x) => x?.league && x.matches > 0)
		.flatMap(({ league }) => {
			const path = leaguePath(league);
			return LOCALES.map((locale) => ({
				url: `${SITE_URL}/${locale}${path}`,
				lastModified: now,
				// Zmienia się z każdą nową prognozą w dzienniku — tuż pod ogólnymi „Typami na dziś" (0,95).
				changeFrequency: 'hourly',
				priority: 0.85,
				alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])) },
			}));
		});
}
