/**
 * Kanoniczne kształty danych meczowych.
 *
 * To jedyne miejsce, które zna strukturę odpowiedzi dostawcy. UI i prompty AI korzystają
 * wyłącznie z kształtów zdefiniowanych tutaj, więc zmiana dostawcy albo dołożenie nowych
 * pól z płatnego planu to zmiana w tym pliku, a nie w komponentach i promptach.
 *
 * Każda funkcja jest odporna na braki — API potrafi zwrócić sekcję jako `null` albo pustą
 * tablicę i to nie może wywracać całej odpowiedzi.
 */

const num = (value) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

/** "45%" → 45 */
const percent = (value) => {
	if (typeof value !== 'string') return num(value);
	return num(value.replace('%', '').trim());
};

export function normalizeFixture(raw) {
	if (!raw?.fixture) return null;
	const { fixture, league, teams, goals, score } = raw;

	return {
		id: fixture.id,
		date: fixture.date,
		timestamp: fixture.timestamp ?? null,
		venue: fixture.venue?.name ?? null,
		city: fixture.venue?.city ?? null,
		referee: fixture.referee ?? null,
		status: {
			// `short` to kod typu NS/1H/HT/FT — dotąd nigdzie nieczytany, przez co mecze
			// przełożone traktowano jak rozpoczęte na podstawie samej godziny.
			code: fixture.status?.short ?? null,
			label: fixture.status?.long ?? null,
			elapsed: fixture.status?.elapsed ?? null,
			isLive: ['1H', '2H', 'HT', 'ET', 'BT', 'P', 'LIVE'].includes(fixture.status?.short),
			isFinished: ['FT', 'AET', 'PEN'].includes(fixture.status?.short),
			/*
			 * Trzy różne sytuacje, wcześniej wrzucone do jednego worka `isPostponed`.
			 *
			 * Przełożony zostanie rozegrany, tylko nie wiadomo kiedy — analiza ma sens, ale
			 * z zastrzeżeniem. Odwołany i przerwany bez wznowienia nie odbędą się wcale, więc
			 * generowanie analizy to spalenie limitu użytkownika na mecz, którego nie będzie.
			 * Przerwa w trakcie gry to stan chwilowy — mecz może za moment wrócić.
			 */
			isPostponed: ['PST'].includes(fixture.status?.short),
			isCancelled: ['CANC', 'ABD', 'AWD', 'WO'].includes(fixture.status?.short),
			isInterrupted: ['SUSP', 'INT'].includes(fixture.status?.short),
		},
		league: league
			? {
					id: league.id,
					name: league.name,
					country: league.country,
					season: league.season,
					round: league.round ?? null,
					logo: league.logo ?? null,
				}
			: null,
		teams: {
			home: { id: teams?.home?.id, name: teams?.home?.name, logo: teams?.home?.logo ?? null },
			away: { id: teams?.away?.id, name: teams?.away?.name, logo: teams?.away?.logo ?? null },
		},
		goals: { home: goals?.home ?? null, away: goals?.away ?? null },
		score: {
			halftime: score?.halftime ?? null,
			fulltime: score?.fulltime ?? null,
		},
	};
}

/** Forma i statystyki drużyny wyciągnięte z sekcji `teams` w odpowiedzi /predictions. */
/**
 * Statystyki sezonowe drużyny z `/teams/statistics`.
 *
 * CELOWO WĄSKI ZAKRES. Bilanse, średnie bramkowe i czyste konta są już w bloku osadzonym
 * w `predictions`, więc powielanie ich tutaj nic nie wnosi. Bierzemy wyłącznie to, czego
 * tam nie ma:
 *
 *  - rozkład goli w przedziałach minut — odpowiada na pytanie, czy drużyna rozstrzyga mecze
 *    wcześnie, czy dowozi je w końcówce; przy progach bramkowych i typach na połowy mówi
 *    coś, czego średnia nie powie nigdy,
 *  - lista formacji z liczbą meczów — jedna wartość „formacja" myli, gdy trener rotuje,
 *  - najdłuższe serie — kontekst dla formy, która w samym ciągu WWDLW jest nieczytelna.
 */
