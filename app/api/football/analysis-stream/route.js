import { streamStructured, AiRefusalError } from '@/lib/ai';
import { MATCH_ANALYSIS_SCHEMA } from '@/lib/ai/schemas';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt } from '@/lib/ai/prompts/matchAnalysis';
import { MODEL_ANALYSIS, MODEL_ANALYSIS_FAST, MAX_TOKENS_ANALYSIS } from '@/lib/ai/config';
import { parsePartialJson } from '@/lib/ai/partialJson';
import { formatFrame } from '@/lib/sse/parseFrames';
import {
	ANALYSIS_MESSAGES,
	finalizeAnalysis,
	prepareAnalysis,
	resolveLanguage,
} from '@/lib/analysis/service';

export const maxDuration = 300;

/**
 * Analiza meczu podawana strumieniem (Server-Sent Events).
 *
 * Metoda POST, a nie GET, bo wywołanie zmienia stan: zużywa limit, zapisuje analizę
 * i pociąga koszt. Oznacza to, że po stronie przeglądarki nie da się użyć `EventSource`
 * (obsługuje wyłącznie GET) i strumień trzeba czytać ręcznie z `fetch`.
 *
 * Zdarzenia:
 *   status  — etap pracy (`preparing` | `generating`)
 *   partial — częściowy wynik; pola pojawiają się w miarę pisania odpowiedzi
 *   done    — komplet: tekst + sekcje
 *   error   — powód niepowodzenia; strumień się kończy
 */

/** Ograniczenie tempa podglądu. Bez tego każdy token generuje osobną ramkę SSE. */
const PARTIAL_INTERVAL_MS = 220;

export async function POST(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return Response.json({ error: 'Invalid request body' }, { status: 400 });
	}

	const fixtureId = String(body?.fixtureId || '').trim();
	if (!/^\d{1,12}$/.test(fixtureId)) {
		return Response.json({ error: 'Missing or invalid fixtureId' }, { status: 400 });
	}

	const language = resolveLanguage(request, body?.language);
	const t = ANALYSIS_MESSAGES[language];

	// Błędy sprzed otwarcia strumienia zwracamy zwykłą odpowiedzią JSON — klient nie musi
	// wtedy w ogóle wchodzić w tryb czytania zdarzeń.
	let prepared;
	try {
		prepared = await prepareAnalysis({ request, fixtureId, language, force: body?.force === true });
	} catch (error) {
		console.error('[analysis-stream] przygotowanie nie powiodło się:', error.message);
		return Response.json({ error: 'generation_failed', message: t.failed }, { status: 500 });
	}

	if (prepared.status === 'cached') {
		return Response.json(
			{ analysis: prepared.analysis, sections: prepared.sections, cached: true },
			{ status: 200 }
		);
	}

	if (prepared.status === 'blocked') {
		const { status, httpStatus, release, ...payload } = prepared;
		return Response.json({ error: payload.code, ...payload }, { status: httpStatus });
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		async start(controller) {
			let closed = false;
			const send = (event, data) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(formatFrame(event, data)));
				} catch {
					// Klient zamknął połączenie — generowanie i tak dokończymy, żeby zapisać wynik.
					closed = true;
				}
			};

			let lastPartialAt = 0;

			try {
				send('status', { stage: 'generating' });

				/*
				 * W trwającym meczu wygrywa szybkość, przed meczem głębia.
				 *
				 * Zmierzone: mocniejszy model milczy ~19 s, zanim cokolwiek trafi do strumienia,
				 * i kończy po ~34 s. Przed gwizdkiem to akceptowalna cena za pełniejszą analizę,
				 * ale w 60. minucie użytkownik odświeża wynik co chwilę i dane i tak się starzeją.
				 */
				const naZywo = prepared.bundle.fixture.status.isLive;

				const { data: sections, meta } = await streamStructured({
					model: naZywo ? MODEL_ANALYSIS_FAST : MODEL_ANALYSIS,
					fast: naZywo,
					system: ANALYSIS_SYSTEM_PROMPT,
					user: buildAnalysisPrompt(prepared.bundle, language),
					schema: MATCH_ANALYSIS_SCHEMA,
					maxTokens: MAX_TOKENS_ANALYSIS,
					onProgress: (accumulated) => {
						const now = Date.now();
						if (now - lastPartialAt < PARTIAL_INTERVAL_MS) return;
						const partial = parsePartialJson(accumulated);
						if (!partial) return;
						lastPartialAt = now;
						send('partial', { sections: partial });
					},
				});

				const analysisText = await finalizeAnalysis({
					fixtureId,
					language,
					sections,
					meta,
					...prepared,
				});

				send('done', { analysis: analysisText, sections, cached: false });
			} catch (error) {
				if (error instanceof AiRefusalError) {
					console.warn('[analysis-stream] odmowa modelu:', error.category);
					send('error', { code: 'refused', message: t.refused });
				} else {
					console.error('[analysis-stream] błąd generowania:', error.message);
					send('error', { code: 'generation_failed', message: t.failed });
				}
			} finally {
				await prepared.release();
				if (!closed) controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream; charset=utf-8',
			'Cache-Control': 'no-cache, no-transform',
			Connection: 'keep-alive',
			// Nginx domyślnie buforuje odpowiedzi proxy — bez tego nagłówka zdarzenia
			// dotarłyby do przeglądarki dopiero na końcu, czyli strumień byłby pozorny.
			'X-Accel-Buffering': 'no',
		},
	});
}
