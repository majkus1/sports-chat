import { SITE_URL, siteFor } from '@/lib/seo/config';
import { OPERATOR } from '@/lib/legal/operator';
import { PLANS, CREDIT_PACKS } from '@/lib/billing/plans';

/**
 * Dane strukturalne (schema.org, JSON-LD).
 *
 * Dwa różne odbiory tej samej treści. Wyszukiwarki budują z niej wyniki rozszerzone —
 * gwiazdki, ceny, rozwijane pytania. Asystenci AI traktują ją jako uporządkowane fakty
 * o serwisie i chętniej cytują je niż tekst wyłuskany z układu strony.
 *
 * Warunek jest jeden i bezwzględny: każda wartość musi odpowiadać temu, co widać na stronie.
 * Dlatego cennik i pakiety pochodzą z `lib/billing/plans.js`, a dane firmy z `lib/legal/operator.js`.
 */

const ld = (obj) => ({ __html: JSON.stringify(obj) });

export function organizationLd(locale) {
	const site = siteFor(locale);
	return ld({
		'@context': 'https://schema.org',
		'@type': 'Organization',
		name: site.name,
		url: `${SITE_URL}/${locale}`,
		email: OPERATOR.email,
		logo: `${SITE_URL}/img/logo-mark.png`,
		founder: { '@type': 'Person', name: 'Michał Lipka' },
		address: {
			'@type': 'PostalAddress',
			streetAddress: 'Rynek Główny 34 lok. 15',
			postalCode: '31-010',
			addressLocality: 'Kraków',
			addressCountry: 'PL',
		},
		vatID: OPERATOR.nip,
	});
}

export function websiteLd(locale) {
	const site = siteFor(locale);
	return ld({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: site.name,
		url: `${SITE_URL}/${locale}`,
		inLanguage: locale,
		description: site.description,
	});
}

/**
 * Aplikacja wraz z cennikiem.
 *
 * Plan darmowy podajemy jako ofertę za 0 zł, a nie pomijamy: to najczęstsze pytanie
 * zadawane asystentom o dowolne narzędzie i najmocniejszy argument za wejściem.
 */
export function webApplicationLd(locale) {
	const site = siteFor(locale);
	const offers = [
		...Object.values(PLANS).map((plan) => ({
			'@type': 'Offer',
			name: plan.id === 'free' ? (locale === 'en' ? 'Free plan' : 'Plan darmowy') : plan.id.toUpperCase(),
			price: String(plan.priceMonthlyPln),
			priceCurrency: 'PLN',
			...(plan.priceMonthlyPln > 0
				? { priceSpecification: { '@type': 'UnitPriceSpecification', billingDuration: 1, billingIncrement: 1, unitCode: 'MON' } }
				: {}),
		})),
		...CREDIT_PACKS.map((pack) => ({
			'@type': 'Offer',
			name: locale === 'en' ? `${pack.credits} credits` : `${pack.credits} kredytów`,
			price: String(pack.priceGrosze / 100),
			priceCurrency: 'PLN',
		})),
	];

	return ld({
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: site.name,
		url: `${SITE_URL}/${locale}`,
		applicationCategory: 'SportsApplication',
		operatingSystem: 'Web',
		inLanguage: locale,
		description: site.description,
		offers,
	});
}

/** Sekcja pytań i odpowiedzi. Treść musi być identyczna z widoczną na stronie. */
export function faqLd(items) {
	return ld({
		'@context': 'https://schema.org',
		'@type': 'FAQPage',
		mainEntity: items.map((item) => ({
			'@type': 'Question',
			name: item.question,
			acceptedAnswer: { '@type': 'Answer', text: item.answer },
		})),
	});
}

export function articleLd({ locale, post }) {
	const site = siteFor(locale);
	return ld({
		'@context': 'https://schema.org',
		'@type': 'Article',
		headline: post.title,
		description: post.description,
		datePublished: post.publishedAt,
		dateModified: post.updatedAt || post.publishedAt,
		inLanguage: locale,
		mainEntityOfPage: `${SITE_URL}/${locale}/blog/${post.slug}`,
		author: { '@type': 'Organization', name: site.name },
		publisher: {
			'@type': 'Organization',
			name: site.name,
			logo: { '@type': 'ImageObject', url: `${SITE_URL}/img/logo-mark.png` },
		},
		keywords: post.tags?.join(', '),
	});
}

/** Okruszki nawigacyjne — pokazują się pod tytułem w wynikach zamiast surowego adresu. */
export function breadcrumbLd(locale, trail) {
	return ld({
		'@context': 'https://schema.org',
		'@type': 'BreadcrumbList',
		itemListElement: trail.map((item, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			name: item.name,
			item: `${SITE_URL}/${locale}${item.path === '/' ? '' : item.path}`,
		})),
	});
}

/** Wstawka do JSX: <JsonLd data={organizationLd(locale)} /> */
export function JsonLd({ data }) {
	return <script type="application/ld+json" dangerouslySetInnerHTML={data} />;
}
