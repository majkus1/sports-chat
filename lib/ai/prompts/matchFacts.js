/**
 * Zamiana pakietu danych meczu na blok tekstu dla modelu.
 *
 * Jedno miejsce dla dwóch odbiorców: promptu analizy (`matchAnalysis.js`) i promptu
 * asystenta pod analizą oraz w czacie (`chatReply.js`). Wcześniej asystent dostawał własną,
 * dużo uboższą wersję tych samych danych — znał wynik, formę i trzy ostatnie H2H, ale nie
 * tabelę, statystyki ani zdarzenia. Przez to potrafił odpowiedzieć „nie mam takich danych"
 * na pytanie o rzecz, która stała w analizie tuż nad rozmową.
 *
 * Plik zawiera wyłącznie formatowanie — żadnych zasad ani instrukcji dla modelu. Te są
 * po stronie każdego z promptów, bo analityk i rozmówca mają inne zadania.
 */

/** Sparingi mają najniższą wagę prognostyczną — ranga musi być widoczna przy każdym wyniku. */
function formatTeamForm(form) {
	if (!form) return 'brak danych';

	// Sezon bez rozegranego meczu to same zera — wypisane wyglądają jak fatalna forma,
	// a nie jak brak danych. Mówimy o tym wprost i odsyłamy do sekcji zastępczej.
	if (!form.played?.total) {
		return 'brak rozegranych meczów w bieżącym sezonie ligowym — patrz sekcja OSTATNIE MECZE';
	}

	const line = (label, value) =>
		value === null || value === undefined || value === '' ? null : `${label}: ${value}`;

	return [
		line('rozegrane', form.played?.total),
		line('forma', form.form),
		line(
			'bilans',
			`${form.wins?.total ?? '?'}Z / ${form.draws?.total ?? '?'}R / ${form.loses?.total ?? '?'}P`
		),
		line('śr. gole zdobyte', form.goals?.for?.average?.total),
		line('śr. gole stracone', form.goals?.against?.average?.total),
		line('ostatnie 5 — forma', form.last5?.form),
		line('ostatnie 5 — śr. zdobyte', form.last5?.goalsForAvg),
		line('ostatnie 5 — śr. stracone', form.last5?.goalsAgainstAvg),
		line('czyste konta', form.cleanSheet?.total),
		line('mecze bez gola', form.failedToScore?.total),
		line('formacja', form.formation),
	]
		.filter(Boolean)
		.join('\n  ');
}

/**
 * Ostatnie mecze z rangą przy każdym wyniku.
 *
 * Bez rangi 4-0 w lipcowym sparingu waży tyle samo, co wyjazdowa wygrana w bieżącej lidze.
 */
function formatRecentForm(recent) {
	if (!recent?.matches?.length) return null;
	const s = recent.summary;

	const head = [
		`  ostatnie ${s.played} meczów łącznie: ${s.wins}Z / ${s.draws}R / ${s.loses}P, forma ${s.form || '?'}`,
		`  w tym: ${s.currentLeague} w bieżącej lidze, ${s.friendlies} sparingów`,
		`  śr. gole (wszystkie mecze): zdobyte ${s.goalsForAvg ?? '?'} / stracone ${s.goalsAgainstAvg ?? '?'}`,
	];

	// Osobny bilans meczów o stawkę w tej właśnie lidze — w środku sezonu to on
	// jest miarodajny, a nie średnia rozmyta sparingami i pucharami.
	if (recent.league) {
		const l = recent.league;
		head.push(
			`  SAME MECZE BIEŻĄCEJ LIGI (${l.played}): ${l.wins}Z / ${l.draws}R / ${l.loses}P, forma ${l.form || '?'}`,
			`    śr. gole: zdobyte ${l.goalsForAvg ?? '?'} / stracone ${l.goalsAgainstAvg ?? '?'}, czyste konta ${l.cleanSheets}, bez gola ${l.failedToScore}`
		);
	}

	const rows = recent.matches.map((m) => {
		const gdzie = m.isHome ? 'u siebie' : 'wyjazd';
		const runda = m.isCurrentLeague && m.round ? `, ${m.round}` : '';
		return `  ${(m.date || '').slice(0, 10)} ${m.result ?? '?'} ${m.goalsFor}-${m.goalsAgainst} z ${m.opponent ?? '?'} (${gdzie}) [${m.kind}${runda}]`;
	});

	return [...head, '  mecz po meczu:', ...rows].join('\n');
}

