import { getLeagueModel, MODEL_VERSION } from '@/lib/model';
import { goalsFor } from '@/lib/model/goals';
import { expectedGoals } from '@/lib/model/ratings';
import { matchExpectation } from '@/lib/model/shotStrength';
import { predictMarkets, inPlayMarkets, remainingFraction } from '@/lib/model/dixonColes';
import { oddsByFixture, liveOdds } from '@/lib/football/endpoints';
import { normalizeOddsFixture, impliedFromOdds } from '@/lib/football/normalize';
import { baseRateFor, isBannedMarket, liftFor, meetsPolicy } from '@/lib/picks/policy';
import { normalizePick, sameSelection, SELECTION_SHAPES } from '@/lib/picks/markets';
import { CHANCE_SOURCE, confirmWithMarket, liveChance, modelChance } from '@/lib/picks/chance';
import { LIVE_LEG_MAX_ODDS, LIVE_LEG_MIN_ODDS, liveMinuteOk, liveOddsFromRow, liveSelections } from '@/lib/live/select';

/**
 * Model liczbowy w analizie pojedynczego meczu — MODEL LICZY, AI TŁUMACZY.
 *
 * Do tej pory raport miał własny rachunek prawdopodobieństw, a analiza meczu nie: liczby
 * pisał model językowy, a kod mógł je tylko ocenić po fakcie. Skutek był mierzalny —
 * deklarowana pewność typów z analiz nie rosła wraz z trafnością. Tu ten sam model sił
 * drużyn, który wybiera typy w raporcie, liczy szanse i selekcje dla jednego meczu.
 * Model językowy dostaje gotowe liczby i ma je UZASADNIĆ albo ODRZUCIĆ, wskazując
 * czynnik, którego rachunek nie widzi: absencje, skład, stawkę, warunki.
 *
 * MECZ W TRAKCIE dostaje prognozę dla pozostałego czasu przy aktualnym wyniku, a jego
 * norma nie pochodzi z tabeli — jest liczona dla przeciętnej pary drużyn w tej samej
 * sytuacji. „Gospodarz wygra" przy 2:0 w 80. minucie ma 97% u każdego i nie jest typem.
 *
 * KURS POTWIERDZA PRZED MECZEM (od 21.11.2026, `lib/picks/chance.js`): gdy są kursy, kandydatem na
 * typ jest tylko selekcja, przy której próg przechodzi i model, i szansa z kursu; procent jest z kursu
 * albo z modelu według `MARKET_CHANCE_KEYS`, a przy niezgodzie — ostrożniejszy z dwóch.
 *
 * MECZ W TRAKCIE — ZASADY KUPONU LIVE (od 21.11.2026). Typy z analizy na żywo trafiły 57% przy
 * obietnicy 72% (44 typy; do 19.10 10 → 70%, od 20.10 34 → 53%): bez modelu liczbowego 12 → 50%,
 * zapasowe i poniżej progu 24 → 50%, w tym poniżej 60% 7 → 14%. Nogi kuponu live z zasad
 * `lib/live/select.js` trafiły 87% (83 nogi, od 21.10) przy obietnicy 82%, a w obecnych widełkach
 * nogi 1,20–1,60 — 78% przy 77% (46). Dlatego selekcja w trakcie meczu może być typem (także
 * zapasowym) tylko wtedy, gdy przechodzi `liveSelections` (zgoda z kursem live `LIVE_AGREEMENT`,
 * weto za czerwoną kartkę), kurs mieści się w widełkach nogi kuponu live (1,20–1,60 — tam jest
 * pomiar, a szansa nie schodzi poniżej ~62%, więc nie wraca typ „poniżej 60%") i trwa minuta 10–80
 * (`liveMinuteOk`). Szansa to ostrożniejsza z dwóch liczb: nasze wyliczenie i 100 / kurs live
 * (`liveChance`). Bez kursów live (albo bez modelu ligi) typu nie ma wcale — analiza pokazuje kierunek
 * (`leaning`), który do skuteczności nie wchodzi. Wybrane zamiast „typu jako kierunku w statystyce":
 * kierunek bez kursu to dokładnie te typy, które ciągnęły wynik w dół, a liczenie ich osobno nie
 * dałoby czytelnikowi nic poza drugą, gorszą liczbą. Kursów live przy typie z analizy wcześniej nie
 * zapisywaliśmy, więc tej reguły nie da się sprawdzić wstecz na tych 44 typach — dowodem są nogi
 * kuponu live; pierwsze rozliczenia nowych typów trzeba obejrzeć po kilku tygodniach.
 */

