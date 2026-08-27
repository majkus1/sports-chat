'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { readAgeConfirmed, writeAgeConfirmed } from '@/lib/consent';

/**
 * Potwierdzenie pełnoletności przed wejściem do serwisu.
 *
 * Stopka od początku deklaruje, że treści są dla osób pełnoletnich, ale nic tego nie
 * sprawdzało — deklaracja bez bramki jest pustym zdaniem. Serwis nie urządza zakładów,
 * więc twarda weryfikacja wieku nie jest wymagana; oświadczenie użytkownika odpowiada
 * standardowi stosowanemu przy treściach o tematyce bukmacherskiej.
 *
 * Ekran rysujemy dopiero po zamontowaniu: na serwerze nie ma dostępu do `localStorage`,
 * a renderowanie bramki w HTML-u wysyłanym z serwera schowałoby stronę przed
 * wyszukiwarkami i przed osobami, które już potwierdziły wiek.
 */
export default function AgeGate() {
	const t = useTranslations('common');
	const [state, setState] = useState('loading');

	useEffect(() => {
		setState(readAgeConfirmed() ? 'confirmed' : 'asking');
	}, []);

	if (state === 'loading' || state === 'confirmed') return null;

	const confirm = () => {
		writeAgeConfirmed();
		setState('confirmed');
	};

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby="age-gate-title"
			className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 px-5 backdrop-blur-sm"
		>
			<div className="w-full max-w-md rounded-[var(--radius-ui)] border border-border bg-surface p-6 text-center shadow-lg">
				<ShieldAlert size={32} aria-hidden="true" className="mx-auto text-draw" />
				<h1 id="age-gate-title" className="mt-4 font-display text-xl font-bold uppercase tracking-wide text-text">
					{t('age_gate_title')}
				</h1>
				<p className="mt-3 text-sm leading-relaxed text-muted">{t('age_gate_body')}</p>

				{state === 'denied' ? (
					// Odmowy nie zapisujemy: pomyłka w kliknięciu nie może zamknąć serwisu na stałe.
					<p className="mt-5 rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-text">
						{t('age_gate_denied')}
					</p>
				) : (
					<div className="mt-5 flex flex-col gap-2 sm:flex-row">
						<Button onClick={confirm} block>
							{t('age_gate_confirm')}
						</Button>
						<Button variant="outline" onClick={() => setState('denied')} block>
							{t('age_gate_deny')}
						</Button>
					</div>
				)}

				<p className="mt-4 text-xs leading-relaxed text-muted">{t('age_gate_note')}</p>
			</div>
		</div>
	);
}
