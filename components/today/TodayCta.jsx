'use client';

import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { useAuthKey } from '@/context/UserContext';
import { openRegister } from '@/components/today/GuestUnlock';

/** `font-sans` jawnie: bez preflightu `<button>` nie dziedziczy kroju. */
const glowny =
	'inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] border-0 bg-accent px-5 py-3 font-sans text-base font-bold text-accent-fg no-underline transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

/**
 * Zakończenie „Typów na dziś": jedno główne wezwanie zależne od tego, kto patrzy.
 *
 * Gość — „Załóż darmowe konto" (okno rejestracji) i jedno zdanie o okresie próbnym, a lista meczów
 * jako link tekstowy. Zalogowany (i robot, dopóki sesja nie jest sprawdzona) — przycisk do listy
 * meczów; zachęty do konta, które już ma, nie widzi.
 *
 * @param {{ c: object }} props `c` z `todayPicksContent`
 */
export default function TodayCta({ c }) {
	const authKey = useAuthKey();

	if (authKey === 'guest') {
		return (
			<div className="flex flex-col items-center gap-2 text-center">
				<button type="button" onClick={openRegister} className={`${glowny} w-full`}>
					{c.ctaRegister}
					<ArrowRight size={18} aria-hidden="true" />
				</button>
				<p className="text-sm text-muted">{c.ctaTrial}</p>
				<Link href="/pilka-nozna/przedmeczowe" className="text-sm font-semibold text-accent no-underline hover:underline">
					{c.ctaMatches}
				</Link>
			</div>
		);
	}

	return (
		<Link href="/pilka-nozna/przedmeczowe" className={glowny}>
			{c.ctaMatches}
			<ArrowRight size={18} aria-hidden="true" />
		</Link>
	);
}