/**
 * Selekcje, które model umie policzyć i które polityka umie rozliczyć.
 *
 * Nazwa rynku, postać znormalizowana i TEKST selekcji przychodzą z `SELECTION_SHAPES` —
 * jednego źródła wspólnego z raportem. Trzymanie własnej kopii tych opisów skończyło się
 * w raporcie typami, których parser nie rozpoznawał; szczegóły przy samej stałej.
 * Tutaj dokładamy jedynie to, czego tamta lista wiedzieć nie może: gdzie w wyniku
 * `predictMarkets`/`inPlayMarkets` leży ułamek danej selekcji.
 */
const WYBIERZ = {
	home: (r) => r.matchWinner.home,
	away: (r) => r.matchWinner.away,
	'1X': (r) => r.doubleChance['1X'],
	X2: (r) => r.doubleChance.X2,
	homeScores: (r) => r.teamGoals.home[0.5].over,
	awayScores: (r) => r.teamGoals.away[0.5].over,
	// Nie z macierzy: skalibrowana wartość dołączona przez wywołującego (`over25`).
	over25: (r) => r.over25Calibrated?.probability ?? null,
};

const SELEKCJE = Object.entries(SELECTION_SHAPES).map(([key, ksztalt]) => ({
	key,
	market: ksztalt.market,
	normalized: ksztalt.normalized,
	wybierz: WYBIERZ[key],
	opis: ksztalt.label,
}));

/**
 * Trzy ułamki → trzy liczby całkowite sumujące się do 100.
 *
 * Zwykłe zaokrąglenie daje 99 albo 101, a schemat odpowiedzi i pasek w interfejsie
 * zakładają dokładnie 100. Metoda największych reszt: reszty rozdajemy od największej.
 */
export function toPercentTriple({ home, draw, away }) {
	const surowe = [home, draw, away].map((v) => (Number.isFinite(v) ? 100 * v : 0));
	const podlogi = surowe.map(Math.floor);
	let brak = 100 - podlogi.reduce((a, b) => a + b, 0);
	const kolejnosc = surowe
		.map((v, i) => ({ i, reszta: v - podlogi[i] }))
		.sort((a, b) => b.reszta - a.reszta);
	for (const { i } of kolejnosc) {
		if (brak <= 0) break;
		podlogi[i] += 1;
		brak -= 1;
	}
	return { home: podlogi[0], draw: podlogi[1], away: podlogi[2] };
}

/** Minuta meczu z pakietu; brak wartości w trwającym meczu traktujemy jak jego początek. */
function minuta(fixture) {
	const m = fixture.status?.elapsed;
	return Number.isFinite(m) ? Math.max(0, m) : 0;
}

