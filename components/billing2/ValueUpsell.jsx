'use client';

import { useB2 } from '@/components/billing2/useB2';
import UpsellNudge from '@/components/billing2/UpsellNudge';
import { useUpsellContext } from '@/components/billing2/useUpsellContext';
import { PRO_WEEK } from '@/lib/billing/plans';

/**
 * „Pełna lista dla Pro" pod zapowiedzią „Wyższych kursów" (`components/value/ValueTeaser`).
 *
 * Zapowiedź pokazuje bilans i prowadzi do raportu, ale bez planu raport kosztuje kredyty, o czym
 * mówił dopiero drobny druk. Tu wprost: pełną listę daje Pro, a wejście to przepustka na 7 dni.
 * Płacący (i administrator) jej nie widzą; dopóki nie wiadomo, kto patrzy — też nie.
 */
export default function ValueUpsell({ className }) {
	const t = useB2();
	const ctx = useUpsellContext();
	if (!ctx || ctx.paid) return null;

	return (
		<UpsellNudge
			placement="value_list"
			title={t('nudge_value_title')}
			body={`${t('nudge_value_body', { price: String(PRO_WEEK.priceGrosze / 100) })} ${t('nudge_18')}`}
			cta={t('nudge_value_title')}
			hideDays={7}
			className={className}
		/>
	);
}
