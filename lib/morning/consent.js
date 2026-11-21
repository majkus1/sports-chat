import crypto from 'crypto';

/**
 * Zgoda na poranny mail — wspólne dla przełącznika w panelu i pola przy rejestracji.
 *
 * Osobny plik, bo `lib/morning/service.js` ciągnie model, typ dnia i kolejkę, a rejestracja
 * potrzebuje tylko tych kilku pól. Zgoda wygląda tak samo, skąd by nie przyszła: `enabledAt`
 * dokumentuje kiedy, token pozwala wyłączyć mail jednym kliknięciem bez logowania.
 */

/** Token do wypisania — losowy, zapisywany raz przy włączeniu. */
export function newUnsubscribeToken() {
	return crypto.randomBytes(24).toString('hex');
}

/**
 * Pola do `$set` przy udzieleniu zgody.
 *
 * @param {{ locale?: string, existingToken?: string|null, now?: Date }} [options]
 *   `existingToken` — stary token zostaje, żeby odnośniki z wcześniejszych maili działały
 */
export function morningConsentSet({ locale = 'pl', existingToken = null, now = new Date() } = {}) {
	return {
		'morningEmail.enabled': true,
		'morningEmail.enabledAt': now,
		'morningEmail.locale': locale === 'en' ? 'en' : 'pl',
		'morningEmail.unsubscribeToken': existingToken || newUnsubscribeToken(),
	};
}
