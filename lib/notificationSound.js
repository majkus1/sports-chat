/**
 * Krótki sygnał dźwiękowy nowej wiadomości.
 *
 * Generowany w Web Audio, a nie wczytywany z pliku: nie ma czego dokładać do repozytorium,
 * nic się nie pobiera przy starcie i nie da się tego zablokować blokadą reklam.
 *
 * Przeglądarki nie pozwalają odtwarzać dźwięku, dopóki użytkownik czegokolwiek nie kliknie
 * na stronie — funkcja to po prostu przemilcza, zamiast wyrzucać błąd do konsoli.
 */

const STORAGE_KEY = 'czat-sound-enabled';

/** Domyślnie włączone; wyłączenie zapamiętuje przeglądarka. */
export function isSoundEnabled() {
	if (typeof window === 'undefined') return false;
	return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setSoundEnabled(enabled) {
	if (typeof window === 'undefined') return;
	window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

let audioContext = null;

export function playNotificationSound() {
	if (typeof window === 'undefined' || !isSoundEnabled()) return;

	try {
		const Ctx = window.AudioContext || window.webkitAudioContext;
		if (!Ctx) return;

		audioContext = audioContext || new Ctx();
		if (audioContext.state === 'suspended') audioContext.resume();

		const now = audioContext.currentTime;
		const gain = audioContext.createGain();
		gain.connect(audioContext.destination);

		// Dwa krótkie tony w górę — czytelne, ale nienachalne przy kilku wiadomościach z rzędu.
		[
			{ freq: 660, at: 0, length: 0.09 },
			{ freq: 880, at: 0.1, length: 0.12 },
		].forEach(({ freq, at, length }) => {
			const osc = audioContext.createOscillator();
			osc.type = 'sine';
			osc.frequency.value = freq;
			osc.connect(gain);
			osc.start(now + at);
			osc.stop(now + at + length);
		});

		// Obwiednia bez twardego cięcia — inaczej słychać trzask na końcu.
		gain.gain.setValueAtTime(0.0001, now);
		gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
	} catch {
		/* brak dźwięku nie może przeszkadzać w korzystaniu z czatu */
	}
}
