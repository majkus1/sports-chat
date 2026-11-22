'use client';

import { useB2 } from '@/components/billing2/useB2';
import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { OPERATOR } from '@/lib/legal/operator';

/**
 * Błąd startu płatności jako zdanie z wyjściem, nie sam czerwony napis.
 *
 * Sesja wygasła → przycisk logowania (otwiera okno w nawigacji, `czat:auth`). Zmieniony regulamin →
 * przycisk odświeżenia. Reszta → adres, pod który można napisać. `role="alert"`, bo komunikat
 * pojawia się po kliknięciu i czytnik ekranu ma go przeczytać od razu.
 */
export default function CheckoutError({ error }) {
	const t = useB2();
	if (!error) return null;

	return (
		<div role="alert" className="mt-4 flex flex-col gap-2 rounded-[var(--radius-ui)] border border-loss/40 bg-surface-2 px-4 py-3 text-sm text-text sm:flex-row sm:items-center">
			<p className="flex flex-1 items-start gap-2">
				<TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-loss" />
				<span>{t(error, { email: OPERATOR.email })}</span>
			</p>
			{error === 'err_outdated' && (
				<Button size="sm" variant="outline" onClick={() => window.location.reload()}>
					{t('err_refresh')}
				</Button>
			)}
			{error === 'err_login' && (
				<Button
					size="sm"
					variant="outline"
					onClick={() => window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'login' }))}
				>
					{t('sign_in')}
				</Button>
			)}
		</div>
	);
}
