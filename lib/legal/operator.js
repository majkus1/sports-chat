/**
 * Dane operatora serwisu — jedno miejsce dla regulaminu, polityki prywatności i strony kontaktu.
 *
 * Data `UPDATED_AT` pokazuje się na obu dokumentach, a `TERMS_VERSION` zapisujemy przy koncie
 * w chwili akceptacji. Zmieniając treść dokumentów, podnieś obie — bez tego nie da się wykazać,
 * którą wersję regulaminu użytkownik faktycznie zaakceptował.
 */
export const OPERATOR = {
	name: 'ML Devworks Michał Lipka',
	address: 'Rynek Główny 34 lok. 15, 31-010 Kraków',
	nip: '6762707876',
	regon: '543372505',
	email: 'office@ml-devworks.com',
	siteName: 'Czat Sportowy',
	/** Adres serwisu bez ukośnika na końcu — wchodzi też w treść dokumentów. */
	url: 'https://czatsportowy.pl',
};

/** Data ostatniej zmiany dokumentów, format ISO. */
export const UPDATED_AT = '2026-08-26';

/**
 * Wersja regulaminu zapisywana przy koncie w chwili akceptacji.
 *
 * Data, a nie kolejny numer: od razu widać, o który dokument chodzi, a przy sporze liczy się
 * właśnie to, jaka treść obowiązywała danego dnia.
 */
export const TERMS_VERSION = '2026-08-26';
