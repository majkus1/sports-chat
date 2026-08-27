import { SITE_URL } from '@/lib/seo/config';

/**
 * robots.txt generowany przez Next.js.
 *
 * Pokoje meczowe blokujemy świadomie, mimo że to najliczniejsze strony serwisu. Każdy mecz
 * to osobny adres o kilkugodzinnej wartości i treści niemal identycznej z sąsiednim; przy
 * kilkuset spotkaniach dziennie robot zająłby się wyłącznie nimi i nie dotarłby do stron,
 * na których naprawdę zależy. Blokada w robots.txt idzie w parze z `noindex` w metadanych
 * tych stron — sam plik nie usuwa z indeksu adresu, który już się w nim znalazł.
 */
export default function robots() {
	return {
		rules: [
			{
				userAgent: '*',
				allow: '/',
				disallow: [
					'/api/',
					'/pl/mecz/',
					'/en/mecz/',
					'/pl/pilka-nozna/raport/',
					'/en/pilka-nozna/raport/',
					'/pl/reset-password',
					'/en/reset-password',
					'/pl/verify-email',
					'/en/verify-email',
				],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
