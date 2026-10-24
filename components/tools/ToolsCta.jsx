'use client';

import { useContext } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { UserContext } from '@/context/UserContext';
import { openAccountPanel } from '@/lib/tools/accountPanel';
import { cn } from '@/lib/utils';

/**
 * Zakończenie strony narzędzi: konto, okres próbny i cennik — bez nachalności.
 *
 * Gość dostaje jedno zdanie o tym, co daje darmowe konto i tydzień próbny, i przycisk
 * rejestracji (to samo okno co w nagłówku, przez `czat:auth`). Zalogowany nie widzi zachęty
 * do zakładania konta, które już ma — tylko drogę do cennika i do swojego panelu.
 *
 * Dopóki sesja nie jest sprawdzona, przycisku rejestracji nie ma: zalogowanemu mignąłby
 * po każdym odświeżeniu strony.
 */

/** `font-sans` jawnie: bez preflightu `<button>` nie dziedziczy kroju i dostaje systemowy. */
const przycisk =
	'inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] px-5 py-3 font-sans text-sm font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export default function ToolsCta({ content: c }) {
	const ctx = useContext(UserContext);
	const sprawdzone = Boolean(ctx?.authChecked);
	const zalogowany = sprawdzone && Boolean(ctx?.isAuthed);

	return (
		<section
			aria-labelledby="narzedzia-cta"
			className="mt-14 rounded-[var(--radius-ui)] border border-border bg-surface-2 px-5 py-7 sm:px-8 sm:py-9"
		>
			<h2 id="narzedzia-cta" className="font-display text-2xl font-bold uppercase tracking-wide text-text">
				{zalogowany ? c.userTitle : c.guestTitle}
			</h2>
			<p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
				{zalogowany ? c.userBody : c.guestBody}
			</p>

			<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
				{sprawdzone && !zalogowany && (
					<button
						type="button"
						onClick={() => window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'register' }))}
						className={cn(przycisk, 'border-0 bg-accent text-accent-fg hover:bg-accent-hover')}
					>
						{c.register}
						<ArrowRight size={16} aria-hidden="true" />
					</button>
				)}
				<Link
					href="/cennik"
					className={cn(
						przycisk,
						'border border-border-strong bg-surface text-text hover:border-accent hover:bg-accent-soft'
					)}
				>
					{c.pricing}
				</Link>
				{zalogowany && (
					<button
						type="button"
						onClick={openAccountPanel}
						className={cn(przycisk, 'border border-border-strong bg-transparent text-text hover:bg-surface')}
					>
						{c.account}
					</button>
				)}
			</div>
		</section>
	);
}
