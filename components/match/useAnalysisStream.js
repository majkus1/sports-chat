'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseFrame, splitFrames } from '@/lib/sse/parseFrames';

/**
 * Odbiór analizy podawanej strumieniem.
 *
 * `EventSource` nie wchodzi w grę, bo obsługuje wyłącznie GET, a generowanie analizy
 * zmienia stan (zużywa limit, zapisuje wynik). Dlatego czytamy strumień ręcznie
 * z odpowiedzi `fetch`, a ramki rozbiera lib/sse/parseFrames.js.
 */

const EMPTY = { text: '', sections: null, limitReached: false, meta: null };

export function useAnalysisStream({ fixtureId, language, unavailableText }) {
	const [analysis, setAnalysis] = useState(EMPTY);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isPartial, setIsPartial] = useState(false);
	/** `preparing` — trwa zbieranie danych; `generating` — model już pisze. */
	const [stage, setStage] = useState(null);

	const abortRef = useRef(null);
	// Blokada podwójnego uruchomienia trzymana w refie, żeby `start` miało stałą
	// referencję i nie unieważniało efektów, które go używają.
	const busyRef = useRef(false);

	useEffect(() => () => abortRef.current?.abort(), []);

	/** Wstawia zapisaną analizę bez uruchamiania generowania (i bez zużycia limitu). */
	const setExisting = useCallback((next) => {
		setAnalysis({ ...EMPTY, ...next });
		setIsPartial(false);
	}, []);

	/** Zapasowa ścieżka: jedno żądanie, wynik w całości naraz. */
	const runOneShot = useCallback(
		async (signal, force) => {
			const res = await fetch('/api/football/getOrCreateAnalysis', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ fixtureId, language, force }),
				signal,
			});
			const data = await res.json();
			setAnalysis({
				text: data.analysis || data.message || unavailableText,
				sections: data.sections || null,
				limitReached: data.error === 'limit_exceeded',
			});
		},
		[fixtureId, language, unavailableText]
	);

	/**
	 * @param {{ force?: boolean }} [options] `force` pomija zapisaną analizę — używane,
	 * gdy mecz trwa i poprzednia wersja opisuje już nieaktualną sytuację.
	 */
	const start = useCallback(async ({ force = false } = {}) => {
		if (busyRef.current) return;
		busyRef.current = true;

		const controller = new AbortController();
		abortRef.current = controller;

		setIsGenerating(true);
		setIsPartial(false);
		setStage('preparing');
		setAnalysis(EMPTY);

		// Dopóki nie dotarła ani jedna ramka, awaria strumienia jest odwracalna —
		// można ponowić zwykłym żądaniem. Po pierwszej ramce limit jest już w grze,
		// więc powtórka zabrałaby użytkownikowi drugą analizę z dziennej puli.
		let receivedFrame = false;

		try {
			const response = await fetch('/api/football/analysis-stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ fixtureId, language, force }),
				signal: controller.signal,
			});

			const contentType = response.headers.get('content-type') || '';

			// Odpowiedź JSON zamiast strumienia znaczy, że serwer rozstrzygnął sprawę przed
			// wywołaniem modelu: analiza była w cache albo limit na to nie pozwolił.
			if (!contentType.includes('text/event-stream')) {
				const data = await response.json();
				setAnalysis({
					text: data.analysis || data.message || unavailableText,
					sections: data.sections || null,
					limitReached: data.error === 'limit_exceeded',
				});
				return;
			}

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			for (;;) {
				const { value, done } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const { frames, rest } = splitFrames(buffer);
				buffer = rest;

				for (const frame of frames) {
					const parsed = parseFrame(frame);
					if (!parsed) continue;
					receivedFrame = true;

					if (parsed.event === 'status') {
						setStage(parsed.data.stage);
					} else if (parsed.event === 'partial') {
						setStage('generating');
						setIsPartial(true);
						setAnalysis((prev) => ({ ...prev, sections: parsed.data.sections }));
					} else if (parsed.event === 'done') {
						setIsPartial(false);
						setAnalysis({
							text: parsed.data.analysis,
							sections: parsed.data.sections,
							limitReached: false,
							// Świeżo wygenerowana analiza jest z tej chwili i należy do tej osoby.
							meta: { generatedAt: new Date().toISOString(), generatedByName: null, isOwn: true },
						});
					} else if (parsed.event === 'error') {
						setIsPartial(false);
						setAnalysis({
							text: parsed.data.message || unavailableText,
							sections: null,
							limitReached: false,
						});
					}
				}
			}
		} catch (error) {
			if (error.name === 'AbortError') return;

			if (receivedFrame) {
				setIsPartial(false);
				setAnalysis((prev) => (prev.sections ? prev : { ...EMPTY, text: unavailableText }));
				return;
			}

			console.warn('[analysis] strumień zawiódł, próbuję zwykłego żądania:', error.message);
			try {
				await runOneShot(controller.signal, force);
			} catch (fallbackError) {
				if (fallbackError.name !== 'AbortError') {
					setAnalysis({ ...EMPTY, text: unavailableText });
				}
			}
		} finally {
			busyRef.current = false;
			abortRef.current = null;
			setIsGenerating(false);
			setIsPartial(false);
			setStage(null);
		}
	}, [fixtureId, language, unavailableText, runOneShot]);

	return { analysis, isGenerating, isPartial, stage, start, setExisting };
}
