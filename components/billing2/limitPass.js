import { b2Defaults } from '@/components/billing2/useB2';
import { PRO_WEEK } from '@/lib/billing/plans';

/**
 * Dane do komunikatu o wyczerpanym limicie (`LimitPassCta`) — osobno od komponentu, żeby test
 * (`test/billing/billing2Messages`) sprawdzał te same klucze i liczby bez renderowania JSX.
 */

/** Zdanie (`ux_p2.*`) dla rodzaju limitu. */
export const LIMIT_KEYS = {
	analysis: 'limit_analysis',
	aiChat: 'limit_ai_chat',
	analysisView: 'limit_analysis_view',
	report: 'limit_report',
};

/** Miejsce do pomiaru dla rodzaju limitu (`lib/upsell/placements.js`). */
export const LIMIT_PLACEMENTS = {
	analysis: 'limit_analysis',
	aiChat: 'limit_ai_chat',
	analysisView: 'limit_analysis_view',
	report: 'limit_report',
};

/** Wartości do zdania o limicie — z przepustki, nie z tłumaczeń. Czysta. */
export function limitPassValues(locale) {
	const l = PRO_WEEK.limits;
	return { ...b2Defaults(locale), analyses: l.analysis, questions: l.aiChat, reports: l.report };
}
