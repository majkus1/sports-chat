/**
 * Kursy zamknięcia do backtestu — z archiwów football-data.co.uk.
 *
 * PO CO RYNEK W BACKTEŚCIE. Rynek bukmacherski to najsilniejsza prognoza, jaka istnieje:
 * zbiera informacje od tysięcy ludzi z pieniędzmi na stole. Model porównywany wyłącznie
 * z częstościami i „zawsze gospodarz" wygrywa z liniami słabymi. Dopiero pomiar wobec
 * rynku mówi, ILE informacji modelowi brakuje i GDZIE jest systematycznie niedoszacowany —
 * np. czy przy dziurawej obronie rywala daje 85% tam, gdzie rynek widzi 95%.
 *
 * DLACZEGO NIE API-FOOTBALL. Dostawca trzyma kursy tylko w oknie wokół meczu; dwóch sezonów
 * wstecz nie ma skąd wziąć. football-data.co.uk publikuje darmowe archiwa CSV z kursami
 * zamknięcia (Pinnacle, Bet365, średnia rynku) dla czołowych lig europejskich od lat.
 *
 * TO JEST WYŁĄCZNIE NARZĘDZIE POMIARU. Nic stąd nie trafia do produkcji, promptów ani
 * interfejsu — patrz `lib/picks/policy.js` o granicy między sufitem a value bettingiem.
 *
 * Bez zależności: parser CSV, dopasowanie po dacie i nazwach drużyn i zdjęcie marży są
 * tutaj, bo żaden z nich nie jest potrzebny nigdzie indziej w aplikacji.
 */

/** Identyfikator ligi u API-Football → kod pliku na football-data.co.uk. */
export const FOOTBALL_DATA_CODES = new Map([
	[39, 'E0'], // Premier League
	[40, 'E1'], // Championship
	[140, 'SP1'], // La Liga
	[135, 'I1'], // Serie A
	[78, 'D1'], // Bundesliga
	[61, 'F1'], // Ligue 1
	[88, 'N1'], // Eredivisie
	[94, 'P1'], // Primeira Liga
	[203, 'T1'], // Süper Lig
	[144, 'B1'], // Jupiler Pro League
	[179, 'SC0'], // Premiership (Szkocja)
]);

/** Sezon 2024 (czyli 2024/25) → „2425" w ścieżce pliku. */
export function seasonCode(season) {
	const a = String(season).slice(-2);
	const b = String(Number(season) + 1).slice(-2);
	return `${a}${b}`;
}

export function footballDataUrl(leagueId, season) {
	const code = FOOTBALL_DATA_CODES.get(leagueId);
	return code ? `https://www.football-data.co.uk/mmz4281/${seasonCode(season)}/${code}.csv` : null;
}

/**
 * Minimalny parser CSV: nagłówek w pierwszym wierszu, pola w cudzysłowie dozwolone,
 * CRLF i znacznik BOM tolerowane. Pliki football-data mają puste kolumny na końcu wierszy.
 */