function formatTransfers(list) {
	if (!list?.length) return null;
	return list
		.map((t) => {
			const kierunek = t.direction === 'in' ? 'przyszedł z' : 'odszedł do';
			return `  ${(t.date || '').slice(0, 10)} ${t.playerName ?? '?'} — ${kierunek} ${t.otherTeam ?? '?'} (${t.type ?? '?'})`;
		})
		.join('\n');
}

/**
 * Tabela ligowa.
 *
 * Była pobierana od początku, ale nigdy nie trafiała do promptu — analiza nie wiedziała
 * nawet, kto jest wyżej i o ile punktów. Dystans do czołówki czy strefy spadkowej zmienia
 * motywację obu stron, więc podajemy całą tabelę, a nie same dwa wiersze.
 */
function formatStandings(rows, homeId, awayId) {
	if (!rows?.length) return null;

	const table = rows
		.slice(0, 24)
		.map((r) => {
			const marker = r.teamId === homeId ? '>' : r.teamId === awayId ? '<' : ' ';
			const bilans = `${r.win ?? '?'}-${r.draw ?? '?'}-${r.lose ?? '?'}`;
			const roznica = `${r.goalsDiff >= 0 ? '+' : ''}${r.goalsDiff}`;
			return `  ${marker} ${String(r.rank).padStart(2)}. ${r.teamName} — ${r.points} pkt, ${r.played ?? '?'} m, ${bilans}, bramki ${roznica}, forma ${r.form || '-'}`;
		})
		.join('\n');

	const home = rows.find((r) => r.teamId === homeId);
	const away = rows.find((r) => r.teamId === awayId);
	const naglowek = ['  (> gospodarze, < goście)'];
	if (home && away) {
		naglowek.push(
			`  dystans: ${home.teamName} ${home.rank}. miejsce / ${home.points} pkt, ${away.teamName} ${away.rank}. miejsce / ${away.points} pkt — różnica ${Math.abs(home.points - away.points)} pkt`
		);
	}

	return [...naglowek, table].join('\n');
}

/**
 * Statystyki meczowe (strzały, posiadanie, podania).
 *
 * Były pobierane i normalizowane, ale — podobnie jak tabela — nie miały własnej sekcji
 * w prompcie. W meczu na żywo to najkonkretniejszy obraz przewagi, jaki mamy.
 */
function formatStatistics(list) {
	if (!list?.length) return null;

	// Zestawienie obok siebie czyta się lepiej niż dwie osobne listy.
	const keys = [...new Set(list.flatMap((team) => Object.keys(team.stats || {})))];
	const naglowek = `  ${list.map((t) => t.teamName).join(' | ')}`;
	const rows = keys.map((key) => {
		const values = list.map((t) => {
			const value = t.stats?.[key];
			return value === null || value === undefined ? '-' : String(value);
		});
		return `  ${key}: ${values.join(' | ')}`;
	});

	return [naglowek, ...rows].join('\n');
}

/** Oceny zawodników w trwającym meczu — kto ciągnie grę, a kto zawodzi. */
function formatPlayers(list) {
	if (!list?.length) return null;
	return list
		.map((team) => {
			const opis = (p) =>
				`${p.name} ${p.rating ?? '?'}${p.goals ? ` (${p.goals} gol)` : ''}${p.assists ? ` (${p.assists} asysta)` : ''}`;
			const parts = [`  ${team.teamName} — średnia ocena ${team.averageRating ?? '?'}`];
			if (team.best?.length) parts.push(`    najlepsi: ${team.best.map(opis).join(', ')}`);
			if (team.worst?.length) parts.push(`    najsłabsi: ${team.worst.map(opis).join(', ')}`);
			return parts.join('\n');
		})
		.join('\n');
}

/** Kto w tych drużynach realnie zdobywa bramki w bieżącym sezonie. */
function formatTopScorers(list) {
	if (!list?.length) return null;
	return list
		.map(
			(p) =>
				`  ${p.teamName}: ${p.playerName} — ${p.goals} gole, ${p.assists} asyst w ${p.appearances ?? '?'} meczach${p.penalties ? ` (w tym ${p.penalties} z karnych)` : ''}`
		)
		.join('\n');
}

function formatH2H(list) {
	if (!list?.length) return 'brak wcześniejszych spotkań w danych';
	return list
		.map(
			(m) =>
				`  ${m.home.name} ${m.home.goals ?? '?'} - ${m.away.goals ?? '?'} ${m.away.name} (${(m.date || '').slice(0, 10)})`
		)
		.join('\n');
}

