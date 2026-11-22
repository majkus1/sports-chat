import { PL_TAX } from '@/lib/model/oddsShadow';
import { wilsonInterval } from '@/lib/picks/metrics';
import {
	DEFAULT_LEAGUE,
	DEFAULT_MARKET,
	DEFAULT_PERIOD,
	MIN_CLV_SAMPLE,
	REGISTER_MARKETS,
	REGISTER_PAGE_SIZE,
	REGISTER_PERIODS,
} from '@/lib/trust/params';

export { DEFAULT_LEAGUE, DEFAULT_MARKET, DEFAULT_PERIOD, MIN_CLV_SAMPLE, REGISTER_MARKETS, REGISTER_PAGE_SIZE, REGISTER_PERIODS };

/**
 * REJESTR TYPÓW — część czysta (bez bazy i sieci): kto wchodzi, jaki kurs, jakie CLV, jakie sumy.
 *
 * PO CO. Procent trafień da się „podkręcić" na sto sposobów: dopisać typ po golu, zmienić
 * selekcję, wybrać do statystyki tylko udane dni, wystawiać same pewniaki po 1,10. Rejestr
 * ma pokazać rzeczy, których po fakcie nie da się poprawić: godzinę zapisu typu (przed meczem),
 * kurs, jaki rynek dawał po publikacji, kurs tuż przed gwizdkiem i wynik. Przegrane stoją
 * w tej samej tabeli i tym samym krojem co wygrane.
 *
 * CLV — NAJLEPSZY DOWÓD, JAKI MAMY. Kurs zamknięcia (10–30 minut przed meczem) to najlepiej
 * poinformowana cena: rynek zna już składy, kontuzje i pieniądze dużych graczy. Jeśli po naszym
 * typie kurs regularnie SPADA, rynek dochodzi do naszego zdania — to przewaga, której nie da
 * się wylosować. Trafienia potrzebują tysięcy zakładów, żeby odróżnić umiejętność od szczęścia;
 * CLV — kilkuset. Pomiar z 21.11.2026 (1038 typów z kursem z rana i zamknięcia): średnie CLV
 * +0,26%, rynek poszedł za nami w 40% typów, bez zmiany w 33%. Czyli tyle co nic — i tak to
 * pokazujemy, razem z log loss modelu gorszym od rynku (0,971 wobec 0,946).
 *
 * KURS Z RANA, ALE NIE SPRZED PUBLIKACJI. Bazowy kurs to pierwsze zdjęcie kursów zrobione PO
 * zapisaniu typu i PRZED meczem — zwykle poranne (9:00 w dniu meczu, `lib/model/oddsShadowJob`).
 * Typ zapisany po porannym zdjęciu (analiza otwarta o 15:00) liczy się od zdjęcia przy publikacji
 * (`lib/trust/oddsJob.js`). Inaczej CLV nagradzałby nas za ruch rynku, który nastąpił, zanim
 * ktokolwiek mógł typ zobaczyć — a to właśnie byłoby podkręcanie. Takich typów było 97 na 1135
 * i miały CLV +0,77% wobec +0,26% reszty: różnica, której nie wolno nam sobie przypisać.
 */

/** Rodzaje typów AI w rejestrze. `live` powstaje w trakcie meczu, `round` to gra — oba poza. */
export const REGISTER_KINDS = ['daily', 'report', 'prematch', 'hint'];

/**
 * Zapytanie o typy rejestru: AI, przedmeczowe, wliczane do publicznej skuteczności — dokładnie
 * ten sam zbiór co liczba na stronie „Skuteczność" (bez `live`). `countsToStats: false` mają
 * duplikaty tej samej selekcji (liczy się pierwszy zapis) i typy na szczątkowych danych.
 * Pustki (`void`, nierozpoznany rynek albo mecz nierozegrany) nie mają wyniku ani CLV.
 */
export const REGISTER_QUERY = {
	author: 'ai',
	kind: { $in: REGISTER_KINDS },
	countsToStats: { $ne: false },
	status: { $in: ['won', 'lost', 'pending'] },
	kickoff: { $ne: null },
};


/**
 * Przewaga po CLV mniejsza niż to nie pokrywa marży bukmachera (zwykle 4–6% w tych rynkach)
 * i podatku — wtedy mówimy wprost, że to sygnał, nie zysk.
 */
