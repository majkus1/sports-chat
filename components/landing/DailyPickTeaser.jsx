'use client';

import { useContext, useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { UserContext } from '@/context/UserContext';
import DailyPickCard from '@/components/today/DailyPickCard';
import LockedPickCard from '@/components/landing/LockedPickCard';
import { todayPicksContent } from '@/lib/landing/todayPicks';
import { cn } from '@/lib/utils';

/**
 * Typ dnia na stronie głównej — dowód zamiast obietnicy, tuż pod nagłówkiem.
 *
 * Obok niego najmocniejszy INNY typ modelu na ten sam dzień: bez planu z liczbami za kłódką
 * (mecz widać, typ nie), w Pro, VIP i okresie próbnym odkryty. Jedna karta pokazuje, co model
 * daje za darmo, druga — że ma więcej. Plan decyduje trasa `model-hints`, ta sama co przy
 * plakietkach listy, więc strona główna nie może pokazać więcej niż lista meczów.
 *
 * Doczytywany po załadowaniu, żeby strona główna została statyczna i szybka; pełną wersję
 * dla wyszukiwarki ma strona „Typy na dziś". Bez typu dnia sekcja po prostu się nie pokazuje.
 */
export default function DailyPickTeaser() {
	const locale = useLocale();
	const c = todayPicksContent(locale);
	const { isAuthed } = useContext(UserContext);
	const [dane, setDane] = useState(null);
	const [drugi, setDrugi] = useState(null);

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

	const pick =
		dane?.today && dane.today.status === 'pending' && new Date(dane.today.kickoff) > new Date()
			? dane.today
			: dane?.tomorrow || dane?.today;

	// Druga karta: pierwszy z najmocniejszych typów tego dnia, który nie jest typem dnia i jeszcze się nie zaczął.
	useEffect(() => {
		if (!pick?.date) return undefined;
		let anulowane = false;
		fetch(`/api/football/model-hints?date=${pick.date}`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (anulowane || !Array.isArray(d?.top)) return;
				const teraz = Date.now();
				setDrugi(
					d.top.find((w) => String(w.fixtureId) !== String(pick.fixtureId) && Date.parse(w.kickoff) > teraz) || null
				);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, [pick?.date, pick?.fixtureId]);

	if (!pick) return null;
	const label = pick === dane?.tomorrow ? c.tomorrowLabel : c.dailyLabel;
	const odkryty = drugi?.hint && !drugi.hint.locked;

	return (
		<section className="px-5 pb-12" aria-label={label}>
			<div className={cn('mx-auto w-full', drugi ? 'max-w-4xl' : 'max-w-xl')}>
				<div className={cn('grid gap-4', drugi && 'md:grid-cols-2')}>
					<DailyPickCard pick={pick} c={c} label={label} locale={locale} compact className="h-full" />
					{drugi &&
						(odkryty ? (
							<DailyPickCard
								pick={{
									...drugi,
									selection: drugi.hint.selection,
									probability: drugi.hint.probability,
									base: Math.round(drugi.hint.base),
									lift: drugi.hint.lift,
									status: 'pending',
									score: null,
								}}
								c={c}
								label={c.planLabel}
								locale={locale}
								compact
								className="h-full"
							/>
						) : (
							<LockedPickCard pick={drugi} c={c} locale={locale} guest={!isAuthed} className="h-full" />
						))}
				</div>
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
