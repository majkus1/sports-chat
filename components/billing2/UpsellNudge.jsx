'use client';

import { useEffect, useRef, useState } from 'react';
import { useB2 } from '@/components/billing2/useB2';
import { ArrowRight, Sparkles, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { pricingHref } from '@/lib/upsell/placements';
import { trackUpsell, trackUpsellView } from '@/lib/upsell/track';
import { cn } from '@/lib/utils';

/**
 * Delikatna propozycja zakupu w chwili wartości — karta w treści strony, NIE okno modalne.
 *
 * Zasady, których pilnuje ten komponent:
 *  - zamyka się jednym kliknięciem i zapamiętuje to (pamięć lokalna przeglądarki — zapamiętanie
 *    zamknięcia to funkcja, o którą prosi użytkownik, nie statystyka), na `hideDays` dni;
 *  - wyświetlenie liczy się dopiero, gdy karta naprawdę jest na ekranie (połowa widoczna),
 *    nie gdy wyrenderowała się pod zgięciem strony, której nikt nie przewinął;
 *  - jedno wezwanie do działania, prowadzące do cennika z wyróżnioną przepustką i źródłem (`?z=`).
 *
 * @param {{ placement: string, title: string, body: string, cta: string, dismissKey?: string,
 *   hideDays?: number, className?: string }} props
 */
export default function UpsellNudge({ placement, title, body, cta, dismissKey, hideDays = 3, className }) {
	const t = useB2();
	const ref = useRef(null);
	const klucz = `upsell:closed:${dismissKey || placement}`;
	// Domyślnie ukryta, dopóki nie sprawdzimy zamknięcia — inaczej zamknięta karta mignęłaby po odświeżeniu.
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		let zamknieta = false;
		try {
			const kiedy = Number(window.localStorage.getItem(klucz));
			zamknieta = Number.isFinite(kiedy) && kiedy > 0 && Date.now() - kiedy < hideDays * 86_400_000;
		} catch {
			/* tryb prywatny bez pamięci lokalnej — pokazujemy */
		}
		setVisible(!zamknieta);
	}, [klucz, hideDays]);

	useEffect(() => {
		if (!visible || !ref.current) return undefined;
		if (typeof IntersectionObserver === 'undefined') {
			trackUpsellView(placement);
			return undefined;
		}
		const obserwator = new IntersectionObserver(
			(wpisy) => {
				if (wpisy.some((w) => w.isIntersecting)) {
					trackUpsellView(placement);
					obserwator.disconnect();
				}
			},
			{ threshold: 0.5 }
		);
		obserwator.observe(ref.current);
		return () => obserwator.disconnect();
	}, [visible, placement]);

	if (!visible) return null;

	const zamknij = () => {
		try {
			window.localStorage.setItem(klucz, String(Date.now()));
		} catch {
			/* bez pamięci — karta zniknie do odświeżenia */
		}
		setVisible(false);
	};

	return (
		<aside
			ref={ref}
			aria-label={title}
			className={cn(
				'relative rounded-[var(--radius-ui)] border border-accent/40 bg-accent-soft px-4 py-3.5 pr-11 sm:px-5',
				className
			)}
		>
			<button
				type="button"
				onClick={zamknij}
				aria-label={t('nudge_close')}
				className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-text"
			>
				<X size={16} aria-hidden="true" />
			</button>
			<p className="flex items-start gap-2 text-sm font-bold leading-snug text-text">
				<Sparkles size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
				<span>{title}</span>
			</p>
			{body && <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>}
			<Link
				href={pricingHref(placement)}
				onClick={() => trackUpsell(placement, 'click')}
				className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3.5 py-2 text-sm font-bold text-accent-fg no-underline transition-opacity hover:opacity-90"
			>
				{cta}
				<ArrowRight size={15} aria-hidden="true" />
			</Link>
		</aside>
	);
}
