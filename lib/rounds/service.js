import Round from '@/models/Round';
import Pick from '@/models/Pick';
import { fixturesByDate } from '@/lib/football/endpoints';
import { LEAGUE_TIERS } from '@/lib/football/leagues';
import { normalizeFixture } from '@/lib/football/normalize';
import { SETTLE_AFTER_MS, recordPicks } from '@/lib/picks/service';
import { modelHintsFor } from '@/lib/model/hints';
import { MODEL_VERSION } from '@/lib/model';
import { SELECTION_SHAPES } from '@/lib/picks/markets';
import { localDatesBetween } from '@/lib/time';

/**
 * Kolejka tygodniowa: dobór meczów, otwieranie i domykanie.
 *
 * Zestaw ma być rozpoznawalny — jeśli w kolejce stoją Ekstraklasa i Premier League, jest
 * o czym rozmawiać w czacie; jeśli czwarta liga australijska, nie ma. Dlatego mecze
 * dobieramy z zamkniętej listy rozgrywek, a nie z automatycznego wskaźnika popularności.
 *
 * Pierwsza wersja rankingowała mecze liczbą bukmacherów wyceniających spotkanie. Pomiar na
 * żywych danych pokazał, że to ślepa uliczka: wskaźnik nasyca się na czternastu i tyle samo
 * ma Premier League, co druga liga koreańska, a przy tym dzień to 200 meczów na dwudziestu
 * stronach, więc czołowe ligi wypadały poza pobierany zakres. Lista rozgrywek rozwiązuje
 * jedno i drugie, a przy okazji schodzi z sześćdziesięciu zapytań na trzy.
 */

/** Nazwa rynku dla klucza selekcji — z tego samego źródła, którego używa parser typów. */
const SELECTION_MARKET = Object.fromEntries(
	Object.entries(SELECTION_SHAPES).map(([key, ksztalt]) => [key, ksztalt.market])
);

/** Ile meczów wchodzi do kolejki. Tyle da się wytypować bez zmęczenia w jednym posiedzeniu. */
const ROUND_SIZE = 12;

/** Poniżej tylu meczów zestaw nie ma sensu — kolejka w danym tygodniu po prostu nie powstaje. */
const MIN_ROUND_SIZE = 4;

/**
 * Ile najwyżej meczów z jednej ligi.
 *
 * Bez tego limitu zestaw potrafi wyjść jako cztery spotkania jednej kolejki tej samej
 * ligi — sprawdzone na żywych danych. Kolejka ma być przeglądem weekendu, nie wycinkiem
 * jednych rozgrywek.
 */
const MAX_PER_LEAGUE = 2;

/**
 * Najkrótszy czas między ogłoszeniem zestawu a pierwszym gwizdkiem.
 *
 * Kolejka powstaje przy pierwszym wejściu w danym tygodniu, więc bez tego progu potrafi
 * domknąć się kilka godzin po ogłoszeniu — zestaw z meczem o północy zamykałby typowanie
 * jeszcze tego samego wieczoru. Dwanaście godzin daje każdemu jedno wejście do aplikacji.
 */
const MIN_LEAD_HOURS = 12;


