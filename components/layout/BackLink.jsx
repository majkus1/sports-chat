'use client';

import { ArrowLeft } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { cn } from '@/lib/utils';

/**
 * Powrót o poziom wyżej.
 *
 * Celowo prowadzi pod konkretny adres, a nie „wstecz" w historii przeglądarki: na część
 * podstron (reset hasła, potwierdzenie adresu) użytkownik trafia prosto z maila, więc
 * historia bywa pusta albo prowadzi poza serwis.
 */
export default function BackLink({ href = '/', label, className }) {
	return (
		<Link
			href={href}
			className={cn(
				'mb-3 inline-flex items-center gap-1.5 text-sm text-muted no-underline',
				'transition-colors hover:text-text',
				className
			)}
		>
			<ArrowLeft size={16} aria-hidden="true" />
			{label}
		</Link>
	);
}