/**
 * Prognoza modelu dla jednego meczu — część czysta, bez sieci.
 *
 * `null`, gdy nie ma dopasowanego modelu ligi albo któraś z drużyn nie wystąpiła w danych
 * uczących: prognoza dla nieznanej drużyny to prognoza dla drużyny przeciętnej i nie mówi
 * nic o tej parze. Wtedy analiza idzie dawną drogą, a polityka typów filtruje po fakcie.
 *
 * `implied` to prawdopodobieństwa rynkowe z `impliedFromOdds` — wyłącznie do sufitu
 * „to już wszyscy wiedzą". W meczu w trakcie ignorowane: kursy przedmeczowe opisują inny
 * mecz niż ten, który trwa, a normę warunkową i tak liczymy dla aktualnego stanu.
 *
 * `goals` to wynik `goalsFor` z `lib/model/goals.js` (ułamki: `over25` i `btts`) — liczony
 * przez wywołującego, bo wymaga bazy i terminarza, a ta funkcja ma zostać czysta. Bez niego
 * selekcji „powyżej 2,5" po prostu nie ma; w meczu w trakcie też nie, bo kalibracja była
 * mierzona przed meczem. Kafelki goli (oczekiwana suma, powyżej 2,5, obie strzelą) wychodzą
 * stąd zawsze — przed meczem skalibrowane, w trakcie z macierzy dla reszty meczu — żeby
 * liczby w kafelkach i w typach były jednym rachunkiem, a nie domysłem modelu językowego.
 *
 * `live` (tylko w trakcie meczu) — `{ odds, redCards }`: kursy na żywo z `liveOddsFromRow`
 * i czerwone kartki obu drużyn. Bez nich żadna selekcja w trakcie meczu nie jest typem.
 *
 * @param {{ leagueModel: object|null, fixture: object, implied?: object|null, goals?: object|null,
 *   live?: { odds: object|null, redCards?: { home: number, away: number } } | null }} input
 * @returns {null | { version, matchesUsed, inPlay, minute, score, probabilities, likeliestScore, goals, selections, liveConfirmed }}
 */
