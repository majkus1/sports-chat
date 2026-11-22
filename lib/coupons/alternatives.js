import { buildCoupon, couponPool } from '@/lib/coupons/build';
import {
	CUSTOM_LEGS,
	CUSTOM_ODDS,
	customAccept,
	customOdds,
	customPrecheck,
	customRules,
	minLegsFor,
	parseCustomParams,
	sameLegs,
	windowOpen,
} from '@/lib/coupons/custom';

/**
 * Kreator kuponu — PROPOZYCJE przy „nie da się" (część czysta; pula i dziennik: `customService.js`).
 *
 * DLACZEGO. 4.11.2026 nowe konto w okresie próbnym złożyło jeden kupon, dostało „nie da się"
 * i więcej nie wróciło. Dziennik użycia ma ślad z 18:03 (0,097 USD za wiadomości — kupon powstał,
 * AI odrzuciło typ i zabrakło zastępstwa), ale nie ustawienia. Na danych z dziennika prognoz najbliżej
 * pasuje „najbliższe 24 h, ok. 2,5, najwyżej 5 meczów": jedyny zestaw to 5 typów (2,69), a bez
 * któregokolwiek z nich nie ma drugiego. Tego samego wieczoru „najbliższe 3 dni, ok. 2,5" dawało
 * kupon z 3 typów, a „24 h, ok. 2,0" — z 4. Zamiast rady „spróbuj poszerzyć godziny" kreator od razu
 * pokazuje taki działający wariant z zapowiedzią kuponu i przyjmuje go jednym kliknięciem.
 *
 * ZASADY JAKOŚCI ZOSTAJĄ. Propozycja to INNE USTAWIENIA kreatora, nie inne zasady: każdy wariant
 * przechodzi `parseCustomParams` i `customPrecheck`, a zapowiedź składa `buildCoupon` — ta sama pula
 * (`legOddsFit`: kurs 1,05–1,60 i typ potwierdzony kursem, `legEligible`: 12:00–23:00 i godzina
 * wyprzedzenia, ligi sprawdzone) i to samo przeszukanie co kupony serwisu. Typy odrzucone przez
 * wiadomości w tej próbie i te z zapisanym werdyktem „ryzyko" (12 godzin, `peekVerdict`) w zapowiedzi
 * nie występują. Przyjęta propozycja idzie zwykłą drogą złożenia — ze sprawdzeniem wiadomości.
 *
 * KOSZT ZERO. Szukanie działa na kandydatach, którzy już są w pamięci: `buildCoupon` na kilkudziesięciu
 * typach to milisekundy, a zapowiedź nie sprawdza wiadomości (AI płacimy dopiero za wariant, który
 * użytkownik wybierze). Ile najwyżej wariantów przeliczamy — `ALT_MAX_TRIES`.
 *
 * „NAJBLIŻSZE". Każda zmiana ma koszt (`KOSZT_*`), wariant to jedna albo dwie zmiany, przeglądamy od
 * najtańszego. Kurs łączny to główna intencja użytkownika, więc zmiana kursu kosztuje najwięcej (3 za
 * stopień), godziny 1–3 (szerzej o krok taniej niż inny dzień), ligi 2, liczba meczów 1 za mecz,
 * „bez meczów z kuponów serwisu" 1. Wariant, który zawiera wszystkie zmiany już przyjętej propozycji
 * i coś jeszcze (np. „3 dni i 5 meczów", gdy działa samo „3 dni"), nie jest pokazywany — to ta sama rada,
 * tylko droższa; tak samo wariant z tymi samymi typami co wcześniejsza propozycja i trzecia propozycja
 * zmieniająca to samo pole (po „24 h" i „jutro" nie pokazujemy jeszcze „3 dni" — lepiej inna droga).
 */

/** Najwyżej tyle propozycji na karcie — więcej to już formularz, nie podpowiedź. */
export const ALT_MAX = 3;
/**
 * Bezpiecznik czasu: przy 5 oknach, 3 kursach, 4 liczbach meczów i dwóch przełącznikach par zmian jest
 * ok. 60; po kolejności kosztów trzy propozycje znajdują się zwykle w pierwszych kilkunastu.
 */
