/**
 * Rozpoznawanie i rozstrzyganie typów.
 *
 * Typy z raportu mają ustalone słownictwo (sami je generujemy), ale typy z analizy meczu
 * pisze model swobodną polszczyzną albo angielszczyzną: „Bucaramanga lub remis",
 * „Powyżej 2.5 gola", „Obie drużyny strzelą gola / Tak". Ten moduł sprowadza jedno i drugie
 * do wspólnej postaci, którą da się porównać z końcowym wynikiem.
 *
 * ZASADA NADRZĘDNA: czego nie da się rozpoznać jednoznacznie albo rozstrzygnąć samym
 * końcowym wynikiem — zwracamy `null`, co oznacza typ pominięty w statystykach. Zgadywanie
 * podniosłoby liczbę rozliczonych typów kosztem tego, po co w ogóle liczymy skuteczność.
 */

const norm = (text) =>
	String(text || '')
		.toLowerCase()
		.replace(/[ąàáâ]/g, 'a')
		.replace(/[ćç]/g, 'c')
		.replace(/[ęèéê]/g, 'e')
		.replace(/ł/g, 'l')
		.replace(/ń/g, 'n')
		.replace(/[óòôö]/g, 'o')
		.replace(/ś/g, 's')
		.replace(/[żź]/g, 'z')
		.replace(/\s+/g, ' ')
		.trim();

/** „2.5", „2,5", „3" → liczba. */
function readLine(text) {
	const match = norm(text).match(/(\d+[.,]?\d*)/);
	if (!match) return null;
	const value = Number(match[1].replace(',', '.'));
	return Number.isFinite(value) ? value : null;
}

/** Czy tekst wskazuje na konkretną drużynę meczu. */
function whichTeam(text, homeName, awayName) {
	const t = norm(text);
	const home = norm(homeName);
	const away = norm(awayName);
	// Pierwszy człon nazwy wystarcza — model skraca „Deportivo Pasto" do „Pasto".
	const hit = (full) => full && (t.includes(full) || full.split(' ').some((w) => w.length > 3 && t.includes(w)));
	const isHome = hit(home);
	const isAway = hit(away);
	if (isHome && !isAway) return 'home';
	if (isAway && !isHome) return 'away';
	return null;
}

const has = (t, ...words) => words.some((w) => t.includes(w));

/**
 * KANONICZNE NAZWY RYNKÓW — te i tylko te wpisujemy w pole `market`.
 *
 * Jedno źródło dla trzech miejsc naraz: selekcji modelu (`lib/analysis/model`), selekcji
 * raportu (`lib/reports/service`) i instrukcji dla modelu językowego. Dopóki nazwa żyła
 * w każdym z nich osobno, model językowy pisał ją po swojemu — „Drużyna strzeli gola"
 * zamiast „Gole drużyny" — a parser jej nie rozpoznawał i typ przepadał jako `void`:
 * czytelnik widział pełnoprawny typ, którego statystyka nigdy nie policzyła.
 */
export const CANONICAL_MARKETS = {
	matchWinner: 'Wynik meczu',
	doubleChance: 'Podwójna szansa',
	teamGoals: 'Gole drużyny',
};

/**
 * Sprowadza parę rynek/selekcja do postaci rozstrzygalnej końcowym wynikiem.
 *
 * @returns {{ type: string, side?: string, line?: number, value?: string }|null}
 */
