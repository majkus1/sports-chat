'use client';

import { useContext, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { UserContext } from '@/context/UserContext';

/**
 * Typ modelu na stronie meczu dla planu z liczbami (Pro, VIP, okres próbny).
 *
 * Strona meczu jest jedna dla wszystkich i trzymana w pamięci podręcznej, więc serwer
 * zawsze rysuje wersję z kłódką (`children`). Zalogowany pyta po załadowaniu tą samą trasą
 * co plakietki na liście meczów — o tym, co zobaczy, decyduje plan, tak samo jak tam.
 * Gość nie pyta wcale: kłódka zostaje, a strona nie liczy niczego na jego wejście.
 */
export default function PickUnlock({ fixtureId, date, usually, children }) {
	const { isAuthed } = useContext(UserContext);
	const [hint, setHint] = useState(null);

	useEffect(() => {
		if (!isAuthed) return undefined;
		let cancelled = false;
		fetch(`/api/football/model-hints?date=${date}`, { credentials: 'include' })
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => {
				const h = d?.hints?.[fixtureId];
				if (!cancelled && h && !h.locked) setHint(h);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [isAuthed, date, fixtureId]);

	if (!hint) return children;
	return (
		<div className="flex flex-wrap items-center gap-2">
			<span className="inline-flex items-center gap-1.5 rounded-[var(--radius-ui)] bg-accent px-3 py-2 text-base font-bold text-accent-fg">
				<Sparkles size={15} aria-hidden="true" />
				{hint.selection}
			</span>
			<span className="text-2xl font-bold tabular-nums text-text">{hint.probability}%</span>
			<span className="text-sm text-muted">
				({usually} {Math.round(hint.base)}%)
			</span>
			<span className="rounded-md bg-accent-soft px-2 py-1 text-xs font-bold tabular-nums text-accent">+{hint.lift}</span>
		</div>
	);
}