export function normalizeTeamStatistics(raw) {
	if (!raw || !raw.league) return null;

	/** Przedziały minut z odsetkiem; puste kubełki pomijamy, żeby nie zaśmiecać promptu. */
	const minuty = (blok) => {
		if (!blok) return null;
		const wpisy = Object.entries(blok)
			.filter(([, v]) => Number.isFinite(v?.total) && v.total > 0)
			.map(([zakres, v]) => ({ zakres, goals: v.total, percentage: v.percentage ?? null }));
		return wpisy.length ? wpisy : null;
	};

	return {
		teamId: raw.team?.id ?? null,
		teamName: raw.team?.name ?? null,
		leagueId: raw.league?.id ?? null,
		season: raw.league?.season ?? null,
		form: raw.form ?? null,
		goalsByMinute: {
			for: minuty(raw.goals?.for?.minute),
			against: minuty(raw.goals?.against?.minute),
		},
		streak: raw.biggest?.streak ?? null,
		formations: Array.isArray(raw.lineups)
			? raw.lineups
					.filter((l) => l?.formation)
					.map((l) => ({ formation: l.formation, played: l.played ?? null }))
			: null,
	};
}

export function normalizeTeamForm(side) {
	if (!side) return null;
	const league = side.league || {};
	const goalsFor = league.goals?.for || {};
	const goalsAgainst = league.goals?.against || {};

	return {
		id: side.id,
		name: side.name,
		form: league.form ?? null,
		last5: side.last_5
			? {
					played: side.last_5.played ?? null,
					form: percent(side.last_5.form),
					attack: percent(side.last_5.att),
					defense: percent(side.last_5.def),
					goalsFor: side.last_5.goals?.for?.total ?? null,
					goalsForAvg: num(side.last_5.goals?.for?.average),
					goalsAgainst: side.last_5.goals?.against?.total ?? null,
					goalsAgainstAvg: num(side.last_5.goals?.against?.average),
				}
			: null,
		played: {
			total: league.fixtures?.played?.total ?? null,
			home: league.fixtures?.played?.home ?? null,
			away: league.fixtures?.played?.away ?? null,
		},
		wins: league.fixtures?.wins ?? null,
		draws: league.fixtures?.draws ?? null,
		loses: league.fixtures?.loses ?? null,
		goals: {
			for: {
				total: goalsFor.total ?? null,
				average: goalsFor.average ?? null,
				overUnder: goalsFor.under_over ?? null,
			},
			against: {
				total: goalsAgainst.total ?? null,
				average: goalsAgainst.average ?? null,
				overUnder: goalsAgainst.under_over ?? null,
			},
		},
		cleanSheet: league.clean_sheet ?? null,
		failedToScore: league.failed_to_score ?? null,
		biggest: league.biggest ?? null,
		penalty: league.penalty ?? null,
		formation: league.lineups?.[0]?.formation ?? null,
	};
}

export function normalizePrediction(raw) {
	if (!raw) return null;
	const p = raw.predictions || {};

	return {
		advice: p.advice ?? null,
		winner: p.winner?.name ?? null,
		winnerComment: p.winner?.comment ?? null,
		winOrDraw: p.win_or_draw ?? null,
		underOver: p.under_over ?? null,
		percent: {
			home: percent(p.percent?.home),
			draw: percent(p.percent?.draw),
			away: percent(p.percent?.away),
		},
		goals: { home: p.goals?.home ?? null, away: p.goals?.away ?? null },
		comparison: raw.comparison
			? Object.fromEntries(
					Object.entries(raw.comparison).map(([key, value]) => [
						key,
						{ home: percent(value?.home), away: percent(value?.away) },
					])
				)
			: null,
	};
}

export function normalizeH2H(rawList, { limit = 5 } = {}) {
	if (!Array.isArray(rawList)) return [];
	return rawList.slice(0, limit).map((raw) => ({
		id: raw.fixture?.id,
		date: raw.fixture?.date,
		league: raw.league?.name ?? null,
		home: { name: raw.teams?.home?.name, goals: raw.goals?.home ?? null },
		away: { name: raw.teams?.away?.name, goals: raw.goals?.away ?? null },
	}));
}

/** Sparingi mają mniejszą wagę prognostyczną — musi to być widać w danych, nie w domyśle. */
const FRIENDLY_PATTERN = /friendl/i;

