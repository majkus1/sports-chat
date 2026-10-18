import { searchWeb } from '@/lib/ai';
import { MODEL_CHAT } from '@/lib/ai/config';
import { checkSpendCap, recordSpend } from '@/lib/billing/spendGuard';
import { localDate } from '@/lib/time';

/**
 * Sprawdzenie wiadomości przed publikacją płatnego kuponu (3- i 5-dniowy) — decyzja
 * właściciela z 18.10.2026.
 *
 * PO CO. Model liczy wyłącznie na wynikach: nie wie, że napastnik złamał nogę albo że trener
 * zapowiedział rezerwy przed pucharem. Przed zapisem kuponu AI z wyszukiwarką czyta wiadomości
 * z ostatnich dni o każdym typie i daje werdykt: OK albo RYZYKO z powodem. Typ z ryzykiem wypada,
 * a na jego miejsce wchodzi następny najpewniejszy — i też jest sprawdzany.
 *
 * WIADOMOŚCI NIE ZMIENIAJĄ LICZB. Procent przy typie zostaje taki, jak policzył model; AI może
 * tylko typ odrzucić. Inaczej kupon przestaje być mierzalny.
 *
 * OSTROŻNIE Z ODRZUCANIEM. Plotka, „może nie zagrać", drobny uraz rezerwowego — to OK. RYZYKO
 * tylko przy jasnym, świeżym fakcie ze źródłem, który bezpośrednio uderza w typ.
 *
 * KOSZT. Jedno wyszukanie z werdyktem na typ (~0,02–0,03 $, `searchWeb` ma limit dwóch wyszukań);
 * dziennie ok. 15–25 typów. Wydatek liczy się do dziennego progu (`spendGuard`); po jego
 * przekroczeniu kupon wychodzi bez sprawdzenia i tak jest oznaczony.
 */

/** Polecenie dla jednego typu — wyszukanie i werdykt w jednym wywołaniu. */
export function newsPrompt(leg) {
	const data = localDate(new Date(leg.kickoff));
	return (
		`Mecz piłkarski: ${leg.homeName} – ${leg.awayName} (${data}${leg.league ? `, ${leg.league}` : ''}).\n` +
		`Sprawdzany typ: ${leg.selection}.\n\n` +
		'Znajdź NAJNOWSZE wiadomości (ostatnie 7 dni) o PIŁCE NOŻNEJ na temat obu drużyn przed tym meczem: kontuzje i zawieszenia kluczowych zawodników, przewidywany skład, zapowiedzi rotacji (np. przed meczem pucharowym), zmiana trenera, kryzys w klubie, ryzyko przełożenia meczu. Tylko piłka nożna — pomiń inne sekcje klubu.\n\n' +
		'Oceń, czy jest POWAŻNY sygnał przeciwko temu typowi. RYZYKO tylko wtedy, gdy jasny, świeży fakt ze źródła bezpośrednio uderza w typ, np.:\n' +
		'- drużyna, na którą stawia typ, gra bez najlepszego strzelca, kapitana albo kilku podstawowych graczy;\n' +
		'- trener tej drużyny zapowiedział rezerwowy skład albo szeroką rotację;\n' +
		'- przy typie „X strzeli gola": X gra bez swoich głównych napastników;\n' +
		'- przy typie na remis albo wygraną rywala tej drużyny: rywal wraca do pełnego składu po długiej przerwie liderów.\n' +
		'Plotka, „może nie zagrać", uraz rezerwowego albo brak wiadomości — to OK.\n\n' +
		'Odpowiedz krótko: 1–3 punkty z najważniejszymi faktami (z datą), a w OSTATNIEJ linii dokładnie jedno z dwóch:\n' +
		'WERDYKT: OK\n' +
		'WERDYKT: RYZYKO — <powód po polsku, najwyżej 12 słów>\n' +
		'Nie podawaj kursów, typów ani wskazówek dotyczących zakładów.'
	);
}

/** Werdykt z ostatniej linii odpowiedzi. Bez czytelnego werdyktu — `unknown` (typ zostaje). */
export function parseVerdict(text) {
	const linie = String(text || '')
		.split('\n')
		.map((l) => l.replace(/[*_`#>]/g, '').trim())
		.filter(Boolean);
	for (let i = linie.length - 1; i >= 0; i--) {
		const m = linie[i].match(/WERDYKT\s*:\s*(OK|RYZYKO)\b\s*[—–:-]?\s*(.*)$/i);
		if (m) {
			const ryzyko = m[1].toUpperCase() === 'RYZYKO';
			return { verdict: ryzyko ? 'risk' : 'ok', reason: ryzyko ? m[2].trim().slice(0, 140) || null : null };
		}
	}
	return { verdict: 'unknown', reason: null };
}

/**
 * Sprawdza jeden typ. Błąd wyszukiwania nie wywraca kuponu — typ zostaje jako niesprawdzony.
 *
 * @returns {Promise<{ verdict: 'ok'|'risk'|'unknown', reason: string|null, sources: Array<{title: string, url: string}> }>}
 */
export async function checkLegNews(leg, { search = searchWeb } = {}) {
	try {
		const { text, sources, meta } = await search({ model: MODEL_CHAT, prompt: newsPrompt(leg), maxTokens: 1500 });
		await recordSpend(meta?.costUsd).catch(() => {});
		return { ...parseVerdict(text), sources: (sources || []).slice(0, 3).map((s) => ({ title: s.title, url: s.url })) };
	} catch (error) {
		console.warn(`[coupons] wiadomości ${leg.homeName} – ${leg.awayName}:`, error.message);
		return { verdict: 'unknown', reason: null, sources: [] };
	}
}

/** Czy dziś stać nas jeszcze na sprawdzanie (dzienny próg wydatków na AI). */
export async function newsBudgetOk() {
	try {
		return (await checkSpendCap()).allowed;
	} catch {
		return true;
	}
}
