'use client';

import { useEffect } from 'react';
import { trackUpsellView } from '@/lib/upsell/track';

/**
 * Wyświetlenie okna zakupu liczy się dopiero przy połowie elementu na ekranie — nie przy
 * wyrenderowaniu pod zgięciem strony, której nikt nie przewinął. Wspólne dla przycisków
 * pod kłódką i komunikatów o wyczerpanym limicie.
 *
 * @param {{ current: Element|null }} ref
 * @param {string} placement miejsce z `lib/upsell/placements.js`
 * @param {boolean} [enabled] `false`, gdy element się nie pokazuje (np. płacący)
 */
export function useUpsellView(ref, placement, enabled = true) {
	useEffect(() => {
		if (!enabled || !ref.current) return undefined;
		if (typeof IntersectionObserver === 'undefined') {
			trackUpsellView(placement);
			return undefined;
		}
		const obserwator = new IntersectionObserver(
			(wpisy) => {
				if (wpisy.some((w) => w.isIntersecting)) {
					trackUpsellView(placement);
					obserwator.disconnect();
				}
			},
			{ threshold: 0.5 }
		);
		obserwator.observe(ref.current);
		return () => obserwator.disconnect();
	}, [ref, placement, enabled]);
}