export const MEANINGFUL_CLV = 0.05;

/** Typ z rejestru → klucz selekcji w zdjęciu kursów (`ModelForecast.odds`). `null` = rynek bez kursu u nas. */
export function oddsKey(normalized) {
	if (!normalized) return null;
	switch (normalized.type) {
		case 'matchWinner':
			return ['home', 'draw', 'away'].includes(normalized.value) ? normalized.value : null;
		case 'doubleChance':
			return normalized.value === '1X' ? 'dc1X' : normalized.value === 'X2' ? 'dcX2' : null;
		case 'teamGoals':
			// Zdjęcie ma tylko „drużyna strzeli" (powyżej 0,5); inne linie nie mają kursu.
			return normalized.dir === 'over' && normalized.line === 0.5 && ['home', 'away'].includes(normalized.side)
				? `${normalized.side}Scores`
				: null;
		case 'totalGoals':
			return normalized.dir === 'over' && normalized.line === 2.5 ? 'over25' : null;
		default:
			return null;
	}
}

const czas = (v) => {
	if (v == null) return NaN;
	const t = v instanceof Date ? v.getTime() : Date.parse(v);
	return Number.isFinite(t) ? t : NaN;
};
const kursOk = (v) => Number.isFinite(v) && v > 1;

/**
 * Czy typ zapisano przed pierwszym gwizdkiem. Typ bez godziny meczu albo bez godziny zapisu
 * nie wchodzi — nie da się udowodnić, że był pierwszy.
 */
export function publishedBeforeKickoff({ createdAt, kickoff }) {
	const zapis = czas(createdAt);
	const mecz = czas(kickoff);
	return Number.isFinite(zapis) && Number.isFinite(mecz) && zapis < mecz;
}

/**
 * Kurs bazowy typu: najwcześniejsze zdjęcie zrobione po publikacji i przed meczem, z kursem
 * dla tej selekcji. Najwcześniejsze, nie najlepsze — wybór najkorzystniejszego z kilku zdjęć
 * byłby dokładnie tym podkręcaniem, przed którym rejestr ma chronić.
 *
 * @param {{ publishedAt, kickoff, selection: string|null, snapshots: Array<{ at, [key: string]: any }|null> }} p
 * @returns {{ odds: number, at: Date }|null}
 */
export function referenceOdds({ publishedAt, kickoff, selection, snapshots }) {
	if (!selection) return null;
	const od = czas(publishedAt);
	const doMeczu = czas(kickoff);
	if (!Number.isFinite(od) || !Number.isFinite(doMeczu)) return null;
	const kandydaci = (snapshots || [])
		.filter((s) => s && kursOk(s[selection]))
		.map((s) => ({ odds: s[selection], at: czas(s.at) }))
		.filter((s) => Number.isFinite(s.at) && s.at >= od && s.at < doMeczu)
		.sort((a, b) => a.at - b.at);
	return kandydaci.length ? { odds: kandydaci[0].odds, at: new Date(kandydaci[0].at) } : null;
}

/** Pierwsze zdjęcie zamknięcia z kursem dla selekcji (dziennik prognoz, potem zapas rejestru). */
export function closingOdds({ kickoff, selection, snapshots }) {
	if (!selection) return null;
	const doMeczu = czas(kickoff);
	for (const s of snapshots || []) {
		if (!s || !kursOk(s[selection])) continue;
		const at = czas(s.at);
		if (Number.isFinite(at) && (!Number.isFinite(doMeczu) || at <= doMeczu)) return { odds: s[selection], at: new Date(at) };
	}
	return null;
}

/**
 * CLV w ułamku: kurs bazowy / kurs zamknięcia − 1. Dodatnie = rynek po publikacji obniżył kurs,
 * czyli uznał zdarzenie za bardziej prawdopodobne, tak jak my. `null`, gdy brak któregoś kursu.
 */
export function clvOf(reference, close) {
	if (!kursOk(reference) || !kursOk(close)) return null;
	return reference / close - 1;
}

