'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/context/ThemeContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';

/**
 * Widget API-Sports osadzony w zakładce pokoju meczowego.
 *
 * Widget jest komponentem webowym zewnętrznego dostawcy i wymaga własnego dokumentu,
 * więc mieszka w iframe wskazującym na naszą trasę (to ona wstrzykuje klucz z env).
 * Ramka rośnie do wysokości treści — inaczej użytkownik dostałby pasek przewijania
 * wewnątrz przewijanej strony, co na telefonie jest nie do opanowania.
 */

/** Zabezpieczenie przed wysokością z błędnego odczytu; realne widgety są znacznie niższe. */
const MAX_HEIGHT = 12000;

export default function WidgetFrame({ src, title, minHeight = 320, className }) {
	const { theme } = useTheme();
	const frameRef = useRef(null);
	const [frameSrc, setFrameSrc] = useState(null);
	const [height, setHeight] = useState(minHeight);
	const [isReady, setIsReady] = useState(false);

	/*
	 * Adres budujemy raz, po stronie klienta.
	 *
	 * Motyw jest znany dopiero w przeglądarce (ustawia go ThemeScript przed pierwszym
	 * malowaniem), a wstawienie go do `src` przy każdej zmianie przeładowywałoby iframe —
	 * czyli ponownie odpytywało API-Sports. Późniejsze zmiany idą więc przez postMessage,
	 * a `theme` celowo nie jest zależnością tego efektu.
	 */
	useEffect(() => {
		const separator = src.includes('?') ? '&' : '?';
		setFrameSrc(`${src}${separator}embed=1&theme=${theme === 'dark' ? 'dark' : 'light'}`);
		setIsReady(false);
		setHeight(minHeight);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [src, minHeight]);

	/** Wysokość treści zgłasza sam dokument widgetu — patrz lib/widgets/apiSportsPage.js. */
	useEffect(() => {
		function onMessage(event) {
			if (event.origin !== window.location.origin) return;
			if (event.source !== frameRef.current?.contentWindow) return;
			if (event.data?.type !== 'apiSportsWidgetHeight') return;

			const reported = Number(event.data.height);
			if (!Number.isFinite(reported)) return;

			setHeight(Math.min(Math.max(reported, minHeight), MAX_HEIGHT));
			// Szkielet schodzi dopiero, gdy widget ma treść. Sam `load` przychodzi po ułamku
			// sekundy, a dane dostawcy potrafią dojść po kilku — odsłonięta w tym czasie
			// ramka jest po prostu pusta.
			if (event.data.hasContent) setIsReady(true);
		}

		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [minHeight]);

	/**
	 * Ostatnia deska ratunku: gdyby most nigdy nie zgłosił treści (zablokowany skrypt
	 * widgetu, pusta odpowiedź dostawcy), po tym czasie i tak odsłaniamy ramkę —
	 * lepiej pokazać pustą sekcję niż szkielet w nieskończoność.
	 */
	useEffect(() => {
		if (!frameSrc || isReady) return undefined;
		const timer = setTimeout(() => setIsReady(true), 6000);
		return () => clearTimeout(timer);
	}, [frameSrc, isReady]);

	/** Przełącznik motywu w aplikacji przestawia też widget — bez przeładowania. */
	useEffect(() => {
		const frame = frameRef.current;
		if (!frame?.contentWindow || !frameSrc) return;
		frame.contentWindow.postMessage(
			{ type: 'apiSportsWidgetTheme', theme },
			window.location.origin
		);
	}, [theme, frameSrc, isReady]);

	return (
		<div className={cn('relative', className)}>
			{!isReady && (
				<div className="flex flex-col gap-2" style={{ minHeight }} aria-hidden="true">
					<Skeleton className="h-8 w-1/3" />
					<Skeleton className="h-40 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			)}

			{frameSrc && (
				<iframe
					ref={frameRef}
					src={frameSrc}
					title={title}
					loading="lazy"
					// Dopóki nie znamy wysokości, ramka jest niewidoczna, ale musi być w układzie —
					// `display: none` wstrzymałoby ładowanie i wysokość nigdy by nie dotarła.
					className={cn('w-full border-0', !isReady && 'invisible absolute inset-0')}
					style={{ height }}
				/>
			)}
		</div>
	);
}
