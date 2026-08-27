/**
 * Rozbieranie strumienia Server-Sent Events po stronie przeglądarki.
 *
 * `EventSource` robi to samo, ale obsługuje wyłącznie GET, a nasze trasy strumieniowe
 * są POST-em (zmieniają stan). Zostaje czytanie ciała odpowiedzi `fetch` i własny podział
 * na ramki — bajty przychodzą w kawałkach dowolnej wielkości, więc granica ramki
 * potrafi wypaść w środku porcji danych.
 */

/**
 * Składa ramkę do wysłania. Trzymana obok parsera celowo: format zapisu i odczytu
 * to jedna umowa i nie powinny mieć dwóch niezależnych definicji.
 *
 * `JSON.stringify` nigdy nie zwraca surowej nowej linii (koduje ją jako `\n`),
 * więc dane zawsze mieszczą się w jednej linii `data:`.
 */
export function formatFrame(event, data) {
	return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Wydziela z bufora kompletne ramki.
 *
 * @returns {{ frames: string[], rest: string }} `rest` to niedokończony ogon,
 * który trzeba dopisać do początku następnej porcji.
 */
export function splitFrames(buffer) {
	const parts = buffer.split('\n\n');
	return { frames: parts.slice(0, -1), rest: parts[parts.length - 1] };
}

/**
 * Zamienia jedną ramkę na `{ event, data }`.
 *
 * Zwraca `null` dla ramek bez danych (np. komentarze utrzymujące połączenie) oraz dla
 * takich, których treść nie jest poprawnym JSON-em — pojedyncza uszkodzona ramka nie
 * może przerwać odbioru reszty strumienia.
 */
export function parseFrame(frame) {
	let event = 'message';
	const dataLines = [];

	for (const line of frame.split('\n')) {
		if (line.startsWith('event:')) event = line.slice(6).trim();
		// Zgodnie ze specyfikacją wiele linii `data:` w jednej ramce skleja się znakiem nowej linii.
		else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
	}

	if (!dataLines.length) return null;

	try {
		return { event, data: JSON.parse(dataLines.join('\n')) };
	} catch {
		return null;
	}
}