export function buildAnalysisModel({ leagueModel, fixture, implied = null, goals = null, live = null }) {
	const over25 = goals?.over25 ?? null;
	if (!leagueModel || !fixture) return null;

	const eg = expectedGoals(leagueModel, fixture.teams?.home?.id, fixture.teams?.away?.id);
	if (!eg || !eg.known) return null;

	const inPlay = Boolean(fixture.status?.isLive);
	const stan = inPlay
		? { home: fixture.goals?.home ?? 0, away: fixture.goals?.away ?? 0, minute: minuta(fixture) }
		: null;

	const rynki = inPlay
		? inPlayMarkets({
				lambdaHome: eg.lambdaHome,
				lambdaAway: eg.lambdaAway,
				homeGoals: stan.home,
				awayGoals: stan.away,
				minute: stan.minute,
			})
		: przedMeczem(leagueModel, fixture, eg);

	/*
	 * Norma w trakcie meczu: przeciętna para drużyn (oceny zerowe, sama przewaga boiska)
	 * przy tym samym wyniku i minucie. Tylko względem niej przewaga cokolwiek znaczy.
	 */
	let normy = null;
	if (inPlay) {
		const przecietni = expectedGoals(leagueModel, null, null);
		normy = inPlayMarkets({
			lambdaHome: przecietni.lambdaHome,
			lambdaAway: przecietni.lambdaAway,
			homeGoals: stan.home,
			awayGoals: stan.away,
			minute: stan.minute,
		});
	}

	const nazwy = { homeName: fixture.teams?.home?.name, awayName: fixture.teams?.away?.name };
	// Selekcje wyłączone polityką („goście strzelą") w ogóle nie trafiają do listy — ani jako typ, ani zapasowy.
	const dostepne = SELEKCJE.filter((s) => !isBannedMarket(s.normalized) && (s.key !== 'over25' || (!inPlay && over25)));
	const zRynkami = { ...rynki, over25Calibrated: inPlay ? null : over25 };

	// W trakcie meczu: które selekcje przechodzą zasady kuponu live (nagłówek pliku).
	const kursyLive = inPlay ? live?.odds || null : null;
	const potwierdzoneLive = new Set();
	if (kursyLive && liveMinuteOk(fixture.status?.code, stan.minute)) {
		const model = Object.fromEntries(dostepne.map((s) => [s.key, s.wybierz(zRynkami)]));
		for (const w of liveSelections({ odds: kursyLive, model, redCards: live?.redCards })) {
			if (w.odds >= LIVE_LEG_MIN_ODDS && w.odds <= LIVE_LEG_MAX_ODDS) potwierdzoneLive.add(w.key);
		}
	}

	const selections = dostepne.map((s) => {
		const surowa = 100 * s.wybierz(zRynkami);
		const base =
			s.key === 'over25'
				? Math.round(100 * over25.base)
				: inPlay
					? Math.round(100 * s.wybierz(normy))
					: baseRateFor(s.normalized);
		const wspolne = { key: s.key, market: s.market, selection: s.opis(nazwy), normalized: s.normalized, base };

		if (inPlay) {
			const liveOk = potwierdzoneLive.has(s.key);
			const probability = liveOk ? liveChance(surowa, kursyLive[s.key]) : Math.round(surowa);
			const { lift } = liftFor(s.normalized, probability, { base });
			const polityka = meetsPolicy(s.normalized, probability, { base });
			return {
				...wspolne,
				probability,
				lift,
				modelProbability: Math.round(surowa),
				marketProbability: liveOk ? Math.round(100 / kursyLive[s.key]) : null,
				chanceSource: liveOk ? CHANCE_SOURCE.live : CHANCE_SOURCE.model,
				liveConfirmed: liveOk,
				eligible: liveOk && polityka.ok,
				reason: liveOk ? polityka.reason : 'live_unconfirmed',
			};
		}

		// Przed meczem: szansa modelu po korekcie, a gdy są kursy — szansa z kursu i jej potwierdzenie.
		const c = confirmWithMarket({ normalized: s.normalized, model: modelChance(s.key, surowa), base, implied });
		return {
			...wspolne,
			base: c.base,
			probability: c.probability,
			lift: c.lift,
			modelProbability: c.modelProbability,
			marketProbability: c.marketProbability,
			chanceSource: c.source,
			chanceConfirmed: c.confirmed,
			// Kandydat na typ tylko wtedy, gdy próg przechodzi model ORAZ (przy kursie) szansa z kursu.
			eligible: c.ok,
			reason: c.reason,
		};
	});

	/*
	 * Kafelki goli. Przed meczem: suma średnich bramkowych, „powyżej 2,5" i „obie strzelą"
	 * po kalibracji (gdy jest — inaczej z macierzy, oznaczone jako surowe). W trakcie: wynik
	 * plus to, co model spodziewa się jeszcze w pozostałym czasie, i rynki dla wyniku końcowego.
	 */
	const kafelki = inPlay
		? {
				expectedTotal: stan.home + stan.away + (eg.lambdaHome + eg.lambdaAway) * remainingFraction(stan.minute),
				over25: 100 * rynki.totalGoals[2.5].over,
				btts: 100 * rynki.btts.yes,
				calibrated: false,
			}
		: {
				expectedTotal: eg.lambdaHome + eg.lambdaAway,
				over25: 100 * (over25?.probability ?? rynki.totalGoals[2.5].over),
				btts: 100 * (goals?.btts?.probability ?? rynki.btts.yes),
				calibrated: Boolean(over25),
			};

	return {
		version: MODEL_VERSION,
		matchesUsed: leagueModel.matchesUsed ?? null,
		/*
		 * Pula łączona (puchary, reprezentacje): „rozegrane" to mecze drużyny w puli z ostatniego
		 * roku, nie w tych rozgrywkach — patrz `poolPlayed` w `predictFixture`.
		 */
		...(leagueModel.pool
			? {
					pool: leagueModel.pool,
					played: {
						home: leagueModel.teamMatches?.get(fixture.teams?.home?.id) ?? 0,
						away: leagueModel.teamMatches?.get(fixture.teams?.away?.id) ?? 0,
					},
				}
			: {}),
		inPlay,
		minute: stan?.minute ?? null,
		score: stan ? { home: stan.home, away: stan.away } : null,
		// W trakcie meczu: czy choć jedna selekcja przeszła zasady kuponu live — bez tego typu nie ma.
		liveConfirmed: inPlay ? potwierdzoneLive.size > 0 : null,
		probabilities: toPercentTriple(rynki.matchWinner),
		likeliestScore: rynki.likeliestScore,
		goals: {
			expectedTotal: Math.round(kafelki.expectedTotal * 10) / 10,
			over25: Math.round(kafelki.over25),
			btts: Math.round(kafelki.btts),
			calibrated: kafelki.calibrated,
		},
		selections,
	};
}

