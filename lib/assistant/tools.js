import Pick from '@/models/Pick';
import MatchAnalysis from '@/models/MatchAnalysis';
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
import { checkQuota, consumeQuota, hasFeature, recordUsage } from '@/lib/billing/entitlements';
import { recordSpend } from '@/lib/billing/spendGuard';
import { localDate, localTime } from '@/lib/time';
import { predictFixture } from '@/lib/model';
import { couponsOverview } from '@/lib/coupons/service';
import { fetchOddsSnapshot } from '@/lib/model/oddsShadowJob';
import { SELECTION_SHAPES as KSZTALTY } from '@/lib/picks/markets';
import { findValuePicks, recordValuePicks, valueStats } from '@/lib/value/service';
import { modelMarkets, oddsWindow } from '@/lib/value/select';

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
			'Pełna prognoza modelu dla jednego meczu: szanse 1/X/2 i wszystkie sześć selekcji z procentem, przeciętną i przewagą, z zaznaczeniem, które przechodzą próg typu. Użyj, gdy pytanie dotyczy konkretnego meczu, albo żeby wyjaśnić, dlaczego model czegoś nie typuje.',
		input_schema: {
			type: 'object',
			properties: { fixtureId: { type: 'string', description: 'Identyfikator meczu z mecze_dnia.' } },
			required: ['fixtureId'],
		},
	},
	{
		name: 'gotowa_analiza',
		description:
			'Analiza AI tego meczu, jeśli ktoś ją już wygenerował: streszczenie, kluczowe czynniki, typy i ryzyka. Użyj, gdy użytkownik pyta o powody, kontekst albo "co mówi analiza".',
		input_schema: {
			type: 'object',
			properties: { fixtureId: { type: 'string' } },
			required: ['fixtureId'],
		},
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
			'Kupony: kupon dnia (kurs łączny ok. 2,0, za darmo), kupon na 3 dni (ok. 2,0) i na 5 dni (ok. 3,0) — dwa ostatnie w planie Pro i VIP. Mecze, typy, kurs każdego typu (mediana bukmacherów), kurs łączny, szansa według modelu, stan rozliczenia i bilans. Gdy użytkownik nie ma planu, płatne kupony przychodzą bez meczów. Użyj, gdy pytanie dotyczy kuponu, „czegoś po kursie 2–3" albo pewniejszej drogi do wyższego kursu.',
		input_schema: { type: 'object', properties: {} },
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

async function najlepszeTypy({ data, ile }) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : dzien(0);
	const limit = Math.min(10, Math.max(1, Number(ile) || 5));
	const { list } = await hintsForDate(date);

	return {
		data: date,
		prog_typu_pkt: MIN_LIFT,
		meczow_z_typem: list.length,
		typy: list.slice(0, limit).map((w) => ({
			fixtureId: w.fixtureId,
			mecz: `${w.home} – ${w.away}`,
			liga: w.league,
			godzina: godzina(w.kickoff),
			...opisHint(w.hint),
		})),
	};
}

async function modelDlaMeczu({ fixtureId }) {
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

	const leagueModel = await getLeagueModel({ leagueId: fixture.league?.id, season: fixture.league?.season });
	const goals = await goalsForFixture(leagueModel, fixture);
	const wynik = buildAnalysisModel({ leagueModel, fixture, goals });
	if (!wynik) {
		return {
			mecz: `${fixture.teams?.home?.name} – ${fixture.teams?.away?.name}`,
			liga: fixture.league?.name,
			model: null,
			powod: 'Za mało danych: liga na starcie sezonu albo drużyna, której model jeszcze nie zna.',
		};
	}

	return {
		fixtureId: String(fixture.id),
		mecz: `${fixture.teams?.home?.name} – ${fixture.teams?.away?.name}`,
		liga: fixture.league?.name,
		godzina: godzina(fixture.date),
		w_trakcie: wynik.inPlay ? `${wynik.minute}' ${wynik.score?.home}:${wynik.score?.away}` : undefined,
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

async function gotowaAnaliza({ fixtureId }, { language }) {
	const doc = await MatchAnalysis.findOne({ fixtureId: String(fixtureId), language })
		.select('sections createdAt')
		.lean();
	if (!doc?.sections) return { analiza: null, powod: 'Nikt jeszcze nie wygenerował analizy tego meczu.' };

	const s = doc.sections;
	return {
		wygenerowana: doc.createdAt,
		streszczenie: s.summary,
		czynniki: (s.keyFactors || []).slice(0, 5).map((k) => k.title || k.text || k),
		typy: (s.picks || []).map((p) => ({ typ: `${p.market}: ${p.selection}`, prawdopodobienstwo_pct: p.probability })),
		ryzyka: (s.risks || []).slice(0, 4),
	};
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
			dostep: 'Mecze i typy tego kuponu widać w planie Pro i VIP (i przez 7 dni po założeniu konta) — powiedz to i podaj link /cennik.',
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
			'Kupon składa się z typów modelu z kursem 1,05–1,40 (tam model trafia tyle, ile obiecuje), tylko mecze 12:00–23:00, od najpewniejszego, aż kurs łączny dojdzie do celu: dnia i 3-dniowy ok. 2,0, 5-dniowy ok. 3,0. Każdy kupon ma inne mecze. Kursy to mediana bukmacherów z chwili wyboru. Szczegóły na stronie /typy-na-dzis.',
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
 * Wykonawca narzędzi — zwraca tekst JSON dla modelu.
 *
 * `ctx` niesie to, czego model nie może sam podać: kto pyta (identyfikator i dokument konta —
 * ten drugi dla limitu wyszukiwań) i w jakim języku. Nieznana nazwa
 * narzędzia to odpowiedź z błędem, nie wyjątek — model ma o tym powiedzieć.
 */
export function makeExecutor(ctx) {
	const wykonawcy = {
		mecze_dnia: meczeDnia,
		najlepsze_typy: najlepszeTypy,
		model_dla_meczu: modelDlaMeczu,
		gotowa_analiza: (input) => gotowaAnaliza(input, ctx),
		skutecznosc: (input) => skutecznosc(input, ctx),
		aktualnosci: (input) => aktualnosci(input, ctx),
		kupony: (input) => kupony(input, ctx),
		kursy_meczu: kursyMeczu,
		wyzszy_kurs: wyzszyKurs,
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
