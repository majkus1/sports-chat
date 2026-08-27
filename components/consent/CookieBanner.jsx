'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { CONSENT_EVENT, readConsent, writeConsent } from '@/lib/consent';

/**
 * Baner zgody na ciasteczka.
 *
 * Zgody wymaga wyłącznie to, co nie jest niezbędne do działania serwisu. Tu jest to
 * jedna rzecz: skrypt logowania Google, ładowany z serwerów Google. Reszta — token
 * sesji, motyw, zapamiętane zgody — jest niezbędna albo ustawiana na wyraźne życzenie,
 * więc nie pytamy o nią, tylko o niej informujemy.
 *
 * Odmowa naprawdę działa: bez zgody `GoogleAuthButton` nie wstrzykuje skryptu, a konto
 * zakłada się mailem. Baner, którego wybór niczego nie zmienia, byłby fikcją.
 */
export default function CookieBanner() {
	const t = useTranslations('common');
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		setVisible(readConsent() === null);

		// Stopka pozwala wrócić do wyboru — wtedy baner ma się pokazać ponownie.
		const onChange = () => setVisible(readConsent() === null);
		window.addEventListener(CONSENT_EVENT, onChange);
		return () => window.removeEventListener(CONSENT_EVENT, onChange);
	}, []);

	if (!visible) return null;

	const decide = (google) => {
		writeConsent({ google });
		setVisible(false);
	};

	return (
		<div
			role="region"
			aria-label={t('cookies_title')}
			className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-5 py-4 shadow-lg"
		>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-4 sm:flex-row sm:items-center">
				<Cookie size={22} aria-hidden="true" className="shrink-0 text-accent" />

				<div className="min-w-0 flex-1">
					<p className="font-semibold text-text">{t('cookies_title')}</p>
					<p className="mt-1 text-sm leading-relaxed text-muted">
						{t('cookies_body')}{' '}
						<Link href="/polityka-prywatnosci" className="footer-link underline">
							{t('privacy_title')}
						</Link>
					</p>
				</div>

				<div className="flex shrink-0 flex-col gap-2 sm:flex-row">
					<Button size="sm" onClick={() => decide(true)}>
						{t('cookies_accept_all')}
					</Button>
					<Button size="sm" variant="outline" onClick={() => decide(false)}>
						{t('cookies_necessary_only')}
					</Button>
				</div>
			</div>
		</div>
	);
}
