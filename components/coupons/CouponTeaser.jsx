'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import CouponsBlock from '@/components/coupons/CouponsBlock';
import { couponContent } from '@/lib/coupons/content';
import { cn } from '@/lib/utils';

/**
 * Kupony na stronie głównej, pod typem dnia — doczytywane po załadowaniu, jak typ dnia, żeby
 * strona główna została statyczna. Bez kuponu w grze sekcja się nie pokazuje; pełną wersję
 * (z wczorajszym wynikiem i informacją „o 9:30") ma strona „Typy na dziś".
 */
export default function CouponTeaser() {
	const locale = useLocale();
	const c = couponContent(locale);
	const [dane, setDane] = useState(null);

	useEffect(() => {
		let anulowane = false;
		fetch('/api/coupons')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane) setDane(d);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, []);

	const dzienny = dane?.today?.legs?.length > 0;
	const weekend = dane?.weekend?.legs?.length > 0 && Math.max(...dane.weekend.legs.map((l) => Date.parse(l.kickoff))) >= Date.now() - 24 * 3600_000;
	if (!dzienny && !weekend) return null;
	const rekord = dane.record?.daily;

	return (
		<section className="px-5 pb-12" aria-labelledby="kupony-glowna">
			<div className={cn('mx-auto w-full', dzienny && weekend ? 'max-w-4xl' : 'max-w-xl')}>
				<h2 id="kupony-glowna" className="mb-3 font-display text-xl font-bold uppercase tracking-wide text-text">
					{c.sectionTitle}
				</h2>
				<CouponsBlock data={dane} c={c} locale={locale} compact />
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
					{rekord?.total > 0 ? <span className="text-muted">{c.record('daily', rekord.won, rekord.total)}</span> : <span className="text-xs text-muted">18+</span>}
					<Link href="/typy-na-dzis" className="inline-flex items-center gap-1.5 font-bold text-accent no-underline hover:underline">
						{c.seeAll}
						<ArrowRight size={15} aria-hidden="true" />
					</Link>
				</div>
			</div>
		</section>
	);
}
