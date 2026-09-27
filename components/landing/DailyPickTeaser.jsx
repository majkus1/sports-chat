'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import DailyPickCard from '@/components/today/DailyPickCard';
import { todayPicksContent } from '@/lib/landing/todayPicks';

/**
 * Typ dnia na stronie głównej — dowód zamiast obietnicy, tuż pod nagłówkiem.
 *
 * Doczytywany po załadowaniu, żeby strona główna została statyczna i szybka; pełną wersję
 * dla wyszukiwarki ma strona „Typy na dziś". Bez typu dnia sekcja po prostu się nie pokazuje.
 */
export default function DailyPickTeaser() {
	const locale = useLocale();
	const c = todayPicksContent(locale);
	const [dane, setDane] = useState(null);

	useEffect(() => {
		let anulowane = false;
		fetch('/api/daily-pick')
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane) setDane(d);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, []);

	const pick = dane?.today && dane.today.status === 'pending' && new Date(dane.today.kickoff) > new Date() ? dane.today : dane?.tomorrow || dane?.today;
	if (!pick) return null;
	const label = pick === dane?.tomorrow ? c.tomorrowLabel : c.dailyLabel;

	return (
		<section className="px-5 pb-12" aria-label={label}>
			<div className="mx-auto w-full max-w-xl">
				<DailyPickCard pick={pick} c={c} label={label} locale={locale} compact />
				<div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
					{dane.record?.total > 0 ? <span className="text-muted">{c.record(dane.record.won, dane.record.total)}</span> : <span />}
					<Link href="/typy-na-dzis" className="inline-flex items-center gap-1.5 font-bold text-accent no-underline hover:underline">
						{locale === 'en' ? 'All of today’s picks' : 'Wszystkie typy na dziś'}
						<ArrowRight size={15} aria-hidden="true" />
					</Link>
				</div>
			</div>
		</section>
	);
}
