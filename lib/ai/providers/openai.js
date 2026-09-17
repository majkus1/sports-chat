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

/**
 * Rozmowa z narzędziami — odpowiednik `runTools` z dostawcy Anthropic, w formacie OpenAI.
 *
 * Ta sama pętla, inne kształty: narzędzia jako `function`, wywołania w `tool_calls`,
 * wyniki jako wiadomości z rolą `tool`. Argumenty przychodzą jako tekst JSON, więc trzeba
 * je sparsować; niepoprawny JSON traktujemy jak pusty obiekt, a nie jak błąd całej rozmowy.
 */
export async function runTools({ system, messages, tools, execute, maxTokens, maxRounds = 6, fast = true }) {
	const wybrany = pickModel(fast);
	const historia = [{ role: 'system', content: system }, ...messages];
	const toolCalls = [];
	let tokensIn = 0;
	let tokensOut = 0;

	const definicje = tools.map((t) => ({
		type: 'function',
		function: { name: t.name, description: t.description, parameters: t.input_schema },
	}));

	for (let runda = 0; runda <= maxRounds; runda += 1) {
		const ostatnia = runda === maxRounds;
		const response = await getClient().chat.completions.create({
			model: wybrany,
			...limitParam(wybrany, maxTokens),
			tools: definicje,
			...(ostatnia ? { tool_choice: 'none' } : {}),
			messages: historia,
		});

		tokensIn += response.usage?.prompt_tokens ?? 0;
		tokensOut += response.usage?.completion_tokens ?? 0;

		const wiadomosc = response.choices?.[0]?.message;
		const wywolania = wiadomosc?.tool_calls || [];

		if (!wywolania.length) {
			return {
				text: (wiadomosc?.content || '').trim(),
				toolCalls,
				meta: {
					provider: 'openai',
					model: response.model || wybrany,
					tokensIn,
					tokensOut,
					costUsd: estimateCostUsd(response.model || wybrany, tokensIn, tokensOut),
				},
			};
		}

		historia.push(wiadomosc);
		for (const w of wywolania) {
			let input = {};
			try {
				input = JSON.parse(w.function?.arguments || '{}');
			} catch {
				input = {};
			}
			toolCalls.push({ name: w.function?.name, input });
			let content;
			try {
				content = await execute(w.function?.name, input);
			} catch (error) {
				content = JSON.stringify({ error: error.message });
			}
			historia.push({ role: 'tool', tool_call_id: w.id, content: String(content) });
		}
	}

	throw new Error('Asystent nie zakończył rozmowy w limicie rund.');
}

/**
 * Wyszukiwanie w internecie — model z wbudowanym narzędziem `web_search` (Responses API).
 *
 * To jedyne miejsce w kodzie, które sięga po Responses API; reszta idzie przez chat
 * completions. Powód: wyszukiwanie serwerowe jest dostępne tylko tu, a przepisywanie
 * całej warstwy pod nowe API dla jednej funkcji nie miałoby sensu.
 *
 * Koszt to tokeny plus opłata za każde wyszukanie — stąd `searches` w meta, żeby dziennik
 * użycia i próg wydatków widziały prawdziwą kwotę, a nie same tokeny.
 */
const WEB_SEARCH_USD = 0.01;

/** Tekst i źródła z odpowiedzi Responses API — czysta funkcja, do testów. */
/** Adres bez znacznika śledzenia, który dostawca dokleja do każdego wyniku. */
function czystyUrl(url) {
	return String(url).replace(/[?&]utm_source=openai/, '').replace(/\?$/, '');
}

export function extractSearchResult(response) {
	const zrodla = new Map();
	const zWyszukan = new Map();
	let text = '';
	let searches = 0;
	for (const item of response?.output || []) {
		if (item.type === 'web_search_call') {
			searches += 1;
			// Strony odwiedzone przez wyszukiwanie — źródło awaryjne, gdy model nie cytuje w tekście.
			for (const s of item.action?.sources || []) {
				if (s?.url) zWyszukan.set(czystyUrl(s.url), { title: new URL(s.url).hostname, url: czystyUrl(s.url) });
			}
		}
		if (item.type !== 'message') continue;
		for (const part of item.content || []) {
			if (part.type !== 'output_text') continue;
			text += part.text || '';
			for (const a of part.annotations || []) {
				if (a.type === 'url_citation' && a.url) {
					const url = czystyUrl(a.url);
					if (!zrodla.has(url)) zrodla.set(url, { title: a.title || url, url });
				}
			}
		}
	}
	/*
	 * Cytowania w tekście są lepsze (tytuł strony), ale model nie zawsze je dodaje — wtedy
	 * lista byłaby pusta, a fakt bez źródła nie może iść do użytkownika. Strony z wyszukań
	 * to gorsze źródło (sama domena), ale zawsze prawdziwe.
	 */
	const sources = zrodla.size ? [...zrodla.values()] : [...zWyszukan.values()];
	return { text: text.trim(), sources, searches };
}

export async function searchWeb({ prompt, maxTokens = 2500 }) {
	const model = OPENAI_MODEL;
	/*
	 * Trzy ograniczenia, bez których pierwsza wersja kosztowała 0,17 $ i zwracała PUSTY tekst:
	 * model robił osiem wyszukań, każde ciągnęło duży kontekst (66 tys. tokenów), a limit
	 * wyjścia zjadło „myślenie" — na odpowiedź nie zostało nic. Stąd: niskie rozumowanie,
	 * mały kontekst wyszukiwania i wyraźny limit wyszukań w poleceniu. `max_output_tokens`
	 * obejmuje u tego modelu także tokeny rozumowania, więc musi być wyższy niż sam tekst.
	 */
	const response = await getClient().responses.create({
		model,
		reasoning: { effort: 'low' },
		tools: [{ type: 'web_search', search_context_size: 'low' }],
		// Twardy limit wyszukań — prośba w poleceniu nie wystarczała (model robił pięć).
		max_tool_calls: 2,
		include: ['web_search_call.action.sources'],
		input: prompt,
		max_output_tokens: maxTokens,
	});
	const { text, sources, searches } = extractSearchResult(response);
	const tokensIn = response.usage?.input_tokens ?? 0;
	const tokensOut = response.usage?.output_tokens ?? 0;
	const tokenCost = estimateCostUsd(response.model || model, tokensIn, tokensOut) ?? 0;
	return {
		text,
		sources,
		meta: {
			provider: 'openai',
			model: response.model || model,
			tokensIn,
			tokensOut,
			searches,
			costUsd: Number((tokenCost + searches * WEB_SEARCH_USD).toFixed(6)),
		},
	};
}