/**
 * Wiersz rejestru z typu i zdjęć kursów meczu.
 *
 * @param {object} pick dokument `Pick` (lean)
 * @param {{ forecast?: object|null, extra?: object|null, country?: string|null }} odds
 *   `forecast` — `ModelForecast` meczu, `extra` — `RegisterOdds` meczu (zapas dla meczów spoza
 *   dziennika i zdjęcia przy publikacji)
 * @param {Date} now
 */
export function buildRow(pick, { forecast = null, extra = null } = {}, now = new Date()) {
	const kickoff = new Date(pick.kickoff);
	const publishedAt = new Date(pick.createdAt);
	const selection = oddsKey(pick.normalized);
	const open = [forecast?.odds?.open, extra?.open].filter(Boolean);
	const ref = referenceOdds({ publishedAt, kickoff, selection, snapshots: [...open, ...(extra?.after || [])] });
	const close = closingOdds({ kickoff, selection, snapshots: [forecast?.odds?.close, extra?.close] });
	// Zamknięcie musi być PÓŹNIEJ niż kurs bazowy — typ zapisany 5 minut przed meczem nie ma CLV.
	const closeUsable = ref && close && close.at.getTime() > ref.at.getTime() ? close : null;
	const clv = closeUsable ? clvOf(ref.odds, closeUsable.odds) : null;
	const started = kickoff.getTime() <= now.getTime();
	const openAts = new Set(open.map((s) => czas(s.at)));

	return {
		id: String(pick._id),
		fixtureId: String(pick.fixtureId),
		kind: pick.kind,
		homeName: pick.homeName ?? null,
		awayName: pick.awayName ?? null,
		leagueId: Number.isFinite(pick.leagueId) ? pick.leagueId : null,
		leagueName: pick.leagueName ?? null,
		country: forecast?.leagueCountry ?? null,
		kickoff,
		publishedAt,
		leadMinutes: Math.round((kickoff.getTime() - publishedAt.getTime()) / 60_000),
		market: pick.normalized?.type ?? null,
		normalized: pick.normalized ?? null,
		probability: Number.isFinite(pick.probability) ? pick.probability : null,
		status: pick.status,
		score:
			Number.isFinite(pick.finalScore?.home) && Number.isFinite(pick.finalScore?.away)
				? { home: pick.finalScore.home, away: pick.finalScore.away }
				: null,
		started,
		refOdds: ref?.odds ?? null,
		refAt: ref?.at ?? null,
		// `morning` — poranne zdjęcie dnia meczu; `publish` — zdjęcie zrobione po zapisaniu typu.
		refSource: ref ? (openAts.has(ref.at.getTime()) ? 'morning' : 'publish') : null,
		closeOdds: close?.odds ?? null,
		closeAt: close?.at ?? null,
		clv,
	};
}

/**
 * Wiersz do wysłania przeglądarce. Typ przed pierwszym gwizdkiem zostaje zamknięty: widać mecz
 * i godzinę zapisu (to jest dowód), ale nie selekcję ani kurs — plakietki i raporty są w planach
 * płatnych, a rejestr nie może być furtką do nich.
 */
export function publicRow(row) {
	const base = {
		id: row.id,
		fixtureId: row.fixtureId,
		kind: row.kind,
		homeName: row.homeName,
		awayName: row.awayName,
		leagueName: row.leagueName,
		country: row.country,
		kickoff: row.kickoff,
		publishedAt: row.publishedAt,
		leadMinutes: row.leadMinutes,
		started: row.started,
	};
	if (!row.started) return { ...base, locked: true };
	return {
		...base,
		locked: false,
		market: row.market,
		normalized: row.normalized,
		probability: row.probability,
		status: row.status,
		score: row.score,
		refOdds: row.refOdds,
		refAt: row.refAt,
		refSource: row.refSource,
		closeOdds: row.closeOdds,
		closeAt: row.closeAt,
		clv: row.clv === null ? null : Number(row.clv.toFixed(5)),
	};
}

const srednia = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const zaokr = (v, d = 4) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);

/**
 * Werdykt CLV dla laika — z przedziałem, nie z samej średniej.
 *
 *   too_few  za mało typów z CLV, żeby cokolwiek mówić
 *   behind   cały przedział poniżej zera: rynek regularnie idzie przeciw nam
 *   level    przedział obejmuje zero: nie da się odróżnić od braku przewagi
 *   small    przedział powyżej zera, ale średnia poniżej `MEANINGFUL_CLV` — sygnał, nie zysk
 *   ahead    przedział powyżej zera i średnia od `MEANINGFUL_CLV`
 */
