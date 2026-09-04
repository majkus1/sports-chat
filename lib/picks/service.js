import Pick from '@/models/Pick';
import { fixturesByIds } from '@/lib/football/endpoints';
import { normalizePick, settlePick } from '@/lib/picks/markets';
import { liftFor, meetsPolicy, countsAsFallback } from '@/lib/picks/policy';

/**
 * Zapis i rozliczanie typów.
 *
 * Typy zapisujemy w chwili wygenerowania, a wynik dopisujemy wsadowo po zakończeniu meczów.
 * Rozliczanie celowo NIE chodzi przy każdym wejściu na stronę: mecz kończy się raz, więc
 * wystarczy jeden przebieg na dobę. Dodatkowo pobieramy wyniki paczkami po 20 meczów
 * (`fixtures?ids=`), czyli jedno wywołanie API na dwadzieścia rozliczonych typów.
 */

/** Ile meczów mieści jedno wywołanie `fixtures?ids=` — limit dostawcy. */
const BATCH = 20;

/**
 * Mecz uznajemy za rozstrzygalny dopiero po tym czasie od gwizdka.
 *
 * 3,5 godziny pokrywa dogrywkę, karne i typowe opóźnienia w publikacji wyniku. Wcześniejsze
 * pytanie kończyłoby się statusem „w trakcie" i typ i tak zostałby na kolejny przebieg.
 */
export const SETTLE_AFTER_MS = 3.5 * 3600 * 1000;

/** Statusy, przy których mecz nie odbędzie się wcale — typ przepada bez winy modelu. */
const NOT_PLAYED = ['CANC', 'ABD', 'AWD', 'WO', 'PST'];

/**
 * Ile meczów musi mieć za sobą każda drużyna, żeby typ liczył się do statystyki.
 *
 * Poniżej tego progu prognoza dostawcy jest zgadywaniem na kilku wynikach, a wynik typu
 * mówi więcej o losowości niż o modelu.
 */
const MIN_PLAYED_FOR_STATS = 6;

/** Sekcje, bez których nie ma z czego prognozować — ich brak wyłącza typ ze statystyki. */
const REQUIRED_SECTIONS = ['form', 'prediction'];

/**
 * Czy typ wchodzi do publicznej statystyki skuteczności.
 *
 * Reguła jest celowo po stronie zapisu, nie odczytu: gdyby liczyła się przy każdym
 * wyświetleniu panelu, zmiana progu przepisywałaby historię i wczorajsza skuteczność
 * potrafiłaby wyglądać inaczej niż wczoraj.
 */
function qualifiesForStats({ dataQuality, sectionsPresent, playedHome, playedAway }) {
	if (dataQuality === 'insufficient') return false;
	if (Array.isArray(sectionsPresent) && sectionsPresent.length) {
		if (!REQUIRED_SECTIONS.every((s) => sectionsPresent.includes(s))) return false;
	}
	if (Number.isFinite(playedHome) && playedHome < MIN_PLAYED_FOR_STATS) return false;
	if (Number.isFinite(playedAway) && playedAway < MIN_PLAYED_FOR_STATS) return false;
	return true;
}

/**
 * Zapisuje typy z wygenerowanej analizy albo raportu.
 *
 * Świadomie nie przerywa działania przy błędzie: nieudany zapis statystyki nie może
 * zabrać użytkownikowi analizy, za którą już zapłacił limitem.
 *
 * `context` niesie okoliczności powstania typu — wersję instrukcji, model, jakość danych
 * i ligę. Zapisujemy je razem z typem, bo później nie ma jak ich odtworzyć: analiza meczu
 * na żywo kasuje się po kwadransie, a wersja promptu zmienia się przy każdym wdrożeniu.
 *
 * `context` bywa wspólny dla całej analizy (jeden mecz) albo różny dla każdego typu
 * (raport obejmuje kilkanaście meczów), więc przyjmujemy obiekt ALBO funkcję typu.
 *
 * @param {{ picks: Array, kind: 'prematch'|'live'|'report', source: 'analysis'|'report',
 *   sourceId?: any, userId?: any, fixtureResolver: (pick) => object,
 *   context?: object | ((pick) => object) }} input
 */