export function normalizePick({ market, selection, homeName, awayName }) {
	const m = norm(market);
	const s = norm(selection);
	const both = `${m} ${s}`;

	// --- Obie drużyny strzelą ---
	if (has(m, 'obie', 'btts', 'both teams')) {
		if (has(s, 'tak', 'yes')) return { type: 'btts', value: 'yes' };
		if (has(s, 'nie', 'no')) return { type: 'btts', value: 'no' };
		return null;
	}

	// --- Podwójna szansa ---
	if (has(m, 'podwojna', 'double chance')) {
		// Zapis skrótowy z raportu.
		if (/\b1x\b/.test(s)) return { type: 'doubleChance', value: '1X' };
		if (/\bx2\b/.test(s)) return { type: 'doubleChance', value: 'X2' };
		if (/\b12\b/.test(s)) return { type: 'doubleChance', value: '12' };

		// Zapis opisowy z analizy: „Bucaramanga lub remis", „Remis lub Chicago Fire".
		const withDraw = has(s, 'remis', 'draw');
		const team = whichTeam(s, homeName, awayName);
		if (withDraw && team === 'home') return { type: 'doubleChance', value: '1X' };
		if (withDraw && team === 'away') return { type: 'doubleChance', value: 'X2' };
		if (!withDraw && team) return { type: 'doubleChance', value: '12' };
		return null;
	}

	/*
	 * Gole konkretnej drużyny: „Bucaramanga powyżej 0.5 gola".
	 *
	 * Rozpoznajemy po TREŚCI, nie po tym, jak rynek akurat został nazwany. Kanoniczna nazwa
	 * to „Gole drużyny", ale model językowy pisał już „Drużyna strzeli gola" i „Team to score",
	 * a wtedy typ lądował poza statystyką mimo poprawnej selekcji. Wariant z obiema drużynami
	 * nie przechodzi tędy, bo `btts` sprawdzamy wyżej.
	 */
	if (has(m, 'gole druzyny', 'team goals', 'gole ', 'druzyna strzeli', 'strzeli gol', 'to score', 'strzelone gole')) {
		const team = whichTeam(both, homeName, awayName);
		const line = readLine(s);
		if (!team || line === null) return null;
		if (has(s, 'powyzej', 'over', 'ponad')) return { type: 'teamGoals', side: team, dir: 'over', line };
		if (has(s, 'ponizej', 'under')) return { type: 'teamGoals', side: team, dir: 'under', line };
		return null;
	}

	// --- Suma goli (rynek zakazany, ale ma być rozpoznany, żeby wiedzieć, co odrzucamy) ---
	if (has(m, 'suma goli', 'total goals', 'goals over', 'over/under', 'liczba goli', 'suma bramek', 'liczba bramek', 'gole w meczu')) {
		const line = readLine(s);
		if (line === null) return null;
		if (has(s, 'powyzej', 'over', 'ponad')) return { type: 'totalGoals', dir: 'over', line };
		if (has(s, 'ponizej', 'under')) return { type: 'totalGoals', dir: 'under', line };
		return null;
	}

	// --- Zwycięzca meczu ---
	if (
		has(m, 'wynik meczu', 'zwyciezca', '1x2', 'match winner', 'full time result', 'final result', 'wygrana', 'zwyciestwo', 'kto wygra')
	) {
		if (has(s, 'remis', 'draw')) return { type: 'matchWinner', value: 'draw' };
		if (/\bhome\b/.test(s) || has(s, 'gospodarz')) return { type: 'matchWinner', value: 'home' };
		if (/\baway\b/.test(s) || has(s, 'gosc', 'goscie')) return { type: 'matchWinner', value: 'away' };
		const team = whichTeam(s, homeName, awayName);
		if (team) return { type: 'matchWinner', value: team };
		return null;
	}

	/*
	 * Rynki, których końcowy wynik nie rozstrzyga — świadomie pomijane.
	 * „Następna bramka" wymaga znajomości stanu z chwili typowania, a nie tylko rezultatu.
	 */
	return null;
}

/**
 * Rozstrzyga znormalizowany typ końcowym wynikiem.
 *
 * @returns {'won'|'lost'|null} `null`, gdy rozstrzygnięcie jest niemożliwe
 */
export function settlePick(normalized, { home, away }) {
	if (!normalized || !Number.isFinite(home) || !Number.isFinite(away)) return null;
	const total = home + away;
	const won = (condition) => (condition ? 'won' : 'lost');

	switch (normalized.type) {
		case 'btts':
			return won(normalized.value === 'yes' ? home > 0 && away > 0 : home === 0 || away === 0);

		case 'doubleChance': {
			if (normalized.value === '1X') return won(home >= away);
			if (normalized.value === 'X2') return won(away >= home);
			if (normalized.value === '12') return won(home !== away);
			return null;
		}

		case 'matchWinner': {
			if (normalized.value === 'home') return won(home > away);
			if (normalized.value === 'away') return won(away > home);
			if (normalized.value === 'draw') return won(home === away);
			return null;
		}

		case 'totalGoals':
			// Progi połówkowe nie dają remisu na linii; dla progu całkowitego (np. 3.0)
			// zwrot stawki nie ma u nas znaczenia — liczymy tylko trafienie.
			return won(normalized.dir === 'over' ? total > normalized.line : total < normalized.line);

		case 'teamGoals': {
			const goals = normalized.side === 'home' ? home : away;
			return won(normalized.dir === 'over' ? goals > normalized.line : goals < normalized.line);
		}

		default:
			return null;
	}
}

