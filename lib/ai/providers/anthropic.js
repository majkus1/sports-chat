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

/**
 * Rozmowa z narzędziami — model pyta o dane, kod je liczy, model układa odpowiedź.
 *
 * TO JEST FUNDAMENT ASYSTENTA CAŁEJ OFERTY. Bez narzędzi asystent „znający wszystkie mecze"
 * musiałby dostać wszystkie mecze w kontekście — i zgadywać liczby. Tu dostaje nazwy
 * funkcji z opisem, sam decyduje, które wywołać, a każdą liczbę w odpowiedzi ma z wyniku
 * funkcji, nie z własnej głowy. Pętla: wywołanie → bloki `tool_use` → `execute` → bloki
 * `tool_result` → kolejne wywołanie, aż model skończy tekstem.
 *
 * Treść odpowiedzi modelu wraca do niego bez zmian — z blokami myślenia włącznie, bo przy
 * adaptacyjnym myśleniu API wymaga ich obecności w historii.
 *
 * `maxRounds` jest bezpiecznikiem kosztowym: model, który pyta w kółko, nie może spalić
 * budżetu; po limicie prosimy o odpowiedź z tego, co już ma.
 *
 * @param {{ model, system, messages, tools: Array<{name, description, input_schema}>,
 *   execute: (name: string, input: object) => Promise<string>, maxTokens, maxRounds?: number }} o
 * @returns {Promise<{ text: string, meta: object, toolCalls: Array<{name, input}> }>}
 */
export async function runTools({ model, system, messages, tools, execute, maxTokens, maxRounds = 6 }) {
	const historia = [...messages];
	const toolCalls = [];
	let tokensIn = 0;
	let tokensOut = 0;
	let usedModel = model;

	for (let runda = 0; runda <= maxRounds; runda += 1) {
		const ostatnia = runda === maxRounds;
		const response = await getClient().beta.messages.create({
			model,
			max_tokens: maxTokens,
			betas: ['server-side-fallback-2026-07-01'],
			fallbacks: 'default',
			thinking: { type: 'adaptive' },
			...(AI_EFFORT ? { output_config: { effort: AI_EFFORT } } : {}),
			system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
			tools,
			// W ostatniej rundzie narzędzia są wyłączone — model musi odpowiedzieć tym, co ma.
			...(ostatnia ? { tool_choice: { type: 'none' } } : {}),
			messages: historia,
		});

		tokensIn += response.usage?.input_tokens ?? 0;
		tokensOut += response.usage?.output_tokens ?? 0;
		usedModel = response.model || model;

		if (response.stop_reason === 'refusal') {
			throw new AiRefusalError(response.stop_details?.category);
		}

		const uzycia = response.content.filter((block) => block.type === 'tool_use');
		if (response.stop_reason !== 'tool_use' || !uzycia.length) {
			const text = response.content
				.filter((block) => block.type === 'text')
				.map((block) => block.text)
				.join('')
				.trim();
			return {
				text,
				toolCalls,
				meta: {
					provider: 'anthropic',
					model: usedModel,
					tokensIn,
					tokensOut,
					costUsd: estimateCostUsd(usedModel, tokensIn, tokensOut),
				},
			};
		}

		historia.push({ role: 'assistant', content: response.content });
		const wyniki = [];
		for (const u of uzycia) {
			toolCalls.push({ name: u.name, input: u.input });
			let content;
			try {
				content = await execute(u.name, u.input || {});
			} catch (error) {
				// Błąd narzędzia idzie do modelu jako treść — ma o nim powiedzieć, nie udawać, że wie.
				content = JSON.stringify({ error: error.message });
			}
			wyniki.push({ type: 'tool_result', tool_use_id: u.id, content: String(content) });
		}
		historia.push({ role: 'user', content: wyniki });
	}

	// Nieosiągalne: ostatnia runda ma wyłączone narzędzia, więc kończy się tekstem.
	throw new Error('Asystent nie zakończył rozmowy w limicie rund.');
}
