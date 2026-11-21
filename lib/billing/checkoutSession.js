/**
 * Parametry sesji Stripe Checkout — czysta funkcja, żeby test pilnował, że nic nie blokuje BLIK-a
 * ani Przelewy24 (`test/billing/checkoutSession.test.mjs`).
 *
 * WARUNKI BLIK I PRZELEWY24 W CHECKOUCIE (dokumentacja Stripe'a, stan na 11.2026):
 *   - waluta PLN (BLIK wyłącznie PLN, P24 — PLN albo EUR); kwota w groszach, liczbą całkowitą,
 *   - `mode: 'payment'` — żadna z nich nie działa w subskrypcji,
 *   - BEZ `setup_future_usage` (ani w `payment_intent_data`) — zapis metody na przyszłość wyklucza
 *     obie, bo nie da się ich obciążyć ponownie bez klienta; Checkout po cichu je wtedy ukrywa,
 *   - BEZ sztywnego `payment_method_types` — lista w kodzie rozjeżdża się z panelem, a metoda
 *     wyłączona w panelu i wpisana tutaj kończy się błędem tworzenia sesji,
 *   - metody muszą być WŁĄCZONE w panelu Stripe (Ustawienia → Metody płatności) — kod tego nie
 *     załatwi; patrz `lib/billing/paymentMethods.js`.
 * `customer_creation` zostaje domyślne (`if_required`): przy płatności jednorazowej Stripe nie
 * zakłada klienta, więc nie ma dodatkowego pola ani kroku. E-mail podajemy z konta — P24 go
 * wymaga, a bez niego kupujący musiałby go wpisać drugi raz.
 *
 * @param {{ item: object, email?: string|null, userId: string, locale: 'pl'|'en', appUrl: string,
 *   consentId: string, termsVersion: string, source?: string|null }} p
 */
export function checkoutSessionParams({ item, email, userId, locale, appUrl, consentId, termsVersion, source = null }) {
	const sciezka = locale === 'en' ? 'en' : 'pl';
	return {
		// Jednorazowa, nie subskrypcja — BLIK i P24 nie obsługują płatności cyklicznych.
		mode: 'payment',
		currency: 'pln',
		/*
		 * Język strony płatności = język serwisu. Domyślne `auto` bierze język przeglądarki, więc
		 * kupujący z polskiej wersji na telefonie z angielskim systemem dostawał angielski formularz
		 * z „BLIK" i „Przelewy24" bez słowa po polsku — kolejny powód, żeby się zawahać.
		 */
		locale: sciezka,
		/*
		 * Metod płatności NIE wypisujemy i nie włączamy osobnym parametrem.
		 *
		 * `automatic_payment_methods` należy do PaymentIntents — Checkout Session odrzuca je
		 * błędem „Received unknown parameter" i nie powstaje żadna sesja (tak skończyły się dwie
		 * pierwsze próby 27.08.2026 — oświadczenia bez `sessionId` w bazie). W Checkoucie dobór
		 * metod jest domyślny: Stripe pokazuje to, co włączone w panelu dla waluty i kraju kupującego.
		 */
		customer_email: email || undefined,
		client_reference_id: String(userId),
		/*
		 * Przycisk „Zapłać" zamiast ogólnego „Kup". Drobiazg, ale strona Stripe'a to ostatni krok —
		 * tam nie ma już naszych tekstów, które tłumaczą, co się dzieje.
		 */
		submit_type: 'pay',
		line_items: [
			{
				quantity: 1,
				price_data: {
					currency: 'pln',
					// Bez katalogu produktów w Stripe: cennik żyje w kodzie i jest
					// wersjonowany razem z resztą, a zmiana ceny to jeden commit.
					product_data: { name: item.name, description: item.description },
					unit_amount: item.priceGrosze,
				},
			},
		],
		/*
		 * Metadane to jedyny most między płatnością a kontem.
		 *
		 * Webhook dostaje sesję Stripe'a, nie nasze żądanie — bez tych pól nie wiedziałby,
		 * komu i ile doładować. Trzymamy tu identyfikatory, nie dane: limit to 50 kluczy
		 * i 500 znaków na wartość.
		 */
		metadata: {
			userId: String(userId),
			...item.metadata,
			// Most w drugą stronę: z płatności w panelu Stripe'a do odebranego oświadczenia.
			consentId: String(consentId),
			termsVersion,
			// Skąd przyszedł kupujący (okno zakupu) — webhook dolicza zakup temu miejscu.
			...(source ? { source } : {}),
		},
		// Powrót w języku, w którym użytkownik kupował.
		success_url: `${appUrl}/${sciezka}/cennik?platnosc=sukces&sid={CHECKOUT_SESSION_ID}`,
		cancel_url: `${appUrl}/${sciezka}/cennik?platnosc=anulowana`,
	};
}
