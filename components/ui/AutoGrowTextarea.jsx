'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pole tekstowe, które rośnie razem z treścią — jak w ChatGPT.
 *
 * Zwykła `textarea` z `rows={1}` ma dwa problemy naraz: jest za niska, żeby zachęcać do
 * pisania czegokolwiek dłuższego niż jedno zdanie, i po zawinięciu tekstu pokazuje pasek
 * przewijania zamiast się rozsunąć. Tu wysokość liczy się z `scrollHeight` po każdej zmianie:
 * od `minRows` linii na start do `maxRows`, potem dopiero przewijanie. Bez biblioteki, bo
 * to dziesięć linii.
 *
 * Czcionka jest jawnie dziedziczona: przeglądarki dają polom formularza własną (często
 * monospace) i pole wyglądało obco na tle reszty czatu.
 */
export default function AutoGrowTextarea({ value, minRows = 2, maxRows = 8, className, ...props }) {
	const ref = useRef(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const style = window.getComputedStyle(el);
		const lineHeight = parseFloat(style.lineHeight) || 20;
		const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
		const min = minRows * lineHeight + padding;
		const max = maxRows * lineHeight + padding;

		// Zeruj, żeby zmierzyć prawdziwą wysokość treści, a nie poprzednią.
		el.style.height = 'auto';
		const wanted = Math.min(Math.max(el.scrollHeight, min), max);
		el.style.height = `${wanted}px`;
		el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
	}, [value, minRows, maxRows]);

	return (
		<textarea
			ref={ref}
			value={value}
			rows={minRows}
			className={cn('block w-full resize-none font-[inherit] leading-relaxed', className)}
			{...props}
		/>
	);
}
