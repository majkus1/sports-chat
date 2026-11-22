import AppShell from '@/components/layout/AppShell';
import { MethodDetails, MethodHero, MethodSummary } from '@/components/method/MethodSections';
import { Faq } from '@/components/landing/LandingSections';
import { methodContent } from '@/lib/landing/method';
import { methodFaqItems } from '@/lib/landing/faq';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, faqLd } from '@/lib/seo/jsonLd';

/**
 * „Jak to działa" — strona o metodzie, w całości serwerowa.
 *
 * Powstała, bo serwis obiecuje analizy oparte na danych, a nigdzie nie mówił, co to
 * właściwie znaczy. Bez tej strony „model statystyczny" jest hasłem marketingowym;
 * z nią jest sprawdzalną deklaracją, razem z listą rzeczy, których świadomie nie robimy.
 *
 * Od 22.11.2026: skrót na górze, szczegóły w `details`, a na dole pytania zdjęte ze strony
 * głównej — z własnym `FAQPage` (te same pytania co na ekranie, żadne nie powtarza się
 * z FAQPage strony głównej).
 *
 * Adres jest po polsku i bez segmentu dyscypliny, bo metoda dotyczy całego serwisu,
 * a nie jednego sportu.
 */

export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/jak-to-dziala',
		title: locale === 'en' ? 'How it works — where our numbers come from' : 'Jak to działa — skąd biorą się nasze liczby',
		description:
			locale === 'en'
				? 'A statistical model works out team strength, the AI explains it, and a pick only counts when it beats what happens anyway. Plus what we deliberately don’t do.'
				: 'Model statystyczny wylicza siłę drużyn, AI to tłumaczy, a typem nazywamy dopiero to, co przewyższa przeciętną. Do tego lista rzeczy, których świadomie nie robimy.',
	});
}

export default async function Page({ params }) {
	const { locale } = await params;
	const content = methodContent(locale);
	const faq = methodFaqItems(locale);

	return (
		<AppShell>
			<JsonLd data={faqLd(faq)} />
			<MethodHero content={content} />
			<MethodSummary content={content.summary} cta={content.cta} proofCta={content.proof.cta} />
			<MethodDetails content={content} />
			<Faq title={content.faq.title} items={faq} titleId="method-faq-title" />
		</AppShell>
	);
}
