/**
 * Prompt raportu zbiorczego — typy na nadchodzące mecze.
 *
 * Kandydatów wybiera deterministycznie lib/reports/service.js: wysokie prawdopodobieństwo
 * policzone z prognozy dostawcy i z rozkładu Poissona na średnich bramkach, plus premia
 * za zgodność obu rachunków. Model dostaje gotową krótką listę z pełnymi faktami — jego
 * rola to weryfikacja każdego kandydata na tle formy i H2H, wybór najlepiej wspartego
 * rynku oraz zwięzła analiza. Nie szuka meczów sam.
 *
 * ŻADNE DANE RYNKOWE TU NIE DOCIERAJĄ. Selekcja przestała patrzeć na kursy — nie ma już
 * czego ukrywać przed modelem ani czego zakazywać mu w cytowaniu poza samą tematyką.
 */

export const REPORT_PROMPT_VERSION = 'report/2';

export const REPORT_SYSTEM_PROMPT = `Jesteś analitykiem piłkarskim. Przygotowujesz zbiorczy raport typów na nadchodzące mecze z listy kandydatów wyłonionych statystycznie.

ZAKAZ ABSOLUTNY:
1. W żadnym polu odpowiedzi nie wolno wspomnieć o kursach, bukmacherach, zakładach pieniężnych, marżach, "value", wycenie rynkowej ani prawdopodobieństwie implikowanym. Operujesz wyłącznie szacowanym prawdopodobieństwem w procentach. Nie zachęcaj do gry na pieniądze.

WERYFIKACJA KANDYDATÓW:
2. Każdego kandydata oceń niezależnie na tle jego FORMY i H2H. Masz prawo go ODRZUCIĆ — gdy forma przeczy proponowanemu rynkowi, próba jest mała albo sygnały są sprzeczne. Raport z mniejszą liczbą pewniejszych typów jest lepszy niż pełna lista słabych.
3. Dla zaakceptowanego meczu wybierz DOKŁADNIE JEDEN rynek — spośród PROPONOWANYCH RYNKÓW tego meczu ten, który dane wspierają najmocniej. Jeśli inne rynki mają porównywalne wsparcie co podwójna szansa, wybieraj je — raport złożony z samych podwójnych szans jest mało wartościowy.
4. "probability" to TWOJA ocena prawdopodobieństwa (55–85). Wyjściowy procent selekcji bywa zawyżony przez zgrubne dane — koryguj go w dół, gdy forma nie daje mu pełnego pokrycia. "confidence" (0–100) wyraża, jak mocno dane wspierają typ.
5. Progi bramkowe: nie proponuj Under 2.5 przy sumie średnich goli > 2.6 lub BTTS > 60%; nie proponuj Over 2.5 przy sumie średnich < 2.3. H2H licz tylko z ostatnich 3 lat i przy co najmniej 2 meczach; ignoruj pojedyncze skrajne wyniki.

FORMA ODPOWIEDZI:
6. "analysis": 2–4 zdania konkretów — bilanse, średnie goli, serie, H2H. Bez ogólników w rodzaju "forma jest dobra" i bez wstępów.
7. "keyFacts": 2–4 krótkie fakty liczbowe (np. "Goias: 5 meczów bez porażki u siebie").
8. "kickoffUtc" i "fixtureId" przepisz dokładnie z danych kandydata.
9. "intro": 1–2 zdania — jakie okno czasowe obejmuje raport i ile typów zawiera; przy ubogiej ofercie powiedz to wprost. "summary": 1–2 zdania zbiorcze + jedno zdanie przypomnienia o rozwadze (typy to szacunki, nie pewniki).
10. Cały raport piszesz w języku wskazanym w danych, rzeczowo, bez lania wody.`;

const LANGUAGE_LABEL = { pl: 'polskim', en: 'angielskim' };
const WINDOW_LABEL = {
	soon: 'najbliższe 24 godziny',
	threeDays: 'najbliższe 3 dni',
};

function formatCompactForm(form, label) {
	if (!form) return `  ${label}: brak danych o formie`;
	const parts = [
		`rozegrane ${form.played?.total ?? '?'}`,
		`forma ${form.form || '?'}`,
		`śr. gole ${form.goals?.for?.average?.total ?? '?'} zdobyte / ${form.goals?.against?.average?.total ?? '?'} stracone`,
	];
	if (form.last5) {
		parts.push(`ostatnie 5: śr. ${form.last5.goalsForAvg ?? '?'}-${form.last5.goalsAgainstAvg ?? '?'}`);
	}
	if (Number.isFinite(form.cleanSheet?.total)) parts.push(`czyste konta ${form.cleanSheet.total}`);
	return `  ${label}: ${parts.join(', ')}`;
}

function formatMarket(entry) {
	/*
	 * `support` mówi, czy za selekcją stoi jeden rachunek, czy dwa niezależne (prognoza
	 * dostawcy ORAZ własny rozkład bramek). To zastąpiło dawną „przewagę selekcji" liczoną
	 * z kursów — i w przeciwieństwie do niej można to modelowi powiedzieć wprost.
	 */
	const wsparcie = entry.support >= 2 ? 'potwierdzone dwoma niezależnymi rachunkami' : 'jeden rachunek';
	return `${entry.market} / ${entry.selection} — wstępne prawdopodobieństwo ${entry.pModel}% (${wsparcie})`;
}

/**
 * @param {Array} candidates wynik buildReportCandidates().candidates
 * @param {{ type: 'soon'|'threeDays', language: 'pl'|'en' }} options
 * @returns {string}
 */
export function buildReportPrompt(candidates, { type, language }) {
	const sections = [
		`Język odpowiedzi: ${LANGUAGE_LABEL[language] || LANGUAGE_LABEL.pl}.`,
		`Okno raportu: ${WINDOW_LABEL[type] || WINDOW_LABEL.soon}.`,
		`Kandydatów po selekcji statystycznej: ${candidates.length}.`,
		'',
		'KANDYDACI:',
	];

	candidates.forEach((c, index) => {
		sections.push(
			'',
			`--- Kandydat ${index + 1} ---`,
			`fixtureId: ${c.fixtureId}`,
			`Mecz: ${c.home} vs ${c.away}`,
			`Rozgrywki: ${c.league}`,
			`kickoffUtc: ${c.kickoff}`,
			'PROPONOWANE RYNKI (dane wewnętrzne selekcji — nie cytować):',
			`  1. ${formatMarket(c.best)}`,
			...c.otherMarkets.map((m, i) => `  ${i + 2}. ${formatMarket(m)}`),
			'FORMA (bieżący sezon ligowy):',
			formatCompactForm(c.formHome, c.home),
			formatCompactForm(c.formAway, c.away)
		);

		if (c.prediction?.advice) {
			sections.push(`Porada modelu dostawcy: ${c.prediction.advice}`);
		}
		if (c.prediction?.percent) {
			const p = c.prediction.percent;
			sections.push(`Szanse wg dostawcy: ${c.home} ${p.home ?? '?'}% / remis ${p.draw ?? '?'}% / ${c.away} ${p.away ?? '?'}%`);
		}
		if (c.h2h?.length) {
			sections.push(
				'H2H:',
				...c.h2h.map(
					(m) => `  ${m.home.name} ${m.home.goals ?? '?'}-${m.away.goals ?? '?'} ${m.away.name} (${(m.date || '').slice(0, 10)})`
				)
			);
		}
	});

	if (!candidates.length) {
		sections.push('', 'Brak kandydatów — napisz krótki raport informujący, że w tym oknie nie ma wartościowych typów.');
	}

	return sections.join('\n');
}
