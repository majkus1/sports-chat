import { LOCALES, SITE_URL } from '@/lib/seo/config';
import { allPosts } from '@/lib/blog';
import { UPDATED_AT } from '@/lib/legal/operator';
import connectToDb from '@/lib/db';
import ModelForecast from '@/models/ModelForecast';
import { matchPath } from '@/lib/seo/matchPreview';

/** Mapa zależy od bazy (strony meczów) — liczona przy pobraniu, nie przy budowaniu. */
export const dynamic = 'force-dynamic';

/**
 * Strony „typ na mecz" w mapie: tydzień wstecz (świeże rozliczenia) i trzy dni naprzód.
 * Starsze nadal działają i są podlinkowane między sobą, ale mapa wskazuje to, co ludzie
 * szukają teraz — kilkaset adresów zamiast tysięcy.
 */
async function matchEntries(now) {
	try {
		await connectToDb();
		const mecze = await ModelForecast.find({
			kickoff: { $gte: new Date(now.getTime() - 7 * 86_400_000), $lte: new Date(now.getTime() + 3 * 86_400_000) },
		})
			.select('fixtureId homeName awayName kickoff forecastAt settledAt')
			.sort({ kickoff: -1 })
			.limit(2000)
			.lean();
		return mecze.flatMap((m) =>
			entry(matchPath(m), {
				lastModified: m.settledAt || m.forecastAt || now,
				changeFrequency: new Date(m.kickoff) > now ? 'hourly' : 'weekly',
				priority: 0.6,
			})
		);
	} catch {
		// Baza niedostępna — mapa bez meczów jest lepsza niż żadna.
		return [];
	}
}

/**
 * Mapa witryny.
 *
 * Trafiają do niej wyłącznie adresy, które chcemy widzieć w wynikach — czyli wszystko poza
 * pokojami meczowymi, raportami i ekranami konta. Mecze reprezentują strony „typ na mecz"
 * (`/typ/...`), nie pokoje. Mapa z dziesiątkami tysięcy krótko żyjących
 * pokoi nie tylko nic by nie dała, ale osłabiłaby sygnał dla stron naprawdę istotnych.
 *
 * `alternates.languages` przy każdym wpisie informuje o wersji w drugim języku — ten sam
 * sygnał co hreflang w nagłówku strony, podany raz jeszcze tam, gdzie robot zagląda najpierw.
 */

/** `changeFrequency` i `priority` to podpowiedzi, nie polecenia — stąd ostrożne wartości. */
const STATIC_ROUTES = [
	{ path: '', changeFrequency: 'daily', priority: 1 },
	// Zmienia się codziennie i celuje w najczęstszą frazę — zaraz po stronie głównej.
	{ path: '/typy-na-dzis', changeFrequency: 'daily', priority: 0.95 },
	{ path: '/pilka-nozna/przedmeczowe', changeFrequency: 'hourly', priority: 0.9 },
	{ path: '/pilka-nozna/live', changeFrequency: 'hourly', priority: 0.8 },
	{ path: '/pilka-nozna/kolejka', changeFrequency: 'daily', priority: 0.8 },
	{ path: '/pilka-nozna/skutecznosc', changeFrequency: 'daily', priority: 0.7 },
	{ path: '/pilka-nozna/ai-agent', changeFrequency: 'daily', priority: 0.7 },
	{ path: '/pilka-nozna/asystent', changeFrequency: 'weekly', priority: 0.7 },
	// Przegląd wszystkich funkcji — zmienia się, gdy dochodzi nowe narzędzie, nie codziennie.
	{ path: '/narzedzia', changeFrequency: 'monthly', priority: 0.8 },
	{ path: '/jak-to-dziala', changeFrequency: 'monthly', priority: 0.8 },
	{ path: '/cennik', changeFrequency: 'monthly', priority: 0.8 },
	{ path: '/blog', changeFrequency: 'weekly', priority: 0.8 },
	{ path: '/kontakt', changeFrequency: 'yearly', priority: 0.4 },
	{ path: '/regulamin', changeFrequency: 'yearly', priority: 0.3 },
	{ path: '/zwroty', changeFrequency: 'yearly', priority: 0.3 },
	{ path: '/polityka-prywatnosci', changeFrequency: 'yearly', priority: 0.3 },
];

/** Trasy datowane wersją dokumentów, nie dniem wygenerowania mapy. */
const LEGAL_PATHS = new Set(['/regulamin', '/zwroty', '/polityka-prywatnosci']);

function entry(path, { lastModified, changeFrequency, priority }) {
	return LOCALES.map((locale) => ({
		url: `${SITE_URL}/${locale}${path}`,
		lastModified,
		changeFrequency,
		priority,
		alternates: {
			languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
		},
	}));
}

export default async function sitemap() {
	const now = new Date();

	const staticEntries = STATIC_ROUTES.flatMap((route) =>
		entry(route.path, {
			// Dokumenty prawne mają własną datę zmiany — udawanie, że zmieniły się dziś,
			// psuje sygnał świeżości dla stron, które faktycznie się zmieniają.
			lastModified: LEGAL_PATHS.has(route.path) ? new Date(UPDATED_AT) : now,
			changeFrequency: route.changeFrequency,
			priority: route.priority,
		})
	);

	const postEntries = allPosts().flatMap((post) =>
		entry(`/blog/${post.slug}`, {
			lastModified: new Date(post.updatedAt || post.publishedAt),
			changeFrequency: 'monthly',
			priority: 0.7,
		})
	);

	return [...staticEntries, ...postEntries, ...(await matchEntries(now))];
}
