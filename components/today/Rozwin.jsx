import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * „Jak to czytać", „Jak powstaje kupon" — wyjaśnienie pod rozwinięciem (`<details>`), bez stanu.
 *
 * Gracz nie przychodzi czytać metody, więc na wierzchu zostaje sam tytuł. Treść stoi jednak
 * w HTML od razu (natywne `details`, bez JS), więc robot wyszukiwarki ją widzi, a kto chce — rozwinie.
 *
 * @param {{ title: string, children: React.ReactNode, className?: string }} props
 */
export default function Rozwin({ title, children, className }) {
	return (
		<details className={cn('group text-sm leading-relaxed text-muted', className)}>
			<summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
				{title}
				<ChevronDown size={15} aria-hidden="true" className="transition-transform group-open:rotate-180" />
			</summary>
			<p className="mt-1.5">{children}</p>
		</details>
	);
}
