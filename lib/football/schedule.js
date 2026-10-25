import { teamRecentFixtures, teamNextFixtures } from '@/lib/football/endpoints';
import { EUROPE_CUPS, DOMESTIC_CUPS, NATIONAL_TOURNAMENTS, NATIONAL_OTHER, FRIENDLIES } from '@/lib/model/pools';
import { APP_TIMEZONE, localDate } from '@/lib/time';

/**
 * TERMINARZ DRUŻYN — poprzedni i następny mecz każdej drużyny względem analizowanego spotkania.
 *
 * PO CO. Model liczbowy (Dixon–Coles, `lib/model`) zna siły drużyn, ale nie kalendarz: nie wie,
 * że gość grał w czwartek w Lidze Europy, ani że gospodarz za trzy dni gra w Lidze Mistrzów.
 * Kibic wie to od razu i pyta, czemu analiza o tym milczy. Ten moduł wylicza te fakty raz,
 * w jednym miejscu, dla wszystkich, którzy AI pokazują konkretne mecze: analizy (przed meczem
 * i na żywo), raportów, sprawdzania wiadomości kuponów i typu dnia, kuponu live i asystenta.
 *
 * FAKTY, NIE DOMYSŁY. Wynik to daty, rozgrywki, rywale i liczba dni — nic o zmęczeniu ani
 * o składzie. Flagi (`europeMidweek`, `shortRest`, `rotationRisk`) mówią tylko, że terminarz
 * jest nietypowy; czy to cokolwiek zmienia, ocenia AI, a „ryzyko rotacji" zostaje ryzykiem.
 *
 * LICZBY MODELU BEZ ZMIAN — pomiar 25.10.2026 na dzienniku prognoz (`ModelForecast`, mecze ligowe
 * 18.09–24.10.2026, 1013 meczów; terminy pucharów z 2/3/848, sezony 2025 i 2026):
 *
 *   drużyna w meczu ligowym                     występy  model: wygrana / faktycznie   model: bez porażki / faktycznie
 *   puchar europejski ≤ 4 dni wcześniej            110        51,2% / 55,5%                 74,6% / 70,0%
 *   te same kluby bez pucharu ≤ 6 dni wcześniej    352        44,8% / 47,2%                 70,0% / 67,9%
 *   puchar europejski 2–4 dni później              118        53,1% / 62,7%                 76,5% / 79,7%
 *
 * (Występy drużyn, nie mecze: 110 występów po pucharach to 97 meczów.) Różnice mieszczą się
 * w przypadku (po pucharach: |z| ≈ 1), a kierunek nie jest spójny — po
 * pucharach drużyny wygrywały częściej, niż mówił model, i nieco częściej przegrywały. Dlatego
 * terminarz nie koryguje liczb: jest kontekstem dla AI i czytelnika. Próba wróci do pomiaru,
 * gdy dziennik obejmie całą fazę ligową pucharów (grudzień 2026).
 *
 * KOSZT. Ostatnie mecze (`teamRecentFixtures(team, 10)`) to ten sam klucz pamięci podręcznej co
 * sekcja `recentForm` pakietu meczu — zwykle bez nowego zapytania; najbliższe mecze
 * (`teamNextFixtures`) to jedno zapytanie na drużynę. Oba 6 godzin w Redisie i tyle samo w pamięci
 * procesu (gdy Redis nie odpowiada, dwa typy z tą samą drużyną i tak nie płacą dwa razy). Terminarz
 * liczymy wyłącznie dla meczów, które AI faktycznie analizuje — nigdy w pętli po wszystkich meczach
 * dnia (np. przy plakietkach listy).
 *
 * DNI = różnica dat w kalendarzu polskim: czwartek → niedziela to 3 dni przerwy.
 */

/** Tyle ostatnich meczów bierze `recentForm` w pakiecie meczu — ten sam klucz pamięci podręcznej. */
export const RECENT_COUNT = 10;
/**
 * Trzy, nie dwa: kupon 5-dniowy bierze mecze za kilka dni, a drużyna potrafi mieć przed nimi jeszcze
 * jeden mecz — przy dwóch następny mecz PO analizowanym bywałby poza odpowiedzią. Koszt ten sam.
 */
export const NEXT_COUNT = 3;
/** Puchar europejski najwyżej tyle dni przed meczem (wtorek → sobota) — „puchar w środku tygodnia". */
export const EUROPE_MIDWEEK_MAX_DAYS = 4;
/** Krótki odpoczynek: najwyżej tyle dni od poprzedniego meczu (czwartek → niedziela). */
export const SHORT_REST_MAX_DAYS = 3;
/** Ważny mecz najwyżej tyle dni po analizowanym (niedziela → czwartek) — ryzyko rotacji. */
export const ROTATION_MAX_DAYS = 4;
/** Okno do licznika „meczów w ostatnich dniach". */
export const WINDOW_DAYS = 14;