/** Mediana — pojedynczy bukmacher ze skrajnym kursem nie może przestawić całej wyceny. */
function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Wycena jednego meczu z odpowiedzi `odds?date=`.
 *
 * Z kilkunastu bukmacherów i kilkudziesięciu rynków zostawiamy trzy, których faktycznie
 * używa selekcja raportu: zwycięzcę, próg 2.5 gola i BTTS. Każdy kurs to mediana po
 * wszystkich bukmacherach, którzy dany rynek wyceniają.
 *
 * Zwracamy kursy, nie prawdopodobieństwa — przeliczenie `1/kurs` robi serwis raportu,
 * bo to część logiki selekcji, a nie kształtu danych.
 */
export function normalizeOddsFixture(raw) {
	if (!raw?.fixture?.id) return null;

	// nazwa rynku → nazwa wartości → lista kursów od kolejnych bukmacherów
	const collected = {};
	for (const bookmaker of raw.bookmakers || []) {
		for (const bet of bookmaker.bets || []) {
			for (const entry of bet.values || []) {
				const odd = Number(entry.odd);
				if (!Number.isFinite(odd) || odd <= 1) continue;
				((collected[bet.name] ||= {})[entry.value] ||= []).push(odd);
			}
		}
	}

	const pick = (market, value) => {
		const odds = collected[market]?.[value];
		return odds ? Number(median(odds).toFixed(3)) : null;
	};

	return {
		fixtureId: raw.fixture.id,
		leagueId: raw.league?.id ?? null,
		leagueName: raw.league?.name ?? null,
		country: raw.league?.country ?? null,
		kickoff: raw.fixture.date ?? null,
		bookmakerCount: (raw.bookmakers || []).length,
		markets: {
			matchWinner: {
				home: pick('Match Winner', 'Home'),
				draw: pick('Match Winner', 'Draw'),
				away: pick('Match Winner', 'Away'),
			},
			goals25: {
				over: pick('Goals Over/Under', 'Over 2.5'),
				under: pick('Goals Over/Under', 'Under 2.5'),
			},
			btts: {
				yes: pick('Both Teams Score', 'Yes'),
				no: pick('Both Teams Score', 'No'),
			},
			/*
			 * Czy drużyna strzeli — dwie nazwy rynku, bo dostawca wystawia go raz jako próg
			 * bramkowy drużyny, raz jako pytanie tak/nie. Bierzemy to, co jest.
			 */
			teamGoals: {
				home: {
					over05: pick('Total - Home', 'Over 0.5'),
					under05: pick('Total - Home', 'Under 0.5'),
					scoreYes: pick('Home Team Score a Goal', 'Yes'),
					scoreNo: pick('Home Team Score a Goal', 'No'),
				},
				away: {
					over05: pick('Total - Away', 'Over 0.5'),
					under05: pick('Total - Away', 'Under 0.5'),
					scoreYes: pick('Away Team Score a Goal', 'Yes'),
					scoreNo: pick('Away Team Score a Goal', 'No'),
				},
			},
		},
	};
}

/**
 * Kursy → prawdopodobieństwa rynkowe po zdjęciu marży, w procentach, per selekcja.
 *
 * `1/kurs` sumuje się do więcej niż 1 — nadwyżka to marża bukmachera. Kurs 1,04 to nie
 * 96%, tylko około 92% po normalizacji. Bez tego kroku sufit rynkowy odrzucałby typy
 * za marżę, nie za pewność zdarzenia. Podwójną szansę liczymy z odmarżowanego 1X2, nie
 * z osobnego rynku: jedno źródło, jedna marża.
 *
 * `null`, gdy nie ma z czego liczyć. Brak kursu to brak sufitu, nie odrzucenie.
 *
 * @param {object|null} markets pole `markets` z `normalizeOddsFixture`
 * @returns {null | { home, draw, away, '1X', X2, homeScores, awayScores }}
 */
