'use client';

import { useTranslations } from 'next-intl';
import { normalizePick } from '@/lib/picks/markets';
import { liftFor, meetsPolicy } from '@/lib/picks/policy';
import { cn } from '@/lib/utils';

/**
 * Podpis pod typem: o ile przewyższa normę swojego rynku.
 *
 * Sam procent nic nie mówi — „84%" brzmi identycznie przy banale i przy odkryciu.
 * Dopiero zestawienie z tym, jak często zdarzenie zachodzi samo z siebie, zamienia liczbę
 * w zdanie z treścią: „o 14 punktów więcej niż zwykle w tym rynku".
 *
 * Normę i przewagę bierze z typu, gdy zostały tam zapisane (raport wiąże je po stronie
 * serwera), a w przeciwnym razie liczy z nazw drużyn tą samą funkcją, która decyduje
 * o wliczeniu typu do statystyki. Typ pod progiem dostaje o tym wyraźną wzmiankę: liczy się
 * do skuteczności jak każdy inny, ale czytelnik ma wiedzieć, że powstał z braku laku.
 */
export default function LiftLabel({
	market,
	selection,
	homeName,
	awayName,
	probability,
	baseRate,
	lift,
	showProbability = false,
	className,
}) {
	const t = useTranslations('common');

	const normalized = normalizePick({ market, selection, homeName, awayName });
	let base = baseRate;
	let przewaga = lift;
	if (!Number.isFinite(base) || !Number.isFinite(przewaga)) {
		({ base, lift: przewaga } = liftFor(normalized, probability));
	}
	// W trakcie strumienia typ pojawia się przed swoim procentem — wtedy nie ma czego podpisać.
	if (!Number.isFinite(base) || !Number.isFinite(przewaga)) return null;

	const powyzej = przewaga > 0;
	const liczony = normalized ? meetsPolicy(normalized, probability).ok : true;
	const norma = Math.round(base);

	return (
		<p className={cn('text-xs leading-relaxed', powyzej && liczony ? 'text-text' : 'text-muted', className)}>
			{/* Etykieta, bo przy typie stoją dwie różne liczby i trzeba je odróżnić. */}
			{showProbability && Number.isFinite(probability) && (
				<>
					{t('report_probability')}{' '}
					<strong className="tabular-nums">{probability}%</strong>
					{' · '}
				</>
			)}
			{powyzej
				? t('pick_lift_above', { lift: przewaga, base: norma })
				: t('pick_lift_below', { lift: Math.abs(przewaga), base: norma })}
			{!liczony && ` · ${t('pick_lift_fallback')}`}
		</p>
	);
}