const DZIEN_MS = 86_400_000;
/** Mecz tej samej drużyny bliżej niż 12 godzin od analizowanego to on sam (inny identyfikator u dostawcy). */
const SAM_MECZ_MS = 12 * 3600_000;

/* ------------------------------------------------------------------ rodzaje rozgrywek */

export const KINDS = {
	europe: 'europe',
	continental: 'continental',
	domesticCup: 'domestic_cup',
	league: 'league',
	national: 'national',
	friendly: 'friendly',
};

const UEFA = new Set(EUROPE_CUPS);
/** Klubowe puchary innych federacji: Libertadores, Sudamericana, Liga Mistrzów CAF, Klubowe MŚ, CONCACAF, AFC. */
const KONTYNENTALNE = new Set([13, 11, 12, 15, 16, 17]);
const KRAJOWE = new Set(DOMESTIC_CUPS);
const REPREZENTACJE = new Set([...NATIONAL_TOURNAMENTS, ...NATIONAL_OTHER].filter((id) => id !== FRIENDLIES));
/** Towarzyskie reprezentacji (10) i klubów (667). */
const TOWARZYSKIE = new Set([FRIENDLIES, 667]);

// Nazwy — gdy identyfikatora nie ma na listach (dostawca dodaje rozgrywki; puchary krajowe są setki).
const WZOR_TOWARZYSKI = /friendl/i;
const WZOR_UEFA = /^UEFA (Champions League|Europa League|Europa Conference League|Conference League|Super Cup)$/i;
const WZOR_KONTYNENTALNY = /Libertadores|Sudamericana|CONCACAF Champions|AFC Champions|CAF Champions|CAF Confederation|Club World Cup|Leagues Cup|Recopa|AFC Cup/i;
const WZOR_REPREZENTACJA = /Nations League|World Cup|Euro Championship|Copa America|Africa Cup of Nations|Asian Cup|Gold Cup|Qualification/i;
const WZOR_PUCHAR = /\bcup\b|pokal|coppa|\bcopa\b|coupe|puchar|ta[çc]a|beker|kupa|\bcupa\b|super ?cup|supercopa|supercoppa|troph|shield|kubok/i;
/** Półfinał i finał pucharu krajowego — tylko te rundy są „ważnym meczem" (ćwierćfinał już nie). */
const WAZNA_RUNDA = /^(semi-?finals?|finals?)\b/i;

/**
 * Rodzaj rozgrywek po identyfikatorze ligi u dostawcy, a gdy go nie znamy — po nazwie.
 *
 * @param {{ id?: number, name?: string, country?: string }} league
 * @returns {'europe'|'continental'|'domestic_cup'|'league'|'national'|'friendly'}
 */
export function competitionKind(league) {
	const id = Number(league?.id);
	const name = String(league?.name || '');
	if (TOWARZYSKIE.has(id) || WZOR_TOWARZYSKI.test(name)) return KINDS.friendly;
	if (UEFA.has(id) || WZOR_UEFA.test(name)) return KINDS.europe;
	if (KONTYNENTALNE.has(id) || WZOR_KONTYNENTALNY.test(name)) return KINDS.continental;
	// Rozgrywki reprezentacji dostawca zapisuje z krajem „World" — bez tego warunku „Qualification"
	// łapałoby też eliminacje lig krajowych.
	if (REPREZENTACJE.has(id) || (league?.country === 'World' && WZOR_REPREZENTACJA.test(name))) return KINDS.national;
	if (KRAJOWE.has(id) || WZOR_PUCHAR.test(name)) return KINDS.domesticCup;
	return KINDS.league;
}

/** Puchary klubowe ponad ligą krajową — europejskie i innych federacji. */
const PUCHARY_KLUBOWE = new Set([KINDS.europe, KINDS.continental]);

/**
 * Waga meczu dla trenera: 0 towarzyski, 1 puchar krajowy (wczesne rundy), 2 liga, 3 puchar
 * europejski/kontynentalny, półfinał i finał pucharu, mecz reprezentacji o punkty. Ryzyko rotacji
 * jest wtedy, gdy NASTĘPNY mecz ma wagę 3, a analizowany niższą — po meczu w Lidze Mistrzów nikt
 * nie oszczędza liderów na następny mecz Ligi Mistrzów.
 */
function waga(kind, round) {
	if (kind === KINDS.friendly) return 0;
	if (kind === KINDS.domesticCup) return WAZNA_RUNDA.test(String(round || '')) ? 3 : 1;
	if (kind === KINDS.league) return 2;
	return 3;
}

/* ------------------------------------------------------------------ czysty rachunek */

const ZAKONCZONE = new Set(['FT', 'AET', 'PEN']);
/** Mecze, które się nie odbyły albo nie wiadomo, kiedy się odbędą — terminarz ich nie liczy. */
const NIEODBYTE = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP', 'INT']);