/** Klucz ISO-tygodnia, `2026-W34` — ta sama definicja co w limitach tygodniowych. */
export function roundKeyFor(date = new Date()) {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const yearStart = new Date(d.getFullYear(), 0, 1);
	const week = Math.round(((d - yearStart) / 86400000 + 1) / 7) + 1;
	return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Okno meczów kolejki: od jutra do końca najbliższej niedzieli.
 *
 * Od jutra, a nie od dziś, bo zestaw ogłoszony na kilka godzin przed pierwszym gwizdkiem
 * nie daje nikomu czasu na przemyślenie typów.
 */
function roundWindow(now = new Date()) {
	const from = new Date(now);
	from.setDate(from.getDate() + 1);
	from.setHours(0, 0, 0, 0);

	// Jutrzejsza północ bywa tuż za rogiem — wtedy decyduje minimalne wyprzedzenie.
	const earliest = new Date(now.getTime() + MIN_LEAD_HOURS * 3600 * 1000);
	if (from < earliest) from.setTime(earliest.getTime());

	const to = new Date(from);
	// Dni do najbliższej niedzieli włącznie (niedziela = 0).
	const daysToSunday = (7 - to.getDay()) % 7;
	to.setDate(to.getDate() + daysToSunday);
	to.setHours(23, 59, 59, 999);

	// Zestaw z jednego dnia byłby ubogi — gwarantujemy co najmniej trzy dni okna.
	const minimum = new Date(from);
	minimum.setDate(minimum.getDate() + 2);
	if (to < minimum) to.setTime(minimum.getTime());

	return { from, to };
}

function datesBetween(from, to) {
	// Dni w czasie polskim — terminarz dostawcy dzieli doby tak samo (patrz `fixturesByDate`).
	return localDatesBetween(from, to);
}

/**
 * Tworzy kolejkę na bieżący tydzień, jeśli jeszcze nie istnieje.
 *
 * @returns {Promise<object|null>} dokument kolejki albo `null`, gdy brakło meczów
 */
export async function ensureCurrentRound() {
	const key = roundKeyFor();
	const existing = await Round.findOne({ key });
	if (existing) return existing;

	const { from, to } = roundWindow();
	const pool = [];

	for (const date of datesBetween(from, to)) {
		const rows = await fixturesByDate(date);
		pool.push(...rows.map(normalizeFixture).filter(Boolean));
	}

	const seen = new Set();
	const eligible = pool
		.filter((f) => {
			if (seen.has(f.id)) return false;
			seen.add(f.id);
			// Tylko mecze jeszcze nierozpoczęte i z potwierdzoną godziną: przełożony albo
			// odwołany wszedłby do zestawu jako typ nie do rozliczenia.
			if (f.status.code !== 'NS') return false;
			if (!LEAGUE_TIERS.has(f.league?.id)) return false;
			if (!f.teams.home.name || !f.teams.away.name) return false;

			const kickoff = Date.parse(f.date);
			return Number.isFinite(kickoff) && kickoff >= from.getTime() && kickoff <= to.getTime();
		})
		.sort(
			(a, b) =>
				LEAGUE_TIERS.get(a.league.id) - LEAGUE_TIERS.get(b.league.id) ||
				Date.parse(a.date) - Date.parse(b.date)
		);

	// Limit na ligę stosujemy po sortowaniu, żeby z każdej wziąć jej najwcześniejsze mecze.
	const perLeague = new Map();
	const chosen = [];
	for (const f of eligible) {
		const used = perLeague.get(f.league.id) || 0;
		if (used >= MAX_PER_LEAGUE) continue;
		perLeague.set(f.league.id, used + 1);
		chosen.push(f);
		if (chosen.length >= ROUND_SIZE) break;
	}

	if (chosen.length < MIN_ROUND_SIZE) return null;

	// Do wyświetlenia porządkujemy chronologicznie.
	chosen.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

	const round = await Round.create({
		key,
		fixtures: chosen.map((f) => ({
			fixtureId: String(f.id),
			homeName: f.teams.home.name,
			awayName: f.teams.away.name,
			leagueName: f.league?.name ?? null,
			country: f.league?.country ?? null,
			kickoff: new Date(f.date),
		})),
		// Zamknięcie na pierwszym gwizdku zestawu — patrz komentarz w models/Round.js.
		closesAt: new Date(Date.parse(chosen[0].date)),
		status: 'open',
	});

	// Model typuje w chwili powstania kolejki — tak samo przed zamknięciem jak wszyscy.
	await recordModelPicks(round, chosen);
	return round;
}

/**
 * Typy modelu do kolejki — model gra przeciwko użytkownikom na tym samym zestawie.
 *
 * DLACZEGO TO JEST UCZCIWE. Typ powstaje w chwili utworzenia kolejki, czyli PRZED jej
 * zamknięciem, z tych samych danych, które ma każdy. Model nie zna wyników i nie może
 * zmienić zdania. Tam, gdzie żadna selekcja nie przechodzi progu przewagi nad normą,
 * model po prostu nie typuje — jak użytkownik, który pominął mecz. Wymuszanie typu na
 * każdy mecz dałoby mu przewagę zgadywania, której nikt inny nie ma.
 *
 * DLACZEGO TYPY MODELU SĄ UKRYTE DO ZAMKNIĘCIA. Gdyby były widoczne, gra sprowadzałaby
 * się do przepisania ich. Trasa kolejki oddaje je dopiero po `closesAt`.
 *
 * NIE WCHODZĄ DO PUBLICZNEJ SKUTECZNOŚCI. Ten sam mecz i ta sama selekcja mogą już liczyć
 * się z raportu albo analizy; klucz unikalności typu rozróżnia rodzaje, więc bez wyłączenia
 * trafienie liczyłoby się podwójnie. Ranking kolejki liczy je osobno.
 *
 * Nigdy nie rzuca: kolejka bez typów modelu jest gorsza, ale kolejka, której nie ma,
 * jest gorsza jeszcze bardziej.
 */
async function recordModelPicks(round, fixtures) {
	try {
		const hints = await modelHintsFor(fixtures);
		if (!hints.size) return 0;

		const picks = [];
		for (const f of fixtures) {
			const hint = hints.get(String(f.id));
			if (!hint) continue;
			picks.push({
				fixtureId: String(f.id),
				market: SELECTION_MARKET[hint.key],
				selection: hint.selection,
				probability: hint.probability,
				baseRate: hint.base,
			});
		}

		return recordPicks({
			picks,
			kind: 'round',
			source: 'round',
			sourceId: round._id,
			userId: null,
			fixtureResolver: (pick) => {
				const f = fixtures.find((x) => String(x.id) === pick.fixtureId);
				return {
					fixtureId: pick.fixtureId,
					homeName: f?.teams?.home?.name ?? null,
					awayName: f?.teams?.away?.name ?? null,
					leagueName: f?.league?.name ?? null,
					kickoff: f?.date ?? null,
				};
			},
			context: (pick) => {
				const f = fixtures.find((x) => String(x.id) === pick.fixtureId);
				return {
					roundKey: round.key,
					excludeFromStats: true,
					numericModelVersion: MODEL_VERSION,
					leagueId: f?.league?.id ?? null,
					leagueTier: LEAGUE_TIERS.get(f?.league?.id) ?? null,
					sectionsPresent: ['form', 'prediction'],
				};
			},
		});
	} catch (error) {
		console.warn('[rounds] typy modelu do kolejki nie zapisały się:', error.message);
		return 0;
	}
}

/** Typy modelu w kolejce — do pokazania po zamknięciu i do wiersza w rankingu. */
export async function roundModelPicks(key) {
	return Pick.find({ roundKey: key, author: 'ai', source: 'round' })
		.select('fixtureId market selection probability baseRate lift status')
		.lean();
}

/**
 * Przestawia status kolejki: otwarta → zamknięta → rozliczona.
 *
 * Rozliczona oznacza, że ranking kolejki jest ostateczny. Nie wystarczy brak typów
 * czekających na wynik — kolejka bez ani jednego typu miałaby ich zero już w chwili
 * zamknięcia, w trakcie trwania meczów. Dlatego czekamy też, aż minie okno rozliczania
 * ostatniego spotkania z zestawu.
 */
export async function refreshRoundStatus(round) {
	if (!round || round.status === 'settled') return round;
	const now = new Date();

	if (round.status === 'open') {
		if (round.closesAt > now) return round;
		await Round.updateOne({ _id: round._id }, { $set: { status: 'closed' } });
		round.status = 'closed';
	}

	const lastKickoff = round.fixtures.reduce((max, f) => (f.kickoff > max ? f.kickoff : max), new Date(0));
	if (now.getTime() < lastKickoff.getTime() + SETTLE_AFTER_MS) return round;

	const pending = await Pick.countDocuments({ roundKey: round.key, author: 'user', status: 'pending' });
	if (pending) return round;

	await Round.updateOne({ _id: round._id }, { $set: { status: 'settled', settledAt: now } });
	round.status = 'settled';
	round.settledAt = now;
	return round;
}

/**
 * Ranking pojedynczej kolejki.
 *
 * Bez progu minimalnej liczby typów, w odróżnieniu od rankingu ogólnego: tutaj wszyscy
 * mają do dyspozycji ten sam zestaw, więc liczba trafień jest wprost porównywalna.
 */
export async function roundLeaderboard(key, limit = 50) {
	const [ludzie, modelu] = await Promise.all([leaderboardUsers(key, limit), roundModelPicks(key)]);

	/*
	 * Model jako zawodnik. Wiersz z tym samym licznikiem co u ludzi, bo liczy się na tych
	 * samych meczach; ma własne oznaczenie, żeby w interfejsie nie udawał użytkownika.
	 * Bez typów (np. żaden mecz nie przeszedł progu) model nie pojawia się w rankingu wcale.
	 */
	if (!modelu.length) return ludzie;
	const wiersz = {
		userId: null,
		isModel: true,
		username: 'Model',
		picked: modelu.length,
		settled: modelu.filter((p) => p.status === 'won' || p.status === 'lost').length,
		won: modelu.filter((p) => p.status === 'won').length,
	};
	return [...ludzie, wiersz]
		.sort((a, b) => b.won - a.won || a.settled - b.settled)
		.slice(0, limit);
}

async function leaderboardUsers(key, limit) {
	return Pick.aggregate([
		{ $match: { roundKey: key, author: 'user' } },
		{
			$group: {
				_id: '$userId',
				picked: { $sum: 1 },
				settled: { $sum: { $cond: [{ $in: ['$status', ['won', 'lost']] }, 1, 0] } },
				won: { $sum: { $cond: [{ $eq: ['$status', 'won'] }, 1, 0] } },
			},
		},
		// Liczba trafień, a nie procent: przy wspólnym zestawie ktoś z 6/12 typami jest
		// wyżej niż ktoś z 2/2, bo podjął więcej ryzyka na tych samych meczach.
		{ $sort: { won: -1, settled: 1 } },
		{ $limit: limit },
		{ $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
		{
			$project: {
				_id: 0,
				userId: '$_id',
				username: { $ifNull: [{ $first: '$user.username' }, '?'] },
				picked: 1,
				settled: 1,
				won: 1,
			},
		},
	]);
}
