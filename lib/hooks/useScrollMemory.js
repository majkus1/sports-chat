'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { isReturnVisit, parseScrollY } from '@/lib/urlState';

/**
 * Pozycja przewinięcia listy, która ładuje się dopiero po zapytaniu.
 *
 * Przeglądarka sama przywraca przewinięcie po „Wstecz", ale robi to od razu — na stronie,
 * której treść jeszcze nie przyszła (szkielet, kręciołek). Za krótki dokument przycina pozycję
 * i po dociągnięciu danych użytkownik ląduje na górze listy, z której przed chwilą wszedł
 * w mecz. Tu pamiętamy pozycję sami (sessionStorage, osobno dla każdego adresu — z parametrami,
 * więc każda zakładka ma swoją) i przywracamy ją raz, gdy strona powie, że treść jest gotowa.
 *
 * Tylko po powrocie albo odświeżeniu — wejście z menu zawsze zaczyna od góry (`isReturnVisit`).
 * Ruch użytkownika (kółko, dotyk, klawisz) przerywa przywracanie: nie przeciągamy strony
 * pod palcem kogoś, kto już sam przewija.
 */

const PREFIX = 'przewiniecie:';
/** Ile razy próbujemy dojechać, gdy dokument jest jeszcze za krótki (doczytują się sekcje niżej). */
const PROBY = 20;
const ODSTEP_MS = 100;
/** Zdarzenia, po których przewija już użytkownik, a nie my. */
const RUCH = ['wheel', 'touchstart', 'keydown', 'mousedown'];

/** Ostatnie „Wstecz"/„Dalej" — zapamiętane w chwili zdarzenia, bo strona montuje się później. */
let ostatniPowrot = null;
/** Pierwsze zamontowanie w tym dokumencie — tylko ono może być odświeżeniem tej strony. */
let pierwszyMontaz = true;

if (typeof window !== 'undefined') {
	window.addEventListener('popstate', () => {
		ostatniPowrot = { href: window.location.href, at: Date.now() };
	});
}

const klucz = () => `${PREFIX}${window.location.pathname}${window.location.search}`;

function odczytaj() {
	try {
		return parseScrollY(window.sessionStorage.getItem(klucz()));
	} catch {
		return null; // tryb prywatny, zablokowane dane witryny — po prostu bez przywracania
	}
}

function zapisz(y) {
	try {
		window.sessionStorage.setItem(klucz(), String(y));
	} catch {
		/* jw. — pamięć przewinięcia jest wygodą, nie warunkiem działania strony */
	}
}

function nawigacjaDokumentu() {
	try {
		const [wpis] = window.performance.getEntriesByType('navigation');
		return wpis ? { type: wpis.type, name: wpis.name } : null;
	} catch {
		return null;
	}
}

/**
 * @param {boolean} enabled czy ta strona w ogóle pamięta przewinięcie
 * @param {boolean} ready   treść, od której zależy wysokość strony, jest już na ekranie
 */
export function useScrollMemory(enabled, ready) {
	const zywy = useRef(false);
	/** `undefined` — jeszcze nie rozstrzygnięte; `null` — nie przywracamy; liczba — dokąd. */
	const cel = useRef(undefined);
	const zalatwione = useRef(false);

	/*
	 * Flaga życia ustawiana w efekcie układu: jego sprzątanie przy odmontowaniu biegnie jeszcze
	 * w fazie zmian DOM, przed przewinięciem na górę nowej strony. Dzięki temu zdarzenia `scroll`
	 * wywołane samym przejściem nie nadpiszą zapamiętanej pozycji zerem.
	 */
	useLayoutEffect(() => {
		zywy.current = true;
		return () => {
			zywy.current = false;
		};
	}, []);

	useEffect(() => {
		if (!enabled) return undefined;

		/*
		 * Decyzja raz na egzemplarz i przed pierwszym zapisem: zdarzenia z ładowania (przycięta
		 * wysokość) nie mogą jej zamazać. Ref przeżywa podwójne montowanie trybu ścisłego,
		 * więc w dev przywracanie działa tak samo jak na produkcji.
		 */
		if (cel.current === undefined) {
			const powrot = isReturnVisit({
				href: window.location.href,
				now: Date.now(),
				lastPop: ostatniPowrot,
				firstMount: pierwszyMontaz,
				navigation: nawigacjaDokumentu(),
			});
			pierwszyMontaz = false;
			// Powrót zużyty — wejście z menu chwilę później nie może go odziedziczyć.
			if (powrot) ostatniPowrot = null;
			cel.current = powrot ? odczytaj() : null;
		}

		let klatka = 0;
		const naPrzewiniecie = () => {
			if (klatka) return;
			klatka = window.requestAnimationFrame(() => {
				klatka = 0;
				if (zywy.current) zapisz(Math.round(window.scrollY));
			});
		};
		window.addEventListener('scroll', naPrzewiniecie, { passive: true });
		return () => {
			window.cancelAnimationFrame(klatka);
			window.removeEventListener('scroll', naPrzewiniecie);
		};
	}, [enabled]);

	useEffect(() => {
		if (!enabled || !ready || zalatwione.current) return undefined;
		const y = cel.current;
		if (y == null) {
			zalatwione.current = true;
			return undefined;
		}

		let licznik = 0;
		let timer = 0;
		const sprzatnij = () => {
			window.clearTimeout(timer);
			RUCH.forEach((typ) => window.removeEventListener(typ, przerwij));
		};
		const koniec = () => {
			zalatwione.current = true;
			sprzatnij();
		};
		function przerwij() {
			koniec();
		}
		const krok = () => {
			if (!zywy.current) return;
			const max = document.documentElement.scrollHeight - window.innerHeight;
			window.scrollTo(0, Math.min(y, Math.max(0, max)));
			// Dojechaliśmy albo dalej się nie da — reszta strony nie urośnie już do tej wysokości.
			if (max >= y || ++licznik >= PROBY) koniec();
			else timer = window.setTimeout(krok, ODSTEP_MS);
		};

		RUCH.forEach((typ) => window.addEventListener(typ, przerwij, { passive: true }));
		// Po malowaniu: treść, na którą czekaliśmy, musi już stać w dokumencie.
		timer = window.setTimeout(krok, 0);
		return sprzatnij;
	}, [enabled, ready]);
}
