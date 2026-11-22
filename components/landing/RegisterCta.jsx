'use client';

import { useContext } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { UserContext } from '@/context/UserContext';
import { cn } from '@/lib/utils';

/**
 * Przycisk „Załóż darmowe konto" na stronach serwerowych (strona główna, „Jak to działa").
 *
 * Do 22.11.2026 przyciski „Załóż darmowe konto" na stronie głównej prowadziły do listy meczów —
 * napis obiecywał rejestrację, a jej nie było. Teraz gość otwiera to samo okno co w nagłówku
 * (`czat:auth`, jak `components/tools/ToolsCta.jsx`), a zalogowany zamiast zachęty do konta,
 * które już ma, dostaje przejście dalej (`userHref`) — albo nic (`userHref` puste).
 *
 * Dopóki sesja nie jest sprawdzona, przycisk zajmuje swoje miejsce, ale jest niewidoczny:
 * zalogowanemu nie mignie „Załóż konto", a układ strony nie skacze, gdy przycisk się pojawi.
 */

const KLASY = {
	base:
		'inline-flex items-center justify-center gap-2 rounded-[var(--radius-ui)] font-sans font-semibold no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
	size: { md: 'px-6 py-3 text-base', sm: 'px-4 py-2 text-sm' },
	variant: {
		primary: 'border-0 bg-accent text-accent-fg hover:bg-accent-hover',
		outline: 'border border-border-strong bg-transparent text-text hover:bg-surface-2',
	},
};

/** Stan sesji: `null` — jeszcze nie wiadomo, `false` — gość, `true` — zalogowany. */
function useZalogowany() {
	const ctx = useContext(UserContext);
	if (!ctx?.authChecked) return null;
	return Boolean(ctx.isAuthed);
}

export function openRegister() {
	window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'register' }));
}

/**
 * @param {{ label: string, userLabel?: string, userHref?: string, variant?: 'primary'|'outline',
 *   size?: 'md'|'sm', arrow?: boolean, className?: string }} props
 */
export default function RegisterCta({ label, userLabel, userHref, variant = 'primary', size = 'md', arrow = true, className }) {
	const zalogowany = useZalogowany();
	const klasy = cn(KLASY.base, KLASY.size[size], KLASY.variant[variant], className);
	const strzalka = arrow ? <ArrowRight size={size === 'sm' ? 15 : 18} aria-hidden="true" /> : null;

	if (zalogowany) {
		if (!userHref || !userLabel) return null;
		return (
			<Link href={userHref} className={klasy}>
				{userLabel}
				{strzalka}
			</Link>
		);
	}

	return (
		<button
			type="button"
			onClick={openRegister}
			disabled={zalogowany === null}
			aria-hidden={zalogowany === null ? true : undefined}
			className={cn(klasy, 'cursor-pointer', zalogowany === null && 'invisible')}
		>
			{label}
			{strzalka}
		</button>
	);
}

/**
 * Tekst zależny od sesji — np. tytuł finału: gość czyta o okresie próbnym, zalogowany o typach.
 * Z serwera i przed sprawdzeniem sesji idzie wersja dla gościa (tę czyta też robot).
 * `user === null` znaczy, że zalogowanemu nic się nie pokazuje.
 */
export function GuestText({ guest, user = null }) {
	const zalogowany = useZalogowany();
	return zalogowany ? user : guest;
}

/** Odnośnik tekstowy tylko dla gościa (zalogowany ma go już w głównym przycisku). */
export function GuestLink({ href, children, className }) {
	const zalogowany = useZalogowany();
	if (zalogowany) return null;
	return (
		<Link href={href} className={className}>
			{children}
		</Link>
	);
}

/**
 * Drugi przycisk tylko dla zalogowanego — np. „Wszystkie mecze" obok „Zobacz typy na dziś".
 * Gość go nie widzi (ma „Załóż darmowe konto"); przed sprawdzeniem sesji też nie, żeby nic nie migało.
 */
export function UserButton({ href, children, variant = 'outline', size = 'md', className }) {
	const zalogowany = useZalogowany();
	if (!zalogowany) return null;
	return (
		<Link href={href} className={cn(KLASY.base, KLASY.size[size], KLASY.variant[variant], className)}>
			{children}
		</Link>
	);
}
