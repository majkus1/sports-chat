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
		lead:
			'Kupujesz treści cyfrowe udostępniane od razu po zaksięgowaniu płatności. ' +
			'Prawo pozwala z nich skorzystać natychmiast, ale wymaga, żebyś świadomie o to poprosił.',
		statement:
			'Żądam rozpoczęcia świadczenia przed upływem 14-dniowego terminu na odstąpienie od umowy ' +
			'i przyjmuję do wiadomości, że po spełnieniu świadczenia tracę prawo odstąpienia od umowy.',
		footnote:
			'Niewykorzystane kredyty zwracamy w całości na żądanie złożone w terminie 14 dni. ' +
			'Reklamacje rozpatrujemy niezależnie od tego oświadczenia.',
		confirm: 'Kupuję i płacę',
		cancel: 'Anuluj',
		required: 'Zaznacz oświadczenie, żeby przejść do płatności.',
	},
	en: {
		heading: 'Before you pay',
		lead:
			'You are buying digital content delivered as soon as the payment clears. ' +
			'The law lets you use it immediately, but only if you ask for that knowingly.',
		statement:
			'I request that performance begin before the 14-day withdrawal period ends and I acknowledge ' +
			'that once the service has been performed I lose the right to withdraw from the contract.',
		footnote:
			'Unused credits are refunded in full on request made within 14 days. ' +
			'Complaints are handled regardless of this declaration.',
		confirm: 'Buy and pay',
		cancel: 'Cancel',
		required: 'Tick the declaration to continue to payment.',
	},
};

/** Treść oświadczenia w danym języku; nieznany język dostaje wersję polską. */
export function consentFor(locale) {
	return CONSENT[locale] || CONSENT.pl;
}
