import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Przełącznik stron administratora od ruchu: posty i źródła rejestracji. Dwie strony, które
 * czyta się razem — post wychodzi z utm, a panel źródeł pokazuje, ile kont z niego przyszło.
 */
export default function AdminNav({ active, labels }) {
	const pozycje = [
		{ id: 'posts', href: '/admin/posty', label: labels.posts },
		{ id: 'sources', href: '/admin/zrodla', label: labels.sources },
	];
	return (
		<nav aria-label={labels.aria} className="mb-6 inline-flex gap-0.5 rounded-full border border-border bg-surface-2 p-1">
			{pozycje.map((p) => (
				<Link
					key={p.id}
					href={p.href}
					aria-current={active === p.id ? 'page' : undefined}
					className={cn(
						'rounded-full px-3.5 py-1.5 text-[13px] font-semibold no-underline transition-colors',
						active === p.id ? 'bg-brand text-brand-fg shadow-sm' : 'text-muted hover:bg-surface-3 hover:text-text'
					)}
				>
					{p.label}
				</Link>
			))}
		</nav>
	);
}
