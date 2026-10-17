import CouponCard from '@/components/coupons/CouponCard';
import { cn } from '@/lib/utils';

/**
 * Kupon dnia i weekendowy obok siebie — z `couponsOverview`. Bez stanu: ten sam blok stoi
 * na „Typach na dziś" (serwer) i na stronie głównej (klient, `compact`).
 *
 * Brak kuponu też jest treścią: rano „pojawi się o 9:30", a gdy model kuponu nie złożył —
 * mówimy to wprost. Na stronie głównej (`compact`) pokazujemy wyłącznie gotowe kupony.
 */

/** Weekendowy jest „bieżący" do dnia po ostatnim meczu; potem to kupon z ostatniego weekendu. */
function biezacy(coupon, now = Date.now()) {
	const ostatni = Math.max(...coupon.legs.map((l) => Date.parse(l.kickoff)));
	return coupon.status === 'pending' || ostatni >= now - 24 * 3600_000;
}

export default function CouponsBlock({ data, c, locale, compact = false, className }) {
	if (!data) return null;
	const dzienny = data.today?.legs?.length ? data.today : null;
	const weekend = data.weekend?.legs?.length ? data.weekend : null;
	const weekendTeraz = weekend && biezacy(weekend);
	// Na stronie głównej tylko kupony w grze — rozliczony weekend sprzed kilku dni nic tam nie wnosi.
	const karty = [
		dzienny && { coupon: dzienny, label: c.label.daily },
		weekend && (!compact || weekendTeraz) && { coupon: weekend, label: weekendTeraz ? c.label.weekend : c.lastWeekend },
	].filter(Boolean);

	const notki = compact
		? []
		: [
				!dzienny && (data.todayLater ? c.later.daily : data.today?.status === 'none' ? c.none.daily : null),
				!weekend && (data.weekendLater ? c.later.weekend : data.weekend?.status === 'none' ? c.none.weekend : null),
			].filter(Boolean);

	if (!karty.length && !notki.length) return null;

	return (
		<div className={cn('flex flex-col gap-3', className)}>
			{karty.length > 0 && (
				<div className={cn('grid gap-4', karty.length > 1 && 'md:grid-cols-2')}>
					{karty.map((k) => (
						<CouponCard key={k.coupon.key} coupon={k.coupon} c={c} label={k.label} locale={locale} compact={compact} className="h-full" />
					))}
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