/**
 * Rynki przed meczem — te same dwie macierze co w `predictFixture` (`lib/model/index.js`):
 * 1X2 i podwójna szansa z siły ze strzałów celnych, gdy obie drużyny je mają (`dixon-coles/6`),
 * reszta (gole drużyny, suma, BTTS, najbardziej prawdopodobny wynik) z modelu goli. Inaczej
 * plakietka na liście i analiza tego samego meczu pokazywałyby dwie różne szanse na „1".
 * W trakcie meczu zostaje sam model goli — `inPlayMarkets` był mierzony na nim.
 */
function przedMeczem(leagueModel, fixture, eg) {
	const gole = predictMarkets(eg.lambdaHome, eg.lambdaAway, leagueModel.rho);
	const sila = matchExpectation(leagueModel, fixture.teams?.home?.id, fixture.teams?.away?.id);
	if (sila?.strength !== 'shots') return gole;
	const zeStrzalow = predictMarkets(sila.lambdaHome, sila.lambdaAway, leagueModel.rho);
	return { ...gole, matchWinner: zeStrzalow.matchWinner, doubleChance: zeStrzalow.doubleChance };
}

/**
 * Skalibrowane gole (`over25` do typu, `btts` do kafelka) dla meczu przed pierwszym gwizdkiem;
 * `null` w trakcie, bez modelu albo bez historii drużyn. Nigdy nie rzuca — to dodatek,
 * nie warunek analizy.
 */
export async function goalsForFixture(leagueModel, fixture) {
	if (!leagueModel || !fixture || fixture.status?.isLive) return null;
	const eg = expectedGoals(leagueModel, fixture.teams?.home?.id, fixture.teams?.away?.id);
	if (!eg?.known) return null;
	try {
		const rynki = predictMarkets(eg.lambdaHome, eg.lambdaAway, leagueModel.rho);
		return await goalsFor({
			leagueId: fixture.league?.id,
			season: fixture.league?.season,
			homeId: fixture.teams?.home?.id,
			awayId: fixture.teams?.away?.id,
			dcOver25: rynki.totalGoals[2.5].over,
			dcBtts: rynki.btts.yes,
		});
	} catch (error) {
		console.warn('[analysis] rynek 2,5 gola niedostępny:', error.message);
		return null;
	}
}

/**
 * Prognoza modelu dla pakietu meczu — z dopasowaniem ligi (pamięć procesu, 6 h).
 *
 * Nigdy nie rzuca: model jest dodatkiem do analizy, nie warunkiem. Brak modelu znaczy
 * tylko tyle, że liczby napisze model językowy, jak dotąd.
 */
export async function modelForBundle(bundle) {
	const fixture = bundle?.fixture;
	if (!fixture) return null;
	try {
		const leagueModel = await getLeagueModel({
			leagueId: fixture.league?.id,
			season: fixture.league?.season,
		});
		const goals = await goalsForFixture(leagueModel, fixture);
		return buildAnalysisModel({ leagueModel, fixture, implied: bundle.market ?? null, goals, live: bundle.live ?? null });
	} catch (error) {
		console.warn('[analysis] model liczbowy niedostępny:', error.message);
		return null;
	}
}

/**
 * Prawdopodobieństwa rynkowe meczu (po zdjęciu marży) — do sufitu i do zapisu przy typie.
 *
 * Tylko przed meczem: kursy przedmeczowe w trakcie gry opisują spotkanie, które już się
 * nie odbędzie w tej postaci. Nigdy nie rzuca; brak kursów to brak sufitu.
 */
export async function marketForBundle(bundle) {
	const fixture = bundle?.fixture;
	if (!fixture?.id || fixture.status?.isLive || fixture.status?.isFinished) return null;
	try {
		const kursy = (await oddsByFixture(fixture.id))?.[0] ?? null;
		return impliedFromOdds(normalizeOddsFixture(kursy)?.markets);
	} catch (error) {
		console.warn('[analysis] kursy niedostępne:', error.message);
		return null;
	}
}

/** Czerwone kartki drużyny z wydarzeń meczu (`normalizeEvents`) — do weta live. */
const czerwone = (events, teamId) =>
	(events || []).filter((e) => e.teamId === teamId && e.type === 'Card' && /red/i.test(e.detail || '')).length;

