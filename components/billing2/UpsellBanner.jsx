'use client';

import { usePathname } from 'next/navigation';
import { useB2 } from '@/components/billing2/useB2';
import UpsellNudge from '@/components/billing2/UpsellNudge';
import { useUpsellContext } from '@/components/billing2/useUpsellContext';
import { PRO_WEEK } from '@/lib/billing/plans';

/**
 * Baner zakupu w powłoce strony — najwyżej jeden, wybrany przez serwer (`lib/upsell/context.js`):
 * ostatni dzień próby, trafiony typ z analizy użytkownika albo próba przy ~80% puli.
 *
 * Nie ma go na stronach, na których byłby nie na miejscu: cennik (tam oferta i tak jest),
 * dokumenty prawne, panel admina. Zamknięty znika na 3 dni; trafiony typ ma własny klucz
 * zamknięcia (mecz + typ), więc następny trafiony pojawi się mimo zamknięcia poprzedniego.
 *
 * Każdy baner: tytuł, jedno zdanie z ceną (ok. 20 słów) i ten sam przycisk „Kup 7 dni za 19 zł" —
 * od 22.11.2026 także przy trafionym typie (wcześniej „Odblokuj raport całej kolejki", bez ceny).
 */
const BEZ_BANERA = /\/(cennik|regulamin|polityka-prywatnosci|zwroty|admin)(\/|$)/;

const cena = (grosze) => String(grosze / 100);

export default function UpsellBanner() {
	const t = useB2();
	const pathname = usePathname() || '';
	const ctx = useUpsellContext();
	const banner = ctx?.banner;
	if (!banner || ctx.paid || BEZ_BANERA.test(pathname)) return null;

	const price = cena(PRO_WEEK.priceGrosze);
	const l = PRO_WEEK.limits;
	const cta = t('nudge_cta_pass', { price });

	if (banner.placement === 'trial_last_day') {
		return (
			<UpsellNudge
				placement="trial_last_day"
				title={t('nudge_trial_last_title')}
				body={t('nudge_trial_last_body', { price })}
				cta={cta}
				hideDays={1}
				className="mb-5"
			/>
		);
	}

	if (banner.placement === 'analysis_win') {
		const d = banner.data || {};
		return (
			<UpsellNudge
				placement="analysis_win"
				dismissKey={`analysis_win:${d.home}:${d.away}:${d.selection}`}
				title={t('nudge_win_title', { home: d.home || '', away: d.away || '' })}
				body={t('nudge_win_body', { selection: d.selection || '', reports: l.report, price })}
				cta={cta}
				hideDays={7}
				className="mb-5"
			/>
		);
	}

	if (banner.placement === 'trial_near_limit') {
		const d = banner.data || {};
		return (
			<UpsellNudge
				placement="trial_near_limit"
				title={t('nudge_near_limit_title', { used: d.used ?? 0, limit: d.limit ?? 0, kind: d.kind || 'analysis' })}
				body={t('nudge_near_limit_body', { analyses: l.analysis, questions: l.aiChat, reports: l.report, price })}
				cta={cta}
				className="mb-5"
			/>
		);
	}

	return null;
}
