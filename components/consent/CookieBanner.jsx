'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Cookie } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/Button';
import { CONSENT_EVENT, OPTIONAL_CATEGORIES, readConsent, writeConsent } from '@/lib/consent';

/** Wybór startowy pod „Wybieram": wszystko odznaczone, bo pole zaznaczone z góry nie jest zgodą. */
const NOTHING_PICKED = Object.fromEntries(OPTIONAL_CATEGORIES.map((k) => [k, false]));

/**
 * Baner zgody na ciasteczka.
 *
 * Zgody wymaga wyłącznie to, co nie jest niezbędne do działania serwisu. Tu są to dwa
 * skrypty ładowane z serwerów Google: logowanie kontem Google i Google Analytics. Reszta —
 * token sesji, motyw, zapamiętane zgody — jest niezbędna albo ustawiana na wyraźne
 * życzenie, więc nie pytamy o nią, tylko o niej informujemy.
 *
 * Odmowa naprawdę działa: bez zgody `GoogleAuthButton` nie wstrzykuje skryptu logowania,
 * a `Analytics` skryptu pomiaru; źródło wejścia nie trafia do `sessionStorage`
 * (`lib/growth/firstTouch.js`). Baner, którego wybór niczego nie zmienia, byłby fikcją.
 *
 * Trzy wyjścia: „Akceptuję", „Tylko niezbędne" i „Wybieram". Do 22.11.2026 były tylko dwa
 * pierwsze, czyli wszystko albo nic — a zgodę trzeba móc wyrazić osobno dla każdego celu.
 * „Wybieram" rozwija dwa pola, oba niezaznaczone. Odmowa nadal kosztuje jedno kliknięcie,
 * tyle samo co zgoda.
 *
 * `CONSENT_VERSION` celowo bez zmian: kategorie i cele są te same co w wersji 3, zmienił się
 * tylko sposób zadania pytania. Zgody zapisane wcześniej obejmują dokładnie ten sam zakres.
 */
export default function CookieBanner() {
	const t = useTranslations('common');
	const tx = useTranslations('ux_p5');
	const [visible, setVisible] = useState(false);
	const [choosing, setChoosing] = useState(false);
	const [picked, setPicked] = useState(NOTHING_PICKED);

	useEffect(() => {
		setVisible(readConsent() === null);

		// Stopka pozwala wrócić do wyboru — wtedy baner pokazuje się ponownie, od zera.
		const onChange = () => {
			const ask = readConsent() === null;
			setVisible(ask);
			if (ask) {
				setChoosing(false);
				setPicked(NOTHING_PICKED);
			}
		};
		window.addEventListener(CONSENT_EVENT, onChange);
		return () => window.removeEventListener(CONSENT_EVENT, onChange);
	}, []);

	if (!visible) return null;

	const decide = (choice) => {
		writeConsent(choice);
		setVisible(false);
	};
	const everything = (value) => Object.fromEntries(OPTIONAL_CATEGORIES.map((k) => [k, value]));

	const labels = { google: tx('cookies_google'), analytics: tx('cookies_analytics') };

	return (
		<div
			role="region"
			aria-label={t('cookies_title')}
			className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface px-5 py-4 shadow-lg"
		>
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<Cookie size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
					<p className="text-sm leading-relaxed text-muted">
						<span className="font-semibold text-text">{t('cookies_title')}.</span>{' '}
						{t('cookies_body')}{' '}
						<Link href="/polityka-prywatnosci" className="footer-link underline">
							{t('privacy_title')}
						</Link>
					</p>
				</div>

				{choosing ? (
					<div className="flex shrink-0 flex-col gap-2.5 sm:items-end">
						<div className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
							{OPTIONAL_CATEGORIES.map((key) => (
								<label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-text">
									<input
										type="checkbox"
										checked={picked[key]}
										onChange={(e) => setPicked((p) => ({ ...p, [key]: e.target.checked }))}
										className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
									/>
									{labels[key]}
								</label>
							))}
						</div>
						<Button size="sm" onClick={() => decide(picked)}>
							{tx('cookies_save')}
						</Button>
					</div>
				) : (
					<div className="flex shrink-0 flex-col gap-2 sm:flex-row">
						<Button size="sm" onClick={() => decide(everything(true))}>
							{t('cookies_accept_all')}
						</Button>
						<Button size="sm" variant="outline" onClick={() => decide(everything(false))}>
							{t('cookies_necessary_only')}
						</Button>
						<Button size="sm" variant="ghost" onClick={() => setChoosing(true)}>
							{tx('cookies_choose')}
						</Button>
					</div>
				)}
			</div>
		</div>
	);
}
