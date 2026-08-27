'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus, X } from 'lucide-react';

/**
 * Skuteczność na stronie głównej — jedyna wysepka kliencka landingu.
 *
 * PRÓG PRÓBY. Procent pokazujemy dopiero od `MIN_SETTLED` rozliczonych typów. Poniżej tej
 * granicy liczba jest statystycznie pusta, a wyeksponowana na stronie głównej działałaby
 * jak obietnica skuteczności — czyli dokładnie to, czego przy treściach okołobukmacherskich
 * robić nie wolno. Do tego czasu opisujemy metodę, nie wynik.
 */
const MIN_SETTLED = 50;

function Stat({ icon: Icon, label, value, tone }) {
	return (
		<span className={`inline-flex items-center gap-1.5 text-sm ${tone}`}>
			<Icon size={14} aria-hidden="true" />
			{label}: <strong className="tabular-nums">{value}</strong>
		</span>
	);
}

export default function AccuracyTeaser({ methodText }) {
	const t = useTranslations('common');
	const [data, setData] = useState(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/stats/picks?scope=global&days=all&author=ai')
			.then((res) => (res.ok ? res.json() : null))
			.then((json) => {
				if (!cancelled) setData(json?.summary || null);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!data || data.settled < MIN_SETTLED) {
		return <p className="mt-4 text-sm leading-relaxed text-muted">{methodText}</p>;
	}

	return (
		<div className="mt-5">
			<p className="flex items-baseline gap-3">
				<span className="font-display text-5xl font-bold tabular-nums text-accent">{data.hitRate}%</span>
				<span className="text-sm text-muted">{t('accuracy_from_settled', { count: data.settled })}</span>
			</p>
			<div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
				<Stat icon={Check} label={t('accuracy_won')} value={data.won} tone="text-win" />
				<Stat icon={X} label={t('accuracy_lost')} value={data.lost} tone="text-loss" />
				<Stat icon={Minus} label={t('accuracy_skipped')} value={data.skipped} tone="text-muted" />
			</div>
		</div>
	);
}
