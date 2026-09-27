'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Sunrise, X } from 'lucide-react';

/**
 * Zachęta do porannego maila — nad listą meczów, jednym kliknięciem.
 *
 * Przełącznik siedział dotąd tylko w panelu konta, do którego nowy użytkownik nie zagląda.
 * Tu pokazuje się każdemu, kto MA mail w swoim planie (albo w okresie próbnym), a go nie
 * włączył. Kliknięcie to świadoma zgoda na wysyłkę — bez niej mail nie idzie do nikogo.
 * „Nie teraz" chowa kartę na dobre na tym urządzeniu.
 */

const KLUCZ = 'morning-prompt-dismissed';

function schowane() {
	try {
		return window.localStorage.getItem(KLUCZ) === '1';
	} catch {
		return false;
	}
}

export default function MorningEmailPrompt({ className = '' }) {
	const t = useTranslations('common');
	const locale = useLocale();
	const [stan, setStan] = useState(null);
	const [zapis, setZapis] = useState(false);
	const [gotowe, setGotowe] = useState(false);

	useEffect(() => {
		if (schowane()) return undefined;
		let anulowane = false;
		fetch('/api/me/morning-email', { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				if (!anulowane && d) setStan(d);
			})
			.catch(() => {});
		return () => {
			anulowane = true;
		};
	}, []);

	if (!stan || (!gotowe && (!stan.available || stan.enabled))) return null;

	const wlacz = async () => {
		setZapis(true);
		try {
			const res = await fetch('/api/me/morning-email', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ enabled: true, locale }),
			});
			if (res.ok) setGotowe(true);
		} finally {
			setZapis(false);
		}
	};

	const zamknij = () => {
		try {
			window.localStorage.setItem(KLUCZ, '1');
		} catch {
			/* bez pamięci przeglądarki karta wróci przy następnej wizycie — trudno */
		}
		setStan(null);
	};

	return (
		<div className={`relative flex gap-3 rounded-[var(--radius-ui)] border border-accent/50 bg-accent-soft/40 px-4 py-3 ${className}`}>
			<span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
				{gotowe ? <Check size={18} aria-hidden="true" /> : <Sunrise size={18} aria-hidden="true" />}
			</span>
			<div className="min-w-0 flex-1 pr-6">
				{gotowe ? (
					<p className="text-sm font-semibold text-text">{t('morning_prompt_done')}</p>
				) : (
					<>
						<p className="text-sm font-bold text-text">{t('morning_prompt_title')}</p>
						<p className="mt-0.5 text-xs leading-relaxed text-muted">{t('morning_prompt_body')}</p>
						{stan.trialDaysLeft > 0 && (
							<p className="mt-0.5 text-xs font-semibold text-accent">{t('morning_prompt_trial', { days: stan.trialDaysLeft })}</p>
						)}
						<div className="mt-2 flex flex-wrap items-center gap-2">
							<button
								type="button"
								onClick={wlacz}
								disabled={zapis}
								className="rounded-[var(--radius-ui)] border-0 bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
							>
								{t('morning_prompt_enable')}
							</button>
							<button type="button" onClick={zamknij} className="border-0 bg-transparent px-2 py-2 text-xs text-muted hover:text-text">
								{t('morning_prompt_dismiss')}
							</button>
						</div>
					</>
				)}
			</div>
			<button
				type="button"
				onClick={zamknij}
				aria-label={t('morning_prompt_dismiss')}
				className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-0 bg-transparent text-muted hover:text-text"
			>
				<X size={15} aria-hidden="true" />
			</button>
		</div>
	);
}
