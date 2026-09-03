import { getLeagueModel, MODEL_VERSION } from '@/lib/model';
import { expectedGoals } from '@/lib/model/ratings';
import { predictMarkets, inPlayMarkets } from '@/lib/model/dixonColes';
import { oddsByFixture } from '@/lib/football/endpoints';
import { normalizeOddsFixture, impliedFromOdds } from '@/lib/football/normalize';
import { baseRateFor, liftFor, meetsPolicy, marketProbabilityFor } from '@/lib/picks/policy';
import { normalizePick, sameSelection } from '@/lib/picks/markets';

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
 */

/**
 * Selekcje, które model umie policzyć i które polityka umie rozliczyć — w kolejności
 * prezentacji. `wybierz` sięga po ułamek z wyniku `predictMarkets`/`inPlayMarkets`,
 * `opis` buduje tekst selekcji w postaci, którą `normalizePick` rozpozna z powrotem.
 */
const SELEKCJE = [
	{
		key: 'home',
		market: 'Wynik meczu',
		normalized: { type: 'matchWinner', value: 'home' },
		wybierz: (r) => r.matchWinner.home,
		opis: (f) => `${f.teams?.home?.name ?? 'Gospodarze'} (gospodarze)`,
	},
	{
		key: 'away',
		market: 'Wynik meczu',
		normalized: { type: 'matchWinner', value: 'away' },
		wybierz: (r) => r.matchWinner.away,
		opis: (f) => `${f.teams?.away?.name ?? 'Goście'} (goście)`,
	},
	{
		key: '1X',
		market: 'Podwójna szansa',
		normalized: { type: 'doubleChance', value: '1X' },
		wybierz: (r) => r.doubleChance['1X'],
		opis: () => '1X (gospodarz lub remis)',
	},
	{
		key: 'X2',
		market: 'Podwójna szansa',
		normalized: { type: 'doubleChance', value: 'X2' },
		wybierz: (r) => r.doubleChance.X2,
		opis: () => 'X2 (gość lub remis)',
	},
	{
		key: 'homeScores',
		market: 'Gole drużyny',
		normalized: { type: 'teamGoals', side: 'home', dir: 'over', line: 0.5 },
		wybierz: (r) => r.teamGoals.home[0.5].over,
		opis: (f) => `${f.teams?.home?.name ?? 'Gospodarze'} powyżej 0.5 gola`,
	},
	{
		key: 'awayScores',
		market: 'Gole drużyny',
		normalized: { type: 'teamGoals', side: 'away', dir: 'over', line: 0.5 },
		wybierz: (r) => r.teamGoals.away[0.5].over,
		opis: (f) => `${f.teams?.away?.name ?? 'Goście'} powyżej 0.5 gola`,
	},
];

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
 * @param {{ leagueModel: object|null, fixture: object, implied?: object|null }} input
 * @returns {null | { version, matchesUsed, inPlay, minute, score, probabilities, likeliestScore, selections }}
 */
export function buildAnalysisModel({ leagueModel, fixture, implied = null }) {
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
		: predictMarkets(eg.lambdaHome, eg.lambdaAway, leagueModel.rho);

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

	const selections = SELEKCJE.map((s) => {
		const probability = Math.round(100 * s.wybierz(rynki));
		const base = inPlay ? Math.round(100 * s.wybierz(normy)) : baseRateFor(s.normalized);
		// Sufit rynkowy tylko przed meczem; zostaje przy selekcji do zapisu, nie do promptu.
		const marketProbability = inPlay ? null : marketProbabilityFor(s.normalized, implied);
		const { lift } = liftFor(s.normalized, probability, { base });
		const polityka = meetsPolicy(s.normalized, probability, { base, market: marketProbability });
		return {
			key: s.key,
			market: s.market,
			selection: s.opis(fixture),
			normalized: s.normalized,
			probability,
			base,
			lift,
			marketProbability,
			eligible: polityka.ok,
			reason: polityka.reason,
		};
	});

	return {
		version: MODEL_VERSION,
		matchesUsed: leagueModel.matchesUsed ?? null,
		inPlay,
		minute: stan?.minute ?? null,
		score: stan ? { home: stan.home, away: stan.away } : null,
		probabilities: toPercentTriple(rynki.matchWinner),
		likeliestScore: rynki.likeliestScore,
		selections,
	};
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
		return buildAnalysisModel({ leagueModel, fixture, implied: bundle.market ?? null });
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

/*
 * Opis powodu odrzucenia dla modelu językowego. „Zbyt oczywiste" celowo bez słowa o rynku:
 * model językowy nie ma wiedzieć, że kursy istnieją, bo mógłby o nich napisać, a treść
 * ma być wolna od jakichkolwiek odniesień do zakładów.
 */
const POWOD = {
	below_min_probability: 'poniżej dolnej granicy',
	below_min_lift: 'za mała przewaga nad normą',
	market_certain: 'zdarzenie zbyt oczywiste, nie wnosi informacji',
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

	wiersze.push('  Selekcje (prawdopodobieństwo, norma, przewaga):');
	for (const s of model.selections) {
		const status = s.eligible ? 'KANDYDAT NA TYP' : POWOD[s.reason] ?? 'poza progiem';
		wiersze.push(
			`    - ${s.market} / ${s.selection}: ${s.probability}% (norma ${s.base}%, ${znak(s.lift)} pkt) — ${status}`
		);
	}

	const kandydaci = model.selections.filter((s) => s.eligible).length;
	wiersze.push(
		'  ZASADY DLA TEJ SEKCJI: "picks" wyłącznie spośród pozycji oznaczonych KANDYDAT NA TYP, z "market", "selection" i "probability" przepisanymi z tej listy co do znaku. Kandydata możesz ODRZUCIĆ — wtedy wskaż w "risks" konkretny czynnik spoza rachunku (absencje, skład, stawka, warunki). Nie dodawaj typów spoza listy i nie zmieniaj liczb.' +
			(kandydaci === 0 ? ' Kandydatów nie ma — zostaw "picks" pustą tablicą.' : '')
	);

	return wiersze;
}

/**
 * Wiąże odpowiedź modelu językowego z prognozą liczbową.
 *
 * Szanse 1X2 i procenty typów wracają do wartości modelu; przy typie ląduje norma
 * i przewaga. Typ spoza listy selekcji zostaje z własnym procentem — polityka przy zapisie
 * i tak oznaczy go jako nieliczony, a czytelnik zobaczy przy nim „poniżej progu".
 *
 * @param {object} sections odpowiedź modelu językowego
 * @param {object|null} model wynik `buildAnalysisModel`
 * @param {{ homeName: string, awayName: string }} names
 */
export function bindAnalysisToModel(sections, model, { homeName, awayName }) {
	if (!sections || !model) return sections;

	const picks = (sections.picks || []).map((pick) => {
		const normalized = normalizePick({ market: pick.market, selection: pick.selection, homeName, awayName });
		const wpis = model.selections.find((s) => sameSelection(s.normalized, normalized));
		if (!wpis) return pick;
		return { ...pick, probability: wpis.probability, baseRate: wpis.base, lift: wpis.lift };
	});

	return {
		...sections,
		probabilities: { ...model.probabilities },
		picks,
		// Ślad dla interfejsu i pomiaru: skąd wzięły się liczby w tej analizie.
		model: {
			version: model.version,
			inPlay: model.inPlay,
			minute: model.minute,
			matchesUsed: model.matchesUsed,
		},
	};
}