export function impliedFromOdds(markets) {
	if (!markets) return null;

	const odmarzuj = (odds) => {
		if (!odds.every((o) => Number.isFinite(o) && o > 1)) return null;
		const surowe = odds.map((o) => 1 / o);
		const suma = surowe.reduce((a, b) => a + b, 0);
		return surowe.map((r) => Number(((100 * r) / suma).toFixed(1)));
	};

	const w = markets.matchWinner || {};
	const trojka = odmarzuj([w.home, w.draw, w.away]);

	const strzeli = (side) => {
		const t = markets.teamGoals?.[side] || {};
		return odmarzuj([t.over05, t.under05]) ?? odmarzuj([t.scoreYes, t.scoreNo]);
	};
	const dom = strzeli('home');
	const gosc = strzeli('away');

	const out = {
		home: trojka?.[0] ?? null,
		draw: trojka?.[1] ?? null,
		away: trojka?.[2] ?? null,
		'1X': trojka ? Number((trojka[0] + trojka[1]).toFixed(1)) : null,
		X2: trojka ? Number((trojka[1] + trojka[2]).toFixed(1)) : null,
		homeScores: dom?.[0] ?? null,
		awayScores: gosc?.[0] ?? null,
	};

	return Object.values(out).some((v) => v !== null) ? out : null;
}

/**
 * Ranga meczu względem spotkania, którego dotyczy analiza.
 *
 * Bez tego wszystkie wyniki wyglądają tak samo, a 4-0 w lipcowym sparingu z czwartoligowcem
 * ważyłoby tyle, co wyjazdowa wygrana w bieżącej lidze. Kategoria wędruje do promptu,
 * więc model waży wyniki sam, zamiast zgadywać po nazwie rozgrywek.
 */
function classifyMatch(league, context) {
	if (FRIENDLY_PATTERN.test(league?.name || '')) return 'sparing';
	if (!context?.leagueId) return 'inne rozgrywki';

	if (league?.id === context.leagueId) {
		if (league?.season === context.season) return 'liga — bieżący sezon';
		return 'liga — poprzedni sezon';
	}
	return 'inne rozgrywki';
}

/**
 * Ostatnie mecze drużyny widziane z jej perspektywy, wraz ze zbiorczym podsumowaniem.
 *
 * Powstaje z `fixtures?team=X&last=N`, czyli ze wszystkich rozgrywek. Dzięki temu drużyna,
 * która w nowym sezonie ligowym nie rozegrała jeszcze ani jednego meczu, i tak ma opisaną
 * formę — sparingami i końcówką poprzedniego sezonu.
 */
export function normalizeRecentFixtures(rawList, teamId, { limit = 10, context } = {}) {
	if (!Array.isArray(rawList) || !teamId) return null;

	const matches = rawList
		.filter((raw) => ['FT', 'AET', 'PEN'].includes(raw.fixture?.status?.short))
		.map((raw) => {
			const isHome = raw.teams?.home?.id === teamId;
			const goalsFor = (isHome ? raw.goals?.home : raw.goals?.away) ?? null;
			const goalsAgainst = (isHome ? raw.goals?.away : raw.goals?.home) ?? null;
			const opponent = isHome ? raw.teams?.away : raw.teams?.home;

			let result = null;
			if (goalsFor !== null && goalsAgainst !== null) {
				result = goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D';
			}

			const kind = classifyMatch(raw.league, context);

			return {
				id: raw.fixture?.id,
				date: raw.fixture?.date ?? null,
				competition: raw.league?.name ?? null,
				country: raw.league?.country ?? null,
				season: raw.league?.season ?? null,
				round: raw.league?.round ?? null,
				kind,
				isFriendly: kind === 'sparing',
				isCurrentLeague: kind === 'liga — bieżący sezon',
				isHome,
				opponentId: opponent?.id ?? null,
				opponent: opponent?.name ?? null,
				goalsFor,
				goalsAgainst,
				result,
			};
		})
		.slice(0, limit);

	if (!matches.length) return null;

	const scored = matches.filter((m) => m.result);
	const stats = (list) => {
		if (!list.length) return null;
		const sum = (pick) => list.reduce((acc, m) => acc + (pick(m) ?? 0), 0);
		const avg = (total) => Number((total / list.length).toFixed(2));
		return {
			played: list.length,
			// Kolejność jak w API — od najnowszego; odwracamy, żeby ciąg czytało się chronologicznie.
			form: list.map((m) => m.result).reverse().join(''),
			wins: list.filter((m) => m.result === 'W').length,
			draws: list.filter((m) => m.result === 'D').length,
			loses: list.filter((m) => m.result === 'L').length,
			goalsForAvg: avg(sum((m) => m.goalsFor)),
			goalsAgainstAvg: avg(sum((m) => m.goalsAgainst)),
			cleanSheets: list.filter((m) => m.goalsAgainst === 0).length,
			failedToScore: list.filter((m) => m.goalsFor === 0).length,
		};
	};

	return {
		matches,
		summary: {
			...stats(scored),
			friendlies: scored.filter((m) => m.isFriendly).length,
			currentLeague: scored.filter((m) => m.isCurrentLeague).length,
		},
		// Osobny bilans z meczów bieżącej ligi — w środku sezonu to on jest miarodajny,
		// a mieszanie go ze sparingami tylko rozmywa obraz.
		league: stats(scored.filter((m) => m.isCurrentLeague)),
	};
}

