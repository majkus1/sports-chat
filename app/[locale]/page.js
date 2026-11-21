import { getTranslations } from 'next-intl/server';
import AppShell from '@/components/layout/AppShell';
import {
	Faq,
	Features,
	FinalCta,
	Hero,
	HowItWorks,
	Pricing,
	Problem,
	Register,
	Sports,
} from '@/components/landing/LandingSections';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, faqLd, organizationLd, webApplicationLd, websiteLd } from '@/lib/seo/jsonLd';
import { MethodTeaser } from '@/components/method/MethodSections';
import DailyPickTeaser from '@/components/landing/DailyPickTeaser';
import CouponTeaser from '@/components/coupons/CouponTeaser';
import ValueTeaser from '@/components/value/ValueTeaser';
import { valueContent } from '@/lib/value/content';
import { landingContent } from '@/lib/landing/content';
import { methodContent } from '@/lib/landing/method';
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
				? 'Sports Chat — AI match analysis in 30 seconds and a public pick register'
				: 'Czat Sportowy — analiza meczu od AI w 30 sekund i publiczny rejestr typów',
		// Bez obietnic zysku: rejestr i rozliczenie, nie „przewaga" (model jeszcze nie bije rynku).
		description:
			locale === 'en'
				? 'A numbers model and AI break a match down into chances and reasons — result, double chance, a team to score, over 2.5 goals. Every pick is recorded before kick-off in a public register and settled after the match, misses included. Free, no card.'
				: 'Model liczbowy i AI rozkładają mecz na szanse i powody: wynik, podwójna szansa, gol drużyny, powyżej 2,5 gola. Każdy typ zapisujemy przed meczem w publicznym rejestrze i rozliczamy po meczu — chybione też. Za darmo, bez karty.',
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
	const tt = await getTranslations('trust');
	const content = landingContent(locale);
	const method = methodContent(locale);
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
			{/*
			 * Kolejność: analiza w 30 sekund (nagłówek) → sprawdzalny wynik (rejestr typów z CLV) →
			 * narzędzia. Rejestr przed typem dnia i kuponami: najpierw dowód, potem oferta.
			 */}
			<Register content={content.register} note={tt('landing_note')} />
			{/* Typ dnia pod rejestrem — konkretny przykład tego, co rejestr rozlicza. */}
			<DailyPickTeaser />
			<CouponTeaser />
			{/* Wyższe kursy pod kuponami — bez liczb (strona główna nie pyta bazy o bilans). */}
			<section className="px-5 pb-12" aria-label={valueContent(locale).teaserTitle}>
				<div className="mx-auto w-full max-w-4xl">
					<ValueTeaser c={valueContent(locale)} compact />
				</div>
			</section>
			<Problem content={content.problem} />
			<Features content={content.features} />
			<HowItWorks content={content.how} />
			<MethodTeaser content={method.teaser} />
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
