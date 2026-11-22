'use client';

import { useContext, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { MailCheck, X } from 'lucide-react';
import { UserContext } from '@/context/UserContext';

/**
 * Pasek „potwierdź adres" — dla zalogowanego, którego adres nie jest potwierdzony.
 *
 * Od 22.11.2026 konto działa bez potwierdzenia (próba od razu), więc to prośba, nie bramka:
 * jedno zdanie, co daje potwierdzenie, i „wyślij link ponownie". Zamknięcie chowa pasek do
 * przeładowania strony — bez zapisu w przeglądarce, żeby nie potrzebował zgody.
 */
export default function VerifyEmailBar() {
	const t = useTranslations('auth2');
	const locale = useLocale();
	const ctx = useContext(UserContext);
	const [stan, setStan] = useState('idle');
	const [schowany, setSchowany] = useState(false);

	if (schowany || !ctx?.isAuthed || ctx.user?.emailVerified !== false) return null;

	const wyslij = async () => {
		setStan('sending');
		try {
			const res = await fetch('/api/auth/resend-verification', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ locale }),
			});
			setStan(res.ok ? 'sent' : 'error');
		} catch {
			setStan('error');
		}
	};

	return (
		<div className="mx-auto mb-4 flex w-full max-w-4xl items-center gap-3 rounded-[var(--radius-ui)] border border-accent/40 bg-accent-soft/40 px-4 py-2.5 text-sm">
			<MailCheck size={17} aria-hidden="true" className="shrink-0 text-accent" />
			<p className="min-w-0 flex-1 text-text">
				{stan === 'sent' ? t('verify_sent', { email: ctx.user?.email || '' }) : stan === 'error' ? t('verify_error') : t('verify_text')}
			</p>
			{stan !== 'sent' && (
				<button
					type="button"
					onClick={wyslij}
					disabled={stan === 'sending'}
					className="shrink-0 rounded-[var(--radius-ui)] border-0 bg-accent px-3 py-1.5 text-xs font-bold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
				>
					{t('verify_resend')}
				</button>
			)}
			<button
				type="button"
				onClick={() => setSchowany(true)}
				aria-label={t('verify_close')}
				className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-text"
			>
				<X size={15} aria-hidden="true" />
			</button>
		</div>
	);
}
