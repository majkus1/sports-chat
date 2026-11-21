/**
 * Pomiar okien zakupu po stronie przeglądarki: wyświetlenie i kliknięcie.
 *
 * NIC NIE ZAPISUJEMY NA URZĄDZENIU. Wyświetlenie liczy się raz na miejsce na wczytanie aplikacji
 * (zbiór w pamięci, ginie z odświeżeniem), a nie raz na dzień z kluczem w `sessionStorage` —
 * zapis czegokolwiek na urządzeniu w celu statystyki wymagałby zgody jak analityka (art. 5 ust. 3
 * dyrektywy o prywatności, art. 173 Prawa komunikacji elektronicznej). Licznik jest przez to
 * trochę hojniejszy dla wyświetleń, ale porównanie miejsc między sobą zostaje uczciwe.
 *
 * `sendBeacon`, bo kliknięcie zwykle od razu przenosi na inną stronę — zwykły `fetch` bywa wtedy
 * przerywany i kliknięcie by przepadło.
 */

const pokazane = new Set();

export function trackUpsell(placement, event) {
	if (typeof window === 'undefined' || !placement) return;
	const body = JSON.stringify({ placement, event });
	try {
		if (navigator.sendBeacon?.('/api/upsell/event', new Blob([body], { type: 'application/json' }))) return;
	} catch {
		/* przeglądarka bez beacona — spróbujemy zwykłym żądaniem */
	}
	fetch('/api/upsell/event', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
		keepalive: true,
	}).catch(() => {});
}

/** Wyświetlenie — raz na miejsce na wczytanie aplikacji. */
export function trackUpsellView(placement) {
	if (pokazane.has(placement)) return;
	pokazane.add(placement);
	trackUpsell(placement, 'view');
}
