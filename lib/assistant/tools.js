import Pick from '@/models/Pick';
import Report from '@/models/Report';
import ValuePick from '@/models/ValuePick';
import FavoriteMatch from '@/models/FavoriteMatch';
import { fixturesByDate, fixtureById } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';
import { LEAGUE_TIERS, MAIN_STATS_LEAGUES } from '@/lib/football/leagues';
import { getLeagueModel } from '@/lib/model';
import { hintsForDate, modelHintsFor } from '@/lib/model/hints';
import { buildAnalysisModel, goalsForFixture } from '@/lib/analysis/model';
import { MARKET_GROUPS } from '@/lib/picks/markets';
import { MIN_LIFT } from '@/lib/picks/policy';
import { MAX_PROBABILITY } from '@/lib/reports/service';
import { searchNews } from '@/lib/assistant/news';
import { checkQuota, consumeQuota, getEntitlements, hasFeature, recordUsage, trialDaysLeft } from '@/lib/billing/entitlements';
import { TRIAL } from '@/lib/billing/plans';
import { recordSpend } from '@/lib/billing/spendGuard';
import { getLiveCoupon, liveMatch, liveMatchesNow, lockedLiveDto, peekLiveCoupon } from '@/lib/live/service';
import { LIVE_AGREEMENT, LIVE_LEG_MAX_ODDS, LIVE_LEG_MIN_ODDS, LIVE_MINUTES, LIVE_SINGLE, LIVE_TOP } from '@/lib/live/select';
import { dailyOverview, dailyOverviewCached, withTimeout } from '@/lib/daily/service';
import { toolsContent } from '@/lib/tools/content';
import { localDate, localTime } from '@/lib/time';
import { predictFixture } from '@/lib/model';
import { couponsOverview } from '@/lib/coupons/service';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import { SELECTION_SHAPES as KSZTALTY } from '@/lib/picks/markets';
import { findValuePicks, recordValuePicks, valueStats } from '@/lib/value/service';
import { modelMarkets, oddsWindow } from '@/lib/value/select';
import { COUPON_TYPES } from '@/lib/coupons/build';
import { CUSTOM_LEGS, CUSTOM_ODDS, CUSTOM_WINDOWS } from '@/lib/coupons/custom';
import { couponBuilderContent, customImpossibleText } from '@/lib/coupons/content';
import { generateCustomCoupon } from '@/lib/coupons/customService';
import { LEAGUE_GROUPS } from '@/lib/football/leagues';
import { formatScheduleLine, loadMatchSchedule, matchFromFixture, peekMatchSchedule, scheduleNotes } from '@/lib/football/schedule';

