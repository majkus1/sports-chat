'use client';

import { useCallback, useState } from 'react';
import { Link } from '@/i18n/routing';
import GuideModal from '@/components/football/GuideModal';
import { openAccountPanel } from '@/lib/tools/accountPanel';

/**
 * Przycisk kafelka, który zamiast przejścia robi coś na miejscu: otwiera panel konta
 * w nagłówku albo przewodnik.
 *
 * Zostaje odnośnikiem z prawdziwym adresem (`href` kafelka) — bez JavaScriptu albo przy
 * otwieraniu w nowej karcie (Ctrl/⌘, środkowy przycisk) prowadzi tam, gdzie funkcja jest
 * opisana. Zwykłe kliknięcie przechwytujemy i robimy to, co obiecuje napis.
 */

/** Kliknięcie „otwórz w nowej karcie" zostawiamy przeglądarce. */
function zwykleKlikniecie(event) {
	return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export default function ToolAction({ action, href, className, children }) {
	const [guideOpen, setGuideOpen] = useState(false);
	const closeGuide = useCallback(() => setGuideOpen(false), []);

	const onClick = (event) => {
		if (!zwykleKlikniecie(event)) return;
		event.preventDefault();
		if (action === 'guide') setGuideOpen(true);
		else openAccountPanel();
	};

	return (
		<>
			<Link
				href={href}
				onClick={onClick}
				className={className}
				aria-haspopup={action === 'guide' ? 'dialog' : undefined}
			>
				{children}
			</Link>
			{action === 'guide' && <GuideModal open={guideOpen} onClose={closeGuide} />}
		</>
	);
}
