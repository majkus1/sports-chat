/**
 * Strony „typy na dziś [liga]" (`/typy-na-dzis/<liga>`) — które ligi i pod jakim adresem.
 *
 * DLACZEGO TA LISTA, A NIE WSZYSTKIE 69 LIG. Strona ligi ma sens, gdy ludzie wpisują frazę z jej
 * nazwą („typy na dziś ekstraklasa", „premier league typy") — u polskiego kibica to puchary,
 * czołowa piątka, Ekstraklasa, I liga i kilka lig, o których się u nas mówi. Dziewiętnaście
 * stron z treścią w dni meczowe zamiast siedemdziesięciu, z których większość przez większość
 * tygodnia byłaby pusta (i dostawała `noindex`).
 *
 * WYŁĄCZNIE LIGI SPRAWDZONE (poziom 1 i 2 w `lib/football/leagues.js`) — ligi w okresie próbnym
 * nie trafiają tam, gdzie serwis ręczy za liczby; test pilnuje, żeby żadna się tu nie wkradła.
 *
 * Adres jeden dla obu języków (jak reszta serwisu: `/pl/typy-na-dzis/...`, `/en/typy-na-dzis/...`).
 */
export const LEAGUE_PAGES = [
	{ id: 2, slug: 'liga-mistrzow', pl: 'Liga Mistrzów', en: 'Champions League' },
	{ id: 3, slug: 'liga-europy', pl: 'Liga Europy', en: 'Europa League' },
	{ id: 848, slug: 'liga-konferencji', pl: 'Liga Konferencji', en: 'Conference League' },
	{ id: 106, slug: 'ekstraklasa', pl: 'Ekstraklasa', en: 'Ekstraklasa' },
	{ id: 107, slug: 'i-liga', pl: 'I liga', en: 'Polish I liga' },
	{ id: 39, slug: 'premier-league', pl: 'Premier League', en: 'Premier League' },
	{ id: 140, slug: 'la-liga', pl: 'La Liga', en: 'La Liga' },
	{ id: 135, slug: 'serie-a', pl: 'Serie A', en: 'Serie A' },
	{ id: 78, slug: 'bundesliga', pl: 'Bundesliga', en: 'Bundesliga' },
	{ id: 61, slug: 'ligue-1', pl: 'Ligue 1', en: 'Ligue 1' },
	{ id: 40, slug: 'championship', pl: 'Championship', en: 'Championship' },
	{ id: 88, slug: 'eredivisie', pl: 'Eredivisie', en: 'Eredivisie' },
	{ id: 94, slug: 'primeira-liga', pl: 'Primeira Liga', en: 'Primeira Liga' },
	{ id: 203, slug: 'super-lig', pl: 'Süper Lig', en: 'Süper Lig' },
	{ id: 5, slug: 'liga-narodow', pl: 'Liga Narodów', en: 'Nations League' },
	{ id: 32, slug: 'eliminacje-ms', pl: 'Eliminacje MŚ', en: 'World Cup qualifiers' },
	{ id: 960, slug: 'eliminacje-euro', pl: 'Eliminacje Euro', en: 'Euro qualifiers' },
	{ id: 1, slug: 'mistrzostwa-swiata', pl: 'Mistrzostwa świata', en: 'World Cup' },
	{ id: 4, slug: 'euro', pl: 'Euro', en: 'Euro' },
];

const PO_SLUGU = new Map(LEAGUE_PAGES.map((l) => [l.slug, l]));
const PO_ID = new Map(LEAGUE_PAGES.map((l) => [l.id, l]));

export function leaguePageBySlug(slug) {
	return PO_SLUGU.get(String(slug || '')) || null;
}

export function leaguePageById(id) {
	return PO_ID.get(Number(id)) || null;
}

/** Ścieżka bez prefiksu języka — do `Link` i mapy witryny. */
export function leaguePath(league) {
	return `/typy-na-dzis/${league.slug}`;
}

export function leagueName(league, locale = 'pl') {
	return locale === 'en' ? league.en : league.pl;
}
