import { ImageResponse } from 'next/og';
import { siteFor } from '@/lib/seo/config';

/**
 * Obrazek pokazywany przy udostępnianiu odnośnika (Facebook, X, WhatsApp, Slack).
 *
 * Rysowany w kodzie zamiast wgrywany jako plik: dzięki temu nigdy się nie zdezaktualizuje
 * i nie wymaga grafika przy każdej nowej stronie. Bez niego platformy pokazują sam adres
 * albo przypadkowy obrazek wyłuskany ze strony — a to widok, który decyduje o kliknięciu.
 */

export const alt = 'Czat Sportowy';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }) {
	const { locale } = await params;
	const site = siteFor(locale);

	return new ImageResponse(
		(
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'center',
					// Kolory wprost, nie z tokenów CSS: obrazek renderuje się poza przeglądarką,
					// więc zmienne z arkusza stylów nie są tu dostępne.
					background: 'linear-gradient(135deg, #173b45 0%, #0f272e 100%)',
					padding: '80px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
					<div style={{ width: 14, height: 14, borderRadius: 999, background: '#16a34a' }} />
					<div style={{ fontSize: 30, color: '#9fb4b9', letterSpacing: 2, textTransform: 'uppercase' }}>
						{site.name}
					</div>
				</div>

				<div style={{ fontSize: 68, color: '#ffffff', fontWeight: 700, lineHeight: 1.15, marginTop: 28 }}>
					{site.tagline}
				</div>

				<div style={{ fontSize: 30, color: '#9fb4b9', marginTop: 28, maxWidth: 900, lineHeight: 1.4 }}>
					{locale === 'en'
						? 'Analysis, an assistant to ask, and live chat at every match.'
						: 'Analiza, asystent do dopytania i czat przy każdym meczu.'}
				</div>
			</div>
		),
		size
	);
}
