import { TERMS_VERSION } from '@/lib/legal/operator';

/**
 * Oświadczenie odbierane przy każdym zakupie.
 *
 * Art. 38 pkt 13 ustawy o prawach konsumenta odbiera prawo odstąpienia przy treściach
 * cyfrowych dostarczanych natychmiast TYLKO wtedy, gdy konsument wyraźnie zażądał
 * rozpoczęcia świadczenia przed upływem terminu i został poinformowany, że w ten sposób
 * to prawo traci. Bez odebranego oświadczenia prawo odstąpienia zostaje w mocy — kupujący
 * może zużyć wszystkie kredyty i w ciągu 14 dni zażądać pełnego zwrotu.
 *
 * Treść mieszka tutaj, a nie w komponencie, bo używają jej dwie strony naraz: przeglądarka
 * wyświetla ją przy zakupie, a serwer zapisuje jej dosłowne brzmienie do bazy. Gdyby każda
 * miała własną kopię, przy pierwszej korekcie tekstu zapis przestałby odpowiadać temu,
 * co użytkownik faktycznie zobaczył — a to jedyne, co liczy się przy sporze.
 */

/**
 * Wersja oświadczenia. Świadomie ta sama co wersja regulaminu: oświadczenie odsyła do jego
 * treści, więc zmiana regulaminu zmienia też to, na co kupujący się godzi.
 */
export const CONSENT_VERSION = TERMS_VERSION;

const CONSENT = {
	pl: {
		heading: 'Zanim zapłacisz',
		// Otoczka krótka (22.11.2026): kupujący czyta oświadczenie, a nie akapit o nim. Treść
		// oświadczenia (`statement`) bez zmian — jej brzmienie trafia do bazy.
		lead: 'Dostęp ruszy od razu po zaksięgowaniu płatności.',
		statement:
			'Żądam rozpoczęcia świadczenia przed upływem 14-dniowego terminu na odstąpienie od umowy ' +
			'i przyjmuję do wiadomości, że po spełnieniu świadczenia tracę prawo odstąpienia od umowy.',
		footnote:
			'Na żądanie w ciągu 14 dni zwrócimy niewykorzystane kredyty i część ceny za niewykorzystane dni planu. ' +
			'Reklamacje rozpatrujemy niezależnie od tego oświadczenia.',
		refunds: 'Zasady zwrotów',
		confirm: 'Kupuję i płacę',
		cancel: 'Anuluj',
		required: 'Zaznacz oświadczenie, żeby przejść do płatności.',
	},
	en: {
		heading: 'Before you pay',
		lead: 'Access starts as soon as the payment clears.',
		statement:
			'I request that performance begin before the 14-day withdrawal period ends and I acknowledge ' +
			'that once the service has been performed I lose the right to withdraw from the contract.',
		footnote:
			'On request within 14 days we refund unused credits and the part of a plan’s price for the unused days. ' +
			'Complaints are handled regardless of this declaration.',
		refunds: 'Refund rules',
		confirm: 'Buy and pay',
		cancel: 'Cancel',
		required: 'Tick the declaration to continue to payment.',
	},
};

/** Treść oświadczenia w danym języku; nieznany język dostaje wersję polską. */
export function consentFor(locale) {
	return CONSENT[locale] || CONSENT.pl;
}
