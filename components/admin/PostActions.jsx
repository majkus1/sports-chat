'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/**
 * Dwa przyciski pod gotowym postem: skopiuj tekst (na Telegram, Facebooka, gdziekolwiek)
 * i otwórz X z wpisanym postem. Publikację zawsze robi człowiek — tu nic nie wychodzi samo.
 */
export default function PostActions({ text, intentUrl }) {
	const [skopiowane, setSkopiowane] = useState(false);

	const kopiuj = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setSkopiowane(true);
			setTimeout(() => setSkopiowane(false), 2000);
		} catch {
			/* przeglądarka bez dostępu do schowka — tekst i tak można zaznaczyć ręcznie */
		}
	};

	return (
		<div className="flex flex-wrap items-center gap-2">
			<a
				href={intentUrl}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-2 rounded-full bg-black px-4 py-2 text-sm font-bold text-white no-underline transition-opacity hover:opacity-85"
			>
				Opublikuj na X
			</a>
			<button
				type="button"
				onClick={kopiuj}
				className="inline-flex items-center gap-2 rounded-full border border-border bg-transparent px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-2"
			>
				{skopiowane ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
				{skopiowane ? 'Skopiowano' : 'Kopiuj tekst'}
			</button>
		</div>
	);
}
