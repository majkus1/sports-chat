import Pick from '@/models/Pick';
import ModelForecast from '@/models/ModelForecast';
import RegisterOdds from '@/models/RegisterOdds';
import {
	buildRow,
	leagueOptions,
	publicRow,
	publishedBeforeKickoff,
	REGISTER_KINDS,
	REGISTER_QUERY,
	registerView,
	summarizeRows,
} from '@/lib/trust/register';

/**
 * Rejestr typów — odczyt z bazy i pamięć podręczna. Rachunki są w `lib/trust/register.js`.
 *
 * DLACZEGO CAŁOŚĆ W PAMIĘCI. Rejestr to ok. 1400 typów (21.11.2026), przybywa ok. 25 dziennie —
 * za rok będzie ich ok. 10 tysięcy, czyli kilka megabajtów. Jedno odczytanie trzech kolekcji
 * co 5 minut i filtrowanie w pamięci jest prostsze i szybsze niż agregacja na każdy filtr
 * (okres × rynek × liga × strona), a sumy liczy ta sama funkcja, którą sprawdzają testy.
 *
 * 5 MINUT, bo nic w rejestrze nie zmienia się szybciej: kursy zdejmuje przebieg co 20 minut,
 * typy rozlicza zadanie po meczach. Każdy proces PM2 ma własną kopię — to kilka zapytań na
 * 5 minut na proces, bez Redisa, który i tak bywa niedostępny (`lib/redis.js`).
 */

export const CACHE_TTL_MS = 5 * 60 * 1000;

let pamiec = { at: 0, data: null, promise: null };

/** Do testów: następny odczyt idzie do bazy. */
export function resetRegisterCache() {
	pamiec = { at: 0, data: null, promise: null };
}

const POLA_TYPU =
	'fixtureId kind createdAt kickoff normalized probability status finalScore homeName awayName leagueName leagueId';

/**
 * Wiersze rejestru prosto z bazy (bez pamięci podręcznej).
 *
 * @param {{ now?: Date, match?: object }} [options] `match` zawęża zbiór — wyłącznie w testach,
 *   żeby nie czytać produkcyjnej historii
 */
export async function loadRegisterRows({ now = new Date(), match = {} } = {}) {
	const typy = await Pick.find({ ...REGISTER_QUERY, ...match }).select(POLA_TYPU).lean();

	/*
	 * TYP ZAPISANY PO STARCIE MECZU NIE WCHODZI. Typy są zapisywane raz (`$setOnInsert`
	 * w `lib/picks/service.js` — rynek, selekcja i szansa nie zmieniają się po zapisie), więc
	 * wystarczy godzina zapisu wobec godziny meczu. Liczba odrzuconych idzie na stronę: do
	 * 21.11.2026 — zero na 1342, ale ma to być sprawdzalne, nie obiecane.
	 */
	const przed = typy.filter(publishedBeforeKickoff);
	const poStarcie = typy.length - przed.length;

	const ids = [...new Set(przed.map((p) => p.fixtureId))];
	const [dziennik, zapas, naZywo] = await Promise.all([
		ModelForecast.find({ fixtureId: { $in: ids } }).select('fixtureId odds leagueCountry').lean(),
		RegisterOdds.find({ fixtureId: { $in: ids } }).lean(),
		// Typy na żywo powstają w trakcie meczu — w rejestrze ich nie ma, liczymy je jawnie obok.
		Pick.countDocuments({ author: 'ai', kind: 'live', ...match }),
	]);
	const zDziennika = new Map(dziennik.map((f) => [f.fixtureId, f]));
	const zZapasu = new Map(zapas.map((f) => [f.fixtureId, f]));

	const rows = przed.map((p) =>
		buildRow(p, { forecast: zDziennika.get(p.fixtureId) ?? null, extra: zZapasu.get(p.fixtureId) ?? null }, now)
	);

	return {
		rows,
		leagues: leagueOptions(rows),
		rules: { checked: typy.length, afterKickoff: poStarcie, live: naZywo, kinds: REGISTER_KINDS },
		builtAt: now,
	};
}

/**
 * Wiersze z pamięci podręcznej; równoległe żądania czekają na jedno odczytanie.
 *
 * Po 5 minutach oddajemy jeszcze starą wersję i odświeżamy w tle. Odczyt trzech kolekcji trwa
 * kilka sekund (z komputera deweloperskiego ok. 4,7 s), więc bez tego co piąta minuta ktoś
 * czekałby na stronę. Czeka tylko pierwsze żądanie po starcie procesu.
 */
export async function cachedRegister({ now = new Date() } = {}) {
	const swieze = pamiec.data && now.getTime() - pamiec.at < CACHE_TTL_MS;
	if (swieze) return pamiec.data;
	if (!pamiec.promise) {
		pamiec.promise = loadRegisterRows({ now })
			.then((data) => {
				pamiec = { at: now.getTime(), data, promise: null };
				return data;
			})
			.catch((error) => {
				pamiec.promise = null;
				throw error;
			});
		// Odświeżenie w tle nie może wywrócić procesu nieobsłużonym odrzuceniem.
		if (pamiec.data) pamiec.promise.catch((error) => console.warn('[register] odświeżenie nie powiodło się:', error.message));
	}
	return pamiec.data || pamiec.promise;
}

/**
 * Odpowiedź trasy `/api/stats/register`. `started` w wierszach liczymy od nowa przy każdym
 * żądaniu — w pamięci leży wersja sprzed nawet 5 minut, a mecz mógł się w tym czasie zacząć.
 */
export async function registerResponse(filters, { now = new Date(), data = null } = {}) {
	const d = data || (await cachedRegister({ now }));
	const rows = d.rows.map((r) => (r.started || r.kickoff.getTime() > now.getTime() ? r : { ...r, started: true }));
	return {
		...registerView(rows, filters, now),
		leagues: d.leagues,
		rules: d.rules,
		builtAt: d.builtAt,
	};
}

/**
 * Skrót na stronę główną: całość i 30 dni, plus kilka ostatnich rozliczonych typów —
 * wygranych i przegranych po kolei, bez wybierania.
 */
export async function registerTeaser({ now = new Date(), data = null, limit = 5 } = {}) {
	const d = data || (await cachedRegister({ now }));
	const rows = d.rows.map((r) => (r.started || r.kickoff.getTime() > now.getTime() ? r : { ...r, started: true }));
	const od30 = now.getTime() - 30 * 86_400_000;
	const ostatnie = rows
		.filter((r) => r.started && (r.status === 'won' || r.status === 'lost'))
		.sort((a, b) => b.kickoff.getTime() - a.kickoff.getTime() || b.publishedAt.getTime() - a.publishedAt.getTime())
		.slice(0, limit)
		.map(publicRow);
	return {
		all: summarizeRows(rows),
		last30: summarizeRows(rows.filter((r) => r.kickoff.getTime() >= od30)),
		recent: ostatnie,
		rules: d.rules,
		builtAt: d.builtAt,
	};
}