/**
 * Oceny zawodników w meczu — po kilku najlepszych i najsłabszych z każdej drużyny.
 *
 * Pełna lista to ~36 zawodników z kilkunastoma polami każdy; do promptu trafiłaby jako
 * ściana liczb, w której nic nie widać. Zostawiamy skrajności i średnią drużyny.
 */
export function normalizeFixturePlayers(rawList, { perTeam = 4 } = {}) {
	if (!Array.isArray(rawList) || !rawList.length) return [];

	return rawList.map((raw) => {
		const players = (raw.players || [])
			.map((entry) => {
				const s = entry.statistics?.[0] || {};
				return {
					id: entry.player?.id,
					name: entry.player?.name,
					position: s.games?.position ?? null,
					minutes: s.games?.minutes ?? null,
					rating: num(s.games?.rating),
					goals: s.goals?.total ?? 0,
					assists: s.goals?.assists ?? 0,
					shotsOnTarget: s.shots?.on ?? 0,
					saves: s.goals?.saves ?? null,
					yellow: s.cards?.yellow ?? 0,
					red: s.cards?.red ?? 0,
				};
			})
			.filter((p) => p.rating !== null || p.goals > 0);

		const rated = players.filter((p) => p.rating !== null).sort((a, b) => b.rating - a.rating);
		const average = rated.length
			? Number((rated.reduce((acc, p) => acc + p.rating, 0) / rated.length).toFixed(2))
			: null;

		return {
			teamId: raw.team?.id,
			teamName: raw.team?.name,
			averageRating: average,
			best: rated.slice(0, perTeam),
			worst: rated.slice(-2).filter((p) => !rated.slice(0, perTeam).includes(p)),
			scorers: players.filter((p) => p.goals > 0),
		};
	});
}

/**
 * Najlepsi strzelcy ligi zawężeni do dwóch drużyn tego meczu.
 *
 * Cała dwudziestka to w większości zawodnicy, których w tym spotkaniu nie będzie —
 * wartość ma tylko informacja, kto po tych stronach realnie zdobywa bramki.
 */
export function normalizeTopScorers(rawList, teamIds = []) {
	if (!Array.isArray(rawList)) return [];
	const wanted = new Set(teamIds.filter(Boolean));

	return rawList
		.map((raw) => {
			const s = (raw.statistics || []).find((entry) => wanted.has(entry.team?.id));
			if (!s) return null;
			return {
				playerId: raw.player?.id,
				playerName: raw.player?.name,
				teamId: s.team?.id,
				teamName: s.team?.name,
				goals: s.goals?.total ?? 0,
				assists: s.goals?.assists ?? 0,
				appearances: s.games?.appearences ?? null,
				minutes: s.games?.minutes ?? null,
				rating: num(s.games?.rating),
				penalties: s.penalty?.scored ?? 0,
			};
		})
		.filter(Boolean);
}

/**
 * Ruchy kadrowe drużyny z ostatnich miesięcy.
 *
 * API zwraca całą historię klubu (setki wpisów) i potrafi podać ten sam transfer dwa razy
 * z sąsiednimi datami, więc filtrujemy po oknie czasu i odsiewamy duplikaty — inaczej
 * do promptu trafiłby ten sam zawodnik kilka razy.
 */