/**
 * Kursy na żywo i czerwone kartki dla analizy meczu W TRAKCIE — `{ odds, redCards }` albo `null`.
 *
 * `liveOdds()` to jedno wspólne zapytanie o wszystkie trwające mecze z pamięcią 60 s (to samo, którym
 * żyje kupon live), więc analiza nie płaci za osobne pobranie. Nigdy nie rzuca: bez kursów live
 * typu w trakcie meczu po prostu nie ma.
 */
export async function liveForBundle(bundle) {
	const fixture = bundle?.fixture;
	if (!fixture?.id || !fixture.status?.isLive) return null;
	try {
		const row = ((await liveOdds()) || []).find((r) => String(r.fixture?.id) === String(fixture.id));
		const odds = row ? liveOddsFromRow(row) : null;
		return {
			odds,
			redCards: {
				home: czerwone(bundle.events, fixture.teams?.home?.id),
				away: czerwone(bundle.events, fixture.teams?.away?.id),
			},
		};
	} catch (error) {
		console.warn('[analysis] kursy na żywo niedostępne:', error.message);
		return null;
	}
}

/*
 * Opis powodu odrzucenia dla modelu językowego. „Zbyt oczywiste" celowo bez słowa o rynku:
 * model językowy nie ma wiedzieć, że kursy istnieją, bo mógłby o nich napisać, a treść
 * ma być wolna od jakichkolwiek odniesień do zakładów.
 */
const POWOD = {
	below_min_probability: 'poniżej dolnej granicy',
	below_min_lift: 'za mała przewaga nad normą',
	market_certain: 'zdarzenie zbyt oczywiste, nie wnosi informacji',
	live_unconfirmed: 'NIE DO TYPU — brak potwierdzenia na żywo',
};

/**
 * Sekcja promptu z prognozą modelu. Model językowy widzi każdą selekcję z procentem, normą
 * i przewagą oraz jednoznaczne oznaczenie, które z nich wolno wystawić jako typ.
 *
 * @param {object} model wynik `buildAnalysisModel`
 * @returns {string[]} wiersze do promptu
 */