export function clvVerdict({ n, mean, low, high }) {
	if (!n || n < MIN_CLV_SAMPLE || !Number.isFinite(mean)) return 'too_few';
	if (high < 0) return 'behind';
	if (low <= 0) return 'level';
	return mean < MEANINGFUL_CLV ? 'small' : 'ahead';
}

/**
 * Sumy rejestru. Liczą się tylko typy po pierwszym gwizdku — te przed meczem są zamknięte
 * i nie mają jeszcze ani CLV, ani wyniku.
 *
 * Trafienia: rozliczone (wygrane + przegrane). Zwrot: stała stawka 1 przy kursie bazowym, tylko
 * rozliczone z kursem; obok wariant po polskim podatku 12% od stawki. CLV: każdy typ z kursem
 * bazowym i zamknięcia — także jeszcze nierozliczony, bo CLV znamy już w chwili gwizdka.
 */
export function summarizeRows(rows) {
	const liczone = (rows || []).filter((r) => r.started);
	const rozliczone = liczone.filter((r) => r.status === 'won' || r.status === 'lost');
	const won = rozliczone.filter((r) => r.status === 'won').length;
	const zKursem = rozliczone.filter((r) => kursOk(r.refOdds));
	const zyski = zKursem.map((r) => (r.status === 'won' ? r.refOdds - 1 : -1));
	const zyskiPoPodatku = zKursem.map((r) => (r.status === 'won' ? r.refOdds * (1 - PL_TAX) - 1 : -1));
	const clvs = liczone.filter((r) => Number.isFinite(r.clv)).map((r) => r.clv);
	const mean = srednia(clvs);
	const sd =
		clvs.length > 1 ? Math.sqrt(clvs.reduce((s, x) => s + (x - mean) ** 2, 0) / (clvs.length - 1)) : null;
	const se = sd === null ? null : sd / Math.sqrt(clvs.length);
	const low = se === null ? null : mean - 1.96 * se;
	const high = se === null ? null : mean + 1.96 * se;

	return {
		total: liczone.length,
		settled: rozliczone.length,
		won,
		lost: rozliczone.length - won,
		pending: liczone.length - rozliczone.length,
		hitRate: rozliczone.length ? zaokr(won / rozliczone.length) : null,
		interval: wilsonInterval(won, rozliczone.length),
		withOdds: zKursem.length,
		avgOdds: zaokr(srednia(zKursem.map((r) => r.refOdds)), 3),
		roi: zaokr(srednia(zyski)),
		roiTaxed: zaokr(srednia(zyskiPoPodatku)),
		clv: {
			n: clvs.length,
			mean: zaokr(mean, 5),
			low: zaokr(low, 5),
			high: zaokr(high, 5),
			beat: clvs.length ? zaokr(clvs.filter((x) => x > 0).length / clvs.length) : null,
			same: clvs.length ? zaokr(clvs.filter((x) => x === 0).length / clvs.length) : null,
			worse: clvs.length ? zaokr(clvs.filter((x) => x < 0).length / clvs.length) : null,
			verdict: clvVerdict({ n: clvs.length, mean, low, high }),
		},
		// Ile typów po gwizdku ma CLV — brakujące to rynki bez kursu u nas albo luki w zdjęciach.
		coverage: liczone.length ? zaokr(clvs.length / liczone.length) : null,
	};
}

/** Granica okresu (data meczu od) albo `null` dla „całość". */
export function periodStart(period, now = new Date()) {
	if (period === 'all' || !REGISTER_PERIODS.includes(period)) return null;
	return new Date(now.getTime() - Number(period) * 86_400_000);
}

/** Filtr wierszy po okresie, rynku i lidze — każda oś opcjonalna. */
export function filterRows(rows, { period = 'all', market = 'all', league = 'all' } = {}, now = new Date()) {
	const od = periodStart(period, now);
	const liga = league === 'all' ? null : Number(league);
	return (rows || []).filter(
		(r) =>
			(!od || r.kickoff.getTime() >= od.getTime()) &&
			(market === 'all' || r.market === market) &&
			(liga === null || r.leagueId === liga)
	);
}