export const ALT_MAX_TRIES = 40;
/** Ile propozycji najwyżej zmienia te same pola. */
const ALT_SAME_FIELDS = 2;

/** Kolejne szersze okna i ich koszt — od wybranego okna (klucz) do proponowanego. */
const KOSZT_OKNA = {
	evening: { today: 1, h24: 2, tomorrow: 3, days3: 3 },
	today: { h24: 1, tomorrow: 2, days3: 3 },
	tomorrow: { days3: 2, today: 2 },
	h24: { days3: 2, tomorrow: 2 },
	days3: {},
};
const KOSZT_LIG = 2;
const KOSZT_PUBLIKOWANYCH = 1;
const KOSZT_MECZU = 1;
const KOSZT_KURSU = 3;

/** Pojedyncze zmiany ustawień — każda z polem, nową wartością i kosztem. */
function zmiany(params, now) {
	const out = [];
	for (const [okno, koszt] of Object.entries(KOSZT_OKNA[params.window] || {})) {
		if (windowOpen(okno, now)) out.push({ field: 'window', to: okno, cost: koszt });
	}
	if (params.leagues?.length) out.push({ field: 'leagues', to: [], cost: KOSZT_LIG });
	if (params.skipPublished) out.push({ field: 'skipPublished', to: false, cost: KOSZT_PUBLIKOWANYCH });
	for (let n = params.legs + 1; n <= CUSTOM_LEGS.max; n++) out.push({ field: 'legs', to: n, cost: (n - params.legs) * KOSZT_MECZU });
	// Tylko w dół: wyższy kurs to mniejsza szansa, a tego nikt nie prosił.
	const i = CUSTOM_ODDS.findIndex((o) => o.id === params.odds);
	for (let j = i - 1; j >= 0; j--) out.push({ field: 'odds', to: CUSTOM_ODDS[j].id, cost: (i - j) * KOSZT_KURSU });
	return out;
}

/**
 * Warianty ustawień od najbliższego: jedna albo dwie zmiany (różnych pól), poprawne według
 * `parseCustomParams` i bez „nie da się" z `customPrecheck`. Przy kursie, którego nie dociągnie wybrana
 * liczba meczów, liczba meczów idzie w górę w każdym wariancie sama (jak w kreatorze) — bez dopłaty.
 *
 * @returns {Array<{ params: object, changes: Array<{ field: string, from: any, to: any }>, cost: number }>}
 */
export function alternativeVariants(params, now = new Date()) {
	const pojedyncze = zmiany(params, now);
	const zestawy = pojedyncze.map((z) => [z]);
	for (let a = 0; a < pojedyncze.length; a++) {
		for (let b = a + 1; b < pojedyncze.length; b++) {
			if (pojedyncze[a].field !== pojedyncze[b].field) zestawy.push([pojedyncze[a], pojedyncze[b]]);
		}
	}
	const out = [];
	const widziane = new Set();
	for (const zestaw of zestawy) {
		const nowe = { ...params, leagues: [...(params.leagues || [])] };
		for (const z of zestaw) nowe[z.field] = Array.isArray(z.to) ? [...z.to] : z.to;
		const potrzeba = minLegsFor(customOdds(nowe.odds).target);
		if (nowe.legs < potrzeba) nowe.legs = potrzeba;
		const wynik = parseCustomParams(nowe);
		if (!wynik.ok || customPrecheck(wynik.params, now)) continue;
		const p = wynik.params;
		const podpis = JSON.stringify(p);
		if (widziane.has(podpis) || podpis === JSON.stringify(params)) continue;
		widziane.add(podpis);
		const changes = ['odds', 'legs', 'window', 'leagues', 'skipPublished']
			.filter((f) => JSON.stringify(p[f]) !== JSON.stringify(params[f]))
			.map((f) => ({ field: f, from: params[f], to: p[f] }));
		out.push({ params: p, changes, cost: zestaw.reduce((s, z) => s + z.cost, 0) });
	}
	// Stała kolejność przy równym koszcie: mniej zmian, potem kolejność pól jak w kreatorze.
	return out.sort((x, y) => x.cost - y.cost || x.changes.length - y.changes.length);
}

