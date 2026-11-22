import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Zwinięta sekcja „dla dociekliwych" — rozbicia, zasady rejestru, wyjaśnienie CLV.
 *
 * Dowody zostają na stronie (i w HTML-u, więc widzi je robot i czytnik ekranu), ale nie stoją
 * w głównym strumieniu: gracz ma w trzy sekundy zobaczyć wynik, a nie panel analityka.
 * Natywne `details`/`summary` zamiast stanu Reacta — działa bez JavaScriptu i bez hydratacji.
 */
export default function MoreDetails({ summary, children, className, defaultOpen = false }) {
	return (
		<details
			open={defaultOpen || undefined}
			className={cn('group rounded-[var(--radius-ui)] border border-border bg-surface', className)}
		>
			<summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
				<span>{summary}</span>
				<ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180" />
			</summary>
			<div className="flex flex-col gap-4 border-t border-border px-4 py-4">{children}</div>
		</details>
	);
}