export async function recordPicks({
	picks,
	kind,
	source,
	sourceId,
	userId,
	fixtureResolver,
	context = {},
}) {
	if (!Array.isArray(picks) || !picks.length) return 0;

	const metaFor = typeof context === 'function' ? context : () => context;
	let saved = 0;

	for (const pick of picks) {
		try {
			const fixtureCtx = fixtureResolver(pick);
			if (!fixtureCtx?.fixtureId) continue;

			const normalized = normalizePick({
				market: pick.market,
				selection: pick.selection,
				homeName: fixtureCtx.homeName,
				awayName: fixtureCtx.awayName,
			});

			// Kontekst dostaje postać znormalizowaną — po niej wywołujący odnajduje selekcję
			// w swoich danych (np. prawdopodobieństwo rynkowe), bez drugiego parsowania.
			/*
			 * Nierozpoznany rynek to CICHA STRATA, więc musi zostawić ślad.
			 *
			 * Taki typ zapisuje się jako `void` i nie wchodzi do żadnej statystyki, ale czytelnik
			 * widzi go przy meczu jak każdy inny. Bez tego logu wykrywa się to wyłącznie okiem,
			 * po brakującym wierszu z przewagą — i dokładnie tak wyszła na jaw nazwa
			 * „Drużyna strzeli gola", której parser nie znał.
			 */
			if (!normalized) {
				console.warn(
					`[picks] nierozpoznany rynek, typ poza statystyką: "${pick.market}" / "${pick.selection}"`
				);
			}

			const meta = metaFor(pick, normalized) || {};

			const probability = Number.isFinite(pick.probability) ? pick.probability : null;
			/*
			 * Norma rynku i przewaga nad nią — zapisane przy typie, bo panel skuteczności
			 * zestawia trafność z tym, co dałoby samo zgadywanie normy dla tych samych typów.
			 *
			 * Typ związany z modelem liczbowym przynosi normę ze sobą: w meczu w trakcie jest
			 * to norma dla aktualnego stanu, nie tabelaryczna. Wtedy ona decyduje.
			 *
			 * Prawdopodobieństwo rynkowe (po zdjęciu marży) idzie do polityki jako sufit
			 * i do bazy jako materiał do pomiaru. Nigdzie dalej — patrz `MARKET_CEILING`.
			 */
			const marketProbability = Number.isFinite(meta.marketProbability) ? meta.marketProbability : null;
			const opcje = {
				...(Number.isFinite(pick.baseRate) ? { base: pick.baseRate } : {}),
				...(marketProbability !== null ? { market: marketProbability } : {}),
			};
			const polityka = meetsPolicy(normalized, probability, opcje);
			const { base, lift } = liftFor(normalized, probability, opcje);

			await Pick.updateOne(
				{
					fixtureId: String(fixtureCtx.fixtureId),
					kind,
					market: String(pick.market || ''),
					selection: String(pick.selection || ''),
					userId: userId || null,
				},
				{
					$setOnInsert: {
						source,
						sourceId: sourceId || null,
						probability,
						confidence: Number.isFinite(pick.confidence) ? pick.confidence : null,
						baseRate: base,
						lift,
						marketProbability,
						normalized,
						homeName: fixtureCtx.homeName ?? null,
						awayName: fixtureCtx.awayName ?? null,
						leagueName: fixtureCtx.leagueName ?? null,
						kickoff: fixtureCtx.kickoff ? new Date(fixtureCtx.kickoff) : null,

						promptVersion: meta.promptVersion ?? null,
						modelVersion: meta.modelVersion ?? null,
						numericModelVersion: meta.numericModelVersion ?? null,
						dataQuality: meta.dataQuality ?? null,
						leagueId: Number.isFinite(meta.leagueId) ? meta.leagueId : null,
						leagueTier: Number.isFinite(meta.leagueTier) ? meta.leagueTier : null,
						sectionsPresent: Array.isArray(meta.sectionsPresent) ? meta.sectionsPresent : [],
						/*
						 * Typ podprogowy TEŻ się liczy — decyzja produktowa.
						 *
						 * Gdy nic nie sięga progu, analiza dostaje typ zapasowy od modelu językowego,
						 * bo analiza bez typu wygląda dla czytelnika na pustą. Skoro go pokazujemy,
						 * musimy go też rozliczać; chwalenie się wyłącznie typami, które sami uznajemy
						 * za mocne, byłoby liczeniem tylko wygranych zakładów.
						 *
						 * Twarde odrzucenia zostają twarde: rynek zakazany pomiarem, selekcja bez
						 * zmierzonej normy i zdarzenie, które rynek uważa za pewne, nadal nie wchodzą.
						 * `policyReason` zostaje zapisany także przy typie wliczonym, więc statystykę
						 * da się w każdej chwili rozdzielić na typy nad progiem i zapasowe.
						 */
						countsToStats:
							qualifiesForStats(meta) && (polityka.ok || countsAsFallback(polityka.reason)),
						policyReason: polityka.reason,

						// Rynek nierozpoznany od razu odpada ze statystyk — nie ma sensu
						// trzymać go jako „oczekujący" i pytać o wynik meczu bez potrzeby.
						status: normalized ? 'pending' : 'void',
						voidReason: normalized ? null : 'market_not_supported',
					},
				},
				{ upsert: true }
			);
			saved += 1;
		} catch (error) {
			// Duplikat (11000) jest normalny przy ponownym generowaniu tej samej analizy.
			if (error?.code !== 11000) {
				console.warn('[picks] nie udało się zapisać typu:', error.message);
			}
		}
	}

	return saved;
}

