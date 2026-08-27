/**
 * Statusy meczu w języku interfejsu.
 *
 * API-Football zwraca `status.long` wyłącznie po angielsku („Match Postponed"), a my
 * wstawialiśmy tę wartość wprost do polskiego interfejsu. Kody są stałe i udokumentowane,
 * więc tłumaczymy po kodzie, a angielski opis zostaje jedynie jako awaryjny.
 */

/** Kod z API → klucz w messages/*.json. */
export const STATUS_LABEL_KEYS = {
	TBD: 'status_tbd',
	NS: 'status_ns',
	'1H': 'status_1h',
	HT: 'status_ht',
	'2H': 'status_2h',
	ET: 'status_et',
	BT: 'status_bt',
	P: 'status_p',
	SUSP: 'status_susp',
	INT: 'status_int',
	FT: 'status_ft',
	AET: 'status_aet',
	PEN: 'status_pen',
	PST: 'status_pst',
	CANC: 'status_canc',
	ABD: 'status_abd',
	AWD: 'status_awd',
	WO: 'status_wo',
	LIVE: 'status_live',
};

/**
 * @param {{ code?: string, label?: string }} status znormalizowany status meczu
 * @param {(key: string) => string} t funkcja tłumacząca z przestrzeni `common`
 * @returns {string} opis w języku interfejsu, a przy nieznanym kodzie — opis z API
 */
export function statusLabel(status, t) {
	const key = STATUS_LABEL_KEYS[status?.code];
	if (!key) return status?.label || status?.code || '';

	const translated = t(key);
	// next-intl przy braku klucza zwraca sam klucz — wtedy lepszy jest opis z API.
	return translated === key ? status?.label || key : translated;
}

/**
 * Czy dla tego meczu ma sens generowanie analizy.
 *
 * Mecz odwołany albo przerwany bez wznowienia już się nie odbędzie, więc analiza byłaby
 * prognozą zdarzenia, które nie nastąpi — i zużyłaby limit użytkownika.
 */
export function canAnalyze(status) {
	return !status?.isCancelled;
}