/** Moment meczu z napisu ISO albo z `Date` (kupon live trzyma godzinę jako `Date`). */
const czas = (x) => (x instanceof Date ? x.getTime() : Date.parse(x));
const dzienKalendarza = (t) => Date.parse(`${localDate(new Date(t))}T00:00:00Z`);
/** Ile dni w kalendarzu polskim dzieli dwa momenty (czwartek 21:00 → niedziela 15:00 = 3). */
const dniMiedzy = (a, b) => Math.round((dzienKalendarza(b) - dzienKalendarza(a)) / DZIEN_MS);

/** Wiersz `fixtures` dostawcy z perspektywy drużyny; `null` — nie nadaje się do terminarza. */
function wpis(raw, teamId) {
	const t = Date.parse(raw?.fixture?.date);
	if (!Number.isFinite(t) || raw?.fixture?.id == null) return null;
	const status = raw.fixture?.status?.short ?? null;
	if (NIEODBYTE.has(status)) return null;
	const homeId = Number(raw.teams?.home?.id);
	const awayId = Number(raw.teams?.away?.id);
	if (homeId !== teamId && awayId !== teamId) return null;

	const isHome = homeId === teamId;
	const rywal = isHome ? raw.teams?.away : raw.teams?.home;
	const rozegrany = ZAKONCZONE.has(status);
	const gf = rozegrany ? ((isHome ? raw.goals?.home : raw.goals?.away) ?? null) : null;
	const ga = rozegrany ? ((isHome ? raw.goals?.away : raw.goals?.home) ?? null) : null;
	const wynik = gf === null || ga === null ? null : gf > ga ? 'W' : gf < ga ? 'L' : 'D';
	const league = raw.league || {};
	return {
		fixtureId: String(raw.fixture.id),
		t,
		date: raw.fixture.date,
		status,
		leagueId: Number.isFinite(Number(league.id)) ? Number(league.id) : null,
		competition: league.name ?? null,
		round: league.round ?? null,
		kind: competitionKind(league),
		isHome,
		opponent: rywal?.name ?? null,
		goalsFor: gf,
		goalsAgainst: ga,
		result: wynik,
		played: rozegrany,
	};
}

/**
 * Terminarz jednej drużyny względem analizowanego meczu (sam mecz pominięty — po identyfikatorze
 * i po czasie). Czyste: bez sieci, `now` tylko po to, żeby odróżnić mecz rozegrany od zaplanowanego.
 *
 * @param {{ teamId: number|string, recent?: Array|null, upcoming?: Array|null, match: object, now?: number }} args
 *   `recent` — surowe wiersze `teamRecentFixtures`, `upcoming` — `teamNextFixtures` (`null` = nie udało się
 *   pobrać); `match` — `{ fixtureId, kickoff, leagueId, leagueName, leagueCountry, round }`
 * @returns {null | {
 *   teamId: number,
 *   last: object|null, next: object|null, lastKnown: boolean, nextKnown: boolean,
 *   matches14: number|null, restDays: number|null, restHours: number|null,
 *   flags: { europeMidweek: boolean, shortRest: boolean, rotationRisk: boolean }, flagged: boolean,
 * }} `null` — brak danych o drużynie albo o godzinie meczu
 */
export function teamSchedule({ teamId, recent, upcoming, match, now = Date.now() }) {
	const id = Number(teamId);
	const k = czas(match?.kickoff);
	if (!id || !Number.isFinite(k)) return null;
	const sOstatnich = Array.isArray(recent);
	const sNastepnych = Array.isArray(upcoming);
	if (!sOstatnich && !sNastepnych) return null;

	// Najpierw najbliższe, potem ostatnie: ten sam mecz z listy ostatnich ma już wynik.
	const poId = new Map();
	for (const raw of [...(upcoming || []), ...(recent || [])]) {
		const w = wpis(raw, id);
		if (!w) continue;
		if (w.fixtureId === String(match?.fixtureId ?? '') || Math.abs(w.t - k) < SAM_MECZ_MS) continue;
		poId.set(w.fixtureId, w);
	}
	const lista = [...poId.values()].sort((a, b) => a.t - b.t);
	const przed = lista.filter((w) => w.t < k);
	const po = lista.filter((w) => w.t > k);

	const opis = ({ t, ...w }) => ({ ...w, upcoming: t > now });
	const poprzedni = przed.at(-1) ?? null;
	const nastepny = po[0] ?? null;
	const last = poprzedni ? { ...opis(poprzedni), daysBefore: dniMiedzy(poprzedni.t, k) } : null;
	const next = nastepny ? { ...opis(nastepny), daysAfter: dniMiedzy(k, nastepny.t) } : null;

	const rodzajMeczu = competitionKind({ id: match?.leagueId, name: match?.leagueName, country: match?.leagueCountry });
	const europeMidweek = Boolean(
		last && PUCHARY_KLUBOWE.has(last.kind) && last.daysBefore <= EUROPE_MIDWEEK_MAX_DAYS && !PUCHARY_KLUBOWE.has(rodzajMeczu)
	);
	const shortRest = Boolean(last && last.daysBefore <= SHORT_REST_MAX_DAYS);
	const wagaNastepnego = next ? waga(next.kind, next.round) : 0;
	const rotationRisk = Boolean(
		next && next.daysAfter <= ROTATION_MAX_DAYS && wagaNastepnego === 3 && wagaNastepnego > waga(rodzajMeczu, match?.round)
	);

	return {
		teamId: id,
		last,
		next,
		// Czy „brak" znaczy brak meczu, czy brak danych: przy pełnej liście najbliższych, która kończy
		// się przed analizowanym meczem, następnego po nim po prostu nie widzimy.
		lastKnown: sOstatnich || Boolean(last),
		nextKnown: Boolean(next) || (sNastepnych && upcoming.length < NEXT_COUNT),
		matches14: sOstatnich ? przed.filter((w) => w.t >= k - WINDOW_DAYS * DZIEN_MS).length : null,
		restDays: last ? last.daysBefore : null,
		restHours: poprzedni ? Math.round((k - poprzedni.t) / 3600_000) : null,
		flags: { europeMidweek, shortRest, rotationRisk },
		flagged: europeMidweek || shortRest || rotationRisk,
	};
}