/**
 * Czy dwie postacie znormalizowane wskazują tę samą selekcję.
 *
 * Porównanie po polach, nie po tekście: model językowy pisze „1X — Machida lub remis",
 * a selekcja zna „1X". Dopiero tu obie wersje spotykają się jako jedna rzecz.
 */
export function sameSelection(a, b) {
	if (!a || !b || a.type !== b.type) return false;
	if (a.type === 'teamGoals' || a.type === 'totalGoals') {
		return a.side === b.side && a.dir === b.dir && a.line === b.line;
	}
	return a.value === b.value;
}

/** Czytelny opis rynku do interfejsu — bez surowych kodów. */
export function describeNormalized(normalized) {
	if (!normalized) return null;
	switch (normalized.type) {
		case 'btts':
			return normalized.value === 'yes' ? 'Obie strzelą' : 'Obie nie strzelą';
		case 'doubleChance':
			return `Podwójna szansa ${normalized.value}`;
		case 'matchWinner':
			return { home: 'Wygrana gospodarzy', away: 'Wygrana gości', draw: 'Remis' }[normalized.value];
		case 'totalGoals':
			return `${normalized.dir === 'over' ? 'Powyżej' : 'Poniżej'} ${normalized.line} gola`;
		case 'teamGoals':
			return `${normalized.side === 'home' ? 'Gospodarze' : 'Goście'} ${normalized.dir === 'over' ? 'powyżej' : 'poniżej'} ${normalized.line}`;
		default:
			return null;
	}
}

/**
 * Rynki dostępne dla typujących użytkowników — zamknięta lista, nie wolny tekst.
 *
 * Powód jest prosty: typ wpisany ręcznie („wygra gospodarz do zera") bywa nierozstrzygalny
 * i wypadałby ze statystyk, co przy rankingu byłoby nie do obronienia. Wybór z listy
 * gwarantuje, że każdy typ da się rozliczyć końcowym wynikiem.
 *
 * `value` trafia do bazy jako `selection`, `labelKey` to klucz tłumaczenia w UI.
 */
export const USER_MARKETS = [
	{
		market: 'Wynik meczu',
		labelKey: 'pick_market_result',
		options: [
			{ value: 'home', labelKey: 'pick_sel_home' },
			{ value: 'draw', labelKey: 'pick_sel_draw' },
			{ value: 'away', labelKey: 'pick_sel_away' },
		],
	},
	{
		market: 'Podwójna szansa',
		labelKey: 'pick_market_dc',
		options: [
			{ value: '1X', labelKey: 'pick_sel_1x' },
			{ value: 'X2', labelKey: 'pick_sel_x2' },
			{ value: '12', labelKey: 'pick_sel_12' },
		],
	},
	{
		market: 'Suma goli',
		labelKey: 'pick_market_goals',
		options: [
			{ value: 'Over 2.5', labelKey: 'pick_sel_over25' },
			{ value: 'Under 2.5', labelKey: 'pick_sel_under25' },
		],
	},
	{
		market: 'Obie strzelą',
		labelKey: 'pick_market_btts',
		options: [
			{ value: 'Tak', labelKey: 'pick_sel_yes' },
			{ value: 'Nie', labelKey: 'pick_sel_no' },
		],
	},
];

/** Czy para rynek/selekcja pochodzi z listy dostępnej użytkownikom. */
export function isAllowedUserPick(market, selection) {
	const entry = USER_MARKETS.find((m) => m.market === market);
	return Boolean(entry && entry.options.some((o) => o.value === selection));
}

/** Grupa rynku do statystyk „skuteczność wg rynku". */
export const MARKET_GROUPS = {
	btts: 'Obie strzelą',
	doubleChance: 'Podwójna szansa',
	matchWinner: 'Zwycięzca meczu',
	totalGoals: 'Suma goli',
	teamGoals: 'Gole drużyny',
};
