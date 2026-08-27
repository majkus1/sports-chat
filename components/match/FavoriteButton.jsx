'use client';

import { useContext, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Star } from 'lucide-react';
import { UserContext } from '@/context/UserContext';
import { cn } from '@/lib/utils';

/**
 * Gwiazdka „dodaj do ulubionych" w nagłówku pokoju meczowego.
 *
 * Stan przełączamy optymistycznie — gwiazdka reaguje od razu, a jeśli serwer odmówi,
 * wraca do poprzedniego stanu. Dla niezalogowanych przycisk nie istnieje: ulubione
 * żyją na koncie, więc bez konta nie ma czego przełączać.
 */
export default function FavoriteButton({ fixtureId, className }) {
	const t = useTranslations('common');
	const { isAuthed } = useContext(UserContext);
	const [isFavorite, setIsFavorite] = useState(false);
	const busyRef = useRef(false);

	useEffect(() => {
		if (!isAuthed) return undefined;
		let cancelled = false;

		(async () => {
			try {
				const res = await fetch('/api/favorites', { credentials: 'include' });
				if (!res.ok || cancelled) return;
				const { favorites } = await res.json();
				setIsFavorite(favorites.some((f) => f.fixtureId === String(fixtureId)));
			} catch {
				/* brak odpowiedzi = gwiazdka zostaje pusta */
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [fixtureId, isAuthed]);

	if (!isAuthed) return null;

	const toggle = async () => {
		if (busyRef.current) return;
		busyRef.current = true;

		const next = !isFavorite;
		setIsFavorite(next);

		try {
			const res = next
				? await fetch('/api/favorites', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						credentials: 'include',
						body: JSON.stringify({ fixtureId: String(fixtureId) }),
					})
				: await fetch(`/api/favorites/${encodeURIComponent(fixtureId)}`, {
						method: 'DELETE',
						credentials: 'include',
					});
			if (!res.ok) setIsFavorite(!next);
		} catch {
			setIsFavorite(!next);
		} finally {
			busyRef.current = false;
		}
	};

	return (
		<button
			type="button"
			onClick={toggle}
			aria-pressed={isFavorite}
			aria-label={isFavorite ? t('favorite_remove') : t('favorite_add')}
			title={isFavorite ? t('favorite_remove') : t('favorite_add')}
			className={cn(
				'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
				isFavorite ? 'text-draw hover:bg-surface-2' : 'text-muted hover:bg-surface-2 hover:text-text',
				className
			)}
		>
			<Star size={17} aria-hidden="true" fill={isFavorite ? 'currentColor' : 'none'} />
		</button>
	);
}
