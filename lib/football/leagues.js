/**
 * Rozgrywki dopuszczone do zestawień redakcyjnych, w dwóch poziomach ważności.
 *
 * Ta sama lista rządzi kolejką tygodniową i doborem meczów do raportu AI. Wcześniej
 * mieszkała wyłącznie w `lib/rounds/service.js`, a raport dobierał mecze po liczbie
 * bukmacherów, którzy je wycenili — czyli po sygnale z rynku zakładów. Po usunięciu
 * kursów z raportu potrzebne było jedno źródło prawdy o tym, które rozgrywki w ogóle
 * nas interesują; rozjechanie się tych dwóch list dawałoby kolejkę i raport mówiące
 * o innym świecie.
 *
 * Poziom 1 wchodzi przed poziomem 2. Identyfikatory są stałe po stronie API-Football.
 * Czego nie ma na liście, nie trafia nigdzie — lepszy zestaw ośmiu znanych meczów niż
 * dwunastu z dopełnieniem przypadkowymi rozgrywkami.
 */
export const LEAGUE_TIERS = new Map([
	// Reprezentacje i europejskie puchary — mecze, o których mówią wszyscy.
	[1, 1], // Mistrzostwa świata
	[4, 1], // Mistrzostwa Europy
	[5, 1], // Liga Narodów UEFA
	[2, 1], // Liga Mistrzów
	[3, 1], // Liga Europy
	[848, 1], // Liga Konferencji
	// Czołowa piątka Europy i Ekstraklasa — aplikacja jest polska.
	[39, 1], // Premier League
	[140, 1], // La Liga
	[135, 1], // Serie A
	[78, 1], // Bundesliga
	[61, 1], // Ligue 1
	[106, 1], // Ekstraklasa

	// Poziom 2: mocne ligi krajowe, puchary i rozgrywki spoza Europy.
	[88, 2], // Eredivisie
	[94, 2], // Primeira Liga
	[203, 2], // Süper Lig
	[144, 2], // Jupiler Pro League
	[179, 2], // Premiership (Szkocja)
	[40, 2], // Championship
	[107, 2], // I liga
	[113, 2], // Allsvenskan
	[103, 2], // Eliteserien
	[119, 2], // Superliga (Dania)
	[207, 2], // Super League (Szwajcaria)
	[218, 2], // Bundesliga (Austria)
	[210, 2], // HNL
	[283, 2], // Liga I
	[286, 2], // Super Liga (Serbia)
	[45, 2], // Puchar Anglii
	[48, 2], // Puchar Ligi Angielskiej
	[81, 2], // Puchar Niemiec
	[137, 2], // Puchar Włoch
	[143, 2], // Puchar Króla
	[13, 2], // Copa Libertadores
	[11, 2], // Copa Sudamericana
	[71, 2], // Serie A (Brazylia)
	[128, 2], // Liga Profesional (Argentyna)
	[262, 2], // Liga MX
	[253, 2], // MLS
	[98, 2], // J1 League
	[292, 2], // K League 1
	[307, 2], // Saudi Pro League
]);

/** Poziom rozgrywek albo `null`, gdy ich nie obsługujemy. */
export function leagueTier(leagueId) {
	return LEAGUE_TIERS.get(leagueId) ?? null;
}
