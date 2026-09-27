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
/*
 * 2026-09-16: do polityki prywatności doszła analityka (Google Analytics za zgodą).
 * `TERMS_VERSION` zostaje — regulamin się nie zmienił, więc nie ma czego ponownie akceptować;
 * o nowy zakres zgód pyta baner przez podbicie `CONSENT_VERSION` w lib/consent.js.
 */
/*
 * 2026-09-27: regulamin doprecyzowuje, od kiedy liczy się okres limitów planu płatnego
 * (30 dni od zakupu, nie miesiąc kalendarzowy). Zmiana na korzyść użytkownika i zgodna z tym,
 * jak plan jest sprzedawany („dostęp na 30 dni"), więc bez ponownej akceptacji.
 */
export const UPDATED_AT = '2026-09-27';

/**
 * Wersja regulaminu zapisywana przy koncie w chwili akceptacji.
 *
 * Data, a nie kolejny numer: od razu widać, o który dokument chodzi, a przy sporze liczy się
 * właśnie to, jaka treść obowiązywała danego dnia.
 */
export const TERMS_VERSION = '2026-08-26';
