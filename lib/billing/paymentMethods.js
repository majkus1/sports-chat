/**
 * Metody płatności pokazywane w serwisie PRZED przejściem do Stripe'a (cennik, okno oświadczenia).
 *
 * STAŁA LISTA, NIE ODCZYT Z PANELU. Checkout sam dobiera metody do waluty i kraju (`checkoutSession.js`
 * celowo nie ma `payment_method_types`), ale kupujący musi wiedzieć, czym zapłaci, zanim kliknie
 * „Kup" — brak tej informacji to jedno z tarć, przez które odchodzi się z koszyka. Odpytywanie API
 * Stripe'a o konfigurację przy każdym wejściu na cennik byłoby wolne i kruche, więc lista jest tutaj.
 *
 * WARUNEK: każda metoda z tej listy MUSI być włączona w panelu Stripe (Settings → Payments →
 * Payment methods, konfiguracja domyślna używana przez Checkout). Wyłączenie którejś w panelu
 * wymaga usunięcia jej stąd — inaczej obiecujemy BLIK, a na stronie płatności go nie ma.
 * Kolejność = popularność w Polsce: BLIK, potem przelew przez Przelewy24, potem karta.
 */
export const PAYMENT_METHODS = [
	{ id: 'blik', label: { pl: 'BLIK', en: 'BLIK' } },
	{ id: 'p24', label: { pl: 'Przelewy24', en: 'Przelewy24' } },
	{ id: 'card', label: { pl: 'Karta', en: 'Card' } },
];

export function paymentMethodLabels(locale) {
	const l = locale === 'en' ? 'en' : 'pl';
	return PAYMENT_METHODS.map((m) => m.label[l]);
}
