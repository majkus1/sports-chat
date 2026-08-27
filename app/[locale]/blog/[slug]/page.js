import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { CalendarDays, Clock } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import PostBody from '@/components/blog/PostBody';
import { Badge } from '@/components/ui/Badge';
import { Link } from '@/i18n/routing';
import { allSlugs, contentFor, postBySlug } from '@/lib/blog';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, articleLd, breadcrumbLd } from '@/lib/seo/jsonLd';
import { routing } from '@/i18n/routing';

/**
 * Pojedynczy wpis.
 *
 * `generateStaticParams` zwraca komplet kombinacji języka i adresu, więc wszystkie wpisy
 * powstają w czasie budowania jako gotowy HTML. Dla treści, która zmienia się raz na kilka
 * tygodni, generowanie przy każdym żądaniu byłoby marnotrawstwem.
 */

export function generateStaticParams() {
	return routing.locales.flatMap((locale) => allSlugs().map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }) {
	const { locale, slug } = await params;
	const post = postBySlug(slug);
	if (!post) return {};

	const content = contentFor(post, locale);

	return buildMetadata({
		locale,
		path: `/blog/${post.slug}`,
		// Krótszy wariant, jeśli istnieje — patrz komentarz przy `metaTitle` w danych wpisu.
		title: content.metaTitle || content.title,
		description: content.description,
		type: 'article',
		article: { publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags },
	});
}

export default async function PostPage({ params }) {
	const { locale, slug } = await params;
	const post = postBySlug(slug);
	if (!post) notFound();

	const content = contentFor(post, locale);
	const t = await getTranslations('common');

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<JsonLd data={articleLd({ locale, post: { ...post, ...content } })} />
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: t('mainpage'), path: '/' },
					{ name: 'Blog', path: '/blog' },
					{ name: content.title, path: `/blog/${post.slug}` },
				])}
			/>

			<BackLink label={t('blog_back')} href="/blog" />

			<article>
				<div className="flex flex-wrap items-center gap-2">
					{post.tags.map((tag) => (
						<Badge key={tag} variant="outline">
							{tag}
						</Badge>
					))}
				</div>

				<h1 className="mt-4 font-display text-2xl font-bold leading-tight text-text sm:text-4xl">
					{content.title}
				</h1>

				<p className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted">
					<span className="inline-flex items-center gap-1.5">
						<CalendarDays size={13} aria-hidden="true" />
						<time dateTime={post.publishedAt}>
							{new Date(post.publishedAt).toLocaleDateString(locale, {
								day: 'numeric',
								month: 'long',
								year: 'numeric',
							})}
						</time>
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Clock size={13} aria-hidden="true" />
						{t('blog_reading_time', { minutes: post.readingMinutes })}
					</span>
				</p>

				{/* Lead wyróżniony rozmiarem — pierwszy akapit decyduje, czy ktoś czyta dalej. */}
				<p className="mt-6 text-lg leading-relaxed text-text">{content.lead}</p>

				<PostBody content={content} />
			</article>

			<aside className="mt-14 rounded-[var(--radius-ui)] border border-border bg-surface-2 px-5 py-5">
				<p className="text-sm leading-relaxed text-text">{t('blog_cta')}</p>
				<Link href="/pilka-nozna/przedmeczowe" className="footer-link mt-3 inline-flex">
					{t('blog_cta_link')}
				</Link>
			</aside>

			<p className="mt-8 text-xs leading-relaxed text-muted">{t('footer_responsible_gaming')}</p>
		</AppShell>
	);
}
