import Anthropic from '@anthropic-ai/sdk';
import { AI_EFFORT, estimateCostUsd } from '@/lib/ai/config';

let client = null;

function getClient() {
	if (!client) {
		client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
	}
	return client;
}

export class AiRefusalError extends Error {
	constructor(category) {
		super(`Model odmówił odpowiedzi (kategoria: ${category || 'nieokreślona'}).`);
		this.name = 'AiRefusalError';
		this.category = category || null;
	}
}

/**
 * Wywołanie Claude z wyjściem w ustalonym schemacie JSON.
 *
 * Trzy rzeczy warte uwagi:
 *
 * 1. `output_config.format` wymusza kształt odpowiedzi na poziomie API. Wcześniejsze
 *    podejście — proszenie w prompcie o „format: Przewidywanie: ..." i parsowanie regexem —
 *    działało tylko po polsku i psuło się przy każdej zmianie stylu odpowiedzi.
 * 2. Stały blok zasad dostaje `cache_control`, więc przy wielu analizach tego samego dnia
 *    płacimy za niego raz. Zmienna część promptu (dane meczu) idzie po nim — odwrotna
 *    kolejność unieważniałaby cache przy każdym meczu.
 * 3. `fallbacks: 'default'` przenosi żądanie na model zapasowy, gdy klasyfikatory
 *    bezpieczeństwa odrzucą prompt. Analiza sportowa bywa fałszywie dopasowana do
 *    tematów wrażliwych, więc bez tego część meczów po prostu nie dostałaby analizy.
 */
export async function generateStructured({ model, system, user, schema, maxTokens }) {
	const response = await getClient().beta.messages.create({
		model,
		max_tokens: maxTokens,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		thinking: { type: 'adaptive' },
		system: [
			{
				type: 'text',
				text: system,
				cache_control: { type: 'ephemeral' },
			},
		],
		messages: [{ role: 'user', content: user }],
		output_config: {
			...(AI_EFFORT ? { effort: AI_EFFORT } : {}),
			format: { type: 'json_schema', schema },
		},
	});

	// Odmowa wraca jako poprawne HTTP 200 — bez tego sprawdzenia czytalibyśmy pustą treść.
	if (response.stop_reason === 'refusal') {
		throw new AiRefusalError(response.stop_details?.category);
	}

	const text = response.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text)
		.join('');

	if (!text.trim()) {
		throw new Error(`Model nie zwrócił treści (stop_reason: ${response.stop_reason}).`);
	}

	const tokensIn = response.usage?.input_tokens ?? 0;
	const tokensOut = response.usage?.output_tokens ?? 0;

	return {
		data: JSON.parse(text),
		meta: {
			provider: 'anthropic',
			model: response.model || model,
			tokensIn,
			tokensOut,
			cachedTokens: response.usage?.cache_read_input_tokens ?? 0,
			costUsd: estimateCostUsd(response.model || model, tokensIn, tokensOut),
		},
	};
}

/**
 * To samo co `generateStructured`, ale z podglądem odpowiedzi w trakcie powstawania.
 *
 * `onProgress` dostaje całość tekstu zebranego do tej pory (nie sam przyrost) — wołający
 * i tak musi parsować narastający JSON, więc trzymanie akumulatora po jego stronie tylko
 * powielałoby ten sam kod.
 */
export async function streamStructured({ model, system, user, schema, maxTokens, onProgress }) {
	const stream = getClient().beta.messages.stream({
		model,
		max_tokens: maxTokens,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		thinking: { type: 'adaptive' },
		system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
		messages: [{ role: 'user', content: user }],
		output_config: {
			...(AI_EFFORT ? { effort: AI_EFFORT } : {}),
			format: { type: 'json_schema', schema },
		},
	});

	let accumulated = '';
	stream.on('text', (delta) => {
		accumulated += delta;
		// Błąd w rysowaniu podglądu nie może przerwać generowania.
		try {
			onProgress?.(accumulated);
		} catch {
			/* podgląd jest opcjonalny */
		}
	});

	const response = await stream.finalMessage();

	if (response.stop_reason === 'refusal') {
		throw new AiRefusalError(response.stop_details?.category);
	}

	const text =
		accumulated.trim() ||
		response.content
			.filter((block) => block.type === 'text')
			.map((block) => block.text)
			.join('');

	if (!text.trim()) {
		throw new Error(`Model nie zwrócił treści (stop_reason: ${response.stop_reason}).`);
	}

	const tokensIn = response.usage?.input_tokens ?? 0;
	const tokensOut = response.usage?.output_tokens ?? 0;

	return {
		data: JSON.parse(text),
		meta: {
			provider: 'anthropic',
			model: response.model || model,
			tokensIn,
			tokensOut,
			cachedTokens: response.usage?.cache_read_input_tokens ?? 0,
			costUsd: estimateCostUsd(response.model || model, tokensIn, tokensOut),
		},
	};
}

/** Zwykła odpowiedź tekstowa — używana przez asystenta w czacie. */
export async function generateText({ model, system, messages, maxTokens }) {
	const response = await getClient().beta.messages.create({
		model,
		max_tokens: maxTokens,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		thinking: { type: 'adaptive' },
		...(AI_EFFORT ? { output_config: { effort: AI_EFFORT } } : {}),
		system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
		messages,
	});

	if (response.stop_reason === 'refusal') {
		throw new AiRefusalError(response.stop_details?.category);
	}

	const text = response.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text)
		.join('')
		.trim();

	const tokensIn = response.usage?.input_tokens ?? 0;
	const tokensOut = response.usage?.output_tokens ?? 0;

	return {
		text,
		meta: {
			provider: 'anthropic',
			model: response.model || model,
			tokensIn,
			tokensOut,
			costUsd: estimateCostUsd(response.model || model, tokensIn, tokensOut),
		},
	};
}