export function normalizeTransfers(rawList, teamId, { sinceDays = 200, limit = 12 } = {}) {
	if (!Array.isArray(rawList) || !teamId) return [];

	const cutoff = Date.now() - sinceDays * 24 * 3600 * 1000;
	const seen = new Set();
	const out = [];

	for (const entry of rawList) {
		for (const move of entry.transfers || []) {
			const time = Date.parse(move.date);
			if (!Number.isFinite(time) || time < cutoff) continue;

			const inId = move.teams?.in?.id;
			const outId = move.teams?.out?.id;
			if (inId !== teamId && outId !== teamId) continue;
			// Ruch wewnątrz klubu (awans z rezerw) czytałby się jako „przyszedł z samego siebie".
			if (inId === outId) continue;

			const direction = inId === teamId ? 'in' : 'out';
			const key = `${entry.player?.id}:${direction}`;
			if (seen.has(key)) continue;
			seen.add(key);

			out.push({
				playerId: entry.player?.id ?? null,
				playerName: entry.player?.name ?? null,
				date: move.date,
				type: move.type ?? null,
				direction,
				otherTeam: (direction === 'in' ? move.teams?.out?.name : move.teams?.in?.name) ?? null,
			});
		}
	}

	return out.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
}

export function normalizeLineups(rawList) {
	if (!Array.isArray(rawList)) return [];
	return rawList
		// Część rozgrywek zwraca wpis drużyny bez ani jednego zawodnika. Taki „skład" nie
		// niesie nic, a w UI rysował pustą kartę, w prompcie zaś wiersz „formacja nieznana:".
		.filter((raw) => raw?.startXI?.length || raw?.substitutes?.length)
		.map((raw) => ({
		teamId: raw.team?.id,
		teamName: raw.team?.name,
		formation: raw.formation ?? null,
		coach: raw.coach?.name ?? null,
		startXI: (raw.startXI || []).map((entry) => ({
			id: entry.player?.id,
			name: entry.player?.name,
			number: entry.player?.number ?? null,
			position: entry.player?.pos ?? null,
		})),
		substitutes: (raw.substitutes || []).map((entry) => ({
			id: entry.player?.id,
			name: entry.player?.name,
			position: entry.player?.pos ?? null,
		})),
	}));
}

export function normalizeInjuries(rawList) {
	if (!Array.isArray(rawList)) return [];

	// API potrafi zwrócić tego samego zawodnika kilka razy (osobny wpis na rozgrywki),
	// przez co lista absencji w prompcie i w UI dublowała się co do wiersza.
	const seen = new Set();
	const out = [];

	for (const raw of rawList) {
		const key = `${raw.team?.id}:${raw.player?.id ?? raw.player?.name}`;
		if (seen.has(key)) continue;
		seen.add(key);

		out.push({
			teamId: raw.team?.id,
			teamName: raw.team?.name,
			playerId: raw.player?.id,
			playerName: raw.player?.name,
			type: raw.player?.type ?? null,
			reason: raw.player?.reason ?? null,
		});
	}

	return out;
}

export function normalizeEvents(rawList) {
	if (!Array.isArray(rawList)) return [];
	return rawList.map((raw) => ({
		minute: raw.time?.elapsed ?? null,
		extra: raw.time?.extra ?? null,
		teamId: raw.team?.id,
		teamName: raw.team?.name,
		type: raw.type ?? null,
		detail: raw.detail ?? null,
		player: raw.player?.name ?? null,
		assist: raw.assist?.name ?? null,
	}));
}

export function normalizeFixtureStatistics(rawList) {
	if (!Array.isArray(rawList)) return [];
	return rawList.map((raw) => ({
		teamId: raw.team?.id,
		teamName: raw.team?.name,
		stats: Object.fromEntries((raw.statistics || []).map((s) => [s.type, s.value])),
	}));
}

export function normalizeStandings(rawList) {
	if (!Array.isArray(rawList)) return [];
	// API zwraca tabele zagnieżdżone w lidze i pogrupowane (np. fazy grupowe).
	const groups = rawList[0]?.league?.standings || [];
	return groups.flat().map((row) => ({
		rank: row.rank,
		teamId: row.team?.id,
		teamName: row.team?.name,
		points: row.points,
		goalsDiff: row.goalsDiff,
		played: row.all?.played ?? null,
		win: row.all?.win ?? null,
		draw: row.all?.draw ?? null,
		lose: row.all?.lose ?? null,
		form: row.form ?? null,
		description: row.description ?? null,
	}));
}
