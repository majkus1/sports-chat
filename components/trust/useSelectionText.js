'use client';

import { useLocale, useTranslations } from 'next-intl';
import { selectionMessage } from '@/lib/trust/format';

/**
 * Tekst selekcji typu z postaci znormalizowanej („Legia lub remis", „Powyżej 2,5 gola").
 * Z `normalized`, nie z tekstu zapisanego przez model językowy — ta sama selekcja ma w rejestrze
 * brzmieć zawsze tak samo, w obu językach.
 */
export function useSelectionText() {
	const t = useTranslations('trust');
	const locale = useLocale();
	return (row) => {
		const m = selectionMessage(row.normalized, {
			homeName: row.homeName,
			awayName: row.awayName,
			home: t('team_home'),
			away: t('team_away'),
			locale,
		});
		return m ? t(m.key, m.values) : '—';
	};
}
