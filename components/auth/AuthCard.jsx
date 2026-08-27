'use client';

import { cn } from '@/lib/utils';

/**
 * Wspólna oprawa ekranów konta: logowania, rejestracji i odzyskiwania hasła.
 *
 * Wcześniej każdy z nich miał własną szerokość, własny odstęp i własny nagłówek,
 * przez co przejście między nimi wyglądało jak skok do innej aplikacji.
 */
export default function AuthCard({ title, description, children, footer, className }) {
	return (
		<div
			className={cn(
				'w-full max-w-sm rounded-[calc(var(--radius-ui)+4px)] border border-border',
				'bg-surface p-6 text-text shadow-[var(--shadow-soft)]',
				className
			)}
		>
			<h2 className="font-display text-xl font-bold tracking-wide text-text">{title}</h2>
			{description && <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>}

			<div className="mt-5">{children}</div>

			{footer && <div className="mt-5 border-t border-border pt-4">{footer}</div>}
		</div>
	);
}

/** Poziomy separator „lub" między logowaniem przez Google a formularzem. */
export function AuthDivider({ label }) {
	return (
		<div className="my-4 flex items-center gap-3" aria-hidden="true">
			<span className="h-px flex-1 bg-border" />
			<span className="text-xs uppercase tracking-wide text-muted">{label}</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}
