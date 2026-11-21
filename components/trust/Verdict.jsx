'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Minus, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MIN_CLV_SAMPLE } from '@/lib/trust/params';
import { formatSignedPct } from '@/lib/trust/format';

const STYL = {
	too_few: { icon: Scale, border: 'border-l-border-strong', text: 'text-muted' },
	behind: { icon: TrendingDown, border: 'border-l-loss', text: 'text-loss' },
	level: { icon: Minus, border: 'border-l-border-strong', text: 'text-text' },
	small: { icon: Scale, border: 'border-l-draw', text: 'text-draw' },
	ahead: { icon: TrendingUp, border: 'border-l-win', text: 'text-win' },
};

/**
 * Werdykt CLV jednym zdaniem (`clvVerdict` w `lib/trust/register.js`) — z tych samych liczb co
 * kafle obok, bez ręcznie pisanych wniosków. Wspólny dla rejestru i strony głównej: gdy liczby się
 * zmienią, zmieni się zdanie, a nie zostanie stary slogan.
 *
 * @param {{ clv: { verdict: string, mean: number|null, n: number } | null, className?: string }} props
 */
export default function Verdict({ clv, className }) {
	const t = useTranslations('trust');
	const locale = useLocale();
	if (!clv) return null;
	const styl = STYL[clv.verdict] || STYL.level;
	const Icon = styl.icon;
	return (
		<div
			className={cn(
				'flex items-start gap-3 rounded-[var(--radius-ui)] border border-l-4 border-border bg-surface px-4 py-3',
				styl.border,
				className
			)}
		>
			<Icon size={18} aria-hidden="true" className={cn('mt-0.5 shrink-0', styl.text)} />
			<p className="text-sm leading-relaxed text-text">
				{t(`verdict_${clv.verdict}`, {
					clv: formatSignedPct(clv.mean, locale, 2) ?? '—',
					n: clv.n,
					min: MIN_CLV_SAMPLE,
				})}
			</p>
		</div>
	);
}
