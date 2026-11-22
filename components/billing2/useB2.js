'use client';

import { useLocale, useTranslations } from 'next-intl';
import { PLAN_PASS_DAYS, PRO_WEEK } from '@/lib/billing/plans';
import { formatZl } from '@/lib/billing/offers';

/**
 * Tłumaczenia `billing2` z liczbami z cennika podstawionymi zawsze.
 *
 * Teksty mają miejsca `{week}` (dni przepustki), `{month}` (dni planu) i `{price}` (cena przepustki)
 * zamiast wpisanych „7", „30", „19" — tak jak reszta cennika (`lib/billing/planTexts.js`). Zmiana
 * długości albo ceny przepustki w `plans.js` zmienia wtedy każde zdanie, a test
 * (`test/billing/billing2Messages`) pilnuje, żeby nikt nie wpisał liczby z powrotem ręcznie.
 * Wartości podane przy wywołaniu mają pierwszeństwo (np. `price` innego biletu).
 */
export function b2Defaults(locale) {
	return { week: PRO_WEEK.days, month: PLAN_PASS_DAYS, price: formatZl(PRO_WEEK.priceGrosze, locale) };
}

export function useB2() {
	const t = useTranslations('billing2');
	const domyslne = b2Defaults(useLocale());
	return (key, values = {}) => t(key, { ...domyslne, ...values });
}
