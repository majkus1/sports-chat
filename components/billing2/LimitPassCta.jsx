'use client';

import { useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useB2 } from '@/components/billing2/useB2';
import { LIMIT_KEYS, LIMIT_PLACEMENTS, limitPassValues } from '@/components/billing2/limitPass';
import { useUpsellContext } from '@/components/billing2/useUpsellContext';
import { useUpsellView } from '@/components/billing2/useUpsellView';
import { pricingHref } from '@/lib/upsell/placements';
import { trackUpsell } from '@/lib/upsell/track';
import { cn } from '@/lib/utils';

/**
 * Wyjście z wyczerpanego limitu: jedno zdanie z ceną i przycisk „Kup 7 dni za 19 zł".
 *
 * DLACZEGO. Do 22.11.2026 komunikat o końcu limitu („Wykorzystałeś miesięczny limit pytań…")
 * był martwym zdaniem — w chwili, w której gracz najbardziej chce dalej, nie dostawał ani ceny,
 * ani przycisku. Liczby (dni, cena, limity przepustki) idą z `PRO_WEEK`, nie z tłumaczeń.
 *
 * Płacący jej nie widzą (przepustki nie da się kupić w trakcie planu na 30 dni), a dopóki nie
 * wiadomo, kto patrzy — też nie, żeby płacącemu nie mignęła oferta.
 *
 * Użycie: `<LimitPassCta kind="aiChat" />` pod komunikatem o limicie.
 */

/**
 * @param {{ kind: 'analysis'|'aiChat'|'analysisView'|'report', placement?: string, className?: string }} props
 *   `placement` — inne miejsce pomiaru niż domyślne dla rodzaju (np. `panel_plan`)
 */
export default function LimitPassCta({ kind, placement, className }) {
	const u = useTranslations('ux_p2');
	const t = useB2();
	const locale = useLocale();
	const ctx = useUpsellContext();
	const ref = useRef(null);
	const miejsce = placement || LIMIT_PLACEMENTS[kind];
	const widoczna = Boolean(ctx && !ctx.paid && LIMIT_KEYS[kind]);
	useUpsellView(ref, miejsce, widoczna);

	if (!widoczna) return null;

	return (
		<div
			ref={ref}
			className={cn(
				'flex flex-col gap-2 rounded-[var(--radius-ui)] border border-accent/40 bg-accent-soft px-4 py-3 sm:flex-row sm:items-center sm:gap-4',
				className
			)}
		>
			<p className="flex-1 text-sm leading-relaxed text-text">{u(LIMIT_KEYS[kind], limitPassValues(locale))}</p>
			<Link
				href={pricingHref(miejsce)}
				onClick={() => trackUpsell(miejsce, 'click')}
				className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
			>
				{t('buy_week')}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</div>
	);
}
