import serieA from '@/lib/blog/posts/serie-a-2026-27';
import jakAiAnalizuje from '@/lib/blog/posts/jak-ai-analizuje-mecz';
import statystyki from '@/lib/blog/posts/statystyki-xg-forma-h2h';

/**
 * Rejestr wpisów bloga.
 *
 * Wpisy to moduły, nie rekordy w bazie: treść wchodzi do repozytorium razem z kodem, więc
 * podlega przeglądowi zmian, a strony da się wygenerować statycznie w czasie budowania.
 * Przy blogu redakcyjnym, gdzie wpisy powstają rzadko i pisze je jedna osoba, panel
 * administracyjny byłby kosztem bez pokrycia.
 *
 * Slug jest wspólny dla obu języków — ta sama treść pod jednym adresem z prefiksem języka
 * upraszcza hreflang i mapę witryny.
 */
const POSTS = [serieA, jakAiAnalizuje, statystyki];

/** Wpisy od najnowszego. */
export function allPosts() {
	return [...POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function postBySlug(slug) {
	return POSTS.find((post) => post.slug === slug) || null;
}

/** Treść wpisu w danym języku; brak tłumaczenia cofa do polskiej wersji. */
export function contentFor(post, locale) {
	return post?.[locale] || post?.pl || null;
}

export function allSlugs() {
	return POSTS.map((post) => post.slug);
}