function formatInjuries(list) {
	if (!list?.length) return null;
	return list
		.map((i) => `  ${i.teamName}: ${i.playerName} — ${i.reason || i.type || 'brak szczegółów'}`)
		.join('\n');
}

function formatLineups(list) {
	if (!list?.length) return null;
	return list
		.map(
			(l) =>
				`  ${l.teamName} (${l.formation || 'formacja nieznana'}): ${l.startXI.map((p) => p.name).join(', ')}`
		)
		.join('\n');
}

/**
 * Zdarzenia meczu.
 *
 * Bramka samobójcza wymaga osobnego zdania. API przypisuje ją drużynie, która gola
 * ZYSKUJE, a nie drużynie strzelca — zapis „Gnistan: Goal (Own Goal) — S. Vaisanen"
 * model odczytał jako samobója zawodnika Gnistanu i przypisał bramkę nie tej stronie.
 * (Sprawdzone: ten sam zawodnik dostaje w tym meczu kartkę pod drużyną przeciwną.)
 */
function formatEvents(list) {
	if (!list?.length) return null;

	return list
		.map((e) => {
			const minuta = `  ${e.minute ?? '?'}'`;

			if (e.type === 'Goal' && e.detail === 'Own Goal') {
				return `${minuta} BRAMKA SAMOBÓJCZA — gol zapisany dla ${e.teamName}; do własnej siatki trafił ${e.player ?? '?'} (zawodnik drużyny przeciwnej)`;
			}
			if (e.type === 'Goal') {
				const asysta = e.assist ? `, asysta ${e.assist}` : '';
				const rodzaj = e.detail && e.detail !== 'Normal Goal' ? ` (${e.detail})` : '';
				return `${minuta} GOL dla ${e.teamName} — ${e.player ?? '?'}${asysta}${rodzaj}`;
			}
			if (e.type === 'Card') {
				return `${minuta} ${e.detail || 'kartka'} — ${e.player ?? '?'} (${e.teamName})`;
			}
			if (e.type === 'subst') {
				return `${minuta} zmiana w ${e.teamName}: wchodzi ${e.assist ?? '?'}, schodzi ${e.player ?? '?'}`;
			}

			return `${minuta} ${e.teamName}: ${e.type}${e.detail ? ` (${e.detail})` : ''}${e.player ? ` — ${e.player}` : ''}`;
		})
		.join('\n');
}

/**
 * Cały blok faktów o meczu.
 *
 * @param {object} bundle wynik buildFixtureBundle()
 * @param {{ withHeader?: boolean }} [options] `withHeader` dokłada nagłówek „DANE MECZU"
 * @returns {string}
 */