/**
 * Opis meczu w postaci, której potrzebuje terminarz — z meczu po `normalizeFixture`.
 */
export function matchFromFixture(fixture) {
	if (!fixture) return null;
	return {
		fixtureId: fixture.id != null ? String(fixture.id) : null,
		kickoff: fixture.date,
		leagueId: fixture.league?.id ?? null,
		leagueName: fixture.league?.name ?? null,
		leagueCountry: fixture.league?.country ?? null,
		round: fixture.league?.round ?? null,
		homeId: fixture.teams?.home?.id ?? null,
		homeName: fixture.teams?.home?.name ?? null,
		awayId: fixture.teams?.away?.id ?? null,
		awayName: fixture.teams?.away?.name ?? null,
	};
}

/**
 * Terminarz obu drużyn meczu. Czyste.
 *
 * @param {object} match `{ fixtureId, kickoff, leagueId, leagueName, round, homeId, awayId, … }`
 * @param {{ home?: { recent, upcoming }|null, away?: { recent, upcoming }|null }} lists
 * @returns {null | { home: object|null, away: object|null, flagged: boolean }}
 */
export function buildMatchSchedule(match, { home, away } = {}, { now = Date.now() } = {}) {
	if (!match) return null;
	const h = home && match.homeId ? teamSchedule({ teamId: match.homeId, ...home, match, now }) : null;
	const a = away && match.awayId ? teamSchedule({ teamId: match.awayId, ...away, match, now }) : null;
	if (!h && !a) return null;
	return { home: h, away: a, flagged: Boolean(h?.flagged || a?.flagged) };
}

/* ------------------------------------------------------------------ tekst */

/** Rozgrywki, które czytelnik zna pod polską nazwą — z formą „w …" do zdania. */
const NAZWY = {
	2: { pl: 'Liga Mistrzów', plW: 'Lidze Mistrzów', en: 'Champions League' },
	3: { pl: 'Liga Europy', plW: 'Lidze Europy', en: 'Europa League' },
	848: { pl: 'Liga Konferencji', plW: 'Lidze Konferencji', en: 'Conference League' },
	531: { pl: 'Superpuchar UEFA', plW: 'Superpucharze UEFA', en: 'UEFA Super Cup' },
	45: { pl: 'Puchar Anglii', plW: 'Pucharze Anglii', en: 'FA Cup' },
	48: { pl: 'Puchar Ligi Angielskiej', plW: 'Pucharze Ligi Angielskiej', en: 'League Cup' },
	81: { pl: 'Puchar Niemiec', plW: 'Pucharze Niemiec', en: 'DFB-Pokal' },
	137: { pl: 'Puchar Włoch', plW: 'Pucharze Włoch', en: 'Coppa Italia' },
	143: { pl: 'Puchar Króla', plW: 'Pucharze Króla', en: 'Copa del Rey' },
};

const RODZAJ = {
	pl: {
		europe: 'puchar europejski',
		continental: 'puchar kontynentalny',
		domestic_cup: 'puchar krajowy',
		league: 'liga',
		national: 'mecz reprezentacji',
		friendly: 'towarzyski',
	},
	en: {
		europe: 'European cup',
		continental: 'continental cup',
		domestic_cup: 'domestic cup',
		league: 'league',
		national: 'national team',
		friendly: 'friendly',
	},
};

const DZIEN_KROTKO = {
	pl: ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'],
	en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};
const W_DZIEN = ['w niedzielę', 'w poniedziałek', 'we wtorek', 'w środę', 'w czwartek', 'w piątek', 'w sobotę'];
const ON_DAY = ['on Sunday', 'on Monday', 'on Tuesday', 'on Wednesday', 'on Thursday', 'on Friday', 'on Saturday'];

