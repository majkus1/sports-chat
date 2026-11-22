'use client';

import { ArrowRight } from 'lucide-react';
import { useAuthKey } from '@/context/UserContext';
import { cn } from '@/lib/utils';

/** Okno rejestracji w nawigacji (`components/NavBar.js` słucha `czat:auth`). */
export function openRegister() {
	window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'register' }));
}

/**
 * Wezwanie przy kłódce, zależne od tego, kto patrzy.
 *
 * Gość dostaje przycisk rejestracji (to samo okno co w nagłówku, przez `czat:auth`): okres próbny
 * odkrywa typy i kupony, a cennik bez konta i tak kończy się na „najpierw załóż konto". Zalogowany
 * dostaje to, co strona poda w `children` (np. przycisk z ceną przepustki) — albo nic.
 *
 * Dopóki sesja nie jest sprawdzona, nie rysujemy niczego: zalogowanemu mignąłby przycisk
 * rejestracji po każdym odświeżeniu, a robot i tak go nie potrzebuje.
 *
 * @param {{ label: string, children?: React.ReactNode, size?: 'sm'|'lg', className?: string }} props
 */
export default function GuestUnlock({ label, children = null, size = 'sm', className }) {
	const authKey = useAuthKey();
	if (!authKey) return null;
	if (authKey !== 'guest') return children;
	return (
		<button
			type="button"
			onClick={openRegister}
			className={cn(
				// `font-sans` jawnie: bez preflightu `<button>` nie dziedziczy kroju.
				'inline-flex w-fit items-center justify-center gap-1.5 rounded-[var(--radius-ui)] border-0 bg-accent font-sans font-bold text-accent-fg transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
				size === 'lg' ? 'px-5 py-3 text-base' : 'px-3.5 py-2 text-sm',
				className
			)}
		>
			{label}
			<ArrowRight size={size === 'lg' ? 18 : 15} aria-hidden="true" />
		</button>
	);
}
