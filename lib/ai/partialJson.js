/**
 * Parsowanie niedokończonego JSON-a.
 *
 * Model strumieniuje odpowiedź znak po znaku, więc w połowie generowania mamy w ręku
 * coś w rodzaju `{"summary":"Gospodarze mają lep`. Zwykły `JSON.parse` na tym poleci,
 * a bez parsowania nie da się pokazać niczego przed końcem — użytkownik patrzyłby
 * w spinner tak samo jak bez strumienia.
 *
 * Rozwiązanie: odcinamy niedokończony fragment i domykamy to, co zostało otwarte.
 * Wynik jest z założenia niepełny — komponent musi umieć narysować brakujące pola.
 */

/** Znaki, po których wartość jest na tyle kompletna, że da się ją domknąć. */
function isStructural(char) {
	return char === ',' || char === '{' || char === '[' || char === ':';
}

/**
 * @param {string} text fragment odpowiedzi modelu
 * @returns {object|null} sparsowany obiekt albo null, gdy nie ma jeszcze czego pokazać
 */
export function parsePartialJson(text) {
	if (typeof text !== 'string') return null;

	const trimmed = text.trim();
	if (!trimmed) return null;

	// Najczęstszy przypadek pod koniec strumienia — pełny, poprawny JSON.
	try {
		return JSON.parse(trimmed);
	} catch {
		/* lecimy dalej i domykamy ręcznie */
	}

	const stack = [];
	let inString = false;
	let escaped = false;
	// Ostatnia pozycja, od której da się bezpiecznie uciąć (koniec kompletnej wartości).
	let safeEnd = -1;

	for (let i = 0; i < trimmed.length; i += 1) {
		const char = trimmed[i];

		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') {
				inString = false;
				safeEnd = i + 1;
			}
			continue;
		}

		if (char === '"') {
			inString = true;
			continue;
		}
		if (char === '{' || char === '[') {
			stack.push(char);
			continue;
		}
		if (char === '}' || char === ']') {
			stack.pop();
			safeEnd = i + 1;
			continue;
		}
		if (char === ',') {
			safeEnd = i + 1;
			continue;
		}
		// Koniec liczby / true / false / null rozpoznajemy po tym, co następuje dalej.
		if (/[\s]/.test(char) && safeEnd < i) safeEnd = i;
	}

	let candidate = trimmed;
	let closeString = '';

	if (inString) {
		// Tekst w trakcie pisania domykamy, zamiast go wycinać — dzięki temu podsumowanie
		// pojawia się na ekranie w miarę pisania, a nie dopiero po ostatnim znaku.
		// Wisząca ukośna kreska rozpoczęłaby sekwencję ucieczki na naszym cudzysłowie.
		if (escaped) candidate = candidate.slice(0, -1);
		closeString = '"';
	} else {
		// Ucinamy ogon typu `"summary":` albo niedokończoną liczbę.
		const tail = candidate.slice(safeEnd);
		if (/[:0-9eE+.\-]/.test(tail) && !/[}\]]/.test(tail)) {
			candidate = candidate.slice(0, safeEnd);
		}
	}

	// Przycinanie ogona dotyczy wyłącznie struktury. Wewnątrz łańcucha przecinek albo
	// nawias klamrowy to zwykłe znaki treści i nie wolno ich obcinać.
	if (!inString) {
		candidate = candidate.replace(/[\s]*,\s*$/, '');
		while (candidate.length && isStructural(candidate[candidate.length - 1])) {
			candidate = candidate.slice(0, -1).replace(/[\s]*,\s*$/, '');
		}
	}

	if (!candidate) return null;

	// Domknięcia w odwrotnej kolejności otwarć.
	const closers = stack
		.slice()
		.reverse()
		.map((open) => (open === '{' ? '}' : ']'))
		.join('');

	try {
		return JSON.parse(candidate + closeString + closers);
	} catch {
		return null;
	}
}
