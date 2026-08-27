import { ImageResponse } from 'next/og';
import { contentFor, postBySlug } from '@/lib/blog';
import { siteFor } from '@/lib/seo/config';

/**
 * Obrazek udostępnienia dla wpisu — z jego własnym tytułem.
 *
 * Wpis dzieli się inaczej niż strona główna: liczy się tytuł tekstu, nie hasło serwisu.
 * Rysowanie go z danych wpisu oznacza, że każdy nowy artykuł dostaje grafikę automatycznie.
 */

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Czat Sportowy — blog';

export default async function Image({ params }) {
	const { locale, slug } = await params;
	const post = postBySlug(slug);
	const site = siteFor(locale);
	const content = post ? contentFor(post, locale) : null;

	return new ImageResponse(
		(
			<div
				style={{
					width: '100%',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
					background: 'linear-gradient(135deg, #173b45 0%, #0f272e 100%)',
					padding: '72px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
					<div style={{ width: 12, height: 12, borderRadius: 999, background: '#16a34a' }} />
					{/*
					 * Jeden łańcuch znaków, nie `{site.name} · Blog`.
					 *
					 * Renderer obrazków (Satori) wymaga `display: flex` od każdego elementu z więcej
					 * niż jednym dzieckiem, a zapis z wyrażeniem obok tekstu daje ich dwa i kończy się
					 * błędem 500 przy generowaniu podglądu.
					 */}
					<div style={{ fontSize: 26, color: '#9fb4b9', letterSpacing: 2, textTransform: 'uppercase' }}>
						{`${site.name} · Blog`}
					</div>
				</div>

				<div style={{ fontSize: 60, color: '#ffffff', fontWeight: 700, lineHeight: 1.15 }}>
					{content?.title || site.tagline}
				</div>

				<div style={{ fontSize: 26, color: '#9fb4b9' }}>
					{post?.tags?.join(' · ') || ''}
				</div>
			</div>
		),
		size
	);
}
