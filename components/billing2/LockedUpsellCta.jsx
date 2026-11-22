'use client';

import { useEffect, useRef } from 'react';
import { useB2 } from '@/components/billing2/useB2';
import { ArrowRight, Lock } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { PRO_WEEK } from '@/lib/billing/plans';
import { pricingHref } from '@/lib/upsell/placements';
import { trackUpsell, trackUpsellView } from '@/lib/upsell/track';

/**
 * Wezwanie pod zablokowanym kuponem (3-, 5-dniowym, live): ten sam przycisk „Odblokuj" co dotąd,
 * ale prowadzi do cennika z wyróżnioną przepustką 7-dniową i źródłem do pomiaru, a pod nim
 * jedno zdanie z ceną wejścia.
 *
 * DLACZEGO. Karta z kłódką już jest podglądem (kurs łączny, szansa, liczba typów), ale przycisk
 * prowadził do cennika, którego najtańszy plan kosztował 49 zł. Kto ogląda zablokowany kupon,
 * chce zobaczyć TEN kupon dziś — 19 zł za tydzień jest odpowiedzią na to pytanie, 49 zł za miesiąc
 * nie zawsze.
 *
 * Wyświetlenie liczy się przy połowie przycisku na ekranie (nie przy wyrenderowaniu pod zgięciem).
 *
 * @param {{ placement: 'coupon_days3'|'coupon_days5'|'coupon_live', label: string, className?: string }} props
 */
export default function LockedUpsellCta({ placement, label, className = '' }) {
	const t = useB2();
	const ref = useRef(null);

	useEffect(() => {
		if (!ref.current) return undefined;
		if (typeof IntersectionObserver === 'undefined') {
			trackUpsellView(placement);
			return undefined;
		}
		const obserwator = new IntersectionObserver(
			(wpisy) => {
				if (wpisy.some((w) => w.isIntersecting)) {
					trackUpsellView(placement);
					obserwator.disconnect();
				}
			},
			{ threshold: 0.5 }
		);
		obserwator.observe(ref.current);
		return () => obserwator.disconnect();
	}, [placement]);

	return (
		<div ref={ref} className={className}>
			<Link
				href={pricingHref(placement)}
				onClick={() => trackUpsell(placement, 'click')}
				className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
			>
				<Lock size={14} aria-hidden="true" />
				{label}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
			<p className="mt-2 text-xs leading-relaxed text-muted">
				{t('nudge_coupon_hint', { price: String(PRO_WEEK.priceGrosze / 100) })}
			</p>
		</div>
	);
}
