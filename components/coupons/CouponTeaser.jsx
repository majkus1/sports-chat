'use client';

import { useContext, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { UserContext, useAuthKey } from '@/context/UserContext';
import CouponsBlock from '@/components/coupons/CouponsBlock';
import { couponContent } from '@/lib/coupons/content';

/**
 * Kupony na stronie głównej, pod typem dnia — doczytywane po załadowaniu (z sesją: plan
 * decyduje, czy 3- i 5-dniowy są odkryte), żeby strona główna została statyczna. Bez kuponu
 * w grze sekcja się nie pokazuje; pełną wersję ma strona „Typy na dziś".
 */
export default function CouponTeaser() {
	const locale = useLocale();
	const c = couponContent(locale);
	const { isAuthed } = useContext(UserContext);
	const authKey = useAuthKey();
	const [dane, setDane] = useState(null);

	useEffect(() => {
		if (!authKey) return undefined;
		let anulowane = false;
		fetch('/api/coupons', { credentials: 'include', cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane) setDane(d);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, [authKey]);

	const wGrze = (k) => k && k.status === 'pending' && (k.locked || k.legs?.length > 0);
	if (!dane || ![dane.today, dane.days3, dane.days5].some(wGrze)) return null;
	const rekord = dane.record?.daily;

	return (
		<section className="px-5 pb-12" aria-labelledby="kupony-glowna">
			<div className="mx-auto w-full max-w-4xl">
				<h2 id="kupony-glowna" className="mb-3 font-display text-xl font-bold uppercase tracking-wide text-text">
					{c.sectionTitle}
				</h2>
				<CouponsBlock data={dane} c={c} locale={locale} compact guest={!isAuthed} />
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
