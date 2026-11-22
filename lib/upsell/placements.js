/**
 * Miejsca, w których serwis proponuje zakup „w chwili wartości" (etap C, 21.11.2026).
 *
 * DLACZEGO TAK. Do 21.11.2026 okno zakupu pojawiało się praktycznie tylko po wyczerpaniu limitu —
 * czyli w chwili frustracji, nie wartości. Jedyne konto z zewnątrz, które doszło do płatności,
 * zrobiło to minutę po rejestracji, z cennika, i odpadło na stronie Stripe'a. Te miejsca stoją tam,
 * gdzie użytkownik właśnie zobaczył, że coś działa (typ z jego analizy wszedł), albo że czegoś
 * nie widzi (zablokowany kupon), albo że zaraz coś straci (koniec próby, ~80% puli).
 *
 * Plik jest wspólny dla przeglądarki i serwera: lista dozwolonych miejsc chroni licznik przed
 * dopisywaniem dowolnych nazw z zewnątrz, a etykiety po polsku idą do widoku w panelu admina.
 */

export const UPSELL_PLACEMENTS = {
	trial_near_limit: 'Próba: ok. 80% puli',
	trial_last_day: 'Próba: ostatni dzień',
	analysis_win: 'Typ z Twojej analizy wszedł',
	value_list: 'Wyższe kursy: pełna lista w Pro',
	coupon_days3: 'Kupon 3-dniowy za kłódką',
	coupon_days5: 'Kupon 5-dniowy za kłódką',
	coupon_live: 'Kupon live za kłódką',
};

/**
 * Zdarzenia w liczniku. `view` i `click` wysyła przeglądarka, `checkout` (powstała sesja Stripe'a)
 * i `purchase` (opłacona) — serwer, z metadanych zakupu. Dzięki dwóm ostatnim widać nie tylko,
 * co klikają, ale co faktycznie sprzedaje.
 */
export const CLIENT_EVENTS = ['view', 'click'];
export const UPSELL_EVENTS = [...CLIENT_EVENTS, 'checkout', 'purchase'];

/** Pole licznika w kolekcji `upsellstats` dla zdarzenia. */
export const EVENT_FIELD = { view: 'views', click: 'clicks', checkout: 'checkouts', purchase: 'purchases' };

export function isPlacement(value) {
	return typeof value === 'string' && Object.hasOwn(UPSELL_PLACEMENTS, value);
}

/**
 * Adres cennika z wyróżnioną przepustką i źródłem do pomiaru (`?z=`).
 * `oferta` — który bilet cennik ma podświetlić i przewinąć do niego.
 */
export function pricingHref(placement, oferta = 'pro_week') {
	const params = new URLSearchParams({ oferta });
	if (isPlacement(placement)) params.set('z', placement);
	return `/cennik?${params.toString()}`;
}
