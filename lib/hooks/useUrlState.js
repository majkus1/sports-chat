'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isSearchParam, MAX_SEARCH_PARAM, mergeSearch, paramValue, readParam } from '@/lib/urlState';

/**
 * Zmiana parametrów bieżącego adresu bez nawigacji i bez nowego wpisu w historii.
 *
 * Natywne `history.replaceState`, nie `router.replace`. Strony z `[locale]` są renderowane
 * dynamicznie, więc `router.replace` przy każdym kliknięciu zakładki szedłby do serwera
 * po nowy RSC strony, a `useSearchParams` zmieniałby się dopiero po odpowiedzi — pigułka
 * zapalałaby się z opóźnieniem. Next (od 14.1) łata `history.replaceState`: wywołanie
 * aktualizuje `useSearchParams` i `usePathname` od razu, bez zapytania, i przepisuje do
 * nowego wpisu swój stan wewnętrzny — dlatego pierwszy argument to `null`. Własny obiekt
 * stanu z polem `__NA` Next by przepuścił bez synchronizacji i hook przestałby widzieć zmianę.
 *
 * Replace, nie push: przełączenie zakładki to nie nowe miejsce, a każde kliknięcie we wpisie
 * historii zamieniłoby „Wstecz" w cofanie zakładek po kolei.
 *
 * Bez przewijania: zmienia się tylko adres, strona zostaje tam, gdzie była.
 *
 * @param {Record<string, string|null|undefined>} updates `null`/`''` usuwa parametr
 */
export function replaceSearchParams(updates) {
	if (typeof window === 'undefined') return;
	const { pathname, search, hash } = window.location;
	const next = mergeSearch(search, updates);
	if (next === search) return;
	window.history.replaceState(null, '', `${pathname}${next}${hash}`);
}

/**
 * Jedna wartość widoku trzymana w parametrze adresu: `[wartość, ustaw]`.
 *
 * Odczyt z walidacją (nieznana wartość → domyślna), zapis bez wartości domyślnej w adresie,
 * pozostałe parametry nietknięte. Adres jest jedynym źródłem prawdy: przejście z menu
 * na czysty adres tej samej strony wraca do domyślnej, a „Wstecz" i odświeżenie odtwarzają
 * dokładnie to, co było widać.
 *
 * Uwaga dla nowych miejsc: `useSearchParams` na stronie renderowanej statycznie wymaga granicy
 * `<Suspense>` (inaczej build pada). Pod `app/[locale]` jest nią `loading.js` — Next owija nim
 * każdą stronę — a same strony są dziś dynamiczne (układ czyta język z nagłówków), więc adres
 * jest znany już na serwerze i HTML od razu pokazuje właściwą zakładkę. Hooka nie wolno za to
 * wkładać w komponenty spoza stron (nagłówek, panel profilu): trafiłyby na trasy bez tej granicy.
 *
 * @param {string} key nazwa parametru
 * @param {{ allowed: string[] | ((raw: string) => boolean), fallback: string }} options
 * @returns {[string, (next: string) => void]}
 */
export function useUrlState(key, { allowed, fallback }) {
	const searchParams = useSearchParams();
	const value = readParam(searchParams?.get(key) ?? null, allowed, fallback);

	const setValue = useCallback(
		(next) => replaceSearchParams({ [key]: paramValue(next, fallback) }),
		[key, fallback]
	);

	return [value, setValue];
}

/**
 * Pole wyszukiwania z frazą w adresie: `[wpisywane, ustawWpisywane, fraza]`.
 *
 * Pole reaguje na każdą literę, a adres dostaje frazę dopiero po odbiciu (`delay`) — inaczej
 * każda litera przepisywałaby adres i, tam gdzie fraza idzie do serwera, wysyłała zapytanie.
 * `fraza` to wartość z adresu (przycięta), czyli to, czego się faktycznie szuka.
 *
 * Zmiana adresu z zewnątrz (menu prowadzi na czystą listę tej samej strony) przestawia pole —
 * bez tego odbicie wpisałoby starą frazę z powrotem i odnośnik wyglądałby na martwy.
 *
 * @param {string} key nazwa parametru (zwykle `q`)
 * @param {{ delay?: number, alsoClear?: string[] }} [options] `alsoClear` — parametry zerowane
 *   razem z nową frazą (np. `page`: nowa fraza zaczyna od pierwszej strony)
 */
export function useUrlSearch(key, { delay = 400, alsoClear = [] } = {}) {
	const [query] = useUrlState(key, { allowed: isSearchParam, fallback: '' });
	const [term, setTerm] = useState(query);
	/** Ostatnia fraza zapisana z pola — odróżnia własny zapis od zmiany adresu z zewnątrz. */
	const written = useRef(query);
	const committed = query.trim();
	// Napis zamiast tablicy w zależnościach: nowa tablica przy każdym renderze zerowałaby odbicie.
	const clear = alsoClear.join(',');

	useEffect(() => {
		const fraza = term.trim().slice(0, MAX_SEARCH_PARAM);
		if (fraza === committed) return undefined;
		const timer = setTimeout(() => {
			written.current = fraza;
			const updates = { [key]: fraza || null };
			for (const k of clear ? clear.split(',') : []) updates[k] = null;
			replaceSearchParams(updates);
		}, delay);
		return () => clearTimeout(timer);
	}, [term, committed, key, delay, clear]);

	useEffect(() => {
		if (query === written.current) return;
		written.current = query;
		setTerm(query);
	}, [query]);

	return [term, setTerm, committed];
}