export function parseCsv(text) {
	const lines = String(text || '')
		.replace(/^﻿/, '')
		.split(/\r?\n/)
		.filter((l) => l.trim().length);
	if (!lines.length) return [];

	const splitLine = (line) => {
		const out = [];
		let cur = '';
		let inQuotes = false;
		for (let i = 0; i < line.length; i += 1) {
			const ch = line[i];
			if (ch === '"') {
				if (inQuotes && line[i + 1] === '"') {
					cur += '"';
					i += 1;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (ch === ',' && !inQuotes) {
				out.push(cur);
				cur = '';
			} else {
				cur += ch;
			}
		}
		out.push(cur);
		return out.map((v) => v.trim());
	};

	const header = splitLine(lines[0]);
	return lines.slice(1).map((line) => {
		const cells = splitLine(line);
		const row = {};
		header.forEach((h, i) => {
			row[h] = cells[i] ?? '';
		});
		return row;
	});
}

/** „17/08/2024" albo „17/08/24" → „2024-08-17". */
export function parseDate(value) {
	const m = String(value || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
	if (!m) return null;
	const dd = m[1].padStart(2, '0');
	const mm = m[2].padStart(2, '0');
	const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
	return `${yyyy}-${mm}-${dd}`;
}

const num = (v) => {
	const n = Number(String(v ?? '').replace(',', '.'));
	return Number.isFinite(n) && n > 1 ? n : null;
};

/**
 * Kursy zamknięcia 1X2 i 2.5 gola z jednego wiersza — w kolejności wiarygodności.
 *
 * Pinnacle zamknięcie (PSC*) to złoty standard: niska marża, rynek na chwilę przed
 * gwizdkiem. Dalej średnia rynku i Bet365; bez zamknięcia zostają kursy otwarcia.
 */
const KOLEJNOSC_1X2 = [
	['PSCH', 'PSCD', 'PSCA', 'pinnacle-close'],
	['AvgCH', 'AvgCD', 'AvgCA', 'avg-close'],
	['B365CH', 'B365CD', 'B365CA', 'b365-close'],
	['PSH', 'PSD', 'PSA', 'pinnacle-open'],
	['AvgH', 'AvgD', 'AvgA', 'avg-open'],
	['B365H', 'B365D', 'B365A', 'b365-open'],
	['BWH', 'BWD', 'BWA', 'bwin-open'],
];
const KOLEJNOSC_25 = [
	['PC>2.5', 'PC<2.5'],
	['AvgC>2.5', 'AvgC<2.5'],
	['B365C>2.5', 'B365C<2.5'],
	['P>2.5', 'P<2.5'],
	['Avg>2.5', 'Avg<2.5'],
	['B365>2.5', 'B365<2.5'],
];

export function closingOdds(row) {
	let trojka = null;
	for (const [h, d, a, source] of KOLEJNOSC_1X2) {
		const home = num(row[h]);
		const draw = num(row[d]);
		const away = num(row[a]);
		if (home && draw && away) {
			trojka = { home, draw, away, source };
			break;
		}
	}
	let over = null;
	for (const [o, u] of KOLEJNOSC_25) {
		const ov = num(row[o]);
		const un = num(row[u]);
		if (ov && un) {
			over = { over: ov, under: un };
			break;
		}
	}
	if (!trojka) return null;
	return { ...trojka, over25: over };
}

/** Kursy wykluczających się wyników → prawdopodobieństwa sumujące się do 1. */
export function demargin(odds) {
	if (!Array.isArray(odds) || !odds.length || !odds.every((o) => Number.isFinite(o) && o > 1)) return null;
	const raw = odds.map((o) => 1 / o);
	const suma = raw.reduce((a, b) => a + b, 0);
	return raw.map((r) => r / suma);
}

/** Prawdopodobieństwa rynkowe wiersza (ułamki), albo `null` bez kompletu 1X2. */
export function marketProbabilities(match) {
	const k = match?.odds;
	if (!k) return null;
	const [home, draw, away] = demargin([k.home, k.draw, k.away]);
	const o = k.over25 ? demargin([k.over25.over, k.over25.under]) : null;
	return { home, draw, away, over25: o ? o[0] : null, source: k.source };
}

/*
 * DOPASOWANIE NAZW DRUŻYN.
 *
 * Dwa źródła, dwie konwencje: „Man United" kontra „Manchester United", „Ath Madrid" kontra
 * „Atletico Madrid", „Nott'm Forest" kontra „Nottingham Forest". Ręczna mapa dla każdej
 * z kilkuset drużyn byłaby krucha, więc porównujemy TOKENY po normalizacji (bez znaków
 * diakrytycznych, bez przedrostków klubowych), z dopasowaniem po wspólnym początku słowa.
 * Ostatnią linią obrony jest data: w jednej lidze jednego dnia gra kilka par, więc nawet
 * luźne podobieństwo nazw wybiera właściwy wiersz. Kilka skrótów, których nie da się
 * odgadnąć („Spurs", „QPR", „Paris SG"), ma jawne aliasy.
 */
const PRZEDROSTKI = new Set([
	'fc', 'cf', 'sc', 'afc', 'ac', 'as', 'us', 'ss', 'ssc', 'rc', 'sv', 'vfb', 'vfl', 'tsg', 'fsv',
	'fk', 'sk', 'bk', 'if', 'ik', 'cd', 'ud', 'sd', 'rcd', 'kv', 'club', 'de', 'del', 'the', 'of',
	'calcio', 'spor', '1', '1899', '1860', '04', '05', '09', '1907', '1909', '1913', '1919', '1926',
]);
const ROZWINIECIA = { utd: 'united', st: 'saint', weds: 'wednesday', bor: 'borussia', munich: 'munchen' };
const ALIASY = {
	spurs: 'tottenham',
	qpr: 'queens park rangers',
	'paris sg': 'paris saint germain',
	'ath madrid': 'atletico madrid',
	mgladbach: 'monchengladbach',
	'union sg': 'union saint gilloise',
	'oh leuven': 'oud heverlee leuven',
	'sp lisbon': 'sporting',
	'sporting cp': 'sporting',
	'psv eindhoven': 'psv',
	'az alkmaar': 'az',
	inter: 'inter milan',
	'nottm forest': 'nottingham forest',
	'man utd': 'manchester united',
	'sheffield weds': 'sheffield wednesday',
};

export function normalizeTeamName(name) {
	let s = String(name || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/ø/g, 'o')
		.replace(/ł/g, 'l')
		.replace(/ß/g, 'ss')
		.replace(/æ/g, 'ae')
		.toLowerCase()
		.replace(/['’.]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
	if (ALIASY[s]) s = ALIASY[s];
	const tokens = s
		.split(' ')
		.map((t) => ROZWINIECIA[t] ?? t)
		.filter((t) => t && !PRZEDROSTKI.has(t));
	return tokens;
}

function tokenMatch(a, b) {
	if (a === b) return true;
	const krotszy = a.length <= b.length ? a : b;
	const dluzszy = a.length <= b.length ? b : a;
	if (krotszy.length >= 3 && dluzszy.startsWith(krotszy)) return true;
	let i = 0;
	while (i < krotszy.length && krotszy[i] === dluzszy[i]) i += 1;
	return i >= 4;
}

/**
 * Podobieństwo nazw w zakresie 0–1.
 *
 * Liczymy dopasowane tokeny względem KRÓTSZEJ nazwy (żeby „Preston" pasował do „Preston
 * North End"), z lekką premią za pokrycie dłuższej — dzięki niej dokładne „Dundee" wygrywa
 * z „Dundee United", gdy oba stoją do wyboru.
 */
export function nameSimilarity(a, b) {
	const ta = normalizeTeamName(a);
	const tb = normalizeTeamName(b);
	if (!ta.length || !tb.length) return 0;
	const uzyte = new Set();
	let trafione = 0;
	for (const x of ta) {
		const idx = tb.findIndex((y, i) => !uzyte.has(i) && tokenMatch(x, y));
		if (idx >= 0) {
			uzyte.add(idx);
			trafione += 1;
		}
	}
	const min = Math.min(ta.length, tb.length);
	const max = Math.max(ta.length, tb.length);
	return (trafione / min) * (0.8 + 0.2 * (trafione / max));
}

/** Wiersze CSV → mecze z wynikiem i kursami; bez kompletu 1X2 wiersz odpada. */
export function rowsToMatches(rows) {
	const out = [];
	for (const row of rows) {
		const date = parseDate(row.Date);
		const odds = closingOdds(row);
		const hg = Number(row.FTHG);
		const ag = Number(row.FTAG);
		if (!date || !odds || !row.HomeTeam || !row.AwayTeam) continue;
		out.push({
			date,
			home: row.HomeTeam,
			away: row.AwayTeam,
			homeGoals: Number.isFinite(hg) ? hg : null,
			awayGoals: Number.isFinite(ag) ? ag : null,
			odds,
		});
	}
	return out;
}

const MIN_PODOBIENSTWO = 0.6;

function dayOffset(iso, days) {
	const d = new Date(`${iso}T12:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * Wiersz football-data dla meczu z API — po dacie (±1 dzień na strefy czasowe) i nazwach.
 *
 * @param {{ date: string, homeName: string, awayName: string }} fixture
 * @param {Array} matches wynik `rowsToMatches` dla tej ligi
 */
export function matchFixture(fixture, matches) {
	if (!fixture?.date || !fixture.homeName || !fixture.awayName || !matches?.length) return null;
	const dzien = new Date(fixture.date).toISOString().slice(0, 10);
	const dni = new Set([dayOffset(dzien, -1), dzien, dayOffset(dzien, 1)]);

	let best = null;
	let bestScore = 0;
	for (const m of matches) {
		if (!dni.has(m.date)) continue;
		const sh = nameSimilarity(fixture.homeName, m.home);
		if (sh < MIN_PODOBIENSTWO) continue;
		const sa = nameSimilarity(fixture.awayName, m.away);
		if (sa < MIN_PODOBIENSTWO) continue;
		const score = sh * sa;
		if (score > bestScore) {
			best = m;
			bestScore = score;
		}
	}
	return best;
}

/**
 * Pobiera archiwa dla podanych lig i sezonów.
 *
 * @returns {Promise<{ byLeague: Map<number, Array>, rows: number, errors: string[] }>}
 */
export async function loadMarketData(leagueIds, seasons, { fetchImpl = globalThis.fetch } = {}) {
	const byLeague = new Map();
	const errors = [];
	let rows = 0;

	for (const leagueId of leagueIds) {
		for (const season of seasons) {
			const url = footballDataUrl(leagueId, season);
			if (!url) continue;
			try {
				const res = await fetchImpl(url);
				if (!res.ok) {
					errors.push(`${url}: HTTP ${res.status}`);
					continue;
				}
				const mecze = rowsToMatches(parseCsv(await res.text()));
				rows += mecze.length;
				byLeague.set(leagueId, [...(byLeague.get(leagueId) || []), ...mecze]);
			} catch (error) {
				errors.push(`${url}: ${error.message}`);
			}
		}
	}

	return { byLeague, rows, errors };
}
