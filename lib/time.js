/**
 * Czas aplikacji — jedna strefa dla wszystkiego, co dzieli mecze na dni.
 *
 * DOBA JEST POLSKA, NIE UTC. Serwer stoi w UTC, dostawca danych domyślnie też liczy dni
 * w UTC, a użytkownik patrzy na kalendarz w Warszawie. Rozjazd był widoczny gołym okiem:
 * na liście „dziś" stały mecze z jutra o 1:00 w nocy (dla UTC to jeszcze dziś), a poranny
 * mail liczył „dziś" po dacie UTC, więc mecz z 0:30 wpadał do „wczoraj". Każde miejsce,
 * które zamienia moment na datę albo datę na zakres, ma iść przez ten plik — ręczne
 * `toISOString().slice(0, 10)` to zawsze data UTC i zawsze błąd o dwie godziny.
 *
 * Wszystko przez `Intl`, bez własnej tabeli przesunięć — zmiana czasu letniego liczy
 * się sama.
 */

export const APP_TIMEZONE = 'Europe/Warsaw';

/** YYYY-MM-DD w strefie aplikacji. `offsetDays` przesuwa o pełne doby (jutro = 1). */
export function localDate(d = new Date(), offsetDays = 0) {
	const base = offsetDays ? new Date(d.getTime() + offsetDays * 86_400_000) : d;
	// `en-CA` daje ISO-podobny zapis; to jedyny powód wyboru tego locale.
	return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(base);
}

/** Północ danego dnia w strefie aplikacji, jako `Date`. */
export function localMidnight(dateStr) {
	const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
	const hour = Number(
		new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, hour: '2-digit', hour12: false }).format(utcMidnight)
	);
	// O północy UTC w strefie jest 1:00 albo 2:00 — tyle wynosi przesunięcie tego dnia.
	return new Date(utcMidnight.getTime() - (hour % 24) * 3600_000);
}

/** Godzina „18:30" w strefie aplikacji. */
export function localTime(iso) {
	return new Intl.DateTimeFormat('pl-PL', { timeZone: APP_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(
		new Date(iso)
	);
}

/**
 * Wszystkie daty (w strefie aplikacji), które obejmuje przedział czasu — do pobrania
 * terminarza dzień po dniu. Oba końce włącznie, więc mecz z 23:30 ostatniego dnia
 * nie wypada tylko dlatego, że „dzień" skończył się dwie godziny wcześniej w UTC.
 */
export function localDatesBetween(from, to) {
	const out = [];
	const koniec = localDate(new Date(to));
	for (let t = new Date(from); ; t = new Date(t.getTime() + 86_400_000)) {
		const d = localDate(t);
		out.push(d);
		if (d >= koniec) break;
	}
	return out;
}
