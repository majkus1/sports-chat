import * as anthropic from '@/lib/ai/providers/anthropic';
import * as openai from '@/lib/ai/providers/openai';
import { AI_PROVIDER, AI_FALLBACK_PROVIDER } from '@/lib/ai/config';

const PROVIDERS = { anthropic, openai };

export { AiRefusalError } from '@/lib/ai/providers/anthropic';

function resolve(name) {
	const provider = PROVIDERS[name];
	if (!provider) throw new Error(`Nieznany dostawca AI: "${name}".`);
	return provider;
}

/**
 * Uruchamia zadanie u głównego dostawcy, a przy jego awarii u zapasowego.
 *
 * Odmowa modelu (AiRefusalError) NIE jest powodem do przełączenia dostawcy —
 * to decyzja merytoryczna, a nie awaria, i drugi model najpewniej odmówi tak samo.
 */
async function withFallback(call) {
	try {
		return await call(resolve(AI_PROVIDER));
	} catch (error) {
		if (error.name === 'AiRefusalError') throw error;
		if (AI_FALLBACK_PROVIDER === AI_PROVIDER) throw error;

		console.warn(`[ai] ${AI_PROVIDER} zawiódł (${error.message}) — próbuję ${AI_FALLBACK_PROVIDER}.`);
		return call(resolve(AI_FALLBACK_PROVIDER));
	}
}

/** @returns {Promise<{ data: object, meta: object }>} */
export function generateStructured(options) {
	return withFallback((provider) => provider.generateStructured(options));
}

/**
 * Wersja strumieniowa. Dostawca zapasowy nie musi obsługiwać strumienia — jeśli nie umie,
 * schodzimy na zwykłe wywołanie i wynik pojawia się w całości naraz. Lepsze to niż brak
 * analizy tylko dlatego, że główny dostawca zawiódł.
 */
export function streamStructured({ onProgress, ...options }) {
	return withFallback((provider) =>
		provider.streamStructured
			? provider.streamStructured({ ...options, onProgress })
			: provider.generateStructured(options)
	);
}

/** @returns {Promise<{ text: string, meta: object }>} */
export function generateText(options) {
	return withFallback((provider) => provider.generateText(options));
}
