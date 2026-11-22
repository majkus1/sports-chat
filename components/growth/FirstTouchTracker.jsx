'use client';

import { useEffect } from 'react';
import { CONSENT_EVENT } from '@/lib/consent';
import { recordFirstTouch, syncFirstTouchStorage } from '@/lib/growth/firstTouch';

/**
 * Zapamiętuje pierwsze wejście (źródło rejestracji) — zasady i podstawa prawna w `lib/growth/firstTouch.js`.
 *
 * Stoi w układzie strony, więc montuje się raz na pełne załadowanie, przy pierwszej stronie, na którą
 * ktoś wszedł. Nic nie renderuje i nic nie wysyła: dane idą na serwer wyłącznie razem z formularzem
 * rejestracji. Zmiana zgody (baner, stopka) od razu zapisuje albo kasuje kopię w `sessionStorage`.
 */
export default function FirstTouchTracker() {
	useEffect(() => {
		recordFirstTouch();
		window.addEventListener(CONSENT_EVENT, syncFirstTouchStorage);
		return () => window.removeEventListener(CONSENT_EVENT, syncFirstTouchStorage);
	}, []);
	return null;
}