const jezyk = (language) => (language === 'en' ? 'en' : 'pl');
const dzienTygodnia = (date) => new Date(`${localDate(new Date(date))}T12:00:00Z`).getUTCDay();
function dataKrotka(date, lang) {
	if (lang === 'en') {
		return new Intl.DateTimeFormat('en-GB', { timeZone: APP_TIMEZONE, day: 'numeric', month: 'short' }).format(new Date(date));
	}
	const [, m, d] = localDate(new Date(date)).split('-');
	return `${d}.${m}`;
}
const kiedy = (w, lang) => `${DZIEN_KROTKO[lang][dzienTygodnia(w.date)]} ${dataKrotka(w.date, lang)}`;

const dni = (n, lang) => (lang === 'en' ? (n === 1 ? '1 day' : `${n} days`) : n === 1 ? '1 dzień' : `${n} dni`);
function meczeOdmiana(n) {
	if (n === 1) return 'mecz';
	const j = n % 10;
	const s = n % 100;
	return j >= 2 && j <= 4 && (s < 12 || s > 14) ? 'mecze' : 'meczów';
}

/** Nazwa rozgrywek do faktów: polska, gdy ją znamy, inaczej od dostawcy. */
function nazwaRozgrywek(w, lang) {
	return NAZWY[w.leagueId]?.[lang] ?? w.competition ?? '?';
}

/** Runda pucharu krajowego, gdy to półfinał albo finał — w innych rundach nie ma czego nazywać. */
function rundaPl(w) {
	if (w.kind !== KINDS.domesticCup || !WAZNA_RUNDA.test(String(w.round || ''))) return null;
	return /^semi/i.test(w.round) ? 'półfinał' : 'finał';
}

/** „mecz w Lidze Konferencji", „mecz ligowy", „półfinał w Pucharze Niemiec", „mecz (Coppa Italia)". */
function meczPl(w) {
	const runda = rundaPl(w);
	const znana = NAZWY[w.leagueId]?.plW ?? (/^Puchar /.test(w.competition || '') ? w.competition.replace(/^Puchar /, 'Pucharze ') : null);
	if (znana) return `${runda || 'mecz'} w ${znana}`;
	if (w.kind === KINDS.league) return 'mecz ligowy';
	return `${runda || 'mecz'} (${w.competition ?? '?'})`;
}

/** „Conference League match", „league match", „DFB-Pokal semi-final". */
function meczEn(w) {
	if (w.kind === KINDS.league) return 'league match';
	const runda = rundaPl(w);
	return `${nazwaRozgrywek(w, 'en')} ${runda === 'półfinał' ? 'semi-final' : runda === 'finał' ? 'final' : 'match'}`;
}

function wynikTekst(w, lang) {
	if (!w.result) return null;
	const sep = lang === 'en' ? '-' : ':';
	const slowo = lang === 'en' ? { W: 'won', D: 'drew', L: 'lost' } : { W: 'wygrana', D: 'remis', L: 'porażka' };
	return `${slowo[w.result]} ${w.goalsFor}${sep}${w.goalsAgainst}`;
}

/** Sygnały drużyny jako lista krótkich fraz — w faktach dla AI. */
function sygnaly(ts, lang) {
	const out = [];
	const { last, next, flags } = ts;
	if (lang === 'en') {
		if (flags.europeMidweek) out.push(`${last.kind === KINDS.europe ? 'European' : 'continental'} cup match ${dni(last.daysBefore, lang)} before this one`);
		if (flags.shortRest) out.push(`short rest: ${dni(last.daysBefore, lang)} since the previous match`);
		if (flags.rotationRisk) out.push(`important match ${dni(next.daysAfter, lang)} after this one (${nazwaRozgrywek(next, lang)}) — risk of squad rotation`);
		return out;
	}
	if (flags.europeMidweek) out.push(`mecz w pucharach ${last.kind === KINDS.europe ? 'europejskich' : 'kontynentalnych'} ${dni(last.daysBefore, lang)} przed tym meczem`);
	if (flags.shortRest) out.push(`krótki odpoczynek: ${dni(last.daysBefore, lang)} od poprzedniego meczu`);
	if (flags.rotationRisk) out.push(`ważny mecz ${dni(next.daysAfter, lang)} po tym (${nazwaRozgrywek(next, lang)}) — ryzyko rotacji składu`);
	return out;
}

function opisMeczu(w, lang) {
	const gdzie = lang === 'en' ? (w.isHome ? 'home' : 'away') : w.isHome ? 'u siebie' : 'na wyjeździe';
	const z = lang === 'en' ? 'vs' : 'z';
	const wynik = wynikTekst(w, lang);
	const dopisek = wynik ? `, ${wynik}` : w.upcoming ? (lang === 'en' ? ', not played yet' : ', jeszcze do rozegrania') : '';
	return `${kiedy(w, lang)} — ${nazwaRozgrywek(w, lang)} (${RODZAJ[lang][w.kind]}), ${gdzie} ${z} ${w.opponent ?? '?'}${dopisek}`;
}