export function formatModelSection(model) {
	if (!model) return [];

	const znak = (n) => (n > 0 ? `+${n}` : String(n));
	const wiersze = [
		`PROGNOZA MODELU LICZBOWEGO (${model.version}; dopasowany na ${model.matchesUsed ?? '?'} meczach ligi; obie drużyny w danych)`,
	];

	if (model.inPlay) {
		wiersze.push(
			`  Stan: ${model.score.home}:${model.score.away} w ${model.minute}. minucie. Prognoza dotyczy KOŃCOWEGO wyniku przy tym stanie; norma to przeciętna para drużyn w tej samej sytuacji.`
		);
	}

	const p = model.probabilities;
	wiersze.push(
		`  Szanse końcowe: gospodarze ${p.home}% / remis ${p.draw}% / goście ${p.away}% — przepisz DOKŁADNIE do "probabilities".`
	);
	if (model.likeliestScore) {
		wiersze.push(`  Najbardziej prawdopodobny wynik: ${model.likeliestScore.home}:${model.likeliestScore.away}.`);
	}
	if (model.goals) {
		wiersze.push(
			`  Gole: oczekiwana suma ${model.goals.expectedTotal}, powyżej 2,5 — ${model.goals.over25}%, obie strzelą — ${model.goals.btts}%. Przepisz DOKŁADNIE do "goals" (expectedTotal, over25, btts).`
		);
	}

	/*
	 * Źródło procentu przy wierszu — żeby model językowy nie nazywał szansy z kursu „wynikiem modelu".
	 * Słowa „kurs" celowo tu nie ma: model językowy nie ma wiedzieć, że kursy istnieją, bo mógłby
	 * o nich napisać (zasada 1); wystarczy, że wie, czyja to liczba.
	 */
	const ZRODLO = {
		market: 'szansa ustalona przez serwis z pełnych danych — nie przypisuj jej modelowi',
		live: 'szansa ostrożna, potwierdzona na żywo',
		model: 'szansa z modelu',
	};
	wiersze.push('  Selekcje (prawdopodobieństwo, norma, przewaga):');
	for (const s of model.selections) {
		const status = s.eligible ? 'KANDYDAT NA TYP' : POWOD[s.reason] ?? 'poza progiem';
		const zrodlo = ZRODLO[s.chanceSource] ? ` [${ZRODLO[s.chanceSource]}]` : '';
		wiersze.push(
			`    - ${s.market} / ${s.selection}: ${s.probability}%${zrodlo} (norma ${s.base}%, ${znak(s.lift)} pkt) — ${status}`
		);
	}

	const kandydaci = model.selections.filter((s) => s.eligible).length;
	if (model.inPlay && !model.liveConfirmed) {
		wiersze.push(
			'  ZASADY DLA TEJ SEKCJI: w tym meczu żadna selekcja nie ma potwierdzenia na żywo, więc "picks" ZOSTAW PUSTE — typ zapasowy w tej sytuacji NIE obowiązuje. "probabilities" i "goals" przepisz jak zwykle; kierunek pokaże serwis.'
		);
		return wiersze;
	}
	wiersze.push(
		'  ZASADY DLA TEJ SEKCJI: "picks" wyłącznie spośród pozycji oznaczonych KANDYDAT NA TYP, z "market", "selection" i "probability" przepisanymi z tej listy co do znaku. Kandydata możesz ODRZUCIĆ — wtedy wskaż w "risks" konkretny czynnik spoza rachunku (absencje, skład, stawka, warunki). Nie dodawaj typów spoza listy i nie zmieniaj liczb.' +
			(kandydaci === 0
				? ' KANDYDATÓW NIE MA, więc wystaw DOKŁADNIE JEDEN typ zapasowy: wybierz z powyższej listy selekcję, którą całość danych wspiera najmocniej, pomijając te oznaczone jako "zbyt oczywiste" i "NIE DO TYPU". "probability" przepisz z jej wiersza tak samo jak przy kandydacie — liczba jest policzona i wiążąca, brakuje jej tylko przewagi nad normą. W "rationale" napisz wprost, że dane nie dają wyraźnej przewagi.'
				: '')
	);

	return wiersze;
}

/**
 * NAJMOCNIEJSZA SKŁONNOŚĆ — co pokazujemy, gdy żaden typ nie przeszedł progu.
 *
 * Analiza bez typu wygląda dla czytelnika na pustą, a przy obecnym progu typu nie dostaje
 * spora część meczów. Obniżenie progu byłoby jednak cofnięciem wszystkiego, co daje typom
 * wartość: wróciłyby zdarzenia oczywiste, a skuteczność znów przestałaby cokolwiek znaczyć.
 *
 * Dlatego skłonność NIE JEST TYPEM i nigdy nim nie zostaje. Nie trafia do `picks`, więc
 * `recordPicks` jej nie zapisuje i nie wchodzi do statystyki. Mówi tylko, w którą stronę
 * przechylają się dane — i podpisujemy ją wprost, że nie sięga naszego progu.
 *
 * @param {Array} selections lista z `buildAnalysisModel`
 * @returns {object|null} selekcja z największą przewagą nad normą
 */
export function bestLeaning(selections) {
	const sensowne = (selections || []).filter((s) => Number.isFinite(s.lift));
	if (!sensowne.length) return null;
	const najlepsza = sensowne.reduce((a, b) => (b.lift > a.lift ? b : a));
	return {
		market: najlepsza.market,
		selection: najlepsza.selection,
		probability: najlepsza.probability,
		baseRate: najlepsza.base,
		lift: najlepsza.lift,
	};
}

/**
 * Skłonność wyliczona z samych szans 1X2 — dla meczów bez modelu liczbowego.
 *
 * Rozgrywki spoza obsługiwanej listy nie dostają modelu, a czytelnik i tak ma coś zobaczyć.
 * Rynków bramkowych nie da się tu wyprowadzić, więc zostają cztery selekcje wynikowe.
 */
