'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Lock, Sunrise } from 'lucide-react';
import { Link } from '@/i18n/routing';

/**
 * Przełącznik porannego maila w panelu konta.
 *
 * DOMYŚLNIE WYŁĄCZONY I WŁĄCZANY ŚWIADOMIE. To zgoda na treść marketingową, więc nie
 * wolno jej domniemywać ani z planu, ani z rejestracji — przełącznik jest jedynym
 * miejscem, gdzie powstaje. Plan bez tej cechy widzi, co by dostał, i odnośnik do cennika:
 * wartość planu ma być widoczna tam, gdzie się jej brakuje.
 *
 * Język maila bierzemy z języka interfejsu w chwili włączenia — użytkownik nie musi
 * wybierać osobno rzeczy, którą już wybrał.
 */
export default function MorningEmailToggle() {
	const t = useTranslations('common');
	const locale = useLocale();
	const [state, setState] = useState(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/me/morning-email', { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!cancelled) setState(data);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	const toggle = async () => {
		if (!state || busy) return;
		setBusy(true);
		setError(null);
		try {
			const res = await fetch('/api/me/morning-email', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ enabled: !state.enabled, locale }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setError(t('morning_email_error'));
				return;
			}
			setState(data);
		} catch {
			setError(t('morning_email_error'));
		} finally {
			setBusy(false);
		}
	};

	if (!state) return null;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-start gap-3">
				<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
					{state.available ? <Sunrise size={16} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
				</span>
				<div className="min-w-0 flex-1">
					<p className="text-sm font-semibold text-text">{t('morning_email_title')}</p>
					<p className="mt-0.5 text-xs leading-relaxed text-muted">{t('morning_email_body')}</p>
				</div>

				{state.available ? (
					<button
						type="button"
						role="switch"
						aria-checked={state.enabled}
						aria-label={t('morning_email_title')}
						disabled={busy}
						onClick={toggle}
						className={
							'relative h-6 w-11 shrink-0 rounded-full border-0 transition-colors disabled:opacity-60 ' +
							(state.enabled ? 'bg-accent' : 'bg-border-strong')
						}
					>
						<span
							aria-hidden="true"
							className={
								'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ' +
								(state.enabled ? 'left-0.5 translate-x-5' : 'left-0.5 translate-x-0')
							}
						/>
					</button>
				) : (
					<Link href="/cennik" className="shrink-0 text-xs font-semibold text-accent underline">
						{t('morning_email_locked')}
					</Link>
				)}
			</div>

			{state.available && (
				<p className="pl-11 text-xs text-muted">
					{state.enabled ? t('morning_email_on') : t('morning_email_off')}
				</p>
			)}
			{error && <p className="pl-11 text-xs text-loss">{error}</p>}
		</div>
	);
}
