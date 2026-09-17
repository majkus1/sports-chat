import { searchWeb } from '@/lib/ai';
import { MODEL_CHAT } from '@/lib/ai/config';

/**
 * Wiadomości z internetu dla asystenta — kontuzje, składy, trener, transfery, zawieszenia.
 *
 * WIADOMOŚCI NIGDY NIE ZMIENIAJĄ LICZB. To jest reguła nadrzędna całej tej warstwy i stoi
 * w trzech miejscach: tu, w prompcie asystenta i w opisie narzędzia. Newsy trafiają do
 * kontekstu i ryzyk — „napastnik kontuzjowany, warto to wziąć pod uwagę" — a procent przy
 * typie zostaje ten, który policzył model. Inaczej cała mierzalność serwisu pęka: typ,
 * którego liczba zależy od tego, co AI wyczytało z sieci, nie da się ani rozliczyć wobec
 * normy, ani powtórzyć.
 *
 * KAŻDY FAKT ZE ŹRÓDŁEM I DATĄ. Bez tego użytkownik nie odróżni newsa od halucynacji,
 * a my — przy reklamacji. Streszczamy, nie cytujemy: prawa autorskie.
 *
 * Wyszukanie robi model z wbudowanym narzędziem internetowym (u każdego dostawcy inaczej,
 * patrz `searchWeb`), a nie zewnętrzne API wyszukiwarki — bez nowego klucza i nowej umowy.
 * Wynik jest już streszczeniem; asystent tylko wplata je w odpowiedź.
 *
 * „Tylko piłka nożna" w poleceniu nie jest ozdobą: pierwsze wyszukanie o „Legii Warszawa"
 * przyniosło kontuzję koszykarza z sekcji koszykówki tego samego klubu.
 */

const PROMPT = {
	pl: (q) =>
		`Znajdź NAJNOWSZE wiadomości (ostatnie 7 dni) o PIŁCE NOŻNEJ na temat: ${q}.\n` +
		'Tylko piłka nożna — pomiń inne sekcje klubu (koszykówka, siatkówka itd.).\n' +
		'Interesują mnie wyłącznie rzeczy istotne przed meczem: kontuzje i powroty, zawieszenia, przewidywany skład, zmiana trenera, transfery, atmosfera w klubie, sprawy dyscyplinarne.\n' +
		'Napisz 3–6 krótkich punktów po polsku. Każdy punkt: jeden fakt, data publikacji w nawiasie, bez cytowania — własnymi słowami.\n' +
		'NIE podawaj kursów, typów, „pewniaków" ani żadnych wskazówek dotyczących zakładów.\n' +
		'Jeśli nie ma nic świeżego, napisz jedno zdanie: „Brak istotnych wiadomości z ostatnich dni."',
	en: (q) =>
		`Find the LATEST FOOTBALL (soccer) news (last 7 days) about: ${q}.\n` +
		'Football only — ignore other sections of the club (basketball, volleyball etc.).\n' +
		'I only care about things that matter before a match: injuries and returns, suspensions, expected line-up, manager change, transfers, mood at the club, disciplinary matters.\n' +
		'Write 3–6 short bullet points in English. Each: one fact, publication date in brackets, no quoting — in your own words.\n' +
		'Do NOT give odds, tips, "sure things" or any betting guidance.\n' +
		'If there is nothing recent, write one sentence: "No significant news from the last few days."',
};

/**
 * @param {{ query: string, language: 'pl'|'en' }} input
 * @returns {Promise<{ summary: string, sources: Array<{title: string, url: string}>, meta: object }>}
 */
export async function searchNews({ query, language }) {
	const prompt = (PROMPT[language] || PROMPT.pl)(String(query || '').slice(0, 200));
	const { text, sources, meta } = await searchWeb({ model: MODEL_CHAT, prompt });
	return { summary: text, sources, meta };
}
