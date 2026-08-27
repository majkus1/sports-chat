/**
 * Odmiana rzeczownika przez liczebnik po polsku.
 *
 * Limity planów pochodzą z konfiguracji i wolno je zmienić w każdej chwili, więc tekst
 * musi się do nich dostosować. Wpisane na sztywno „5 analizy" jest błędem gramatycznym,
 * a „5 analiz(y)" wygląda jak niedokończona strona — obie wersje kosztują zaufanie
 * w pierwszym zdaniu, które ktoś czyta.
 *
 * Zasada polska: 1 → forma pojedyncza; 2–4 → forma mnoga „mianownikowa”; 5–21, a także
 * końcówki 12–14 → forma dopełniaczowa.
 */
export function odmien(liczba, [pojedyncza, mnoga, dopelniacz]) {
	const n = Math.abs(liczba);
	if (n === 1) return pojedyncza;

	const dziesiatki = n % 100;
	const jednosci = n % 10;

	// Nastki (12, 13, 14, 112…) idą do dopełniacza mimo końcówki 2–4.
	if (dziesiatki >= 12 && dziesiatki <= 14) return dopelniacz;
	if (jednosci >= 2 && jednosci <= 4) return mnoga;
	return dopelniacz;
}

export const ANALIZY = ['analiza', 'analizy', 'analiz'];
export const RAPORTY = ['raport', 'raporty', 'raportów'];
export const PYTANIA = ['pytanie', 'pytania', 'pytań'];
export const KREDYTY = ['kredyt', 'kredyty', 'kredytów'];
export const DNI = ['dzień', 'dni', 'dni'];
