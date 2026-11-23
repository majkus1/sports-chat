/**
 * Orientacyjna cena w euro i dolarach — TYLKO dla wersji angielskiej.
 *
 * Płacimy wyłącznie w PLN (`lib/billing/checkoutSession.js`), a „19 zł" nic nie mówi komuś
 * z zagranicy — 23.11.2026 pierwsze konto z Google przyszło przez angielską stronę meczu.
 * Dopisek „≈ €4.50 / $5" mówi, ile to mniej więcej jest; obciążenie i tak idzie w złotych,
 * a bank kupującego sam przelicza po swoim kursie.
 *
 * Kursy stałe, zaokrąglone — to wskazówka, nie przelicznik. Zaktualizuj, gdy złoty mocno się ruszy.
 */
export const PLN_PER_EUR = 4.25;
export const PLN_PER_USD = 3.65;

/** Poniżej 20 do pół jednostki (4,50), wyżej do pełnej (23). */
function zaokraglij(x) {
	return x < 20 ? Math.round(x * 2) / 2 : Math.round(x);
}

function kwota(symbol, x) {
	return Number.isInteger(x) ? `${symbol}${x}` : `${symbol}${x.toFixed(2)}`;
}

function liczba(pln) {
	if (typeof pln === 'number') return pln;
	return Number(String(pln ?? '').replace(/\s/g, '').replace(',', '.'));
}

/** „≈ €4.50 / $5" albo pusty napis dla zera i bzdur. */
export function approxForeign(pln) {
	const n = liczba(pln);
	if (!Number.isFinite(n) || n <= 0) return '';
	return `≈ ${kwota('€', zaokraglij(n / PLN_PER_EUR))} / ${kwota('$', zaokraglij(n / PLN_PER_USD))}`;
}

/** „19 zł (≈ €4.50 / $5)" — do angielskich zdań i maili. */
export function plnEn(pln) {
	const a = approxForeign(pln);
	return a ? `${pln} zł (${a})` : `${pln} zł`;
}