/** Wiersze faktów jednej drużyny (z wcięciem) — do bloku TERMINARZ. */
function wierszeDruzyny(ts, name, lang) {
	if (!ts) return [lang === 'en' ? `  ${name}: no schedule data` : `  ${name}: brak danych o terminarzu`];
	const czesci = [];
	if (lang === 'en') {
		czesci.push(
			ts.last
				? `previous match ${opisMeczu(ts.last, lang)} — ${dni(ts.last.daysBefore, lang)} before this one`
				: ts.lastKnown
					? 'previous match: none in the data'
					: 'previous match: no data'
		);
		czesci.push(
			ts.next
				? `next match ${opisMeczu(ts.next, lang)} — ${dni(ts.next.daysAfter, lang)} after this one`
				: ts.nextKnown
					? 'next match: none scheduled'
					: 'next match: no data'
		);
		if (ts.matches14 !== null) czesci.push(`${ts.matches14} matches in the ${WINDOW_DAYS} days before this one`);
	} else {
		czesci.push(
			ts.last
				? `poprzedni mecz ${opisMeczu(ts.last, lang)} — ${dni(ts.last.daysBefore, lang)} przerwy`
				: ts.lastKnown
					? 'poprzedni mecz: brak w danych'
					: 'poprzedni mecz: brak danych'
		);
		czesci.push(
			ts.next
				? `następny mecz ${opisMeczu(ts.next, lang)} — ${dni(ts.next.daysAfter, lang)} po tym meczu`
				: ts.nextKnown
					? 'następny mecz: brak w terminarzu'
					: 'następny mecz: brak danych'
		);
		if (ts.matches14 !== null) czesci.push(`w ${WINDOW_DAYS} dniach przed tym meczem ${ts.matches14} ${meczeOdmiana(ts.matches14)}`);
	}
	const s = sygnaly(ts, lang);
	const linia = lang === 'en' ? (s.length ? `SIGNALS: ${s.join('; ')}` : 'no fatigue or rotation signals') : s.length ? `SYGNAŁY: ${s.join('; ')}` : 'bez sygnałów zmęczenia i rotacji';
	return [`  ${name}: ${czesci.join('; ')}.`, `    ${linia}`];
}

/**
 * Blok faktów „TERMINARZ" dla promptu — obie drużyny, z sygnałami. `null`, gdy nic nie wiemy.
 *
 * @param {object|null} schedule wynik `buildMatchSchedule`
 * @param {{ homeName?: string, awayName?: string, language?: 'pl'|'en', header?: boolean }} [options]
 * @returns {string|null}
 */
export function formatScheduleFacts(schedule, { homeName = '?', awayName = '?', language = 'pl', header = true } = {}) {
	if (!schedule || (!schedule.home && !schedule.away)) return null;
	const lang = jezyk(language);
	const naglowek =
		lang === 'en'
			? 'SCHEDULE — PREVIOUS AND NEXT MATCH OF BOTH TEAMS (this match excluded; days counted on the calendar)'
			: 'TERMINARZ — POPRZEDNI I NASTĘPNY MECZ OBU DRUŻYN (ten mecz pominięty; dni liczone w kalendarzu)';
	return [...(header ? [naglowek] : []), ...wierszeDruzyny(schedule.home, homeName, lang), ...wierszeDruzyny(schedule.away, awayName, lang)].join(
		'\n'
	);
}

/** Jedna drużyna w jednej linii — do promptów z wieloma meczami (raporty, kupon live). */
function linijkaDruzyny(ts, name, lang) {
	if (!ts) return `${name}: ${lang === 'en' ? 'no data' : 'brak danych'}`;
	const czesci = [];
	if (ts.last) {
		czesci.push(
			lang === 'en'
				? `previous ${kiedy(ts.last, lang)} ${nazwaRozgrywek(ts.last, lang)} (${RODZAJ[lang][ts.last.kind]}), ${dni(ts.last.daysBefore, lang)} before`
				: `poprzedni ${kiedy(ts.last, lang)} ${nazwaRozgrywek(ts.last, lang)} (${RODZAJ[lang][ts.last.kind]}), ${dni(ts.last.daysBefore, lang)} przerwy`
		);
	}
	if (ts.next) {
		czesci.push(
			lang === 'en'
				? `next ${kiedy(ts.next, lang)} ${nazwaRozgrywek(ts.next, lang)} (${RODZAJ[lang][ts.next.kind]}), ${dni(ts.next.daysAfter, lang)} after`
				: `następny ${kiedy(ts.next, lang)} ${nazwaRozgrywek(ts.next, lang)} (${RODZAJ[lang][ts.next.kind]}), ${dni(ts.next.daysAfter, lang)} po`
		);
	}
	const s = sygnaly(ts, lang);
	const sygnal = s.length ? ` [${lang === 'en' ? 'SIGNAL' : 'SYGNAŁ'}: ${s.join('; ')}]` : '';
	return `${name}: ${czesci.join(', ') || (lang === 'en' ? 'no data' : 'brak danych')}${sygnal}`;
}