export function buildMatchFacts(bundle, { withHeader = true } = {}) {
	if (!bundle?.fixture) return '(brak danych o meczu)';

	const { fixture } = bundle;
	const home = fixture.teams.home.name;
	const away = fixture.teams.away.name;
	const sections = [];

	if (withHeader) sections.push('DANE MECZU');

	sections.push(
		`Mecz: ${home} vs ${away}`,
		`Rozgrywki: ${fixture.league?.name || '?'} (${fixture.league?.country || '?'})`,
		`Status: ${fixture.status.label || fixture.status.code || '?'} (kod ${fixture.status.code || '?'})`
	);

	/*
	 * Status nieoczywisty dostaje własne zdanie po polsku.
	 *
	 * Dotąd w prompcie stała sama angielska etykieta „Match Postponed" w jednym rzędzie
	 * z ligą i godziną. Mocniejszy model to wyłapywał, słabszy niekoniecznie — a to nie
	 * może zależeć od modelu. Teraz fakt jest nazwany wprost, razem z jego konsekwencją.
	 */
	if (fixture.status.isPostponed) {
		sections.push(
			'UWAGA: mecz został PRZEŁOŻONY na inny, jeszcze nieznany termin. Prognoza dotyczy spotkania, które odbędzie się później — do tego czasu forma, skład i sytuacja w tabeli mogą się zmienić. Napisz o tym w "summary" i umieść to jako pierwszą pozycję w "risks".'
		);
	}
	if (fixture.status.isCancelled) {
		sections.push(
			'UWAGA: mecz został ODWOŁANY albo zakończony walkowerem i NIE zostanie rozegrany. Nie prognozuj jego przebiegu — zwróć pustą tablicę "picks" i wyjaśnij powód w "summary".'
		);
	}
	if (fixture.status.isInterrupted) {
		sections.push(
			'UWAGA: mecz jest PRZERWANY i może zostać wznowiony albo dokończony w innym terminie. Odnieś prognozy do pozostałego czasu gry, ale zaznacz niepewność co do wznowienia.'
		);
	}

	if (fixture.status.isLive || fixture.status.isFinished) {
		const minuta = fixture.status.elapsed;
		sections.push(
			`WYNIK: ${home} ${fixture.goals.home ?? 0} - ${fixture.goals.away ?? 0} ${away}` +
				(minuta ? ` (${minuta}. minuta)` : '')
		);
	}

	if (bundle.form) {
		sections.push(
			'',
			`GOSPODARZE — ${home}`,
			`  ${formatTeamForm(bundle.form.home)}`,
			'',
			`GOŚCIE — ${away}`,
			`  ${formatTeamForm(bundle.form.away)}`
		);
	}

	const recentHome = formatRecentForm(bundle.recentForm?.home);
	const recentAway = formatRecentForm(bundle.recentForm?.away);
	if (recentHome || recentAway) {
		sections.push(
			'',
			'OSTATNIE MECZE — MECZ PO MECZU',
			'Ranga każdego wyniku stoi w nawiasie kwadratowym: „liga — bieżący sezon", „liga — poprzedni sezon", „sparing" albo „inne rozgrywki".',
			'',
			`${home}:`,
			recentHome || '  brak danych',
			'',
			`${away}:`,
			recentAway || '  brak danych'
		);
	}

	const transfersHome = formatTransfers(bundle.transfers?.home);
	const transfersAway = formatTransfers(bundle.transfers?.away);
	if (transfersHome || transfersAway) {
		sections.push(
			'',
			'RUCHY KADROWE W OSTATNICH MIESIĄCACH',
			`${home}:`,
			transfersHome || '  brak ruchów w danych',
			'',
			`${away}:`,
			transfersAway || '  brak ruchów w danych'
		);
	}

	const standings = formatStandings(bundle.standings, fixture.teams.home.id, fixture.teams.away.id);
	if (standings) sections.push('', `TABELA — ${fixture.league?.name || 'liga'}`, standings);

	const topScorers = formatTopScorers(bundle.topScorers);
	if (topScorers) {
		sections.push('', 'NAJSKUTECZNIEJSI ZAWODNICY OBU DRUŻYN W TYM SEZONIE', topScorers);
	}

	const statistics = formatStatistics(bundle.statistics);
	if (statistics) sections.push('', 'STATYSTYKI TEGO MECZU', statistics);

	const players = formatPlayers(bundle.players);
	if (players) sections.push('', 'OCENY ZAWODNIKÓW W TYM MECZU', players);

	if (bundle.prediction) {
		const p = bundle.prediction;
		sections.push(
			'',
			'PROGNOZA DOSTAWCY DANYCH (materiał pomocniczy)',
			`  porada: ${p.advice || 'brak'}`,
			`  szanse: ${home} ${p.percent?.home ?? '?'}% / remis ${p.percent?.draw ?? '?'}% / ${away} ${p.percent?.away ?? '?'}%`,
			`  przewidywane gole: ${p.goals?.home ?? '?'} - ${p.goals?.away ?? '?'}`
		);
		if (p.comparison) {
			const cmp = Object.entries(p.comparison)
				.map(([key, v]) => `${key} ${v.home ?? '?'}/${v.away ?? '?'}`)
				.join(', ');
			sections.push(`  porównanie (gospodarze/goście): ${cmp}`);
		}
	}

	if (bundle.h2h) sections.push('', 'BEZPOŚREDNIE SPOTKANIA', formatH2H(bundle.h2h));

	const lineups = formatLineups(bundle.lineups);
	if (lineups) sections.push('', 'SKŁADY', lineups);

	const injuries = formatInjuries(bundle.injuries);
	if (injuries) sections.push('', 'ABSENCJE', injuries);

	const events = formatEvents(bundle.events);
	if (events) sections.push('', 'ZDARZENIA W MECZU', events);

	if (bundle.missing && Object.keys(bundle.missing).length) {
		sections.push('', `BRAKUJĄCE SEKCJE DANYCH: ${Object.keys(bundle.missing).join(', ')}.`);
	}

	sections.push('', `Dane pobrano: ${bundle.fetchedAt}.`);

	return sections.join('\n');
}
