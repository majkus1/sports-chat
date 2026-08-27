/**
 * Konfiguracja warstwy AI.
 *
 * Dostawca i modele są sterowane zmiennymi środowiskowymi, żeby zmiana nie wymagała
 * deployu kodu. Domyślnie Claude — przy analizie meczu do promptu trafia komplet danych
 * (statystyki, H2H, składy, kontuzje) plus historia czatu, więc długi kontekst i jakość
 * rozumowania mają tu bezpośrednie przełożenie na wynik.
 */

export const AI_PROVIDER = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
export const AI_FALLBACK_PROVIDER = (process.env.AI_FALLBACK_PROVIDER || 'openai').toLowerCase();

/**
 * Modele. Zostawiamy Opus jako domyślny w obu zadaniach — świadome zejście na tańszy
 * model (np. `claude-haiku-4-5` do odpowiedzi w czacie) ustawia się zmienną, a nie
 * po cichu w kodzie.
 */
export const MODEL_ANALYSIS = process.env.AI_MODEL_ANALYSIS || 'claude-opus-5';
export const MODEL_CHAT = process.env.AI_MODEL_CHAT || 'claude-opus-5';

/** Odpowiednik dla zadań, w których liczy się czas — patrz OPENAI_MODEL_FAST. */
export const MODEL_ANALYSIS_FAST = process.env.AI_MODEL_ANALYSIS_FAST || 'claude-sonnet-5';

/**
 * Model OpenAI — używany jako główny przy `AI_PROVIDER=openai`, inaczej jako zapasowy.
 *
 * Zmierzone 2026-08-17 na pełnym prompcie analizy (7,9 tys. znaków, mecz La Liga):
 *   gpt-4o   — pierwszy fragment po 0,8 s, całość 5,6 s, 3 czynniki / 2 typy / 3 ryzyka
 *   gpt-4.1  — 11 s, 3 czynniki / 1 typ; raz zwrócił prawdopodobieństwa sumujące się do 0
 *   gpt-5.5  — pierwszy fragment po 19,3 s, całość 34 s, 5 czynników / 3 typy / 5 ryzyk,
 *              jako jedyny sięgnął po tabelę i absencje
 *
 * Stąd podział: głębia przed meczem, szybkość w trakcie.
 */
export const OPENAI_MODEL = process.env.AI_MODEL_OPENAI || 'gpt-5.5';

/**
 * Model do analiz meczów na żywo i do rozmowy.
 *
 * W trwającym meczu 19 sekund pustego panelu jest gorsze niż płytsza analiza — dane
 * i tak starzeją się z każdą minutą, a użytkownik odświeża je wielokrotnie.
 */
export const OPENAI_MODEL_FAST = process.env.AI_MODEL_OPENAI_FAST || 'gpt-4o';

/**
 * `effort` steruje głębokością rozumowania i zużyciem tokenów. Puste = domyślne API.
 * Ustaw `medium`, jeśli koszt analiz zacznie doskwierać.
 */
export const AI_EFFORT = process.env.AI_EFFORT || null;

/** Górny limit odpowiedzi. Uwaga: obejmuje też tokeny myślenia, nie tylko tekst wyniku. */
export const MAX_TOKENS_ANALYSIS = Number(process.env.AI_MAX_TOKENS_ANALYSIS || 16000);
export const MAX_TOKENS_CHAT = Number(process.env.AI_MAX_TOKENS_CHAT || 2000);

/**
 * Cennik w dolarach za milion tokenów — do zapisywania kosztu każdej analizy.
 * Trzymane lokalnie, bo API nie zwraca kwoty, tylko liczbę tokenów.
 */
const PRICING = {
	'claude-opus-5': { input: 5, output: 25 },
	'claude-opus-4-8': { input: 5, output: 25 },
	'claude-sonnet-5': { input: 3, output: 15 },
	'claude-haiku-4-5': { input: 1, output: 5 },
	'gpt-4o': { input: 2.5, output: 10 },
	'gpt-4.1': { input: 2, output: 8 },
	// Stawki gpt-5.x sprawdź w cenniku OpenAI i skoryguj — bez wpisu koszt zapisze się
	// jako null i statystyki wydatków będą niepełne.
	'gpt-5.5': { input: 1.25, output: 10 },
	'gpt-5.4': { input: 1.25, output: 10 },
};

/**
 * @returns {number|null} koszt w USD albo null, gdy model nie ma wpisu w cenniku
 *
 * OpenAI zwraca w odpowiedzi identyfikator z datą (`gpt-4o-2024-08-06`), a nie alias,
 * którym wołamy model. Przy dosłownym porównaniu żadna analiza nie trafiała w cennik
 * i wszystkie zapisywały się w UsageLog z kosztem `null`.
 */
export function estimateCostUsd(model, tokensIn, tokensOut) {
	if (!Number.isFinite(tokensIn) || !Number.isFinite(tokensOut)) return null;

	const rate = PRICING[model] || PRICING[String(model || '').replace(/-\d{4}-\d{2}-\d{2}$/, '')];
	if (!rate) return null;

	return Number(((tokensIn / 1e6) * rate.input + (tokensOut / 1e6) * rate.output).toFixed(6));
}
