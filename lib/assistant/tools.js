import Pick from '@/models/Pick';
import MatchAnalysis from '@/models/MatchAnalysis';
import { fixturesByDate, fixtureById } from '@/lib/football/endpoints';
import { normalizeFixture } from '@/lib/football/normalize';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { getLeagueModel } from '@/lib/model';
import { hintsForDate } from '@/lib/model/hints';
import { buildAnalysisModel } from '@/lib/analysis/model';
import { MARKET_GROUPS } from '@/lib/picks/markets';
import { MIN_LIFT } from '@/lib/picks/policy';
import { MAX_PROBABILITY } from '@/lib/reports/service';

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

/** Data w formacie YYYY-MM-DD dla strefy serwera; `undefined` daje dziś. */
function dzien(offsetDni = 0) {
	const d = new Date(Date.now() + offsetDni * 86_400_000);
	return d.toISOString().slice(0, 10);
}

function godzina(iso) {
	return new Date(iso).toISOString().slice(11, 16) + ' UTC';
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
			'Lista meczów z obsługiwanych lig na dany dzień (dziś, jutro albo konkretna data). Przy każdym meczu jest identyfikator (do odnośnika /mecz/ID), godzina, liga, status i — jeśli model ma typ — jego selekcja z przewagą nad przeciętną. Użyj, gdy pytanie dotyczy „co dziś gra", konkretnej ligi albo drużyny.',
		input_schema: {
			type: 'object',
			properties: {
				data: { type: 'string', description: 'YYYY-MM-DD. Pomiń dla dzisiaj.' },
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

async function meczeDnia({ data, liga, druzyna }) {
	const date = /^\d{4}-\d{2}-\d{2}$/.test(data || '') ? data : dzien(0);
	const [rows, { byId }] = await Promise.all([fixturesByDate(date), hintsForDate(date)]);

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

	const lista = mecze.slice(0, MAX_MECZOW).map((f) => {
		const hint = byId.get(String(f.id));
		return {
			fixtureId: String(f.id),
			mecz: `${f.teams?.home?.name} – ${f.teams?.away?.name}`,
			liga: [f.league?.name, f.league?.country].filter(Boolean).join(', '),
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
	const wynik = buildAnalysisModel({ leagueModel, fixture });
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
		: { author: 'ai', countsToStats: true, status: { $in: ['won', 'lost'] } };

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

/* ------------------------------------------------------------------------------------------ */

/**
 * Wykonawca narzędzi — zwraca tekst JSON dla modelu.
 *
 * `ctx` niesie to, czego model nie może sam podać: kto pyta i w jakim języku. Nieznana nazwa
 * narzędzia to odpowiedź z błędem, nie wyjątek — model ma o tym powiedzieć.
 */
export function makeExecutor(ctx) {
	const wykonawcy = {
		mecze_dnia: meczeDnia,
		najlepsze_typy: najlepszeTypy,
		model_dla_meczu: modelDlaMeczu,
		gotowa_analiza: (input) => gotowaAnaliza(input, ctx),
		skutecznosc: (input) => skutecznosc(input, ctx),
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
				blad: 'Nie udało się pobrać danych w tej chwili. Powiedz użytkownikowi wprost, że to chwilowy problem z pobraniem danych i żeby spróbował za minutę. NIE podawaj żadnej innej przyczyny.',
			});
		}
	};
}
