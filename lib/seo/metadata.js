import { LOCALES, SITE_URL, siteFor } from '@/lib/seo/config';

/**
 * Budowanie metadanych stron.
 *
 * Jedna funkcja zamiast obiektu `metadata` pisanego ręcznie na każdej trasie. Powód jest
 * prozaiczny: komplet to canonical, hreflang dla obu języków, Open Graph i karta Twittera —
 * przy ręcznym przepisywaniu połowa stron dostałaby zestaw niepełny, a błąd w canonical
 * potrafi wykluczyć stronę z wyników bez żadnego widocznego objawu.
 */

/**
 * @param {object} options
 * @param {string} [options.title] tytuł strony bez nazwy serwisu — dokłada ją szablon z layoutu
 * @param {string} [options.description] opis; docelowo 130–155 znaków
 * @param {string} options.path ścieżka BEZ prefiksu języka, np. `/cennik`
 * @param {string} options.locale
 * @param {boolean} [options.noindex] wyłącza stronę z indeksu
 * @param {'website'|'article'} [options.type]
 * @param {object} [options.article] `{ publishedTime, modifiedTime, tags }` dla wpisów bloga
 */
export function buildMetadata({
	title,
	description,
	path = '',
	locale = 'pl',
	noindex = false,
	type = 'website',
	article,
}) {
	const site = siteFor(locale);
	const clean = path === '/' ? '' : path;
	const canonical = `${SITE_URL}/${locale}${clean}`;

	/*
	 * Hreflang wskazuje wszystkie wersje językowe, także bieżącą — tego wymaga specyfikacja.
	 * `x-default` prowadzi na polską: to język domyślny serwisu i większość ruchu.
	 */
	const languages = Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${clean}`]));
	languages['x-default'] = `${SITE_URL}/pl${clean}`;

	return {
		title,
		description: description || site.description,
		alternates: { canonical, languages },
		robots: noindex
			? { index: false, follow: false, googleBot: { index: false, follow: false } }
			: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
		openGraph: {
			type,
			url: canonical,
			siteName: site.name,
			locale: site.ogLocale,
			title: title ? `${title} · ${site.name}` : `${site.name} — ${site.tagline}`,
			description: description || site.description,
			...(article
				? {
						publishedTime: article.publishedTime,
						modifiedTime: article.modifiedTime || article.publishedTime,
						tags: article.tags,
					}
				: {}),
		},
		twitter: {
			card: 'summary_large_image',
			title: title ? `${title} · ${site.name}` : `${site.name} — ${site.tagline}`,
			description: description || site.description,
		},
	};
}
