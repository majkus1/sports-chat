'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { parseFrame, splitFrames } from '@/lib/sse/parseFrames';

/**
 * Odbiór raportu generowanego strumieniem — wzorzec z useAnalysisStream.
 *
 * POST + ręczne czytanie strumienia, bo generowanie zmienia stan (limit tygodniowy,
 * zapis raportu). Typy pojawiają się w interfejsie w miarę pisania odpowiedzi.
 */

const EMPTY = { sections: null, reportId: null, error: null, limitReached: false };

export function useReportStream({ language, failedText }) {
	const [report, setReport] = useState(EMPTY);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isPartial, setIsPartial] = useState(false);
	/** `selecting` — trwa selekcja meczów; `generating` — model pisze raport. */
	const [stage, setStage] = useState(null);
	/** Ilu kandydatów przeszło selekcję — pokazywane w trakcie czekania na model. */
	const [candidateCount, setCandidateCount] = useState(null);

	const abortRef = useRef(null);
	const busyRef = useRef(false);

	useEffect(() => () => abortRef.current?.abort(), []);

	const reset = useCallback(() => setReport(EMPTY), []);

	/** @param {'soon'|'threeDays'} type */
	const start = useCallback(
		async (type) => {
			if (busyRef.current) return;
			busyRef.current = true;

			const controller = new AbortController();
			abortRef.current = controller;

			setIsGenerating(true);
			setIsPartial(false);
			setStage('selecting');
			setCandidateCount(null);
			setReport(EMPTY);

			try {
				const response = await fetch('/api/reports/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					credentials: 'include',
					body: JSON.stringify({ type, language }),
					signal: controller.signal,
				});

				const contentType = response.headers.get('content-type') || '';

				// JSON zamiast strumienia = rozstrzygnięcie przed modelem (limit, brak sesji).
				if (!contentType.includes('text/event-stream')) {
					const data = await response.json();
					setReport({
						...EMPTY,
						error: data.message || failedText,
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

						if (parsed.event === 'status') {
							setStage(parsed.data.stage);
							if (Number.isFinite(parsed.data.candidates)) {
								setCandidateCount(parsed.data.candidates);
							}
						} else if (parsed.event === 'partial') {
							setStage('generating');
							setIsPartial(true);
							setReport((prev) => ({ ...prev, sections: parsed.data.sections }));
						} else if (parsed.event === 'done') {
							setIsPartial(false);
							setReport({
								sections: parsed.data.sections,
								reportId: parsed.data.reportId,
								error: null,
								limitReached: false,
							});
						} else if (parsed.event === 'error') {
							setIsPartial(false);
							setReport({ ...EMPTY, error: parsed.data.message || failedText });
						}
					}
				}
			} catch (error) {
				if (error.name !== 'AbortError') {
					setReport((prev) => (prev.sections ? prev : { ...EMPTY, error: failedText }));
				}
			} finally {
				busyRef.current = false;
				abortRef.current = null;
				setIsGenerating(false);
				setIsPartial(false);
				setStage(null);
			}
		},
		[language, failedText]
	);

	return { report, isGenerating, isPartial, stage, candidateCount, start, reset };
}