/** „2,4–2,8" — przedział kursu łącznego kuponu w opisie narzędzia, z zasad w `lib/coupons/build.js`. */
const przedzialKuponu = (type) =>
	[COUPON_TYPES[type].target, COUPON_TYPES[type].max]
		.map((v) => v.toLocaleString('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
		.join('–');

/**
 * Narzędzia asystenta całej oferty — to, co model językowy może „wcisnąć", żeby dostać liczby.
 *
 * ZASADA: KAŻDA LICZBA W ODPOWIEDZI ASYSTENTA POCHODZI STĄD. Model językowy nie dostaje
 * meczów w kontekście i nie liczy niczego sam — decyduje tylko, które narzędzie wywołać,
 * i układa wynik w zdania. Narzędzia sięgają po ten sam rachunek, który stoi za raportem,
 * analizą i plakietkami na liście: `hintsForDate`, `buildAnalysisModel`, tabela typów.
 * Dzięki temu asystent nie może powiedzieć niczego, czego nie mówi reszta serwisu.
 *
 * WYNIKI SĄ MAŁE. Każde wywołanie zwraca kilkaset bajtów JSON-u, nie pakiet meczu. Koszt
 * pytania to dwa–trzy krótkie wywołania modelu, mieszczące się w limicie pytań do asystenta.
 *
 * Nazwy pól w wynikach są po polsku i opisowe, bo model językowy czyta je jak tekst —
 * `przewaga_pkt` mówi mu więcej niż `lift`.
 *
 * WSZYSTKO, CO UMIE APLIKACJA (od assistant/4): poza meczami i modelem także na żywo (wspólny
 * wynik generatora kuponu live i pojedynczy mecz), analiza na żądanie, raporty, typ dnia, katalog
 * funkcji z dostępem użytkownika, jego ulubione i typy. PLAN DECYDUJE TAK SAMO JAK NA STRONIE:
 * płatna część przychodzi jako pole `dostep` (zdanie dla użytkownika + cennik), nie jako cisza.
 * KOSZT TEŻ TEN SAM: AI woła tylko wspólny wynik live (raz na 3 minuty dla wszystkich), a analiza
 * na żądanie zużywa limit `analysis` dokładnie tą drogą co strona meczu.
 *
 * KREATOR KUPONU (od assistant/6): `zloz_kupon` składa własny kupon użytkownika przez ten sam serwis
 * co przycisk na „Typach na dziś" (`lib/coupons/customService.js`) — ten sam dzienny limit `couponGen`,
 * blokada, zasady i zapis w „Moich kuponach"; „nie da się" wraca z powodem i nie zużywa limitu.
 */

const NIEROZEGRANE = new Set(['NS', 'TBD']);
const MAX_MECZOW = 60;

/** Data w czasie polskim; `dzien(1)` to jutro. */
function dzien(offsetDni = 0) {
	return localDate(new Date(), offsetDni);
}

/** Godzina w czasie polskim — taka, jaką użytkownik widzi na liście. */
function godzina(iso) {
	return localTime(iso);
}

/**
 * Terminarz meczu dla asystenta (`lib/football/schedule.js`): fakty w jednej linii i — tylko przy
 * sygnale — gotowe notki („Legia: w czwartek mecz w Lidze Konferencji (3 dni przerwy)"). `undefined`,
 * gdy nic nie wiemy, żeby pole w ogóle nie trafiło do wyniku.
 */
function opisTerminarza(schedule, { homeName, awayName }, language) {
	const fakty = formatScheduleLine(schedule, { homeName, awayName, language });
	if (!fakty) return undefined;
	const uwagi = scheduleNotes(schedule, { homeName, awayName }, language);
	return { fakty, ...(uwagi.length ? { sygnaly: uwagi } : { sygnaly: 'brak — zwykły terminarz, nie wspominaj o nim' }) };
}

/** Selekcja i przewaga do jednego wiersza — asystent ma to przepisać, nie interpretować. */
function opisHint(hint) {
	return {
		typ: hint.selection,
		prawdopodobienstwo_pct: hint.probability,
		zwykle_pct: Math.round(hint.base),
		przewaga_pkt: hint.lift,
	};
}

/* ------------------------------------------------------------------------------------------ */

export const TOOLS = [
	{
		name: 'mecze_dnia',
		description:
			'Lista meczów z obsługiwanych lig na dany dzień albo kilka kolejnych dni. Przy każdym meczu jest identyfikator (do odnośnika /mecz/ID), data i godzina, liga, status i — jeśli model ma typ — jego selekcja z przewagą nad przeciętną. Użyj, gdy pytanie dotyczy „co dziś gra", konkretnej ligi albo drużyny. Szukając konkretnego meczu po nazwie drużyny, ustaw dni=5, żeby objąć cały najbliższy tydzień.',
		input_schema: {
			type: 'object',
			properties: {
				data: { type: 'string', description: 'YYYY-MM-DD. Pomiń dla dzisiaj.' },
				dni: { type: 'integer', description: 'Ile kolejnych dni od daty objąć (1–5). Domyślnie 1.' },
				liga: { type: 'string', description: 'Fragment nazwy ligi albo kraju, np. "Ekstraklasa", "Premier League", "Poland".' },
				druzyna: { type: 'string', description: 'Fragment nazwy drużyny.' },
			},
		},
	},
	{
		name: 'najlepsze_typy',
		description:
			'Typy modelu na dany dzień, od najbardziej odstających od przeciętnej. To NIE są mecze z najwyższym procentem — to te, w których model widzi najwięcej ponad to, co zdarza się zwykle. Użyj na pytania w rodzaju "co polecasz", "najlepszy typ", "gdzie model coś widzi".',
		input_schema: {
			type: 'object',
			properties: {
				data: { type: 'string', description: 'YYYY-MM-DD. Pomiń dla dzisiaj.' },
				ile: { type: 'integer', description: 'Ile typów zwrócić, 1–10. Domyślnie 5.' },
			},
		},
	},
	{
		name: 'model_dla_meczu',
		description:
			'Pełna prognoza modelu dla jednego meczu: szanse 1/X/2 i wszystkie sześć selekcji z procentem, przeciętną i przewagą, z zaznaczeniem, które przechodzą próg typu, oraz terminarz obu drużyn (poprzedni i następny mecz, dni przerwy, sygnały zmęczenia i rotacji). Użyj, gdy pytanie dotyczy konkretnego meczu, terminarza, zmęczenia albo rotacji, albo żeby wyjaśnić, dlaczego model czegoś nie typuje.',
		input_schema: {
			type: 'object',
			properties: { fixtureId: { type: 'string', description: 'Identyfikator meczu z mecze_dnia.' } },
			required: ['fixtureId'],
		},
	},
	{
		name: 'analiza_meczu',
		description:
			'Analiza AI jednego meczu: streszczenie, kluczowe czynniki, szanse 1/X/2, typy z procentem, przeciętną i przewagą, ryzyka i odnośnik do strony meczu. Domyślnie oddaje GOTOWĄ analizę (bez kosztu). Gdy jej nie ma, mówi, czy da się ją wygenerować i ile to kosztuje — wtedy zapytaj użytkownika. wygeneruj=true tworzy nową analizę (10–30 s) i ZUŻYWA JEDNĄ ANALIZĘ Z LIMITU użytkownika — tylko gdy wprost o to poprosił albo się zgodził. Użyj, gdy pytanie dotyczy powodów, kontekstu, „co mówi analiza", „przeanalizuj mecz".',
		input_schema: {
			type: 'object',
			properties: {
				fixtureId: { type: 'string', description: 'Identyfikator meczu z mecze_dnia albo na_zywo.' },
				wygeneruj: {
					type: 'boolean',
					description: 'true — wygeneruj nową analizę, gdy gotowej nie ma (zużywa jedną analizę z limitu). Domyślnie false.',
				},
			},
			required: ['fixtureId'],
		},
	},
	{
		name: 'na_zywo',
		description:
			'Mecze, które TRWAJĄ TERAZ, i najlepsze typy na żywo z generatora kuponu live (wspólny wynik, odświeżany co 3 minuty). Przy każdym typie: minuta, wynik, kurs live (mediana bukmacherów), szansa według rynku, nasze wyliczenie ze źródłem (model albo kursy sprzed meczu + wynik) i uzasadnienie AI ze statystyk meczu. Do tego: ile meczów sprawdzono, ilu kandydatów oceniło AI, co odrzuciło i dlaczego. Użyj na KAŻDE pytanie o mecze w trakcie: „live", „na żywo", „teraz grają", „typ w trakcie meczu". Bez planu z liczbami przychodzi pole "dostep" i lista trwających meczów bez typów.',
		input_schema: {
			type: 'object',
			properties: {
				ile: { type: 'integer', description: `Ile typów zwrócić, 1–${LIVE_TOP}. Domyślnie 3.` },
			},
		},
	},
	{
		name: 'mecz_na_zywo',
		description:
			'Jeden trwający mecz: wynik, minuta, statystyki (strzały, celne, posiadanie, xG, rożne, faule, kartki), gole i kartki z minutami — a w planie z liczbami także kursy live wszystkich rynków z szansą rynku i naszym wyliczeniem przy obecnym wyniku (źródło: model albo kursy sprzed meczu). Użyj, gdy pytanie dotyczy przebiegu konkretnego meczu w trakcie, albo żeby poprzeć typ live statystykami. Dla meczu, który nie trwa, mówi tylko, w jakim jest stanie.',
		input_schema: {
			type: 'object',
			properties: { fixtureId: { type: 'string', description: 'Identyfikator meczu z na_zywo albo mecze_dnia.' } },
			required: ['fixtureId'],
		},
	},
	{
		name: 'typ_dnia',
		description:
			'Typ dnia — jeden typ modelu dziennie, za darmo dla wszystkich: mecz, typ, procent, przeciętna, przewaga, szanse 1/X/2, stan rozliczenia; wczorajszy z wynikiem i bilans. Gdy dzisiejszy już trwa albo go nie ma — także typ na jutro. Użyj na „typ dnia", „jeden typ na dziś", „co polecacie za darmo".',
		input_schema: { type: 'object', properties: {} },
	},
	{
		name: 'raporty',
		description:
			'Ostatnie raporty AI tego użytkownika — zwykły i „Wyższe kursy" — z typami, ich stanem i odnośnikiem do raportu, plus ile raportów zostało w limicie i gdzie wygenerować nowy. Asystent raportów nie generuje (to dłuższe liczenie na stronie raportów) — podaje odnośnik. Użyj na „mój raport", „co było w raporcie", „wygeneruj raport".',
		input_schema: { type: 'object', properties: {} },
	},
	{
		name: 'funkcje_aplikacji',
		description:
			'Katalog funkcji serwisu z odnośnikami i informacją, czy TEN użytkownik ma do nich dostęp: jego plan, okres próbny, ile zostało z limitów (analizy, pytania, raporty, wyszukiwania), kredyty. Użyj na pytania „co potrafi aplikacja", „gdzie znajdę X", „czy mam dostęp do Y", „ile mam analiz", „co daje Pro".',
		input_schema: {
			type: 'object',
			properties: {
				szukaj: { type: 'string', description: 'Opcjonalnie fragment nazwy funkcji, np. "kupon", "raport", "live". Pomiń, żeby dostać wszystkie.' },
			},
		},
	},
	{
		name: 'moje_mecze_i_typy',
		description:
			'Ulubione mecze użytkownika (nadchodzące, trwające i ostatnie) i jego własne typy — czekające na wynik i ostatnio rozliczone. Użyj na „moje typy", „moje mecze", „co z meczami, które obserwuję". Skuteczność w liczbach daje skutecznosc (czyja: moja).',
		input_schema: { type: 'object', properties: {} },
	},
	{
		name: 'aktualnosci',
		description:
			'Najnowsze wiadomości z internetu (ostatnie 7 dni) o drużynie, zawodniku albo meczu: kontuzje, zawieszenia, przewidywany skład, trener, transfery. Zwraca streszczenie w punktach i listę źródeł z adresami. UŻYWAJ TYLKO, gdy pytanie dotyczy wiadomości, składu, kontuzji, formy pozaboiskowej — nie do pytań o liczby. Wiadomości NIE zmieniają prawdopodobieństw z modelu. Dostępne w planach płatnych; gdy wynik ma pole "niedostepne", powiedz to użytkownikowi wprost.',
		input_schema: {
			type: 'object',
			properties: {
				zapytanie: { type: 'string', description: 'O czym szukać, np. "Legia Warszawa kontuzje", "Bayern Union Berlin skład".' },
			},
			required: ['zapytanie'],
		},
	},
	{
		name: 'kupony',
		description:
			`Kupony: kupon dnia (kurs łączny ${przedzialKuponu('daily')}, za darmo), kupon na 3 dni (${przedzialKuponu('days3')}) ` +
			`i na 5 dni (${przedzialKuponu('days5')}) — dwa ostatnie w planie Pro i VIP oraz przez ${TRIAL.days} dni po założeniu konta. ` +
			'Mecze, typy, kurs każdego typu (mediana bukmacherów), kurs łączny, szansa według modelu, stan rozliczenia i bilans. Gdy użytkownik nie ma planu, płatne kupony przychodzą bez meczów. Użyj, gdy pytanie dotyczy kuponu, „czegoś po kursie 2–3" albo pewniejszej drogi do wyższego kursu. Gdy użytkownik prosi, żeby ZŁOŻYĆ mu kupon według jego ustawień — zloz_kupon.',
		input_schema: { type: 'object', properties: {} },
	},
	{
		name: 'zloz_kupon',
		description:
			'Kreator kuponu: SKŁADA WŁASNY kupon użytkownika z meczów, które jeszcze się nie zaczęły, według jego ustawień — kurs łączny ok. 2,0, 2,5 albo 3,0, najwyżej 2–5 meczów, okno pierwszego gwizdka i opcjonalnie grupy lig. Te same zasady co kupony serwisu (typy modelu z kursem 1,05–1,40, przy których bukmacherzy są co najmniej tak pewni jak model, mecze 12:00–23:00), a przed pokazaniem AI sprawdza wiadomości o każdym typie (10–60 s). Plan Pro, VIP i okres próbny, z DZIENNYM limitem; jeden kupon z limitu schodzi TYLKO wtedy, gdy kupon powstanie. Użyj, gdy użytkownik wprost prosi „złóż mi kupon…", „zrób kupon na wieczór po 2,5", „kupon z 3 meczów z Anglii". Nie wołaj dla pytań o gotowe kupony serwisu (to kupony) ani „na wszelki wypadek".',
		input_schema: {
			type: 'object',
			properties: {
				kurs: {
					type: 'number',
					enum: CUSTOM_ODDS.map((o) => o.nominal),
					description: 'Cel kursu łącznego: 2 (ok. 2,0), 2.5 (ok. 2,5) albo 3 (ok. 3,0). Domyślnie 2.5.',
				},
				mecze: {
					type: 'integer',
					minimum: CUSTOM_LEGS.min,
					maximum: CUSTOM_LEGS.max,
					description: 'Najwyżej tyle meczów na kuponie (2–5). Domyślnie 4. Przy kursie ok. 2,0 i 2,5 potrzeba co najmniej 3, przy 3,0 — 4.',
				},
				okno: {
					type: 'string',
					enum: CUSTOM_WINDOWS,
					description: 'Kiedy mecze mają się zaczynać: today — dziś do 23:00, evening — dziś wieczorem 18–23, h24 — najbliższe 24 godziny, days3 — najbliższe 3 dni. Domyślnie today.',
				},
				ligi: {
					type: 'array',
					items: { type: 'string', enum: LEAGUE_GROUPS.map((g) => g.id) },
					description:
						'Opcjonalnie grupy lig: cups (puchary europejskie), national (reprezentacje), poland, england, spain, italy, germany, france, europe (reszta Europy), americas, world (Azja i Afryka). Pomiń — wszystkie.',
				},
				bez_kuponow_serwisu: {
					type: 'boolean',
					description: 'true — inne mecze niż w dzisiejszych kuponach serwisu (dnia, 3- i 5-dniowym). Domyślnie false.',
				},
			},
		},
	},
	{
		name: 'kursy_meczu',
		description:
			'Kursy jednego meczu (mediana kilku bukmacherów) i szanse, które z nich wynikają, obok szans modelu — dla 1/X/2, podwójnej szansy, goli drużyn i powyżej 2,5. Użyj, gdy użytkownik pyta o kurs konkretnego meczu albo o porównanie modelu z rynkiem.',
		input_schema: {
			type: 'object',
			properties: { fixtureId: { type: 'string', description: 'Identyfikator meczu z mecze_dnia.' } },
			required: ['fixtureId'],
		},
	},
	{
		name: 'wyzszy_kurs',
		description:
			'Typy z wyższym kursem: od podanego progu (domyślnie 2,0) do progu + 0,3, na najbliższe 24 godziny albo 3 dni. Wybiera mecze, w których szansa według rynku jest najwyższa przy takim kursie, a model się z rynkiem zgadza. Zwraca kurs, szansę według rynku i według modelu oraz publiczny bilans takich typów. Użyj, gdy użytkownik prosi o typ „po kursie 2", „powyżej kursu X", „z wyższym kursem".',
		input_schema: {
			type: 'object',
			properties: {
				min_kurs: { type: 'number', description: 'Próg kursu, 1,5–5. Domyślnie 2,0.' },
				dni: { type: 'integer', description: '1 — najbliższe 24 godziny (domyślnie), 3 — trzy dni.' },
			},
		},
	},
	{
		name: 'skutecznosc',
		description:
			'Skuteczność typów: całego serwisu (typy AI, publiczna statystyka) albo tego użytkownika. Trafienia, chybienia, procent i to, ile wynosi przeciętna dla tych samych typów. Użyj na pytania "jak wam idzie", "jaką mam skuteczność", "czy to działa".',
		input_schema: {
			type: 'object',
			properties: {
				czyja: { type: 'string', enum: ['serwis', 'moja'], description: 'Domyślnie "serwis".' },
			},
		},
	},
];

/* ------------------------------------------------------------------------------------------ */

async function meczeDnia({ data, dni, liga, druzyna }) {
	const start = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : dzien(0);
	const ileDni = Math.min(5, Math.max(1, Number(dni) || 1));
	// Kilka dni naraz, bo pytanie „co z meczem Legii?" rzadko dotyczy akurat dzisiaj.
	const daty = Array.from({ length: ileDni }, (_, i) =>
		new Date(Date.parse(start) + i * 86_400_000).toISOString().slice(0, 10)
	);
	const rows = [];
	for (const d of daty) rows.push(...(await fixturesByDate(d)));
	const date = daty.length === 1 ? daty[0] : `${daty[0]} – ${daty[daty.length - 1]}`;

	const szukajLigi = (liga || '').toLowerCase().trim();
	const szukajDruzyny = (druzyna || '').toLowerCase().trim();

	const mecze = rows
		.map(normalizeFixture)
		.filter(Boolean)
		.filter((f) => LEAGUE_TIERS.has(f.league?.id))
		.filter((f) => {
			const ligaTxt = `${f.league?.name || ''} ${f.league?.country || ''}`.toLowerCase();
			const druzynyTxt = `${f.teams?.home?.name || ''} ${f.teams?.away?.name || ''}`.toLowerCase();
			if (szukajLigi && !ligaTxt.includes(szukajLigi)) return false;
			if (szukajDruzyny && !druzynyTxt.includes(szukajDruzyny)) return false;
			return true;
		})
		.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

	/*
	 * Podpowiedzi modelu tylko dla meczów, które przeszły filtr — nie dla całego dnia.
	 * Pytanie o jedną drużynę w pięciu dniach dotyczy kilku meczów, a liczenie modelu dla
	 * wszystkich ~150 spotkań każdego dnia dopasowywałoby wszystkie ligi po nic. Bez filtrów
	 * i przy jednym dniu bierzemy gotowy wynik z cache'u dnia, wspólny z listą meczów.
	 */
	const teraz = Date.now();
	const byId =
		daty.length === 1 && !szukajLigi && !szukajDruzyny
			? (await hintsForDate(date)).byId
			: await modelHintsFor(mecze.filter((f) => Date.parse(f.date) > teraz).slice(0, MAX_MECZOW));

	const lista = mecze.slice(0, MAX_MECZOW).map((f) => {
		const hint = byId.get(String(f.id));
		return {
			fixtureId: String(f.id),
			mecz: `${f.teams?.home?.name} – ${f.teams?.away?.name}`,
			liga: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
			data: localDate(new Date(f.date)),
			godzina: godzina(f.date),
			status: f.status?.isFinished
				? `zakończony ${f.goals?.home ?? '?'}:${f.goals?.away ?? '?'}`
				: f.status?.isLive
					? `w trakcie ${f.goals?.home ?? 0}:${f.goals?.away ?? 0}`
					: NIEROZEGRANE.has(f.status?.code)
						? 'przed meczem'
						: f.status?.code,
			...(hint ? { typ_modelu: opisHint(hint) } : {}),
		};
	});

	return {
		data: date,
		meczow_w_obslugiwanych_ligach: mecze.length,
		pokazano: lista.length,
		uwaga: mecze.length > MAX_MECZOW ? `Pokazano ${MAX_MECZOW} z ${mecze.length} — zawęź ligę albo drużynę.` : undefined,
		mecze: lista,
	};
}

/*
 * LICZBY MODELU BEZ PLANU — ŚWIADOMIE (decyzja właściciela, 24.10.2026). Lista meczów pokazuje
 * procenty przy plakietkach tylko w Pro, VIP i okresie próbnym (`model_hints`), a asystent podaje
 * je w `najlepsze_typy` i `model_dla_meczu` każdemu. To próbka płatnej funkcji: pytań do asystenta
 * jest ograniczona pula, więc nie zastępuje planu. Kupony płatne, kupon live i szanse na żywo
 * (`na_zywo`, `mecz_na_zywo`) zostają pod planem — tak jak w aplikacji.
 */
async function najlepszeTypy({ data, ile }, { language = 'pl' } = {}) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : dzien(0);
	const limit = Math.min(10, Math.max(1, Number(ile) || 5));
	const { list } = await hintsForDate(date);

	return {
		data: date,
		prog_typu_pkt: MIN_LIFT,
		meczow_z_typem: list.length,
		typy: list.slice(0, limit).map((w) => {
			/*
			 * Terminarz WYŁĄCZNIE z pamięci procesu (zero zapytań): drużyny, o które ktoś już pytał —
			 * analiza, kupon, raport. Lista typów to do dziesięciu meczów i nie może za każdym razem
			 * dociągać terminarzy; pełny ma model_dla_meczu.
			 */
			const notki = scheduleNotes(
				peekMatchSchedule({ fixtureId: w.fixtureId, kickoff: w.kickoff, leagueId: w.leagueId, homeId: w.homeId, awayId: w.awayId }),
				{ homeName: w.home, awayName: w.away },
				language
			);
			return {
				fixtureId: w.fixtureId,
				mecz: `${w.home} – ${w.away}`,
				liga: w.league,
				godzina: godzina(w.kickoff),
				...opisHint(w.hint),
				...(notki.length ? { terminarz: notki } : {}),
			};
		}),
	};
}

async function modelDlaMeczu({ fixtureId }, { language = 'pl', zrodla: z = ZRODLA } = {}) {
	const raw = (await fixtureById(String(fixtureId)))?.[0];
	const fixture = raw ? normalizeFixture(raw) : null;
	if (!fixture) return { blad: 'Nie znam takiego meczu.' };

	if (!LEAGUE_TIERS.has(fixture.league?.id)) {
		return {
			mecz: `${fixture.teams?.home?.name} – ${fixture.teams?.away?.name}`,
			liga: fixture.league?.name,
			model: null,
			powod: 'Ta liga nie jest na liście rozgrywek, dla których liczymy model.',
		};
	}

	// Terminarz równolegle z modelem: jedno zapytanie na drużynę o najbliższe mecze (6 h w pamięci).
	const terminarzP = Promise.resolve(z.matchSchedule(matchFromFixture(fixture))).catch(() => null);
	const leagueModel = await getLeagueModel({ leagueId: fixture.league?.id, season: fixture.league?.season });
	const goals = await goalsForFixture(leagueModel, fixture);
	const wynik = buildAnalysisModel({ leagueModel, fixture, goals });
	const terminarz = opisTerminarza(
		await terminarzP,
		{ homeName: fixture.teams?.home?.name ?? '?', awayName: fixture.teams?.away?.name ?? '?' },
		language
	);
	if (!wynik) {
		return {
			mecz: `${fixture.teams?.home?.name} – ${fixture.teams?.away?.name}`,
			liga: fixture.league?.name,
			model: null,
			powod: 'Za mało danych: liga na starcie sezonu albo drużyna, której model jeszcze nie zna.',
			terminarz,
		};
	}

	return {
		fixtureId: String(fixture.id),
		mecz: `${fixture.teams?.home?.name} – ${fixture.teams?.away?.name}`,
		liga: fixture.league?.name,
		godzina: godzina(fixture.date),
		w_trakcie: wynik.inPlay ? `${wynik.minute}' ${wynik.score?.home}:${wynik.score?.away}` : undefined,
		// Poprzedni i następny mecz obu drużyn — liczb modelu nie zmienia (model terminarza nie zna).
		terminarz,
		szanse_pct: { gospodarz: wynik.probabilities.home, remis: wynik.probabilities.draw, gosc: wynik.probabilities.away },
		najbardziej_prawdopodobny_wynik: wynik.likeliestScore
			? `${wynik.likeliestScore.home}:${wynik.likeliestScore.away}`
			: undefined,
		prog_typu_pkt: MIN_LIFT,
		/*
		 * `pomijane_jako_pewne`: raport i plakietki odrzucają selekcje powyżej MAX_PROBABILITY —
		 * zdarzenie niemal pewne nie jest typem. Bez tego pola asystent mówiłby, że Bayern
		 * u siebie „przechodzi próg" przy 93%, a chwilę później nie znajdował go w najlepszych
		 * typach. Oba narzędzia mają mówić jednym głosem.
		 */
		selekcje: wynik.selections.map((s) => ({
			typ: s.selection,
			prawdopodobienstwo_pct: s.probability,
			zwykle_pct: Math.round(s.base),
			przewaga_pkt: s.lift,
			przechodzi_prog: s.eligible && s.probability <= MAX_PROBABILITY,
			...(s.eligible && s.probability > MAX_PROBABILITY
				? { pomijane_jako_pewne: `powyżej ${MAX_PROBABILITY}% — to niemal pewne, więc nie wystawiamy tego jako typu` }
				: {}),
		})),
	};
}

/** Analiza w kilku polach — tyle, ile asystent ma streścić; pełna jest pod odnośnikiem. */
function opisAnalizy({ sections: s, analysis, createdAt }, { fixtureId, language }) {
	const link = `/${language}/mecz/${fixtureId}`;
	// Stare zapisy mają sam tekst, bez struktury — wtedy oddajemy jego początek.
	if (!s) return { streszczenie: String(analysis || '').slice(0, 1200), link };
	const typy = (s.picks || []).map((p) => ({
		typ: `${p.market}: ${p.selection}`,
		prawdopodobienstwo_pct: p.probability,
		...(Number.isFinite(p.baseRate) ? { zwykle_pct: Math.round(p.baseRate), przewaga_pkt: p.lift } : {}),
	}));
	const p = s.probabilities;
	return {
		...(createdAt ? { wygenerowana: dataGodzina(createdAt) } : {}),
		...(s.model?.inPlay ? { stan_meczu: `analiza z ${s.model.minute}. minuty` } : {}),
		streszczenie: s.summary,
		czynniki: (s.keyFactors || []).slice(0, 5).map((k) => (k.detail ? `${k.title}: ${k.detail}` : k.title || k.text || k)),
		...(Number.isFinite(p?.home) ? { szanse_pct: { gospodarz: p.home, remis: p.draw, gosc: p.away } } : {}),
		typy,
		// Notki terminarza zapisane przy analizie (tylko przy sygnale) — bez nowego zapytania.
		...(s.schedule?.notes?.length ? { terminarz: s.schedule.notes } : {}),
		/*
		 * Bez typu analiza daje kierunek (`bestLeaning`) — selekcję poniżej progu. Asystent ma ją
		 * nazwać kierunkiem, nie typem, tak jak robi to strona meczu.
		 */
		...(!typy.length && s.leaning
			? {
					kierunek_ponizej_progu: {
						typ: `${s.leaning.market}: ${s.leaning.selection}`,
						prawdopodobienstwo_pct: s.leaning.probability,
						...(Number.isFinite(s.leaning.base) ? { zwykle_pct: Math.round(s.leaning.base), przewaga_pkt: s.leaning.lift } : {}),
					},
				}
			: {}),
		ryzyka: (s.risks || []).slice(0, 4),
		link,
	};
}

/** Ile kosztuje następna analiza — zdanie dla użytkownika z wyniku `checkQuota`. */
function kosztAnalizy(q) {
	if (q.limit === null) return 'bez limitu w Twoim planie';
	if (q.usingCredit) return `limit planu wykorzystany — zapłacisz kredytami (${q.creditCost}, masz ${q.credits})`;
	return `jedna analiza z limitu — zostało ${q.remaining} z ${q.limit}`;
}

/**
 * Analiza meczu: gotowa albo — na wyraźną prośbę — nowa, tą samą drogą co strona meczu.
 *
 * DWA KROKI, BO TO KOSZTUJE. Bez `wygeneruj` narzędzie tylko czyta: gotowa analiza (z zaliczeniem
 * odsłony, jak na stronie) albo informacja, ile kosztowałaby nowa. Asystent ma wtedy zapytać, a
 * generuje dopiero po zgodzie — inaczej pytanie „co sądzisz o meczu X?" po cichu zjadałoby limit.
 *
 * TA SAMA DROGA. Generowanie to `prepareAnalysisFor` + `generateAnalysis` z `lib/analysis/service`
 * — ta sama blokada (jedna analiza konta naraz, także ze stroną meczu), limit `analysis`, próg
 * wydatków, blokada analizy na żywo bez planu, zapis w bazie, typy do skuteczności i dziennik kosztu.
 */
async function analizaMeczu({ fixtureId, wygeneruj }, { userId, user, language, zrodla: z }) {
	const id = String(fixtureId || '').trim();
	if (!/^\d{1,12}$/.test(id)) return { blad: 'Podaj identyfikator meczu z mecze_dnia albo na_zywo.' };
	if (!userId) return { niedostepne: 'Analiza wymaga zalogowania.' };
	const cel = { fixtureId: id, language };
	const cennik = `/${language}/cennik`;

	if (wygeneruj !== true) {
		const gotowa = await z.readAnalysis({ user, userId, fixtureId: id, language });
		if (gotowa?.status === 'blocked') return { niedostepne: gotowa.message, cennik };
		if (gotowa) return { zrodlo: 'gotowa analiza — limit nie został zużyty', ...opisAnalizy(gotowa, cel) };

		const [mecz, q] = await Promise.all([z.fixture(id), z.checkQuota({ kind: 'analysis', user, userId })]);
		if (!mecz) return { blad: 'Nie znam takiego meczu.' };
		const brak = { analiza: null, powod: 'Nikt jeszcze nie wygenerował analizy tego meczu (albo analiza na żywo sprzed kwadransa wygasła).' };
		if (mecz.status?.isCancelled) return { analiza: null, powod: 'Ten mecz się nie odbędzie — nie ma czego analizować.' };
		if (mecz.status?.isLive && !hasFeature(user, 'live_analysis')) {
			return {
				...brak,
				mozna_wygenerowac: false,
				dostep: `Analiza meczu w trakcie jest w planie Pro i VIP — powiedz to i podaj link ${cennik}. Wynik i statystyki meczu da narzędzie mecz_na_zywo.`,
			};
		}
		if (!q.allowed) {
			return {
				...brak,
				mozna_wygenerowac: false,
				dostep: `Limit analiz w Twoim planie jest wykorzystany (${q.used} z ${q.limit}) — powiedz to i podaj link ${cennik}.`,
			};
		}
		return {
			...brak,
			mozna_wygenerowac: true,
			koszt: kosztAnalizy(q),
			instrukcja_dla_asystenta:
				'Zapytaj użytkownika, czy wygenerować analizę, i powiedz, ile to kosztuje (pole koszt). Wywołaj analiza_meczu z wygeneruj: true dopiero po jego zgodzie albo gdy wprost poprosił o wygenerowanie.',
			link: `/${language}/mecz/${id}`,
		};
	}

	const prepared = await z.prepareAnalysis({ userId, fixtureId: id, language });
	if (prepared.status === 'cached') return { zrodlo: 'gotowa analiza — już istniała, limit nie został zużyty', ...opisAnalizy(prepared, cel) };
	if (prepared.status === 'blocked') {
		return {
			niedostepne: prepared.message,
			...(['plan_required', 'limit_exceeded'].includes(prepared.code) ? { cennik } : {}),
			link: `/${language}/mecz/${id}`,
		};
	}
	try {
		const { sections } = await z.generateAnalysis(prepared, cel);
		const q = prepared.quota;
		return {
			zrodlo: 'nowa analiza — wygenerowana teraz',
			zuzyto: q.limit === null ? 'nic — plan bez limitu' : q.usingCredit ? `kredyty (${q.creditCost})` : 'jedną analizę z limitu',
			...(q.limit !== null && !q.usingCredit ? { pozostalo_analiz: Math.max(0, q.remaining - 1) } : {}),
			...opisAnalizy({ sections, createdAt: new Date() }, cel),
		};
	} catch (error) {
		// Odmowa modelu to odpowiedź, nie awaria — limit nie został naliczony (`finalizeAnalysis` nie doszło).
		if (error?.name === 'AiRefusalError') return { blad: 'Model nie mógł przygotować analizy tego meczu.' };
		throw error;
	} finally {
		await prepared.release();
	}
}

async function skutecznosc({ czyja }, { userId }) {
	const moja = czyja === 'moja';
	if (moja && !userId) return { blad: 'Użytkownik nie jest zalogowany.' };

	const filtr = moja
		? { author: 'user', userId, status: { $in: ['won', 'lost'] } }
		: { author: 'ai', countsToStats: true, ...MAIN_STATS_LEAGUES, status: { $in: ['won', 'lost'] } };

	const rows = await Pick.find(filtr).select('status normalized baseRate').lean();
	const podsumuj = (lista) => {
		const won = lista.filter((p) => p.status === 'won').length;
		const zBaza = lista.filter((p) => Number.isFinite(p.baseRate));
		const norma = zBaza.length ? zBaza.reduce((s, p) => s + p.baseRate, 0) / zBaza.length : null;
		const pct = lista.length ? Math.round((100 * won) / lista.length) : null;
		return {
			rozliczone: lista.length,
			trafione: won,
			chybione: lista.length - won,
			skutecznosc_pct: pct,
			...(norma !== null ? { zwykle_pct: Math.round(norma), przewaga_pkt: Math.round(pct - norma) } : {}),
		};
	};

	const wgRynku = {};
	for (const [typ, nazwa] of Object.entries(MARKET_GROUPS)) {
		const lista = rows.filter((p) => p.normalized?.type === typ);
		if (lista.length) wgRynku[nazwa] = podsumuj(lista);
	}

	return {
		czyja: moja ? 'moja' : 'serwis',
		razem: podsumuj(rows),
		wg_rynku: wgRynku,
		uwaga: rows.length < 30 ? 'Mała próba — procent może się jeszcze mocno zmienić.' : undefined,
	};
}

/**
 * Wiadomości z internetu — jedyne narzędzie, które samo kosztuje i samo pilnuje limitu.
 *
 * Limit `aiNews` sprawdzany i zaliczany TUTAJ, per wyszukanie, a nie per pytanie: pytanie
 * bez wyszukiwania nie może zjadać puli wyszukiwań. Plan bez tej puli (darmowy) dostaje
 * `niedostepne` z konkretnym zdaniem dla użytkownika — model ma je przekazać, nie zgadywać.
 * Zaliczenie dopiero po udanym wyszukaniu, jak wszędzie: nieudane nie kosztuje.
 */
async function aktualnosci({ zapytanie }, { userId, user, language }) {
	if (!userId) return { niedostepne: 'Wyszukiwanie wiadomości wymaga zalogowania.' };
	const query = String(zapytanie || '').trim();
	if (!query) return { blad: 'Podaj, o czym szukać.' };

	const quota = await checkQuota({ kind: 'aiNews', user, userId });
	if (!quota.allowed) {
		return {
			niedostepne:
				quota.limit === 0
					? 'Wyszukiwanie wiadomości z internetu jest dostępne w planach Pro i VIP.'
					: `Wykorzystany limit wyszukiwań wiadomości (${quota.limit}). Odnawia się z nowym 30-dniowym okresem planu.`,
		};
	}

	const { summary, sources, meta } = await searchNews({ query, language });

	await consumeQuota({ kind: 'aiNews', user, userId, usingCredit: quota.usingCredit });
	await recordSpend(meta.costUsd);
	await recordUsage({
		userId,
		kind: 'aiNews',
		plan: quota.plan,
		provider: meta.provider,
		model: meta.model,
		tokensIn: meta.tokensIn,
		tokensOut: meta.tokensOut,
		costUsd: meta.costUsd,
	});

	return {
		zapytanie: query,
		streszczenie: summary,
		zrodla: sources.slice(0, 6).map((s) => ({ tytul: s.title, url: s.url })),
		pozostalo_wyszukan: quota.limit === null ? null : Math.max(0, quota.limit - quota.used - 1),
		zasada: 'Te wiadomości to kontekst i ryzyka. NIE zmieniaj przez nie żadnego procentu z modelu.',
	};
}

/** Dzień tygodnia i godzina — kupony 3- i 5-dniowe i typy na 3 dni obejmują kilka dni. */
function kiedy(iso) {
	const dzienTyg = new Date(iso).toLocaleDateString('pl-PL', { timeZone: 'Europe/Warsaw', weekday: 'short' });
	return `${dzienTyg} ${godzina(iso)}`;
}

function opisKuponu(c) {
	if (!c) return null;
	if (c.status === 'none') return { stan: 'brak — model nie złożył kuponu (za mało pewnych typów)' };
	if (c.locked) {
		return {
			dostep: `Mecze i typy tego kuponu widać w planie Pro i VIP (i przez ${TRIAL.days} dni po założeniu konta) — powiedz to i podaj link /cennik.`,
			kurs_laczny: c.totalOdds,
			szansa_wg_modelu_pct: c.chance,
			liczba_typow: c.legsCount,
			od: kiedy(c.firstKickoff),
			do: kiedy(c.lastKickoff),
		};
	}
	return {
		stan: { pending: 'przed meczami albo w grze', won: 'wszedł', lost: 'nie wszedł', void: 'anulowany' }[c.status],
		kurs_laczny: c.totalOdds,
		...(c.settledOdds ? { kurs_po_rozliczeniu: c.settledOdds } : {}),
		szansa_wg_modelu_pct: c.chance,
		typy: c.legs.map((l) => ({
			fixtureId: l.fixtureId,
			mecz: `${l.home} – ${l.away}`,
			kiedy: kiedy(l.kickoff),
			typ: l.selection,
			kurs: l.odds,
			szansa_wg_modelu_pct: l.probability,
			stan: l.status,
			...(l.score ? { wynik: l.score } : {}),
		})),
	};
}

async function kupony(_input, { user }) {
	const ov = await couponsOverview({ unlocked: hasFeature(user, 'model_hints') });
	const bilans = (r) => `${r.won} z ${r.total} weszło`;
	return {
		kupon_dnia: opisKuponu(ov.today) || (ov.todayLater ? 'pojawi się dziś o 9:30' : 'dziś brak'),
		kupon_na_3_dni: opisKuponu(ov.days3) || (ov.paidLater ? 'pojawi się dziś o 9:30' : 'brak'),
		kupon_na_5_dni: opisKuponu(ov.days5) || (ov.paidLater ? 'pojawi się dziś o 9:30' : 'brak'),
		wczorajszy_kupon_dnia: opisKuponu(ov.yesterday),
		bilans: {
			kupony_dnia: bilans(ov.record.daily),
			kupony_3_dniowe: bilans(ov.record.days3),
			kupony_5_dniowe: bilans(ov.record.days5),
		},
		zasady:
			'Kupon składa się z plakietek modelu z kursem 1,05–1,40, przy których bukmacherzy są co najmniej tak pewni jak model (tam model trafia tyle, ile obiecuje), tylko mecze 12:00–23:00. Kurs łączny 2,4–2,8 dla wszystkich trzech kuponów, jak najmniej typów (dnia najwyżej 4, 3- i 5-dniowy najwyżej 5), a przy tej samej liczbie — najpewniejsze według modelu. Każdy kupon ma inne mecze. Kursy to mediana bukmacherów z chwili wyboru — u polskich bukmacherów kurs bywa niższy, a podatek 12% od stawki zmniejsza wypłatę. Szczegóły na stronie /typy-na-dzis.',
	};
}

/**
 * Kreator kuponu z rozmowy — ten sam serwis co przycisk „Złóż kupon" (`generateCustomCoupon`): ten
 * sam dzienny limit, blokada, zasady, sprawdzenie wiadomości i zapis w „Moich kuponach". Asystent
 * niczego tu nie wybiera sam — przekazuje ustawienia z pytania, a wynik przepisuje.
 */
async function zlozKupon(input, { userId, user, language, zrodla: z }) {
	if (!userId) return { niedostepne: 'Kreator kuponu wymaga zalogowania.' };
	const c = couponBuilderContent(language);
	const params = {
		odds: input.kurs,
		legs: input.mecze,
		window: input.okno,
		leagues: Array.isArray(input.ligi) && input.ligi.length ? input.ligi : undefined,
		skipPublished: typeof input.bez_kuponow_serwisu === 'boolean' ? input.bez_kuponow_serwisu : undefined,
	};
	const w = await z.customCoupon({ userId, user, params });
	const mojeKupony = `/${language}/moje-kupony`;
	const zostalo = (q) => (q?.limit === null || q?.limit === undefined ? 'bez limitu' : `${q.remaining} z ${q.limit} na dziś`);

	if (w.status === 'invalid') return { blad: `Złe ustawienia kuponu (${w.errors.join(', ')}). Dozwolone: kurs 2, 2.5 albo 3; mecze 2–5.` };
	if (w.status === 'plan_required') {
		return {
			dostep: `${c.locked.body} Podaj odnośnik do cennika.`,
			cennik: `/${language}/cennik`,
		};
	}
	if (w.status === 'limit') {
		return { niedostepne: `Dzisiejszy limit kreatora kuponu (${w.quota?.limit}) jest wykorzystany — odnawia się o północy. Gotowe kupony serwisu podaje narzędzie kupony.` };
	}
	if (w.status === 'busy') return { blad: 'Kupon tego użytkownika już się składa w innym oknie — poczekaj chwilę.' };
	if (w.status === 'impossible') {
		const t = customImpossibleText(language, w);
		return {
			nie_da_sie: t.reason,
			...(t.partial ? { uwaga: t.partial } : {}),
			...(w.dropped?.length
				? { odrzucone_po_wiadomosciach: w.dropped.map((d) => ({ mecz: `${d.homeName} – ${d.awayName}`, typ: d.selection, powod: d.reason })) }
				: {}),
			podpowiedzi: t.suggestions,
			limit: `nie został zużyty — zostało ${zostalo(w.quota)}`,
		};
	}

	const k = w.coupon;
	return {
		kupon: {
			ustawienia: c.paramsLine(k.params),
			kurs_laczny: k.totalOdds,
			szansa_wg_modelu_pct: k.chance,
			typy: k.legs.map((l) => ({
				fixtureId: l.fixtureId,
				mecz: `${l.home} – ${l.away}`,
				kiedy: kiedy(l.kickoff),
				liga: l.league,
				typ: l.selection,
				kurs: l.odds,
				szansa_wg_modelu_pct: l.probability,
				...(l.schedule?.pl ? { terminarz: language === 'en' ? l.schedule.en : l.schedule.pl } : {}),
				link: `/${language}/mecz/${l.fixtureId}`,
			})),
		},
		wiadomosci: k.newsSkipped
			? 'nie sprawdzono (dzienny limit kosztów AI) — powiedz to wprost'
			: {
					sprawdzono_typow: k.newsCheck?.checked ?? 0,
					odrzucone: (k.newsCheck?.dropped || []).map((d) => ({ mecz: d.match, typ: d.selection, powod: d.reason })),
				},
		...(w.repeated ? { powtorka: 'ten sam kupon co przed chwilą — limit nie został zużyty' } : {}),
		limit: `zostało ${zostalo(w.quota)}`,
		moje_kupony: mojeKupony,
		zasada:
			'Pokaż kurs łączny i szansę według modelu obok siebie, potem mecze z typem i kursem. Dopisz, że wyższy kurs to mniejsza szansa, że to szacunki, nie pewniaki, że kurs to mediana bukmacherów (u polskich bywa niższy, podatek 12%), i że kupon jest zapisany w „Moich kuponach" i nie wchodzi do publicznej skuteczności. 18+.',
	};
}

const RYNKI_MECZU = [
	['home', 'home'],
	['draw', null],
	['away', 'away'],
	['dc1X', '1X'],
	['dcX2', 'X2'],
	['homeScores', 'homeScores'],
	['awayScores', 'awayScores'],
	['over25', 'over25'],
];

async function kursyMeczu({ fixtureId }) {
	const raw = (await fixtureById(String(fixtureId)))?.[0];
	const fixture = raw ? normalizeFixture(raw) : null;
	if (!fixture) return { blad: 'Nie znam takiego meczu.' };
	const nazwy = { homeName: fixture.teams?.home?.name ?? '?', awayName: fixture.teams?.away?.name ?? '?' };
	const zdjecie = await fetchOddsSnapshot(String(fixture.id));
	if (!zdjecie?.bookmakers) return { mecz: `${nazwy.homeName} – ${nazwy.awayName}`, kursy: null, powod: 'Bukmacherzy nie wystawili jeszcze kursów na ten mecz.' };

	const prognoza = LEAGUE_TIERS.has(fixture.league?.id)
		? await predictFixture({
				leagueId: fixture.league?.id,
				season: fixture.league?.season,
				homeId: fixture.teams?.home?.id,
				awayId: fixture.teams?.away?.id,
			})
		: null;
	const model = prognoza?.known ? { ...modelMarkets(prognoza), draw: prognoza.matchWinner?.draw ?? null } : null;

	return {
		fixtureId: String(fixture.id),
		mecz: `${nazwy.homeName} – ${nazwy.awayName}`,
		liga: fixture.league?.name,
		kiedy: kiedy(fixture.date),
		kursy: RYNKI_MECZU.filter(([sel]) => Number.isFinite(zdjecie[sel])).map(([sel, klucz]) => ({
			typ: klucz ? KSZTALTY[klucz].label(nazwy) : 'Remis',
			kurs: zdjecie[sel],
			szansa_z_kursu_pct: Math.round(100 / zdjecie[sel]),
			...(Number.isFinite(model?.[sel]) ? { szansa_wg_modelu_pct: Math.round(100 * model[sel]) } : {}),
		})),
		uwaga: 'Szansa z kursu zawiera marżę bukmachera (zwykle 2–5 pkt za dużo). Kursy to mediana kilku bukmacherów.',
		...(model ? {} : { model: 'Model nie liczy tego meczu (liga spoza listy albo drużyna, której nie zna).' }),
	};
}

async function wyzszyKurs({ min_kurs, dni }) {
	const hours = Number(dni) === 3 ? 72 : 24;
	const { lo, hi } = oddsWindow(min_kurs);
	const { picks } = await findValuePicks({ hours, minOdds: lo, limit: 3, maxFetch: hours === 72 ? 40 : 25 });
	// Pokazany typ trafia do publicznego bilansu (zakładka „Wyższy kurs" w skuteczności).
	if (picks.length) await recordValuePicks(picks, { source: 'assistant' });
	const { summary: s } = await valueStats();
	return {
		okno: hours === 72 ? 'najbliższe 3 dni' : 'najbliższe 24 godziny',
		przedzial_kursu: `${lo.toFixed(2)}–${hi.toFixed(2)}`,
		typy: picks.map((p) => ({
			fixtureId: p.fixtureId,
			mecz: `${p.homeName} – ${p.awayName}`,
			liga: p.league,
			kiedy: kiedy(p.kickoff),
			typ: p.selection,
			kurs: p.odds,
			szansa_wg_rynku_pct: p.market,
			szansa_wg_modelu_pct: p.model,
		})),
		...(picks.length ? {} : { brak: 'W tym oknie nie ma meczu z kursem w tym przedziale, przy którym model zgadza się z rynkiem.' }),
		bilans_takich_typow: s.settled
			? `${s.won} z ${s.settled} trafionych (${s.hitRate}%); rynek dawał im średnio ${s.avgMarket}%, model ${s.avgModel}%`
			: 'jeszcze nic nie rozliczone — bilans dopiero się zbiera',
		pomiar: 'Na danych od września: przy kursie 2,0–2,3 i zgodzie modelu z rynkiem trafiało 47% — tyle, ile mówił rynek. Przy wyższych kursach model zawyżał szansę o kilkanaście punktów.',
	};
}

/* ---------------------------------- na żywo ---------------------------------------------- */

/** Data i godzina w czasie polskim — dla rzeczy sprzed dni i tygodni (raporty, analizy). */
function dataGodzina(iso) {
	return `${localDate(new Date(iso))} ${godzina(iso)}`;
}

const kursPl = (v) => v.toFixed(2).replace('.', ',');

const ZRODLO_WYLICZENIA = {
	model: 'model',
	market: 'kursy sprzed meczu + wynik i minuta (liga poza modelem — słabszy punkt odniesienia niż model)',
};

/** Zasady generatora kuponu live jednym zdaniem — liczby z `lib/live/select.js`, nie z pamięci. */
const ZASADY_LIVE =
	`Typujemy mecze w minutach ${LIVE_MINUTES.from}–${LIVE_MINUTES.to}. Typ wchodzi, gdy nasze wyliczenie zgadza się z rynkiem: ` +
	`rynek co najmniej tak pewny jak my — nasze wyliczenie najwyżej ${LIVE_AGREEMENT.above} pkt powyżej szansy z kursu live i najwyżej ${LIVE_AGREEMENT.below} pkt poniżej. ` +
	`Kurs live ${kursPl(LIVE_LEG_MIN_ODDS)}–${kursPl(LIVE_LEG_MAX_ODDS)} na kupon albo ${kursPl(LIVE_SINGLE.minOdds)}–${kursPl(LIVE_SINGLE.maxOdds)} ` +
	'na pojedynczy typ. Typ na drużynę z czerwoną kartką odpada, a AI odrzuca typy, którym przeczą statystyki meczu.';

const UWAGA_LIVE =
	'Kursy live zmieniają się co kilka sekund — to mediana bukmacherów z chwili wyliczenia (wynik wspólny przez 3 minuty). Kupon live rozliczamy publicznie (Skuteczność → Kupon live). Szacunki, nie pewniaki. 18+.';

function opisTrwajacego(f, language) {
	return {
		fixtureId: String(f.id),
		mecz: `${f.teams?.home?.name} – ${f.teams?.away?.name}`,
		liga: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
		stan: f.status?.code === 'HT' ? 'przerwa' : `${f.status?.elapsed ?? '?'}. minuta`,
		wynik: `${f.goals?.home ?? 0}:${f.goals?.away ?? 0}`,
		link: `/${language}/mecz/${f.id}`,
	};
}

/** Trwające mecze dla odpowiedzi: najpierw ligi modelu (od najwyższego poziomu), potem reszta. */
async function trwajaceMecze(z, language, ile = 8) {
	let mecze = [];
	try {
		mecze = await z.liveMatchesNow();
	} catch {
		mecze = []; // lista to dodatek — bez niej narzędzie i tak odpowiada
	}
	const poziom = (f) => LEAGUE_TIERS.get(f.league?.id) ?? 99;
	return {
		trwa_meczow: mecze.length,
		mecze: [...mecze]
			.sort((a, b) => poziom(a) - poziom(b) || (b.status?.elapsed ?? 0) - (a.status?.elapsed ?? 0))
			.slice(0, ile)
			.map((f) => opisTrwajacego(f, language)),
	};
}

function opisTypuLive(c, { naKuponie, pojedynczy }, language) {
	return {
		fixtureId: c.fixtureId,
		mecz: `${c.homeName} – ${c.awayName}`,
		liga: c.league,
		minuta: c.minute,
		wynik: c.liveScore,
		typ: c.selection,
		kurs_live: c.odds,
		szansa_wg_rynku_pct: c.market,
		szansa_wyliczona_pct: c.model,
		zrodlo_wyliczenia: ZRODLO_WYLICZENIA[c.source] || c.source,
		uzasadnienie_ai: c.why || 'brak — sprawdzenie AI było niedostępne',
		...(naKuponie ? { na_kuponie_live: true } : {}),
		...(pojedynczy ? { najlepszy_pojedynczy: true } : {}),
		link: `/${language}/mecz/${c.fixtureId}`,
	};
}

/**
 * Trwające mecze i typy live — ze WSPÓLNEGO wyniku generatora (`getLiveCoupon`, 3 minuty).
 *
 * KOSZT. Narzędzie nie liczy niczego osobno i nie woła AI ponad to, co i tak robi panel kuponu
 * live: w oknie 3 minut każde pytanie dostaje ten sam wynik, a po jego wygaśnięciu pierwsze
 * liczy go dla wszystkich (asystent i panel naraz). Plan bez liczb nigdy liczenia nie uruchamia —
 * dostaje zapowiedź z ostatniego wyniku, jak trasa `/api/live/coupon`.
 *
 * DOSTĘP jak kupon live: `model_hints` (Pro, VIP, okres próbny). Lista trwających meczów
 * z wynikiem jest za darmo — to samo widzi każdy na stronie „Na żywo".
 */
async function naZywo({ ile }, { user, language, zrodla: z }) {
	const limit = Math.min(LIVE_TOP, Math.max(1, Number(ile) || 3));
	const link = `/${language}/pilka-nozna/live`;

	if (!hasFeature(user, 'model_hints')) {
		const zapowiedz = lockedLiveDto(z.peekLiveCoupon());
		const trwajace = await trwajaceMecze(z, language);
		return {
			dostep: `Typy na żywo (generator kuponu live) są w planie Pro i VIP oraz przez ${TRIAL.days} dni po założeniu konta — powiedz to i podaj link /${language}/cennik. Trwające mecze z wynikiem i statystykami są za darmo.`,
			...(zapowiedz && zapowiedz.mode !== 'none'
				? {
						zapowiedz_bez_meczow: {
							co: zapowiedz.mode === 'coupon' ? 'kupon live' : 'najlepszy pojedynczy typ live',
							kurs: zapowiedz.totalOdds,
							szansa_pct: zapowiedz.chance,
							liczba_typow: zapowiedz.legsCount,
							z_godziny: godzina(zapowiedz.generatedAt),
						},
					}
				: {}),
			trwa_meczow: trwajace.trwa_meczow,
			trwajace_mecze: trwajace.mecze,
			link_generatora: link,
		};
	}

	const w = await z.liveCoupon();
	const kupon = w.mode === 'coupon' ? w.coupon : null;
	const klucz = (c) => `${c.fixtureId}:${c.key}`;
	const naKuponie = new Set((kupon?.legs || []).map(klucz));
	const pojedynczy = w.single ? klucz(w.single) : null;
	// Wynik sprzed wdrożenia listy `top` (pamięć procesu) — wtedy przynajmniej to, co poszło na kupon.
	const przyjete = w.top ?? (kupon ? kupon.legs : w.single ? [w.single] : []);
	const typy = przyjete
		.slice(0, limit)
		.map((c) => opisTypuLive(c, { naKuponie: naKuponie.has(klucz(c)), pojedynczy: pojedynczy === klucz(c) }, language));
	const trwajace = typy.length < limit ? await trwajaceMecze(z, language) : null;

	return {
		wyliczono_o: godzina(w.generatedAt),
		sprawdzono: {
			meczow_w_minutach_typowania: w.analyzed,
			z_kursami_live: w.withOdds,
			w_ligach_modelu: w.modelMatches,
			...(Number.isFinite(w.shortlisted) ? { kandydatow_ocenionych_przez_ai: w.shortlisted } : {}),
			sprawdzenie_ai: w.aiChecked ? 'tak' : 'chwilowo niedostępne — typy tylko z wyliczeń i rynku',
		},
		typy,
		...(przyjete.length > limit ? { pozostalych_przyjetych_typow: przyjete.length - limit } : {}),
		...(typy.length
			? {}
			: {
					brak: w.analyzed
						? 'Teraz żaden typ nie przechodzi zasad. Powiedz uczciwie, ile meczów sprawdzono i dlaczego nic (zasady i odrzucone niżej) — nie wymyślaj typu.'
						: 'Teraz nie trwa żaden mecz w minutach, w których typujemy.',
				}),
		...(kupon ? { kupon_live: { kurs_laczny: kupon.totalOdds, szansa_pct: kupon.chance, liczba_typow: kupon.legs.length } } : {}),
		...(w.rejected?.length
			? { odrzucone_przez_ai: w.rejected.slice(0, 5).map((r) => ({ mecz: r.match, typ: r.selection, powod: r.reason || 'bez podanego powodu' })) }
			: {}),
		...(trwajace ? { trwa_meczow: trwajace.trwa_meczow, trwajace_mecze: trwajace.mecze } : {}),
		zasady: ZASADY_LIVE,
		uwaga: UWAGA_LIVE,
		link_generatora: link,
	};
}

/** Statystyki meczu w kolejności „co mówi o przewadze": nazwa pola → typ u dostawcy. */
const STATYSTYKI_LIVE = [
	['strzaly', 'Total Shots'],
	['celne', 'Shots on Goal'],
	['posiadanie', 'Ball Possession'],
	['xG', 'expected_goals'],
	['rozne', 'Corner Kicks'],
	['faule', 'Fouls'],
	['zolte_kartki', 'Yellow Cards'],
	['czerwone_kartki', 'Red Cards'],
];

const ZDARZENIA = {
	'Normal Goal': 'gol',
	Penalty: 'gol z karnego',
	'Own Goal': 'gol samobójczy',
	'Missed Penalty': 'niewykorzystany karny',
	'Yellow Card': 'żółta kartka',
	'Red Card': 'czerwona kartka',
	'Second Yellow card': 'druga żółta kartka',
};

function opisZdarzenia(e) {
	const minuta = `${e.minute ?? '?'}${e.extra ? `+${e.extra}` : ''}'`;
	const co = ZDARZENIA[e.detail] || (e.type === 'Goal' ? 'gol' : e.detail || e.type);
	return `${minuta} ${co}${e.player ? ` — ${e.player}` : ''} (${e.teamName})`;
}

/**
 * Jeden mecz na żywo (`liveMatch`): stan, statystyki i zdarzenia dla każdego — jak pokój meczowy —
 * a kursy live i szanse przy obecnym wyniku tylko w planie z liczbami (`model_hints`, jak kupon
 * live; to te same liczby, które pokazuje generator). Analiza AI w trakcie meczu to co innego —
 * `live_analysis`, sprawdzane w `analiza_meczu`. Bez AI, więc bez kosztu poza zapytaniami do dostawcy.
 */
async function meczNaZywo({ fixtureId }, { user, language, zrodla: z }) {
	const id = String(fixtureId || '').trim();
	if (!/^\d{1,12}$/.test(id)) return { blad: 'Podaj identyfikator meczu z na_zywo albo mecze_dnia.' };
	const zLiczbami = hasFeature(user, 'model_hints');
	const m = await z.liveMatch(id, { chances: zLiczbami });
	if (!m) return { blad: 'Nie znam takiego meczu.' };

	const f = m.fixture;
	const podstawa = {
		fixtureId: String(f.id),
		mecz: `${f.teams?.home?.name} – ${f.teams?.away?.name}`,
		liga: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
		link: `/${language}/mecz/${f.id}`,
	};
	if (!m.live) {
		return {
			...podstawa,
			stan: f.status?.isFinished
				? `zakończony ${f.goals?.home ?? '?'}:${f.goals?.away ?? '?'}`
				: NIEROZEGRANE.has(f.status?.code)
					? `przed meczem — ${kiedy(f.date)}`
					: f.status?.label || f.status?.code,
			uwaga: 'Ten mecz teraz nie trwa — dane na żywo są tylko w trakcie gry. Przed meczem: model_dla_meczu i analiza_meczu.',
		};
	}

	const zDruzyny = (teamId) => m.stats.find((s) => s.teamId === teamId)?.stats || {};
	const g = zDruzyny(f.teams?.home?.id);
	const a = zDruzyny(f.teams?.away?.id);
	const statystyki = Object.fromEntries(
		STATYSTYKI_LIVE.filter(([, k]) => g[k] != null || a[k] != null).map(([nazwa, k]) => [nazwa, `${g[k] ?? '?'}–${a[k] ?? '?'}`])
	);
	const zdarzenia = m.events.filter((e) => e.type === 'Goal' || e.type === 'Card').slice(-12).map(opisZdarzenia);

	let liczby;
	if (!zLiczbami) {
		liczby = {
			kursy_i_szanse: {
				dostep: `Kursy live i szanse przy obecnym wyniku są w planie Pro i VIP oraz przez ${TRIAL.days} dni po założeniu konta (jak generator kuponu live) — powiedz to i podaj link /${language}/cennik. Wynik, statystyki i zdarzenia są za darmo.`,
			},
		};
	} else if (m.chances.outsideRegularTime) {
		liczby = { kursy_i_szanse: 'dogrywka, karne albo przerwana gra — szans na wynik meczu tu nie liczymy' };
	} else {
		const ch = m.chances;
		liczby = {
			zrodlo_wyliczenia: ZRODLO_WYLICZENIA[ch.source] || 'brak — model nie zna drużyn, a kursów sprzed meczu nie ma',
			...(ch.hasOdds ? {} : { kursy_live: 'bukmacherzy nie wystawiają teraz kursów live na ten mecz (albo są zawieszone)' }),
			rynki: ch.markets.map((r) => ({
				typ: r.selection,
				kurs_live: r.odds,
				szansa_wg_rynku_pct: r.market,
				szansa_wyliczona_pct: r.model,
				zgodne_z_rynkiem: r.agrees,
				...(r.veto ? { odpada: 'drużyna gra w osłabieniu (czerwona kartka) — wyliczenie tego nie widzi' } : {}),
			})),
			...(ch.inCouponWindow ? {} : { poza_oknem: `Poza minutami ${LIVE_MINUTES.from}–${LIVE_MINUTES.to} — na kupon live ten mecz teraz nie wejdzie.` }),
			zasady: ZASADY_LIVE,
			uwaga: `${UWAGA_LIVE} Szansa z kursu zawiera marżę bukmachera (zwykle 2–5 pkt za dużo).`,
		};
	}

	return {
		...podstawa,
		stan: f.status?.code === 'HT' ? 'przerwa' : 'w trakcie',
		minuta: f.status?.elapsed ?? null,
		wynik: `${f.goals?.home ?? 0}:${f.goals?.away ?? 0}`,
		statystyki_gospodarze_goscie: Object.keys(statystyki).length ? statystyki : 'dostawca nie podaje statystyk tego meczu',
		zdarzenia: zdarzenia.length ? zdarzenia : 'bez goli i kartek',
		...(m.red?.home || m.red?.away ? { czerwone_kartki: { gospodarze: m.red.home, goscie: m.red.away } } : {}),
		...liczby,
	};
}

/* ------------------------------- typ dnia, raporty --------------------------------------- */

const STAN_TYPU = { pending: 'czeka na wynik', won: 'trafiony', lost: 'nietrafiony', void: 'anulowany' };

function opisTypuDnia(d, language) {
	if (!d) return null;
	const e = d.explanation || {};
	return {
		fixtureId: d.fixtureId,
		mecz: `${d.home} – ${d.away}`,
		liga: d.league,
		kiedy: kiedy(d.kickoff),
		typ: d.selection,
		prawdopodobienstwo_pct: d.probability,
		zwykle_pct: Math.round(d.base),
		przewaga_pkt: d.lift,
		...(Number.isFinite(e.home) ? { szanse_1x2_pct: { gospodarz: e.home, remis: e.draw, gosc: e.away } } : {}),
		...(Number.isFinite(e.lambdaHome) ? { oczekiwane_gole: `${e.lambdaHome}–${e.lambdaAway}` } : {}),
		stan: STAN_TYPU[d.status] || d.status,
		...(d.score ? { wynik: d.score } : {}),
		link: `/${language}/mecz/${d.fixtureId}`,
	};
}

/** Typ dnia — tą samą drogą co strona i API (`/api/daily-pick`): wybór z limitem czasu, potem zapis. */
async function typDnia(_input, { language, zrodla: z }) {
	const ov = await z.dailyOverview();
	const dzis = opisTypuDnia(ov?.today, language);
	const jutro = opisTypuDnia(ov?.tomorrow, language);
	return {
		typ_dnia_dzis: dzis || (jutro ? 'na dziś nic już nie zostało — jest typ na jutro' : 'dziś brak — żaden mecz nie przeszedł zasad'),
		...(jutro ? { typ_dnia_jutro: jutro } : {}),
		...(ov?.yesterday ? { wczorajszy: opisTypuDnia(ov.yesterday, language) } : {}),
		...(ov?.record ? { bilans: `${ov.record.won} z ${ov.record.total} rozliczonych trafionych` } : {}),
		zasady:
			'Jeden typ modelu dziennie, za darmo dla wszystkich: najpierw rozgrywki z najwyższego poziomu, potem największa przewaga nad przeciętną; wybierany raz na dzień i rozliczany publicznie.',
		link: `/${language}/typy-na-dzis`,
	};
}

const OKNO_RAPORTU = { soon: 'najbliższe 24 godziny', threeDays: 'najbliższe 3 dni' };

/** Stan typów raportu: zwykłe z `Pick` (zapisane z identyfikatorem raportu), „Wyższe kursy" z `ValuePick`. */
async function stanyTypowRaportu(r) {
	const picks = r?.sections?.picks || [];
	if (!picks.length) return new Map();
	if (r.variant === 'value') {
		const rows = await ValuePick.find({ $or: picks.map((p) => ({ fixtureId: String(p.fixtureId), key: p.key })) })
			.select('fixtureId key status score')
			.lean();
		return new Map(rows.map((v) => [`${v.fixtureId}:${v.key}`, { status: v.status, score: v.score }]));
	}
	const rows = await Pick.find({ sourceId: r._id }).select('fixtureId status finalScore').lean();
	return new Map(
		rows.map((p) => [
			String(p.fixtureId),
			{ status: p.status, score: Number.isFinite(p.finalScore?.home) ? `${p.finalScore.home}:${p.finalScore.away}` : null },
		])
	);
}

function opisRaportu(r, stany, language) {
	const wartosc = r.variant === 'value';
	return {
		wygenerowany: dataGodzina(r.createdAt),
		okno: OKNO_RAPORTU[r.type] || r.type,
		...(r.sections?.intro ? { wstep: String(r.sections.intro).slice(0, 400) } : {}),
		typy: (r.sections?.picks || []).slice(0, 10).map((p) => {
			const stan = stany.get(wartosc ? `${p.fixtureId}:${p.key}` : String(p.fixtureId));
			return {
				fixtureId: String(p.fixtureId),
				mecz: String(p.match || '').replace(/\s+vs\s+/i, ' – '),
				liga: p.league,
				...(p.kickoffUtc ? { kiedy: dataGodzina(p.kickoffUtc) } : {}),
				...(wartosc
					? { typ: p.selection, kurs: p.odds, szansa_wg_rynku_pct: p.marketProbability, szansa_wg_modelu_pct: p.modelProbability }
					: {
							typ: `${p.market}: ${p.selection}`,
							prawdopodobienstwo_pct: p.probability,
							...(Number.isFinite(p.baseRate) ? { zwykle_pct: Math.round(p.baseRate), przewaga_pkt: p.lift } : {}),
						}),
				...(stan ? { stan: STAN_TYPU[stan.status] || stan.status, ...(stan.score ? { wynik: stan.score } : {}) } : {}),
			};
		}),
		link: `/${language}/pilka-nozna/ai-agent?variant=${wartosc ? 'value' : 'standard'}&report=${r._id}`,
	};
}

/**
 * Ostatnie raporty użytkownika i to, ile może wygenerować — ale bez generowania.
 *
 * DLACZEGO NIE GENERUJE. Raport to przegląd całej oferty okna (dziesiątki zapytań o terminarz,
 * kursy i prognozy, potem dłuższa odpowiedź modelu) — do minuty liczenia, które strona raportów
 * pokazuje krok po kroku strumieniem. W asystencie byłaby to minuta milczenia w jednym pytaniu,
 * a drugie źródło raportów do pilnowania. Asystent pokazuje gotowe i podaje odnośnik.
 */
async function raporty(_input, { userId, user, language, zrodla: z }) {
	if (!userId) return { niedostepne: 'Raporty wymagają zalogowania.' };
	const [zwykly, wyzsze, q] = await Promise.all([
		// Starsze raporty nie mają pola `variant` — to raporty zwykłe.
		Report.findOne({ userId, status: 'ready', variant: { $ne: 'value' } }).sort({ createdAt: -1 }).lean(),
		Report.findOne({ userId, status: 'ready', variant: 'value' }).sort({ createdAt: -1 }).lean(),
		z.checkQuota({ kind: 'report', user, userId }),
	]);
	const [stanyZwyklego, stanyWyzszych] = await Promise.all([stanyTypowRaportu(zwykly), stanyTypowRaportu(wyzsze)]);
	const strona = `/${language}/pilka-nozna/ai-agent`;

	const generowanie =
		!q.allowed && q.limit === 0
			? {
					dostep: `Raporty AI są w planie Pro i VIP (nowe konto dostaje ${TRIAL.limits.report} na start, przez ${TRIAL.days} dni) — powiedz to i podaj link /${language}/cennik.`,
				}
			: {
					zostalo_raportow: q.limit === null ? 'bez limitu' : q.remaining,
					...(q.limit !== null ? { limit: q.limit } : {}),
					...(q.usingCredit ? { kredyty: `limit planu wykorzystany — kolejny raport za ${q.creditCost} kredyty (masz ${q.credits})` } : {}),
					...(!q.allowed ? { dostep: `Limit raportów wykorzystany (${q.used} z ${q.limit}) — odnowi się z nowym okresem planu; podaj link /${language}/cennik.` } : {}),
					link_raport: strona,
					link_wyzsze_kursy: `${strona}?variant=value`,
					zasada: 'Nowy raport generujesz na stronie raportów: wybierasz 24 godziny albo 3 dni, liczenie trwa do minuty i zużywa jeden raport z limitu. Asystent raportów nie generuje — podaj odnośnik.',
				};

	return {
		raport_zwykly: zwykly ? opisRaportu(zwykly, stanyZwyklego, language) : 'brak — użytkownik nie wygenerował jeszcze raportu',
		raport_wyzsze_kursy: wyzsze ? opisRaportu(wyzsze, stanyWyzszych, language) : 'brak — użytkownik nie wygenerował jeszcze raportu „Wyższe kursy"',
		generowanie,
	};
}

/* -------------------------- funkcje aplikacji, moje mecze ------------------------------- */

const NAZWA_PLANU = { free: 'darmowy', pro: 'Pro', vip: 'VIP', admin: 'administrator (bez limitów)' };

/** Limity pokazywane w katalogu: rodzaj z `lib/billing/plans` → nazwa dla użytkownika. */
const LIMITY = [
	['analysis', 'analizy meczów'],
	['aiChat', 'pytania do asystenta (przed tym pytaniem)'],
	['report', 'raporty AI'],
	['aiNews', 'wyszukiwania wiadomości przez asystenta'],
	['couponGen', 'kupony z kreatora (dziś)'],
];

function opisLimitu(q) {
	if (!q) return 'nie udało się sprawdzić';
	if (q.limit === null) return 'bez limitu';
	if (q.limit === 0) return q.creditCost && q.credits >= q.creditCost ? `brak w planie — z kredytów (${q.creditCost} za sztukę)` : 'brak w Twoim planie';
	return `zostało ${q.remaining} z ${q.limit}${q.inTrial ? ' (z pulą na start)' : ''}`;
}

/** Czy TEN użytkownik ma dostęp do kafelka — z tych samych pól, z których strona „Narzędzia" pisze dopiski. */
function dostepDlaUzytkownika(tool, { features, limity }) {
	if (tool.access === 'free' || !tool.requires) return 'tak';
	const czesciowo = tool.access === 'partial';
	if (tool.requires.feature) {
		if (features.includes(tool.requires.feature)) return 'tak';
		return czesciowo ? 'częściowo — pełna wersja w planie Pro i VIP' : 'nie — w planie Pro i VIP';
	}
	const q = limity[tool.requires.quota];
	if (!q) return czesciowo ? 'częściowo' : 'nie wiadomo';
	if (q.limit === null) return 'tak, bez limitu';
	if (q.allowed) return `tak — ${opisLimitu(q)}`;
	if (q.limit === 0) return czesciowo ? 'częściowo — pełna wersja w planie Pro i VIP' : 'nie — w planie Pro i VIP';
	return `limit wykorzystany (${q.used} z ${q.limit}) — odnowi się z nowym okresem`;
}

/**
 * Katalog funkcji serwisu z dostępem TEGO użytkownika — z `lib/tools/content.js` (strona
 * „Narzędzia"), więc asystent nie zna funkcji, których serwis nie ma, i nie obiecuje dostępu,
 * którego plan nie daje. Limity sprawdzane tylko do odczytu (`checkQuota` niczego nie zalicza).
 */
async function funkcjeAplikacji({ szukaj }, { userId, user, language, zrodla: z }) {
	const ent = getEntitlements(user);
	const proba = trialDaysLeft(user);
	const limity = Object.fromEntries(
		await Promise.all(LIMITY.map(async ([kind]) => [kind, await z.checkQuota({ kind, user, userId }).catch(() => null)]))
	);

	const tresc = toolsContent(language);
	const wszystkie = tresc.groups.flatMap((g) => g.tools.map((t) => ({ ...t, grupa: g.title })));
	const fraza = String(szukaj || '').toLowerCase().trim();
	const pasujace = fraza
		? wszystkie.filter((t) => [t.id, t.href, t.name, t.body, t.note, t.grupa].some((x) => String(x || '').toLowerCase().includes(fraza)))
		: wszystkie;
	const lista = pasujace.length ? pasujace : wszystkie;

	return {
		twoj_plan: {
			plan: NAZWA_PLANU[ent.plan] || ent.plan,
			...(ent.validUntil && ent.plan !== 'free' ? { wazny_do: localDate(new Date(ent.validUntil)) } : {}),
			...(proba
				? {
						okres_probny: {
							zostalo_dni: proba,
							obejmuje: `liczby przy typach, płatne kupony, kupon live, kreator kuponu (${TRIAL.limits.couponGen} dziennie) i poranny mail; na start dodatkowo ${TRIAL.limits.analysis} analiz, ${TRIAL.limits.aiChat} pytań i ${TRIAL.limits.report} raporty (analiza meczu na żywo — tylko Pro i VIP)`,
						},
					}
				: {}),
			kredyty: ent.credits,
			limity: Object.fromEntries(LIMITY.map(([kind, nazwa]) => [nazwa, opisLimitu(limity[kind])])),
		},
		...(fraza && !pasujace.length ? { brak_dopasowan: `Nic nie pasuje do „${szukaj}" — poniżej wszystkie funkcje.` } : {}),
		funkcje: lista.map((t) => {
			const dlaCiebie = dostepDlaUzytkownika(t, { features: ent.features, limity });
			return {
				nazwa: t.name,
				grupa: t.grupa,
				opis: t.body,
				link: `/${language}${t.href}`,
				...(t.action === 'account' ? { gdzie: 'w panelu konta — ikona konta w nagłówku strony' } : {}),
				dostep_ogolnie: { free: 'za darmo', partial: 'częściowo za darmo', paid: 'płatne' }[t.access] || t.access,
				dla_ciebie: dlaCiebie,
				...(dlaCiebie !== 'tak' && t.note ? { szczegoly_dostepu: t.note } : {}),
			};
		}),
		cennik: `/${language}/cennik`,
		strona_narzedzi: `/${language}/narzedzia`,
	};
}

/** Mecz, który mógł się zacząć, ale jeszcze nie skończył (~2,5 h od pierwszego gwizdka). */
const OKNO_TRWANIA_MS = 150 * 60_000;

/**
 * Ulubione mecze i własne typy użytkownika — to, co widzi w panelu konta, w kilku polach.
 * Stan meczu w trakcie da `mecz_na_zywo` (ulubione trzymają tylko migawkę z godziną).
 */
async function mojeMeczeITypy(_input, { userId, language }) {
	if (!userId) return { niedostepne: 'Wymaga zalogowania.' };
	const teraz = Date.now();
	const [ulubione, czekajace, rozliczone] = await Promise.all([
		FavoriteMatch.find({ userId }).sort({ kickoff: -1 }).limit(100).lean(),
		Pick.find({ userId, author: 'user', status: 'pending' }).sort({ kickoff: 1 }).limit(10).lean(),
		Pick.find({ userId, author: 'user', status: { $ne: 'pending' } }).sort({ kickoff: -1 }).limit(5).lean(),
	]);

	const odGwizdka = (d) => (d ? teraz - new Date(d).getTime() : -Infinity);
	const mecz = (f) => ({
		fixtureId: f.fixtureId,
		mecz: `${f.homeName} – ${f.awayName}`,
		...(f.leagueName ? { liga: [f.leagueName, f.country].filter(Boolean).join(', ') } : {}),
		...(f.kickoff ? { kiedy: dataGodzina(f.kickoff) } : {}),
		...(odGwizdka(f.kickoff) >= 0 && odGwizdka(f.kickoff) < OKNO_TRWANIA_MS ? { moze_trwac: 'tak — stan sprawdzi mecz_na_zywo' } : {}),
		link: `/${language}/mecz/${f.fixtureId}`,
	});
	const typ = (p) => ({
		fixtureId: p.fixtureId,
		...(p.homeName ? { mecz: `${p.homeName} – ${p.awayName}` } : {}),
		...(p.kickoff ? { kiedy: dataGodzina(p.kickoff) } : {}),
		typ: `${p.market}: ${p.selection}`,
		stan: STAN_TYPU[p.status] || p.status,
		...(Number.isFinite(p.finalScore?.home) ? { wynik: `${p.finalScore.home}:${p.finalScore.away}` } : {}),
		...(p.kind === 'round' ? { kolejka: true } : {}),
		link: `/${language}/mecz/${p.fixtureId}`,
	});

	const nadchodzace = ulubione
		.filter((f) => odGwizdka(f.kickoff) < OKNO_TRWANIA_MS)
		.sort((a, b) => new Date(a.kickoff || 0) - new Date(b.kickoff || 0))
		.slice(0, 10);
	const minione = ulubione.filter((f) => odGwizdka(f.kickoff) >= OKNO_TRWANIA_MS).slice(0, 3);

	return {
		ulubione_nadchodzace_i_trwajace: nadchodzace.length ? nadchodzace.map(mecz) : 'brak — mecz dodaje się gwiazdką przy meczu',
		...(minione.length ? { ulubione_ostatnie: minione.map(mecz) } : {}),
		moje_typy_czekajace: czekajace.length ? czekajace.map(typ) : 'brak',
		...(rozliczone.length ? { moje_typy_ostatnio_rozliczone: rozliczone.map(typ) } : {}),
		uwaga: 'Skuteczność w liczbach podaje narzędzie skutecznosc (czyja: moja).',
	};
}

/**
 * Narzędzia dla rozmowy pod analizą meczu (`/api/ai/ask`).
 *
 * Tamten czat ma cały pakiet meczu w prompcie, więc z narzędzi liczbowych nie skorzysta —
 * dostaje tylko wiadomości. Wykonawca jest ten sam (`makeExecutor`), więc limit `aiNews`
 * i dziennik użycia działają identycznie jak u asystenta całej oferty.
 */
export const NEWS_TOOLS = TOOLS.filter((t) => t.name === 'aktualnosci');

/* ------------------------------------------------------------------------------------------ */

/**
 * Moduł analizy wczytywany przy pierwszym użyciu, nie na starcie.
 *
 * `lib/analysis/service.js` ciągnie za sobą sesję Next.js (`lib/auth` → `next/headers`), która
 * istnieje tylko wewnątrz Next.js. Import statyczny sprawiał, że tego pliku — a więc żadnego
 * narzędzia — nie dało się wczytać poza serwerem (testy), choć analiza to jedno narzędzie z wielu.
 */
const analizy = () => import('@/lib/analysis/service');

/**
 * Skąd nowsze narzędzia biorą dane i wykonanie — domyślnie prawdziwe moduły.
 *
 * Test podmienia pojedyncze źródła (`makeExecutor({ zrodla })`), tak jak `getLiveCoupon({ compute })`
 * czy `ensureCoupons({ hintsFor })` w innych modułach: bez tego sprawdzenie wykonawcy wołałoby
 * prawdziwe API piłkarskie, model AI i zapisy na produkcyjnej bazie.
 */
const ZRODLA = {
	liveCoupon: () => getLiveCoupon(),
	peekLiveCoupon: () => peekLiveCoupon(),
	liveMatchesNow,
	liveMatch,
	// Jak `/api/daily-pick`: wybór (pierwsze zapytanie dnia) z limitem czasu, inaczej to, co zapisane.
	dailyOverview: async () => (await withTimeout(dailyOverview(), 8000, null)) || dailyOverviewCached(),
	checkQuota,
	fixture: async (id) => normalizeFixture((await fixtureById(String(id)))?.[0]),
	readAnalysis: async (args) => (await analizy()).readAnalysis(args),
	prepareAnalysis: async (args) => (await analizy()).prepareAnalysisFor(args),
	generateAnalysis: async (prepared, args) => (await analizy()).generateAnalysis(prepared, args),
	// Terminarz meczu (`lib/football/schedule.js`) — dla model_dla_meczu; najbliższe mecze to zapytanie do dostawcy.
	matchSchedule: (match) => loadMatchSchedule(match),
	// Kreator kuponu — limit `couponGen`, blokada i zapis jak na stronie (`lib/coupons/customService.js`).
	customCoupon: (args) => generateCustomCoupon(args),
};

/**
 * Wykonawca narzędzi — zwraca tekst JSON dla modelu.
 *
 * `ctx` niesie to, czego model nie może sam podać: kto pyta (identyfikator i dokument konta —
 * ten drugi dla planu i limitów) i w jakim języku; w testach także podmienione `zrodla`.
 * Nieznana nazwa narzędzia to odpowiedź z błędem, nie wyjątek — model ma o tym powiedzieć.
 */
export function makeExecutor(ctx) {
	const pelny = { ...ctx, zrodla: { ...ZRODLA, ...(ctx?.zrodla || {}) } };
	const wykonawcy = {
		mecze_dnia: meczeDnia,
		najlepsze_typy: (input) => najlepszeTypy(input, pelny),
		model_dla_meczu: (input) => modelDlaMeczu(input, pelny),
		analiza_meczu: (input) => analizaMeczu(input, pelny),
		skutecznosc: (input) => skutecznosc(input, pelny),
		aktualnosci: (input) => aktualnosci(input, pelny),
		kupony: (input) => kupony(input, pelny),
		zloz_kupon: (input) => zlozKupon(input, pelny),
		kursy_meczu: kursyMeczu,
		wyzszy_kurs: wyzszyKurs,
		na_zywo: (input) => naZywo(input, pelny),
		mecz_na_zywo: (input) => meczNaZywo(input, pelny),
		typ_dnia: (input) => typDnia(input, pelny),
		raporty: (input) => raporty(input, pelny),
		funkcje_aplikacji: (input) => funkcjeAplikacji(input, pelny),
		moje_mecze_i_typy: (input) => mojeMeczeITypy(input, pelny),
	};
	return async (name, input) => {
		const fn = wykonawcy[name];
		if (!fn) return JSON.stringify({ blad: `Nieznane narzędzie: ${name}` });
		try {
			return JSON.stringify(await fn(input || {}));
		} catch (error) {
			/*
			 * Błąd pobrania (limit API, chwilowa awaria) idzie do modelu z jasną instrukcją.
			 * Bez niej model językowy tłumaczył `{"error": "..."}` na zmyśloną przyczynę
			 * w rodzaju „za mało danych na starcie sezonu" — brzmiało wiarygodnie i było nieprawdą.
			 */
			console.warn(`[assistant] narzędzie ${name} nie zadziałało:`, error.message);
			return JSON.stringify({
				blad: 'Chwilowy problem z pobraniem danych — spróbuj za minutę.',
				instrukcja_dla_asystenta:
					'Przekaż treść pola blad użytkownikowi jednym zdaniem, własnymi słowami. Nie cytuj tego pola dosłownie i nie podawaj żadnej innej przyczyny.',
			});
		}
	};
}