/**
 * Rozlicza typy oczekujące, których mecze już się zakończyły.
 *
 * @param {{ limit?: number }} [options] górny limit meczów na jeden przebieg
 * @returns {Promise<{ examined: number, settled: number, won: number, lost: number, voided: number, apiCalls: number }>}
 */
export async function settlePendingPicks({ limit = 400 } = {}) {
	const cutoff = new Date(Date.now() - SETTLE_AFTER_MS);

	const pending = await Pick.find({
		status: 'pending',
		kickoff: { $ne: null, $lte: cutoff },
	})
		.sort({ kickoff: 1 })
		.limit(limit)
		.lean();

	if (!pending.length) {
		return { examined: 0, settled: 0, won: 0, lost: 0, voided: 0, apiCalls: 0 };
	}

	// Jeden mecz bywa typowany wielokrotnie (analiza + raport, różni użytkownicy) —
	// pytamy o niego raz.
	const fixtureIds = [...new Set(pending.map((p) => p.fixtureId))];
	const results = new Map();
	let apiCalls = 0;

	for (let i = 0; i < fixtureIds.length; i += BATCH) {
		const chunk = fixtureIds.slice(i, i + BATCH);
		try {
			const rows = await fixturesByIds(chunk);
			apiCalls += 1;
			for (const row of rows) {
				results.set(String(row.fixture?.id), {
					status: row.fixture?.status?.short,
					home: row.goals?.home,
					away: row.goals?.away,
				});
			}
		} catch (error) {
			console.warn('[picks] nie udało się pobrać wyników paczki:', error.message);
		}
	}

	const summary = { examined: pending.length, settled: 0, won: 0, lost: 0, voided: 0, apiCalls };

	for (const pick of pending) {
		const result = results.get(String(pick.fixtureId));
		if (!result) continue;

		if (NOT_PLAYED.includes(result.status)) {
			await Pick.updateOne(
				{ _id: pick._id },
				{ $set: { status: 'void', voidReason: 'match_not_played', settledAt: new Date() } }
			);
			summary.voided += 1;
			continue;
		}

		// Mecz wciąż nierozstrzygnięty (przełożony w toku, dane spóźnione) — zostawiamy
		// na kolejny przebieg zamiast zgadywać.
		if (!['FT', 'AET', 'PEN'].includes(result.status)) continue;

		const outcome = settlePick(pick.normalized, { home: result.home, away: result.away });
		if (!outcome) {
			await Pick.updateOne(
				{ _id: pick._id },
				{ $set: { status: 'void', voidReason: 'not_settleable', settledAt: new Date() } }
			);
			summary.voided += 1;
			continue;
		}

		await Pick.updateOne(
			{ _id: pick._id },
			{
				$set: {
					status: outcome,
					settledAt: new Date(),
					finalScore: { home: result.home, away: result.away },
				},
			}
		);
		summary.settled += 1;
		summary[outcome] += 1;
	}

	return summary;
}
