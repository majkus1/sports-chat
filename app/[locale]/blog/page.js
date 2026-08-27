import { getTranslations } from 'next-intl/server';
import { ArrowRight, CalendarDays, Clock } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import { Link } from '@/i18n/routing';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { allPosts, contentFor } from '@/lib/blog';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd, breadcrumbLd } from '@/lib/seo/jsonLd';

/**
 * Lista wpisów — komponent serwerowy.
 *
 * Blog istnieje z dwóch powodów naraz. Pierwszy to wyszukiwarki: aplikacja bez treści
 * tekstowej nie ma na czym budować widoczności poza nazwą własną. Drugi to wiarygodność —
 * serwis, który potrafi wytłumaczyć własną metodę, wygląda inaczej niż taki, który tylko
 * obiecuje skuteczność.
 */

export async function generateMetadata({ params }) {
	const { locale } = await params;

	return buildMetadata({
		locale,
		path: '/blog',
		title: locale === 'en' ? 'Blog — analysis, statistics and AI' : 'Blog — analizy, statystyki i AI',
		description:
			locale === 'en'
				? 'Season previews, guides to the statistics that matter, and honest explanations of how AI match analysis works. No sponsored picks.'
				: 'Zapowiedzi sezonów, przewodniki po statystykach i szczere wyjaśnienia, jak działa analiza AI w piłce nożnej. Bez typów sponsorowanych.',
	});
}

export default async function BlogPage({ params }) {
	const { locale } = await params;
	const t = await getTranslations('common');
	const posts = allPosts();

	return (
		<AppShell contentClassName="mx-auto w-full max-w-3xl">
			<JsonLd
				data={breadcrumbLd(locale, [
					{ name: t('mainpage'), path: '/' },
					{ name: 'Blog', path: '/blog' },
				])}
			/>

			<BackLink label={t('back_home')} />

			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text sm:text-3xl">
				Blog
			</h1>
			<p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{t('blog_intro')}</p>

			<div className="mt-8 flex flex-col gap-4">
				{posts.map((post) => {
					const content = contentFor(post, locale);
					return (
						<article key={post.slug}>
							<Link href={`/blog/${post.slug}`} className="block no-underline">
								<Card className="transition-transform hover:scale-[1.01]">
									<CardContent className="flex flex-col gap-3 px-5 py-5">
										<div className="flex flex-wrap items-center gap-2">
											{post.tags.slice(0, 2).map((tag) => (
												<Badge key={tag} variant="outline">
													{tag}
												</Badge>
											))}
										</div>

										<h2 className="font-display text-lg font-bold text-text sm:text-xl">
											{content.title}
										</h2>
										<p className="text-sm leading-relaxed text-muted">{content.description}</p>

										<p className="flex flex-wrap items-center gap-4 text-xs text-muted">
											<span className="inline-flex items-center gap-1.5">
												<CalendarDays size={13} aria-hidden="true" />
												<time dateTime={post.publishedAt}>
													{new Date(post.publishedAt).toLocaleDateString(locale)}
												</time>
											</span>
											<span className="inline-flex items-center gap-1.5">
												<Clock size={13} aria-hidden="true" />
												{t('blog_reading_time', { minutes: post.readingMinutes })}
											</span>
											<span className="ml-auto inline-flex items-center gap-1.5 font-semibold text-accent">
												{t('blog_read')}
												<ArrowRight size={13} aria-hidden="true" />
											</span>
										</p>
									</CardContent>
								</Card>
							</Link>
						</article>
					);
				})}
			</div>
		</AppShell>
	);
}
