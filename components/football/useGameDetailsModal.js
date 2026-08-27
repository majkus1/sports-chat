'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Szczegóły meczu klikniętego w widgecie listy wyników.
 *
 * Widget żyje w iframe, więc kliknięcie meczu nie może samo otworzyć niczego w aplikacji.
 * Skrypt strony widgetu (app/api/widgets/games/route.js) przechwytuje kliknięcie i wysyła
 * do rodzica `OPEN_GAME_DETAILS`; tutaj tę wiadomość odbieramy i podnosimy okno
 * ze szczegółami meczu — już w naszym motywie, zamiast wbudowanego okna dostawcy.
 *
 * Hook jest wspólny, bo wcześniej ta obsługa istniała tylko na liście przedmeczowej
 * i live — na stronie raportu AI ten sam widget otwierał się bez odbiorcy, więc
 * kliknięcie meczu nie robiło nic.
 */
export function useGameDetailsModal() {
	const [gameId, setGameId] = useState(null);

	useEffect(() => {
		const onMessage = (event) => {
			// Widget siedzi na tym samym originie — wiadomości z innych źródeł ignorujemy.
			if (event.origin !== window.location.origin) return;
			if (event.data?.type !== 'OPEN_GAME_DETAILS') return;

			// Identyfikator trafia prosto do adresu, więc wpuszczamy wyłącznie cyfry.
			const id = String(event.data.gameId ?? '').trim();
			if (/^\d{1,12}$/.test(id)) setGameId(id);
		};

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, []);

	const close = useCallback(() => setGameId(null), []);

	return { gameId, close };
}
