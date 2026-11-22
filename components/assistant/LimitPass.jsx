'use client';

import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PRO_WEEK } from '@/lib/billing/plans';
import { formatZl } from '@/lib/billing/offers';
import { pricingHref } from '@/lib/upsell/placements';
import { cn } from '@/lib/utils';

/**
 * Wyczerpany limit = wyjście z ceną.
 *
 * Komunikat o końcu puli to chwila największej chęci zakupu: ktoś właśnie chciał zapytać,
 * przeczytać analizę albo wygenerować raport. Dawniej dostawał martwe zdanie i co najwyżej
 * „Zobacz plany". Teraz jedno zdanie z tym, co daje Pro na 7 dni, i przycisk z ceną — liczby
 * z `PRO_WEEK` w `lib/billing/plans.js`, nie wpisane ręcznie.
 *
 * @param {{ kind: 'chat'|'analysis'|'analysis_view'|'report', limit?: number, className?: string }} props
 */
export default function LimitPass({ kind, limit, className }) {
	const t = useTranslations('ux_p4');
	const locale = useLocale();
	const price = formatZl(PRO_WEEK.priceGrosze, locale);
	const days = PRO_WEEK.days;

	const text = {
		// Gotowe analizy w Pro na 7 dni są bez limitu (`analysisView: null`) — stąd zdanie bez liczby.
		analysis_view: () => t('analysis_view_limit_pass', { limit: limit ?? 0, days, price }),
		analysis: () => t('analysis_limit_pass', { days, analyses: PRO_WEEK.limits.analysis, price }),
		report: () => t('report_limit_pass', { days, reports: PRO_WEEK.limits.report, price }),
		chat: () => t('ai_chat_limit_pass', { days, questions: PRO_WEEK.limits.aiChat, price }),
	}[kind]();

	return (
		<div className={cn('flex flex-col items-start gap-2', className)}>
			<p className="text-sm leading-relaxed text-text">{text}</p>
			<Link
				href={pricingHref(null)}
				className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover"
			>
				{t('buy_pass', { days, price })}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</div>
	);
}