/** Zapowiedź kuponu do karty — bez pól pomocniczych (drużyny, terminarz), tylko to, co widać. */
function zapowiedz(kupon) {
	return {
		legs: kupon.legs.map((l) => ({
			fixtureId: String(l.fixtureId),
			homeName: l.homeName,
			awayName: l.awayName,
			league: l.league ?? null,
			kickoff: new Date(l.kickoff).toISOString(),
			key: l.key,
			selection: l.selection,
			odds: l.odds,
			probability: l.probability,
		})),
		totalOdds: kupon.totalOdds,
		chance: kupon.chance,
	};
}

/**
 * 1–3 działające warianty ustawień z zapowiedzią kuponu — albo pusta lista.
 *
 * @param {{ params: object, candidates: Array, now?: Date, published?: Iterable<string>, blocked?: Iterable<string>,
 *   max?: number }} input
 *   `candidates` — szeroka pula (najbliższe 3 dni, wszystkie ligi) z `couponCandidates`; `published` — mecze
 *   z kuponów serwisu (wykluczane tylko w wariantach, które dalej mają „bez meczów z kuponów serwisu");
 *   `blocked` — mecze, których żadna zapowiedź nie może użyć (odrzucone przez wiadomości, znane ryzyko)
 * @returns {Array<{ params: object, changes: Array, cost: number, preview: object, picks: { before: number, after: number } }>}
 */
export function findAlternatives({ params, candidates, now = new Date(), published = [], blocked = [], max = ALT_MAX }) {
	const zablokowane = [...blocked].map(String);
	const opublikowane = [...published].map(String);
	const wyklucz = (p) => (p.skipPublished ? [...zablokowane, ...opublikowane] : zablokowane);
	const pulaPrzed = couponPool(candidates, { now, exclude: wyklucz(params), accept: customAccept(params, now) }).length;

	const out = [];
	let proby = 0;
	for (const wariant of alternativeVariants(params, now)) {
		if (out.length >= max || proby >= ALT_MAX_TRIES) break;
		const pola = new Set(wariant.changes.map((c) => c.field));
		const tePola = (a) => a.changes.length === pola.size && a.changes.every((c) => pola.has(c.field));
		// Zawiera wszystkie zmiany już pokazanej propozycji i coś więcej — ta sama rada, tylko dalej od prośby.
		if (out.some((a) => a.changes.length < pola.size && a.changes.every((c) => pola.has(c.field)))) continue;
		// Najwyżej dwie propozycje z tym samym polem (np. „jutro" i „3 dni") — trzecia karta ma być inną drogą.
		if (out.filter(tePola).length >= ALT_SAME_FIELDS) continue;
		proby += 1;
		const accept = customAccept(wariant.params, now);
		const kupon = buildCoupon(candidates, { type: 'custom', rules: customRules(wariant.params), accept, now, exclude: wyklucz(wariant.params) });
		if (!kupon || out.some((a) => sameLegs(a.preview.legs, kupon.legs))) continue;
		const pulaPo = couponPool(candidates, { now, exclude: wyklucz(wariant.params), accept }).length;
		out.push({ ...wariant, preview: zapowiedz(kupon), picks: { before: pulaPrzed, after: pulaPo } });
	}
	return out;
}

/**
 * Ile plakietek z okna użytkownika jest w POZOSTAŁYCH ligach — do powodu „w wybranych ligach dziś nic"
 * (`customDiagnosis({ otherLeagues })`). Liczone na szerokiej puli, bez nowych zapytań.
 */
export function otherLeaguesCount(params, entries, now = new Date()) {
	if (!params.leagues?.length) return 0;
	const wOknie = customAccept({ ...params, leagues: [] }, now);
	const wLigach = customAccept(params, now);
	return (entries || []).filter((w) => wOknie(w) && !wLigach(w)).length;
}
