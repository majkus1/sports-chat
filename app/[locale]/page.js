import { getTranslations } from 'next-intl/server';
import AppShell from '@/components/layout/AppShell';
import {
	Accuracy,
	Faq,
	Features,
	FinalCta,
	Hero,
	HowItWorks,
	Pricing,
	Problem,
	Sports,
} from '@/components/landing/LandingSections';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, faqLd, organizationLd, webApplicationLd, websiteLd } from '@/lib/seo/jsonLd';
import { landingContent } from '@/lib/landing/content';
import { faqItems } from '@/lib/landing/faq';
import { SPORT_CATEGORIES } from '@/lib/navigation';
import { PUBLIC_PLANS } from '@/lib/billing/plans';
import { ANALIZY, PYTANIA, RAPORTY, odmien } from '@/lib/landing/plural';

/**
 * Strona główna — komponent serwerowy.
 *
 * Do tej pory pod tym adresem stała jedna karta „Piłka nożna". Ktoś trafiający z wyszukiwarki
 * nie miał szans dowiedzieć się, czym jest ten serwis, a wyszukiwarka nie miała czego zaindeksować:
 * strona była komponentem klienckim, więc nie mogła nawet podać własnego tytułu.
 *
 * Wybór dyscypliny nie zniknął — jest sekcją `#dyscypliny` niżej. Osobna trasa na listę
 * jednego sportu byłaby dodatkowym kliknięciem i kolejnym adresem do wypozycjonowania.
 */

export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/',
		/*
		 * Tytuł z nazwą marki wpisaną wprost.
		 *
		 * `title.template` z layoutu dokleja nazwę serwisu wyłącznie do tytułów z segmentów
		 * POTOMNYCH — strona główna leży w tym samym segmencie co layout, więc szablon jej
		 * nie obejmuje. Bez tego wynik wyszukiwania dla strony głównej byłby bez marki.
		 */
		title:
			locale === 'en'
				? 'Sports Chat — AI match analysis and live football chat'
				: 'Czat Sportowy — analizy AI i czat na żywo przy meczach',
		description:
			locale === 'en'
				? 'AI-written match analyses, live chat in every match room and picks with public accuracy stats. Start free, no card required.'
				: 'Analizy meczów tworzone przez AI, czat na żywo przy każdym spotkaniu i typowanie ze statystyką skuteczności. Zacznij za darmo, bez karty.',
	});
}

/** Krótki opis planu na landingu — pełna tabela jest w cenniku. */
function planSummary(plan, locale) {
	const analysis = plan.limits.analysis;
	const chat = plan.limits.aiChat;
	const report = plan.limits.report;

	if (locale === 'en') {
		return `${analysis} analyses · ${chat} questions · ${report || 'no'} reports per month`;
	}
	return (
		`${analysis} ${odmien(analysis, ANALIZY)} · ${chat} ${odmien(chat, PYTANIA)} · ` +
		`${report ? `${report} ${odmien(report, RAPORTY)}` : 'bez raportów'} miesięcznie`
	);
}

export default async function HomePage({ params }) {
	const { locale } = await params;
	const t = await getTranslations('common');
	const content = landingContent(locale);
	const faq = faqItems(locale);

	const plans = PUBLIC_PLANS.map((plan) => ({
		id: plan.id,
		priceMonthlyPln: plan.priceMonthlyPln,
		name: t(plan.nameKey),
		summary: planSummary(plan, locale),
	}));

	return (
		<AppShell contentClassName="px-0">
			{/* Dane strukturalne: kim jesteśmy, czym jest serwis, ile kosztuje i o co pytają ludzie. */}
			<JsonLd data={organizationLd(locale)} />
			<JsonLd data={websiteLd(locale)} />
			<JsonLd data={webApplicationLd(locale)} />
			<JsonLd data={faqLd(faq)} />

			<Hero content={content.hero} />
			<Problem content={content.problem} />
			<Features content={content.features} />
			<HowItWorks content={content.how} />
			<Accuracy content={content.accuracy} methodText={content.accuracy.method} />
			<Sports content={content.sports} categories={SPORT_CATEGORIES} labelFor={(key) => t(key)} />
			<Pricing
				content={content.pricing}
				plans={plans}
				freeLabel={t('pricing_free')}
				monthLabel={t('pricing_month')}
			/>
			<Faq title={content.faq.title} items={faq} />
			<FinalCta content={content.finalCta} note={t('footer_responsible_gaming')} />
		</AppShell>
	);
}
