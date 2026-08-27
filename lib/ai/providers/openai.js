import { OpenAI } from 'openai';
import { OPENAI_MODEL, OPENAI_MODEL_FAST, estimateCostUsd } from '@/lib/ai/config';

/**
 * Dostawca OpenAI — może pracować jako główny (AI_PROVIDER=openai) albo zapasowy.
 *
 * Kształt odpowiedzi jest ten sam co u Anthropica, bo OpenAI też potrafi wymusić schemat
 * JSON. Strumieniowanie jest tu istotne, nie ozdobne: bez niego analiza pojawia się dopiero
 * po kilkunastu sekundach ciszy, a użytkownik zdąży wyjść.
 */

let client = null;

function getClient() {
	if (!client) {
		client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2 });
	}
	return client;
}

/**
 * Nazwa parametru limitu różni się między rodzinami modeli.
 *
 * Sprawdzone empirycznie: gpt-5 i modele rozumujące (o3, o4) odrzucają `max_tokens`
 * i wymagają `max_completion_tokens`; gpt-4o i gpt-4.1 przyjmują starą nazwę.
 * Wysłanie złej nazwy kończy się błędem 400, więc to nie jest kosmetyka.
 */
function limitParam(model, maxTokens) {
	return /^(gpt-5|o3|o4)/.test(model)
		? { max_completion_tokens: maxTokens }
		: { max_tokens: maxTokens };
}

function jsonFormat(schema) {
	return {
		type: 'json_schema',
		json_schema: { name: 'match_analysis', strict: true, schema },
	};
}

/**
 * Wybor modelu.
 *
 * `fast` ustawia wywolujacy tam, gdzie czas odpowiedzi wazy wiecej niz glebia analizy —
 * czyli w meczu na zywo i w rozmowie z asystentem. Nazwa modelu przekazana w opcjach
 * jest ignorowana: przychodzi z konfiguracji Claude i nie ma odpowiednika w OpenAI.
 */
function pickModel(fast) {
	return fast ? OPENAI_MODEL_FAST : OPENAI_MODEL;
}

function metaFrom(usage, model) {
	const tokensIn = usage?.prompt_tokens ?? 0;
	const tokensOut = usage?.completion_tokens ?? 0;
	return {
		provider: 'openai',
		model: model || OPENAI_MODEL,
		tokensIn,
		tokensOut,
		cachedTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
		costUsd: estimateCostUsd(model || OPENAI_MODEL, tokensIn, tokensOut),
	};
}

export async function generateStructured({ system, user, schema, maxTokens, fast = false }) {
	const wybrany = pickModel(fast);
	const response = await getClient().chat.completions.create({
		model: wybrany,
		...limitParam(wybrany, maxTokens),
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
		response_format: jsonFormat(schema),
	});

	const text = response.choices?.[0]?.message?.content;
	if (!text) throw new Error('OpenAI nie zwrócił treści.');

	return { data: JSON.parse(text), meta: metaFrom(response.usage, response.model) };
}

/**
 * Wersja strumieniowa — treść leci fragmentami, a `onProgress` dostaje narastający tekst.
 * Wywołujący (trasa SSE) parsuje ten niedokończony JSON i wysyła podgląd do przeglądarki.
 */
export async function streamStructured({ system, user, schema, maxTokens, onProgress, fast = false }) {
	const wybrany = pickModel(fast);
	const stream = await getClient().chat.completions.create({
		model: wybrany,
		...limitParam(wybrany, maxTokens),
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
		response_format: jsonFormat(schema),
		stream: true,
		// Bez tego strumień nie zawiera zużycia tokenów, a bez niego nie policzymy kosztu.
		stream_options: { include_usage: true },
	});

	let text = '';
	let usage = null;
	let model = wybrany;

	for await (const chunk of stream) {
		if (chunk.usage) usage = chunk.usage;
		if (chunk.model) model = chunk.model;

		const delta = chunk.choices?.[0]?.delta?.content;
		if (!delta) continue;

		text += delta;
		onProgress?.(text);
	}

	if (!text) throw new Error('OpenAI nie zwrócił treści.');

	return { data: JSON.parse(text), meta: metaFrom(usage, model) };
}

export async function generateText({ system, messages, maxTokens, fast = true }) {
	// Rozmowa domyslnie na szybkim modelu — to czat, nie raport.
	const wybrany = pickModel(fast);
	const response = await getClient().chat.completions.create({
		model: wybrany,
		...limitParam(wybrany, maxTokens),
		messages: [{ role: 'system', content: system }, ...messages],
	});

	return {
		text: (response.choices?.[0]?.message?.content || '').trim(),
		meta: metaFrom(response.usage, response.model),
	};
}
