import CouponCard from '@/components/coupons/CouponCard';
import LockedCouponCard from '@/components/coupons/LockedCouponCard';
import { cn } from '@/lib/utils';

/**
 * Kupon dnia, 3-dniowy i 5-dniowy obok siebie — z `couponsOverview`. Bez stanu: ten sam blok
 * stoi na „Typach na dziś" i na stronie głównej (`compact`).
 *
 * Płatne kupony bez planu przychodzą zakryte (`locked`) — wtedy karta z kłódką: kurs łączny,
 * szansa, liczba typów, bez meczów. Brak kuponu też jest treścią: rano „pojawi się o 9:30",
 * a gdy model kuponu dnia nie złożył — mówimy to wprost (poza wersją `compact`).
 *
 * @param {{ data: object, c: object, locale: string, compact?: boolean, guest?: boolean, className?: string }} props
 */
export default function CouponsBlock({ data, c, locale, compact = false, guest = false, className }) {
	if (!data) return null;
	const karty = [
		data.today?.legs?.length ? { coupon: data.today, label: c.label.daily } : null,
		...['days3', 'days5'].map((type) => {
			const k = data[type];
			if (!k || k.status === 'none') return null;
			if (k.locked) return { coupon: k, label: c.lockedLabel[type], locked: true };
			return k.legs?.length ? { coupon: k, label: c.label[type] } : null;
		}),
	].filter(Boolean);

	const notki = compact
		? []
		: [
				!data.today?.legs?.length && (data.todayLater ? c.later.daily : data.today?.status === 'none' ? c.none.daily : null),
				data.paidLater ? c.later.paid : null,
			].filter(Boolean);

	if (!karty.length && !notki.length) return null;

	return (
		<div className={cn('flex flex-col gap-3', className)}>
			{karty.length > 0 && (
				<div className={cn('grid gap-4', karty.length > 1 && 'md:grid-cols-2')}>
					{karty.map((k, i) => {
						// Nieparzysta liczba kart (np. trzy kupony): ostatnia na całą szerokość, bez pustej połowy obok.
						const klasa = cn('h-full', karty.length > 1 && karty.length % 2 === 1 && i === karty.length - 1 && 'md:col-span-2');
						return k.locked ? (
							<LockedCouponCard key={k.coupon.key} coupon={k.coupon} c={c} label={k.label} locale={locale} guest={guest} className={klasa} />
						) : (
							<CouponCard key={k.coupon.key} coupon={k.coupon} c={c} label={k.label} locale={locale} compact={compact} className={klasa} />
						);
					})}
				</div>
			)}
			{notki.map((n) => (
				<p key={n} className="rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-muted">
					{n}
				</p>
			))}
		</div>
	);
}
