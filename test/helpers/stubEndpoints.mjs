/**
 * Atrapa `@/lib/football/endpoints` — syntetyczne terminarze dla testu dymnego backtestu.
 *
 * NIE SŁUŻY DO OCENY PROGNOZ. Liczby wychodzące z tych danych nic nie znaczą. Chodzi
 * wyłącznie o to, żeby CAŁY skrypt wykonał się od początku do końca bez klucza API —
 * a więc o wyłapanie błędów kolejności deklaracji, literówek w nazwach pól i wywrotek
 * na pustych zbiorach. Dwa razy z rzędu backtest wywrócił się dopiero na serwerze,
 * bo `node --check` widzi składnię, a nie martwą strefę czasową stałych.
 */

/** Deterministyczny generator — ten sam przebieg za każdym razem. */
function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

/** Sezon mieści się w 300 dniach, tak jak prawdziwy — inaczej podział po dacie nie ma sensu. */
const DNI_SEZONU = 300;

/** Liga round-robin: mecz i rewanż, wyniki losowane z siły drużyny. */
function ligaRoundRobin(leagueId, nazwa, season, druzyn, startISO) {
	const los = rng(leagueId * 1000 + season);
	const sily = Array.from({ length: druzyn }, () => 0.6 + los() * 1.4);
	const start = new Date(startISO).getTime();
	const pary = [];

	for (let i = 0; i < druzyn; i += 1) {
		for (let j = 0; j < druzyn; j += 1) {
			if (i !== j) pary.push([i, j]);
		}
	}

	const gole = (lambda) => {
		let k = 0;
		let p = Math.exp(-lambda);
		let acc = p;
		const u = los();
		while (u > acc && k < 8) {
			k += 1;
			p *= lambda / k;
			acc += p;
		}
		return k;
	};

	return pary.map(([i, j], index) => ({
		fixture: {
			id: leagueId * 100000 + index,
			date: new Date(start + (index / pary.length) * DNI_SEZONU * 86_400_000).toISOString(),
			status: { short: 'FT' },
		},
		league: { id: leagueId, name: nazwa, season },
		teams: {
			home: { id: leagueId * 100 + i, name: `${nazwa} ${i}` },
			away: { id: leagueId * 100 + j, name: `${nazwa} ${j}` },
		},
		goals: { home: gole(sily[i] * 1.25), away: gole(sily[j]) },
	}));
}

/**
 * Drabinka pucharowa: setki drużyn po jednym meczu.
 *
 * Ma polec na progu mediany meczów na drużynę — dokładnie tak, jak Puchar Anglii
 * w prawdziwym backteście, gdzie log loss wyszedł 1,66 wobec 1,04 dla częstości.
 */
function puchar(leagueId, nazwa, season, startowych, startISO) {
	const los = rng(leagueId * 1000 + season);
	const start = new Date(startISO).getTime();
	const out = [];
	let zostali = Array.from({ length: startowych }, (_, i) => i);
	let runda = 0;

	while (zostali.length > 1 && runda < 9) {
		const dalej = [];
		for (let i = 0; i + 1 < zostali.length; i += 2) {
			const h = Math.round(los() * 3);
			const a = Math.round(los() * 3);
			out.push({
				fixture: {
					id: leagueId * 100000 + out.length,
					date: new Date(start + (runda / 9) * DNI_SEZONU * 86_400_000).toISOString(),
					status: { short: 'FT' },
				},
				league: { id: leagueId, name: nazwa, season },
				teams: {
					home: { id: leagueId * 1000 + zostali[i], name: `${nazwa} ${zostali[i]}` },
					away: { id: leagueId * 1000 + zostali[i + 1], name: `${nazwa} ${zostali[i + 1]}` },
				},
				goals: { home: h, away: a },
			});
			dalej.push(h >= a ? zostali[i] : zostali[i + 1]);
		}
		zostali = dalej;
		runda += 1;
	}
	return out;
}

const START = { 2024: '2024-08-01T15:00:00Z', 2025: '2025-08-01T15:00:00Z' };

/** Rozgrywki obsługiwane przez atrapę; reszta zwraca pustkę, żeby przebieg był szybki. */
const LIGI = new Set([39, 140, 135, 78, 61, 106, 88]);

export async function leagueFixtures({ leagueId, season }) {
	const startISO = START[season];
	if (!startISO) return [];
	// 45 to Puchar Anglii — ma zostać odrzucony progiem mediany meczów na drużynę.
	if (leagueId === 45) return puchar(45, 'FA Cup', season, 256, startISO);
	// 848 jest na liście wykluczeń — sprawdzamy, że i ona działa.
	if (leagueId === 848) return ligaRoundRobin(848, 'Conference', season, 12, startISO);
	if (LIGI.has(leagueId)) return ligaRoundRobin(leagueId, `Liga ${leagueId}`, season, 18, startISO);
	return [];
}

export async function oddsByDate() {
	return [];
}
export async function oddsByFixture() {
	return [];
}
export async function predictions() {
	return [];
}
export async function fixturesByDate() {
	return [];
}
export async function fixturesByIds() {
	return [];
}
export async function teamRecentFixtures() {
	return [];
}
export async function teamStatistics() {
	return null;
}
