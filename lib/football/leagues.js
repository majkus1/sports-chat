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
	[32, 1], // Eliminacje MŚ — Europa
	[960, 1], // Eliminacje Euro
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
	[34, 2], // Eliminacje MŚ — Ameryka Płd.
	[13, 2], // Copa Libertadores
	[11, 2], // Copa Sudamericana
	[71, 2], // Serie A (Brazylia)
	[128, 2], // Liga Profesional (Argentyna)
	[262, 2], // Liga MX
	[253, 2], // MLS
	[98, 2], // J1 League
	[292, 2], // K League 1
	[307, 2], // Saudi Pro League

	// Dopisane 21.10.2026 po sprawdzianie `lib/model/leagueCheck.mjs` na serwerze: 19 z 49
	// kandydatów, typy razem 5390, obiecane 81,4%, trafione 78,8%. Decyzja właściciela: od razu
	// pełna oferta i główna skuteczność, bez okresu próbnego — te ligi zdały ostrzejszy sprawdzian
	// niż część lig wyżej. W nawiasie: t przewagi nad częstościami ligi i typy obiecane/trafione.
	[136, 2], // Serie B (Włochy) — t 2,8; 79/79%
	[62, 2], // Ligue 2 — t 2,7; 78/76%
	[41, 2], // League One — t 1,5; 79/74%
	[204, 2], // 1. Lig (Turcja) — t 3,2; 85/81%
	[197, 2], // Super League 1 (Grecja) — t 3,8; 82/82%
	[345, 2], // Czech Liga — t 1,7; 82/77%
	[332, 2], // Super Liga (Słowacja) — t 2,2; 80/75%
	[172, 2], // First League (Bułgaria) — t 4,2; 81/81%
	[333, 2], // Premier League (Ukraina) — t 3,2; 83/81%
	[383, 2], // Ligat Ha'al (Izrael) — t 3,3; 82/79%
	[318, 2], // 1. Division (Cypr) — t 2,6; 84/79%
	[235, 2], // Premier League (Rosja) — t 2,0; 82/81%
	[116, 2], // Premier League (Białoruś) — t 1,8; 82/78%
	[239, 2], // Primera A (Kolumbia) — t 2,3; 80/77%
	[281, 2], // Primera División (Peru) — t 1,6; 81/78%
	[255, 2], // USL Championship — t 1,9; 80/77%
	[233, 2], // Premier League (Egipt) — t 3,8; 80/81%
	[301, 2], // Pro League (ZEA) — t 3,6; 82/80%
	[296, 2], // Thai League 1 — t 2,2; 82/79%
]);

/**
 * POZIOM 3 — OKRES PRÓBNY (dziś pusty; mechanizm na przyszłe ligi, gdy wynik sprawdzianu
 * będzie na granicy). Ligi dopisane po sprawdzianie `lib/model/leagueCheck.mjs`
 * (model bije częstości tej ligi z t ≥ 1,5, typy nie przesadzają z procentem).
 *
 * Model liczy w nich wszystko tak samo — plakietki, analizy, kupon live, asystent — bo każda
 * liga ma WŁASNE dopasowanie i dopisanie nowej niczego nie zmienia w prognozach pozostałych
 * (pule pucharowe w `pools.js` mają osobną, zamkniętą listę lig). Ale dopóki liga nie ma
 * historii na produkcji, trzymamy ją z dala od miejsc, za które ręczy serwis:
 *
 *   - typy z tych lig NIE wchodzą do głównej skuteczności — mają osobny licznik
 *     (`/api/stats/picks?leagues=probation`), żeby nowa liga nie mogła po cichu zmienić
 *     liczby, którą pokazujemy na stronie;
 *   - nie trafiają do kuponów (dnia, 3- i 5-dniowego), typu dnia, typów z wyższym kursem,
 *     raportów AI, kolejki tygodniowej ani porannego maila.
 *
 * Awans na poziom 2: po ≥ 150 rozliczonych typach z ligi, gdy trafione są nie niżej niż
 * 6 pkt pod obiecanymi (ta sama miara co w sprawdzianie).
 */
export const PROBATION_TIER = 3;

/** Poziom rozgrywek albo `null`, gdy ich nie obsługujemy. */
export function leagueTier(leagueId) {
	return LEAGUE_TIERS.get(leagueId) ?? null;
}

/** Liga w okresie próbnym (poziom 3). */
export function isProbationLeague(leagueId) {
	return LEAGUE_TIERS.get(leagueId) === PROBATION_TIER;
}

/** Liga sprawdzona na produkcji (poziom 1 albo 2) — tylko takie idą do kuponów, raportów i typu dnia. */
export function isEstablishedLeague(leagueId) {
	const tier = LEAGUE_TIERS.get(leagueId);
	return tier === 1 || tier === 2;
}

/**
 * Filtr do zapytań o GŁÓWNĄ skuteczność typów: bez lig w okresie próbnym. `$ne` przepuszcza
 * też typy bez zapisanego poziomu (starsze i spoza listy) — tak jak dotąd.
 */
export const MAIN_STATS_LEAGUES = { leagueTier: { $ne: PROBATION_TIER } };

/**
 * Grupy rozgrywek do wyboru w kreatorze kuponu (`lib/coupons/custom.js`) — kraje i regiony.
 *
 * DLACZEGO GRUPY, A NIE 69 LIG. Na telefonie lista kilkudziesięciu nazw to formularz, którego nikt
 * nie przewinie, a kibic myśli „Anglia" albo „puchary", nie „League One". Najmocniejsze kraje mają
 * własną grupę, reszta idzie regionami. Nazwy grup (pl/en) są w `lib/coupons/content.js`.
 *
 * Każda liga z `LEAGUE_TIERS` jest w DOKŁADNIE jednej grupie — pilnuje tego test
 * (`test/coupons/custom.test.mjs`), więc dopisana liga bez grupy wywróci go, zanim zniknie z kreatora.
 */
export const LEAGUE_GROUPS = [
	{ id: 'cups', leagues: [2, 3, 848] },
	{ id: 'national', leagues: [1, 4, 5, 32, 960, 34] },
	{ id: 'poland', leagues: [106, 107] },
	{ id: 'england', leagues: [39, 40, 41, 45, 48] },
	{ id: 'spain', leagues: [140, 143] },
	{ id: 'italy', leagues: [135, 136, 137] },
	{ id: 'germany', leagues: [78, 81] },
	{ id: 'france', leagues: [61, 62] },
	{
		id: 'europe',
		leagues: [88, 94, 203, 204, 144, 179, 113, 103, 119, 207, 218, 210, 283, 286, 197, 345, 332, 172, 333, 383, 318, 235, 116],
	},
	{ id: 'americas', leagues: [13, 11, 71, 128, 262, 253, 239, 281, 255] },
	{ id: 'world', leagues: [98, 292, 307, 233, 301, 296] },
];

const GRUPA_LIGI = new Map(LEAGUE_GROUPS.flatMap((g) => g.leagues.map((id) => [id, g.id])));

/** Grupa rozgrywek (`LEAGUE_GROUPS`) albo `null`, gdy liga jest spoza listy. */
export function leagueGroup(leagueId) {
	return GRUPA_LIGI.get(Number(leagueId)) ?? null;
}
