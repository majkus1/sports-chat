'use client';

import { useEffect, useState } from 'react';
import { GoogleAnalytics } from '@next/third-parties/google';
import { CONSENT_EVENT, hasConsent } from '@/lib/consent';

/**
 * Google Analytics — wyłącznie po zgodzie i wyłącznie z ustawionym identyfikatorem.
 *
 * SKRYPT NIE WCHODZI NA STRONĘ, DOPÓKI NIE MA ZGODY. To nie jest „consent mode", w którym
 * skrypt ładuje się zawsze i tylko obiecuje nie zbierać — tu bez zgody nie ma ani jednego
 * żądania do serwerów Google. Dopiero zgoda montuje komponent, a ten wstrzykuje `gtag`.
 * Ten sam wzorzec, którym `GoogleAuthButton` traktuje skrypt logowania.
 *
 * COFNIĘCIE ZGODY. Raz załadowanego skryptu nie da się wyładować, ale `gtag` honoruje
 * globalną flagę `ga-disable-<ID>`: po jej ustawieniu przestaje wysyłać cokolwiek. Odmontowanie
 * komponentu samo w sobie by nie wystarczyło — skrypt zostaje w pamięci strony.
 *
 * Nawigacja w aplikacji: `gtag` wysyła `page_view` przy pierwszym załadowaniu, a kolejne
 * przejścia między stronami łapie „pomiar rozszerzony" GA4 (zdarzenia historii przeglądarki),
 * włączony domyślnie w usłudze. Nic nie trzeba wysyłać ręcznie.
 *
 * Identyfikator przychodzi z `NEXT_PUBLIC_GA_ID`, czyli jest wklejany do paczki W CZASIE
 * BUDOWANIA — musi być w `.env` na serwerze przed `npm run build`, nie tylko przed restartem.
 * Brak identyfikatora znaczy brak analityki i ma to być cicha ścieżka, nie błąd: lokalnie
 * i na środowiskach testowych pomiaru nie chcemy.
 */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || '';

export default function Analytics() {
	const [allowed, setAllowed] = useState(false);

	useEffect(() => {
		const sync = () => {
			const zgoda = hasConsent('analytics');
			setAllowed(zgoda);
			if (GA_ID) window[`ga-disable-${GA_ID}`] = !zgoda;
		};
		sync();
		window.addEventListener(CONSENT_EVENT, sync);
		return () => window.removeEventListener(CONSENT_EVENT, sync);
	}, []);

	if (!GA_ID || !allowed) return null;
	return <GoogleAnalytics gaId={GA_ID} />;
}
