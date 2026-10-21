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
 * OSTROŻNIE Z ODRZUCANIEM. Plotka, „może nie zagrać", „prawdopodobnie bez…", drobny uraz
 * rezerwowego — to OK. RYZYKO tylko przy jasnym, świeżym fakcie ze źródłem, który bezpośrednio
 * uderza w typ. Przy wyraźnym faworycie (rynek ≥ 80%, kurs ok. 1,25 i niżej) brak jednego–dwóch
 * graczy też nie wystarcza — 20.10.2026 AI odrzuciło Romę u siebie ze Slovanem (90%) za
 * „prawdopodobny" brak dwóch pomocników, a ten sam mecz był typem dnia.
 *
 * Sprawdzamy płatne kupony i typ dnia (`lib/daily/service.js`), żeby nie przeczyły sobie nawzajem.
 *
 * KOSZT. Jedno wyszukanie z werdyktem na typ (~0,02–0,03 $, `searchWeb` ma limit dwóch wyszukań);
 * dziennie ok. 15–25 typów. Wydatek liczy się do dziennego progu (`spendGuard`); po jego
 * przekroczeniu kupon wychodzi bez sprawdzenia i tak jest oznaczony.
 */

/** Polecenie dla jednego typu — wyszukanie i werdykt w jednym wywołaniu. */
export function newsPrompt(leg) {
	const data = localDate(new Date(leg.kickoff));
	// Szansa według rynku: z kursu (kupony) albo podana wprost (typ dnia).
	const rynek = Number.isFinite(leg.marketProbability)
		? leg.marketProbability
		: Number.isFinite(leg.odds) && leg.odds > 1
			? 100 / leg.odds
			: null;
	const faworyt = rynek !== null && rynek >= 80;
	return (
		`Mecz piłkarski: ${leg.homeName} – ${leg.awayName} (${data}${leg.league ? `, ${leg.league}` : ''}).\n` +
		`Sprawdzany typ: ${leg.selection}.${faworyt ? ` To wyraźny faworyt — rynek daje mu ok. ${Math.round(rynek)}%.` : ''}\n\n` +
		'Znajdź NAJNOWSZE wiadomości (ostatnie 7 dni) o PIŁCE NOŻNEJ na temat obu drużyn przed tym meczem: kontuzje i zawieszenia kluczowych zawodników, przewidywany skład, zapowiedzi rotacji (np. przed meczem pucharowym), zmiana trenera, kryzys w klubie, ryzyko przełożenia meczu. Tylko piłka nożna — pomiń inne sekcje klubu.\n\n' +
		'Oceń, czy jest POWAŻNY sygnał przeciwko temu typowi. RYZYKO tylko wtedy, gdy jasny, świeży fakt ze źródła bezpośrednio uderza w typ, np.:\n' +
		'- drużyna, na którą stawia typ, gra bez najlepszego strzelca, kapitana albo kilku podstawowych graczy;\n' +
		'- trener tej drużyny zapowiedział rezerwowy skład albo szeroką rotację;\n' +
		'- przy typie „X strzeli gola": X gra bez swoich głównych napastników;\n' +
		'- przy typie na remis albo wygraną rywala tej drużyny: rywal wraca do pełnego składu po długiej przerwie liderów.\n' +
		'Plotka, „może nie zagrać", „prawdopodobnie bez…", „pod znakiem zapytania", uraz rezerwowego albo brak wiadomości — to OK.\n' +
		(faworyt
			? 'Przy wyraźnym faworycie brak jednego–dwóch zawodników to OK; RYZYKO tylko przy potwierdzonym braku kilku podstawowych graczy, najlepszego strzelca albo bramkarza, albo przy zapowiedzianym rezerwowym składzie.\n\n'
			: '\n') +
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

/**
 * Jeden werdykt na mecz i typ — wspólny dla kuponów i typu dnia.
 *
 * Wyszukiwanie w sieci nie jest deterministyczne: 20.10.2026 kupon 3-dniowy odrzucił Romę
 * ze Slovanem, a 5-dniowy złożony półtorej godziny później ją przyjął — i czytelnik widział
 * dwa sprzeczne werdykty o tym samym meczu. Pierwszy werdykt obowiązuje więc przez 12 godzin
 * dla wszystkich (i kosztuje raz). Niesprawdzone (błąd wyszukiwania) nie trafiają do pamięci,
 * żeby następna próba mogła się udać.
 */
const WERDYKT_TTL_MS = 12 * 3600_000;
const werdykty = new Map();

export function verdictKey(leg) {
	return `${leg.fixtureId ?? `${leg.homeName}–${leg.awayName}`}:${leg.selection}`;
}

/** Zapisany werdykt bez nowego wyszukiwania (kupon live: tylko to, co już sprawdzono). */
export function peekVerdict(leg, now = Date.now()) {
	const zapisany = werdykty.get(verdictKey(leg));
	return zapisany && zapisany.wygasa > now ? zapisany.werdykt : null;
}

export async function checkLegNewsShared(leg, { check = checkLegNews, now = Date.now() } = {}) {
	const klucz = verdictKey(leg);
	const zapisany = werdykty.get(klucz);
	if (zapisany && zapisany.wygasa > now) return zapisany.werdykt;
	const werdykt = await check(leg);
	if (werdykt.verdict !== 'unknown') werdykty.set(klucz, { werdykt, wygasa: now + WERDYKT_TTL_MS });
	return werdykt;
}

/** Czy dziś stać nas jeszcze na sprawdzanie (dzienny próg wydatków na AI). */
export async function newsBudgetOk() {
	try {
		return (await checkSpendCap()).allowed;
	} catch {
		return true;
	}
}