/** Skrót sum do tabel przekrojów (okresy, rynki, ligi). */
function skrot(rows) {
	const s = summarizeRows(rows);
	return {
		total: s.total,
		settled: s.settled,
		won: s.won,
		hitRate: s.hitRate,
		roi: s.roi,
		withOdds: s.withOdds,
		clvN: s.clv.n,
		clvMean: s.clv.mean,
		beat: s.clv.beat,
	};
}

/**
 * Cały widok rejestru dla jednego zestawu filtrów.
 *
 * @param {Array} rows wiersze z `buildRow`
 * @param {{ period, market, league, page }} filters
 */
export function registerView(rows, { period = DEFAULT_PERIOD, market = DEFAULT_MARKET, league = DEFAULT_LEAGUE, page = 1 } = {}, now = new Date()) {
	const wybrane = filterRows(rows, { period, market, league }, now);

	const okresy = REGISTER_PERIODS.map((p) => ({ key: p, ...skrot(filterRows(rows, { period: p, market, league }, now)) }));

	const poOkresieILidze = filterRows(rows, { period, league }, now);
	const rynki = REGISTER_MARKETS.filter((m) => m !== 'all')
		.map((m) => ({ key: m, ...skrot(poOkresieILidze.filter((r) => r.market === m)) }))
		.filter((r) => r.total > 0);

	const poOkresieIRynku = filterRows(rows, { period, market }, now);
	const wgLigi = new Map();
	for (const r of poOkresieIRynku) {
		if (r.leagueId === null) continue;
		if (!wgLigi.has(r.leagueId)) wgLigi.set(r.leagueId, []);
		wgLigi.get(r.leagueId).push(r);
	}
	const ligi = [...wgLigi.entries()]
		.map(([id, rs]) => ({ key: String(id), ...leagueLabel(rs), ...skrot(rs) }))
		.filter((r) => r.total > 0)
		.sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)))
		.slice(0, 12);

	// Najnowsze na górze: mecze jeszcze przed gwizdkiem (zamknięte), potem rozegrane.
	const posortowane = [...wybrane].sort(
		(a, b) => b.kickoff.getTime() - a.kickoff.getTime() || b.publishedAt.getTime() - a.publishedAt.getTime()
	);
	const pages = Math.max(1, Math.ceil(posortowane.length / REGISTER_PAGE_SIZE));
	const strona = Math.min(Math.max(1, Number(page) || 1), pages);

	return {
		filters: { period, market, league, page: strona },
		summary: summarizeRows(wybrane),
		upcoming: wybrane.filter((r) => !r.started).length,
		periods: okresy,
		byMarket: rynki,
		byLeague: ligi,
		items: posortowane.slice((strona - 1) * REGISTER_PAGE_SIZE, strona * REGISTER_PAGE_SIZE).map(publicRow),
		page: strona,
		pages,
		total: posortowane.length,
		pageSize: REGISTER_PAGE_SIZE,
	};
}

/**
 * Nazwa i kraj ligi z wierszy jednej ligi. Plakietki dostają nazwę od dostawcy („League One")
 * i kraj z dziennika, raporty — nazwę z krajem w jednym napisie („Major League Soccer, USA").
 * Bierzemy wersję z krajem z dziennika, gdy jakikolwiek wiersz ją ma — inaczej pierwszą.
 */
export function leagueLabel(rows) {
	const zKrajem = (rows || []).find((r) => r.country && r.leagueName);
	const r = zKrajem || (rows || []).find((x) => x.leagueName) || rows?.[0] || {};
	return { name: r.leagueName ?? null, country: r.country ?? null };
}

/** Lista lig do filtra — ze wszystkich wierszy, żeby nie znikała przy zmianie okresu. */
export function leagueOptions(rows) {
	const m = new Map();
	for (const r of rows || []) {
		if (r.leagueId === null) continue;
		if (!m.has(r.leagueId)) m.set(r.leagueId, []);
		m.get(r.leagueId).push(r);
	}
	return [...m.entries()]
		.map(([id, rs]) => ({ key: String(id), ...leagueLabel(rs), n: rs.length }))
		.sort((a, b) => b.n - a.n || String(a.name).localeCompare(String(b.name)));
}
