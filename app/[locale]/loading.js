'use client';

import BeatLoader from 'react-spinners/BeatLoader';
import { useLocale } from 'next-intl';

/**
 * Ekran przejściowy między nawigacjami.
 *
 * Kolory muszą pochodzić z tokenów, nie z literałów. Wcześniej było tu zaszyte `#f1f1f1`,
 * przez co w trybie ciemnym środek strony (szerokość `body`, 1100 px) świecił na jasno,
 * podczas gdy marginesy po bokach — malowane przez `html` — były już ciemne.
 */
export default function Loading() {
	const locale = useLocale();

	// Zapas, gdyby useLocale nie zadziałało.
	const loadingText = locale === 'en' ? 'Loading...' : 'Ładowanie...';

	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'center',
				alignItems: 'center',
				minHeight: '100vh',
				gap: '20px',
				backgroundColor: 'var(--bg)',
			}}
		>
			<BeatLoader color="var(--accent)" size={15} margin={5} speedMultiplier={0.8} />
			<p
				style={{
					fontFamily: 'Roboto Condensed, sans-serif',
					color: 'var(--muted)',
					fontSize: '16px',
					marginTop: '10px',
					fontWeight: 400,
				}}
			>
				{loadingText}
			</p>
		</div>
	);
}
