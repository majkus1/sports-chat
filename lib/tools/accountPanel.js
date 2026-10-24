/**
 * Otwieranie panelu konta z dowolnego miejsca strony.
 *
 * Panel (ulubione, prywatne wiadomości, poranny mail, własna skuteczność) mieszka w nagłówku
 * i do tej pory otwierała go wyłącznie ikona konta — kafelek „Poranny mail" na stronie narzędzi
 * nie miał dokąd prowadzić, bo przełącznik nie ma własnego adresu. Zdarzenie zamiast wspólnego
 * stanu: nagłówek i kafelek nie muszą o sobie nic wiedzieć (ten sam wzór co `czat:auth`).
 *
 * Zalogowany widzi panel, gość — formularz logowania, tak samo jak po kliknięciu ikony.
 */
export const ACCOUNT_PANEL_EVENT = 'czat:account';

export function openAccountPanel() {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(new CustomEvent(ACCOUNT_PANEL_EVENT));
}