/**
 * Terminarz obu drużyn w jednej linii (raporty, kupon live). `null`, gdy nic nie wiemy.
 */
export function formatScheduleLine(schedule, { homeName = '?', awayName = '?', language = 'pl' } = {}) {
	if (!schedule || (!schedule.home && !schedule.away)) return null;
	const lang = jezyk(language);
	return `${linijkaDruzyny(schedule.home, homeName, lang)}; ${linijkaDruzyny(schedule.away, awayName, lang)}`;
}

/**
 * Krótka notka dla czytelnika o jednej drużynie — TYLKO gdy jest flaga, inaczej `null`.
 * Bez czasowników z rodzajem („grała/grał"): nazwa drużyny nie mówi, jaki ma rodzaj.
 *
 *   „Legia: w czwartek mecz w Lidze Konferencji (3 dni przerwy)"
 *   „Bayern: za 3 dni (wt.) mecz w Lidze Mistrzów — ryzyko rotacji składu"
 */
export function teamScheduleNote(ts, teamName, language = 'pl') {
	if (!ts?.flagged) return null;
	const lang = jezyk(language);
	const czesci = [];
	const { last, next, flags } = ts;
	if (flags.europeMidweek || flags.shortRest) {
		czesci.push(
			lang === 'en'
				? `${meczEn(last)} ${ON_DAY[dzienTygodnia(last.date)]} (${last.daysBefore === 1 ? "1 day's" : `${last.daysBefore} days'`} rest)`
				: `${W_DZIEN[dzienTygodnia(last.date)]} ${meczPl(last)} (${dni(last.daysBefore, lang)} przerwy)`
		);
	}
	if (flags.rotationRisk) {
		czesci.push(
			lang === 'en'
				? `${meczEn(next)} in ${dni(next.daysAfter, lang)} (${DZIEN_KROTKO.en[dzienTygodnia(next.date)]}) — rotation risk`
				: `za ${dni(next.daysAfter, lang)} (${DZIEN_KROTKO.pl[dzienTygodnia(next.date)]}) ${meczPl(next)} — ryzyko rotacji składu`
		);
	}
	return `${teamName}: ${czesci.join('; ')}`;
}

/** Notki obu drużyn (tylko z flagą) — lista, pusta, gdy terminarz jest zwyczajny. */
export function scheduleNotes(schedule, { homeName = '?', awayName = '?' } = {}, language = 'pl') {
	if (!schedule) return [];
	return [teamScheduleNote(schedule.home, homeName, language), teamScheduleNote(schedule.away, awayName, language)].filter(Boolean);
}

/**
 * Notka do zapisu przy typie (kupon) — w obu językach naraz, bo karta kuponu renderuje się
 * w języku czytelnika, a kupon zapisujemy raz. `null`, gdy żadna drużyna nie ma flagi.
 *
 * @returns {null | { pl: string, en: string }}
 */
export function scheduleNoteBoth(schedule, names = {}) {
	const pl = scheduleNotes(schedule, names, 'pl');
	if (!pl.length) return null;
	return { pl: pl.join(' · '), en: scheduleNotes(schedule, names, 'en').join(' · ') };
}

/* ------------------------------------------------------------------ pobieranie */

const PAMIEC_MS = 6 * 3600_000;
const PAMIEC_MAX = 3000;
/** teamId → { at, value: { recent, upcoming } } — tylko komplet (obie listy), żeby błąd nie utknął na 6 godzin. */
const pamiec = new Map();
const wToku = new Map();

/** Zapamiętuje listy drużyny pobrane gdzie indziej (pakiet meczu) — kolejne miejsca nie pytają drugi raz. */
export function rememberTeamFixtures(teamId, { recent, upcoming } = {}, now = Date.now()) {
	const id = Number(teamId);
	if (!id || !Array.isArray(recent) || !Array.isArray(upcoming)) return;
	pamiec.delete(id);
	pamiec.set(id, { at: now, value: { recent, upcoming } });
	if (pamiec.size > PAMIEC_MAX) pamiec.delete(pamiec.keys().next().value);
}

/** Listy drużyny z pamięci procesu albo `null` — bez żadnego zapytania. */
export function peekTeamFixtures(teamId, now = Date.now()) {
	const zapis = pamiec.get(Number(teamId));
	return zapis && now - zapis.at < PAMIEC_MS ? zapis.value : null;
}

/** Czyści pamięć procesu — do testów. */
export function clearScheduleMemory() {
	pamiec.clear();
	wToku.clear();
}

/**
 * Ostatnie i najbliższe mecze drużyny: z pamięci procesu, inaczej przez pamięć podręczną dostawcy
 * (6 h). Błąd jednej listy nie przekreśla drugiej — wraca `null` w jej miejscu.
 *
 * @param {number|string} teamId
 * @param {{ recent?: Array }} [options] `recent` — ostatnie mecze, gdy wywołujący już je ma
 * @returns {Promise<null | { recent: Array|null, upcoming: Array|null }>}
 */
