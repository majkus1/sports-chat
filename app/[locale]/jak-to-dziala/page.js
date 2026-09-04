import AppShell from '@/components/layout/AppShell';
import {
	MethodHero,
	MethodLimits,
	MethodProof,
	MethodSteps,
	MethodSummary,
	MethodThreshold,
} from '@/components/method/MethodSections';
import { methodContent } from '@/lib/landing/method';
import { buildMetadata } from '@/lib/seo/metadata';

/**
 * „Jak to liczymy" — strona o metodzie, w całości serwerowa.
 *
 * Powstała, bo serwis obiecuje analizy oparte na danych, a nigdzie nie mówił, co to
 * właściwie znaczy. Bez tej strony „model statystyczny" jest hasłem marketingowym;
 * z nią jest sprawdzalną deklaracją, razem z listą rzeczy, których świadomie nie robimy.
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

	return (
		<AppShell>
			<MethodHero content={content} />
			<MethodSummary content={content.summary} />
			<MethodSteps content={content.steps} />
			<MethodThreshold content={content.threshold} />
			<MethodLimits content={content.limits} />
			<MethodProof content={content.proof} />
		</AppShell>
	);
}
