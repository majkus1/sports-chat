/**
 * Prompt raportu „Wyższe kursy" — typy z kursem od 2,0 na 24 godziny albo 3 dni.
 *
 * Kandydatów wybiera deterministycznie `lib/reports/value.js` (kurs tuż nad progiem, model
 * zgodny z rynkiem). Model językowy ocenia każdego na tle formy, H2H i prognozy dostawcy,
 * może odrzucić i pisze analizę — ale nie zmienia liczb (kurs i obie szanse wracają po
 * odpowiedzi z kandydata, `bindValuePicks`). W tym raporcie, wyjątkowo, wolno wspomnieć kurs
 * i szansę rynku — to jego temat — ale nie stawki ani zachęty do gry.
 */

export const VALUE_REPORT_PROMPT_VERSION = 'report-value/1';

export const VALUE_REPORT_SYSTEM_PROMPT = `Jesteś analitykiem piłkarskim. Przygotowujesz raport typów z wyższym kursem (od 2,0) na nadchodzące mecze z listy kandydatów wyłonionych statystycznie.

UCZCIWOŚĆ PRZEDE WSZYSTKIM:
1. Kurs 2,0 oznacza szansę około 50% — to nie są pewniaki i nie wolno ich tak przedstawiać. Nie podawaj stawek, nie zachęcaj do gry, nie pisz „pewny", „murowany", „bank".
2. Przy każdym kandydacie masz szansę według rynku (z kursu) i według modelu. Szansa rynku jest uczciwsza — przy kursach 2,0+ nasz model w pomiarach zawyżał szansę. Nie przedstawiaj procentu modelu jako faktu.

WERYFIKACJA KANDYDATÓW:
3. Każdego kandydata oceń niezależnie na tle FORMY, H2H i prognozy dostawcy. ODRZUĆ go, gdy dane wyraźnie przeczą typowi (np. typ na gospodarzy, a oni przegrali 4 z 5 ostatnich meczów u siebie). Krótszy raport z lepiej wspartymi typami jest lepszy niż pełna lista.
4. Nie zmieniaj typu ani meczu. "market" przepisz jako „Wyższy kurs", "selection" przepisz ZNAK W ZNAK z kandydata, "probability" = SZANSA WEDŁUG RYNKU z kandydata.
5. "confidence" (0–100) to TWOJA ocena, jak mocno forma i H2H wspierają typ — niezależna od kursu.
6. H2H licz tylko z ostatnich 3 lat i przy co najmniej 2 meczach.

FORMA ODPOWIEDZI:
7. "analysis": 3–4 zdania — dlaczego typ może wejść (konkretne liczby z formy i H2H) i JEDNO zdanie o głównym ryzyku. Bez ogólników.
8. "keyFacts": 2–4 krótkie fakty liczbowe.
9. "kickoffUtc", "fixtureId" i "match" przepisz dokładnie z danych kandydata.
10. "intro": 1–2 zdania — okno czasowe, ile typów, i że to typy z wyższym kursem, czyli mniejszą szansą. "summary": 1–2 zdania + przypomnienie, że przy kursie ok. 2,0 mniej więcej co drugi taki typ nie wchodzi.
11. Piszesz w języku wskazanym w danych, rzeczowo.`;

const LANGUAGE_LABEL = { pl: 'polskim', en: 'angielskim' };
const WINDOW_LABEL = { soon: 'najbliższe 24 godziny', threeDays: 'najbliższe 3 dni' };

function forma(form, label) {
	if (!form) return `  ${label}: brak danych o formie`;
	const czesci = [
		`rozegrane ${form.played?.total ?? '?'}`,
		`forma ${form.form || '?'}`,
		`śr. gole ${form.goals?.for?.average?.total ?? '?'} zdobyte / ${form.goals?.against?.average?.total ?? '?'} stracone`,
	];
	if (form.last5) czesci.push(`ostatnie 5: śr. ${form.last5.goalsForAvg ?? '?'}-${form.last5.goalsAgainstAvg ?? '?'}`);
	if (Number.isFinite(form.cleanSheet?.total)) czesci.push(`czyste konta ${form.cleanSheet.total}`);
	return `  ${label}: ${czesci.join(', ')}`;
}

/** @param {Array} candidates z `buildValueReportCandidates` */
export function buildValueReportPrompt(candidates, { type, language }) {
	const out = [
		`Język odpowiedzi: ${LANGUAGE_LABEL[language] || LANGUAGE_LABEL.pl}.`,
		`Okno raportu: ${WINDOW_LABEL[type] || WINDOW_LABEL.soon}.`,
		`Kandydatów: ${candidates.length}.`,
		'',
		'KANDYDACI:',
	];
	candidates.forEach((c, i) => {
		out.push(
			'',
			`--- Kandydat ${i + 1} ---`,
			`fixtureId: ${c.fixtureId}`,
			`match: ${c.homeName} vs ${c.awayName}`,
			`Rozgrywki: ${c.league}`,
			`kickoffUtc: ${c.kickoff}`,
			`TYP (selection): ${c.selection}`,
			`Kurs (mediana bukmacherów): ${c.odds}`,
			`Szansa według rynku: ${c.market}%`,
			`Szansa według modelu: ${c.model}%`,
			'FORMA (bieżący sezon ligowy):',
			forma(c.formHome, c.homeName),
			forma(c.formAway, c.awayName)
		);
		if (c.prediction?.advice) out.push(`Porada modelu dostawcy: ${c.prediction.advice}`);
		if (c.prediction?.percent) {
			const p = c.prediction.percent;
			out.push(`Szanse wg dostawcy: ${c.homeName} ${p.home ?? '?'}% / remis ${p.draw ?? '?'}% / ${c.awayName} ${p.away ?? '?'}%`);
		}
		if (c.h2h?.length) {
			out.push('H2H:', ...c.h2h.map((m) => `  ${m.home.name} ${m.home.goals ?? '?'}-${m.away.goals ?? '?'} ${m.away.name} (${(m.date || '').slice(0, 10)})`));
		}
	});
	return out.join('\n');
}