export async function loadTeamFixtures(teamId, { recent } = {}) {
	const id = Number(teamId);
	if (!id) return null;
	const zapis = peekTeamFixtures(id);
	if (zapis) return zapis;
	if (wToku.has(id)) return wToku.get(id);

	const praca = (async () => {
		const [r, u] = await Promise.allSettled([
			Array.isArray(recent) ? recent : teamRecentFixtures(id, RECENT_COUNT),
			teamNextFixtures(id, NEXT_COUNT),
		]);
		const value = {
			recent: r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : null,
			upcoming: u.status === 'fulfilled' && Array.isArray(u.value) ? u.value : null,
		};
		rememberTeamFixtures(id, value);
		return value;
	})().finally(() => wToku.delete(id));
	wToku.set(id, praca);
	return praca;
}

/**
 * Terminarz meczu z siecią. Nigdy nie rzuca: błąd albo brak drużyn to `null` (prompt idzie bez
 * sekcji, jak przy każdej innej brakującej sekcji). `timeoutMs` — dla miejsc, w których liczy się
 * czas odpowiedzi (kupon live): po nim `null`, a pobieranie kończy się w tle i zasila pamięć.
 *
 * @param {object} match `{ fixtureId, kickoff, leagueId, leagueName, round, homeId, awayId }`
 * @param {{ now?: number, load?: Function, timeoutMs?: number }} [options]
 */
export async function loadMatchSchedule(match, { now = Date.now(), load = loadTeamFixtures, timeoutMs = null } = {}) {
	if (!match || (!match.homeId && !match.awayId) || !Number.isFinite(czas(match.kickoff))) return null;
	const praca = (async () => {
		const [home, away] = await Promise.all([
			match.homeId ? Promise.resolve(load(match.homeId)).catch(() => null) : null,
			match.awayId ? Promise.resolve(load(match.awayId)).catch(() => null) : null,
		]);
		return buildMatchSchedule(match, { home, away }, { now });
	})().catch(() => null);
	if (!timeoutMs) return praca;
	let timer;
	return Promise.race([praca, new Promise((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)))]).finally(() =>
		clearTimeout(timer)
	);
}

/** Terminarz meczu wyłącznie z pamięci procesu (obie drużyny) — zero zapytań; `null`, gdy nie ma. */
export function peekMatchSchedule(match, { now = Date.now() } = {}) {
	if (!match?.homeId || !match?.awayId) return null;
	const home = peekTeamFixtures(match.homeId);
	const away = peekTeamFixtures(match.awayId);
	if (!home || !away) return null;
	return buildMatchSchedule(match, { home, away }, { now });
}

/**
 * Terminarz dla listy meczów (kandydaci raportu, nogi kuponu) — po kilka naraz. Dokleja wynik do
 * każdej pozycji pod `key`; mecze bez drużyn albo bez danych dostają `null`.
 *
 * @param {Array<object>} items
 * @param {{ toMatch: (item: object) => object, key?: string, concurrency?: number, scheduleFor?: Function }} options
 */
export async function attachSchedules(items, { toMatch, key = 'schedule', concurrency = 4, scheduleFor = loadMatchSchedule } = {}) {
	const lista = items || [];
	for (let i = 0; i < lista.length; i += concurrency) {
		await Promise.all(
			lista.slice(i, i + concurrency).map(async (item) => {
				try {
					item[key] = (await scheduleFor(toMatch(item))) ?? null;
				} catch {
					item[key] = null;
				}
			})
		);
	}
	return lista;
}

/**
 * Terminarz do pakietu meczu (`lib/football/bundle.js`) z list, które pakiet już pobrał — razem
 * z notkami dla strony meczu w obu językach. Zapamiętuje listy, żeby asystent i kupony nie pytały
 * o te same drużyny drugi raz.
 */
export function scheduleForBundle(fixture, { recentHome, recentAway, nextHome, nextAway } = {}, { now = Date.now() } = {}) {
	const match = matchFromFixture(fixture);
	if (!match) return null;
	rememberTeamFixtures(match.homeId, { recent: recentHome, upcoming: nextHome });
	rememberTeamFixtures(match.awayId, { recent: recentAway, upcoming: nextAway });
	const lista = (recent, upcoming) => (Array.isArray(recent) || Array.isArray(upcoming) ? { recent, upcoming } : null);
	const schedule = buildMatchSchedule(
		match,
		{ home: lista(recentHome, nextHome), away: lista(recentAway, nextAway) },
		{ now }
	);
	if (!schedule) return null;
	const names = { homeName: match.homeName ?? '?', awayName: match.awayName ?? '?' };
	return { ...schedule, notes: { pl: scheduleNotes(schedule, names, 'pl'), en: scheduleNotes(schedule, names, 'en') } };
}