export function leaningFromProbabilities(probabilities, nazwy) {
	const { home, draw, away } = probabilities || {};
	if (![home, draw, away].every((v) => Number.isFinite(v))) return null;

	const warianty = [
		{ key: 'home', p: home },
		{ key: 'away', p: away },
		{ key: '1X', p: home + draw },
		{ key: 'X2', p: away + draw },
	];

	const selections = warianty.map(({ key, p }) => {
		const s = SELEKCJE.find((x) => x.key === key);
		const probability = Math.round(p);
		const { base, lift } = liftFor(s.normalized, probability);
		return { market: s.market, selection: s.opis(nazwy), probability, base, lift };
	});

	return bestLeaning(selections);
}

/**
 * Wiąże odpowiedź modelu językowego z prognozą liczbową.
 *
 * Szanse 1X2, kafelki goli i procenty typów wracają do wartości modelu; przy typie ląduje
 * norma i przewaga. Typ spoza listy selekcji zostaje z własnym procentem — polityka przy zapisie
 * i tak oznaczy go jako nieliczony, a czytelnik zobaczy przy nim „poniżej progu".
 *
 * MECZ W TRAKCIE (`inPlay`): zostają wyłącznie typy na selekcje potwierdzone kursem na żywo
 * (`liveConfirmed`); pozostałe — także wszystkie typy w meczu bez modelu liczbowego — wypadają,
 * a czytelnik dostaje kierunek. Prompt prosi o puste „picks", więc to wyjątek, nie reguła.
 *
 * @param {object} sections odpowiedź modelu językowego
 * @param {object|null} model wynik `buildAnalysisModel`
 * @param {{ homeName: string, awayName: string, inPlay?: boolean }} names
 */
export function bindAnalysisToModel(sections, model, { homeName, awayName, inPlay = false }) {
	if (!sections) return sections;

	if (inPlay && sections.picks?.length) {
		const potwierdzone = (sections.picks || []).filter((pick) => {
			const normalized = normalizePick({ market: pick.market, selection: pick.selection, homeName, awayName });
			return (model?.selections || []).some((s) => s.liveConfirmed && sameSelection(s.normalized, normalized));
		});
		if (potwierdzone.length !== sections.picks.length) sections = { ...sections, picks: potwierdzone };
	}

	/*
	 * Bez modelu liczbowego (rozgrywki spoza listy) zostają szanse od modelu językowego.
	 * Typów nie ruszamy — filtruje je polityka przy zapisie — ale gdy żadnego nie ma,
	 * dokładamy kierunek, żeby analiza nie kończyła się niczym.
	 */
	if (!model) {
		if (sections.picks?.length) return sections;
		const leaning = leaningFromProbabilities(sections.probabilities, { homeName, awayName });
		return leaning ? { ...sections, leaning } : sections;
	}

	const picks = (sections.picks || []).map((pick) => {
		const normalized = normalizePick({ market: pick.market, selection: pick.selection, homeName, awayName });
		const wpis = model.selections.find((s) => sameSelection(s.normalized, normalized));
		if (!wpis) return pick;
		return {
			...pick,
			probability: wpis.probability,
			baseRate: wpis.base,
			lift: wpis.lift,
			// Obie liczby i źródło szansy idą z typem do zapisu (`recordPicks`).
			modelProbability: wpis.modelProbability ?? null,
			chanceSource: wpis.chanceSource ?? null,
		};
	});

	return {
		...sections,
		probabilities: { ...model.probabilities },
		// Kafelki goli z tego samego rachunku co typy — model językowy mógł je przepisać z błędem.
		...(model.goals
			? { goals: { expectedTotal: model.goals.expectedTotal, over25: model.goals.over25, btts: model.goals.btts } }
			: {}),
		picks,
		// Bez typu czytelnik dostaje przynajmniej kierunek — patrz `bestLeaning`.
		...(picks.length ? {} : { leaning: bestLeaning(model.selections) }),
		// Ślad dla interfejsu i pomiaru: skąd wzięły się liczby w tej analizie.
		model: {
			version: model.version,
			inPlay: model.inPlay,
			minute: model.minute,
			matchesUsed: model.matchesUsed,
		},
	};
}
