'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useB2 } from '@/components/billing2/useB2';
import { Coins, TriangleAlert } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { planMessageParams } from '@/lib/billing/planTexts';

/**
 * Stan konta: plan, termin jego ważności, saldo kredytów i zużycie każdego limitu.
 *
 * Dane były dostępne w `/api/me/entitlements` od początku, ale interfejs pokazywał z nich
 * dwa pola na stronie cennika. Najbardziej brakowało TERMINU: plany sprzedajemy jako dostęp
 * na 30 dni z płatnością jednorazową, więc bez widocznej daty użytkownik dowiadywał się
 * o wygaśnięciu dopiero wtedy, gdy coś przestawało działać.
 *
 * Kolejność sekcji odpowiada temu, po co się tu zagląda: najpierw „ile mi zostało czasu",
 * potem „ile mam kredytów", na końcu „ile zużyłem".
 */

/** Kolejność jak w cenniku; nazwy krótkie, bo wiersz panelu jest wąski. */
const KINDS = [
	['analysis', 'quota_analysis'],
	['analysisView', 'quota_analysis_view'],
	['aiChat', 'quota_ai_chat'],
	['aiNews', 'quota_ai_news'],
	['report', 'quota_report'],
	['couponGen', 'quota_coupon_gen'],
];

/** Ile dni zostało do podanej daty; `null`, gdy termin nie obowiązuje. */
function daysLeft(validUntil) {
	if (!validUntil) return null;
	const ms = new Date(validUntil).getTime() - Date.now();
	if (!Number.isFinite(ms)) return null;
	return Math.max(0, Math.ceil(ms / 86_400_000));
}

function UsageRow({ label, limit, used }) {
	const t = useTranslations('common');

	// `null` znaczy „bez limitu" — pasek postępu nie miałby wtedy sensu.
	if (limit === null) {
		return (
			<li className="flex items-baseline justify-between gap-3 text-sm">
				<span className="text-muted">{label}</span>
				<span className="font-semibold text-text">{t('pricing_unlimited')}</span>
			</li>
		);
	}

	const total = Number(limit) || 0;
	const spent = Math.min(Number(used) || 0, total);
	const percent = total > 0 ? Math.round((spent / total) * 100) : 100;
	// Trzy progi zamiast gradientu: kolor ma nieść informację, a nie dekorować.
	const tone = percent >= 100 ? 'bg-loss' : percent >= 80 ? 'bg-draw' : 'bg-accent';

	return (
		<li className="text-sm">
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-muted">{label}</span>
				<span className="font-semibold tabular-nums text-text">
					{spent}/{total}
				</span>
			</div>
			<div
				className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2"
				role="progressbar"
				aria-valuenow={spent}
				aria-valuemin={0}
				aria-valuemax={total}
				aria-label={label}
			>
				<div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
			</div>
		</li>
	);
}

export default function PlanSummary({ className = '' }) {
	const t = useTranslations('common');
	const b = useB2();
	const locale = useLocale();
	const [data, setData] = useState(null);

	useEffect(() => {
		let cancelled = false;
		fetch('/api/me/entitlements', { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : null))
			.then((payload) => {
				if (!cancelled) setData(payload);
			})
			.catch(() => {
				/* panel po prostu się nie pokaże — to nie jest powód do komunikatu o błędzie */
			});
		return () => {
			cancelled = true;
		};
	}, []);

	if (!data?.isLoggedIn) return null;

	const left = daysLeft(data.validUntil);
	const isPaid = data.plan !== 'free';
	// Trzy dni to moment, w którym przedłużenie jest jeszcze decyzją, a nie ratowaniem sytuacji.
	const expiringSoon = isPaid && left !== null && left <= 3;
	// Przepustka 7 dni: ten sam Pro, krótszy bilet — panel pokazuje „Pro · 7 dni" i drogę do 30 dni.
	const isPass = data.pass === 'pro_week';
	// Z przepustki naturalnym przedłużeniem jest Pro na 30 dni (dni przepustki nie przepadają).
	const extendHref = isPass ? '/cennik?oferta=pro' : '/cennik';

	return (
		<div className={className}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<span className="rounded-[var(--radius-ui)] bg-accent px-2 py-0.5 font-display text-xs font-bold uppercase tracking-wide text-white">
					{isPass ? b('panel_pass', { plan: t(data.nameKey), days: data.passDays }) : t(data.nameKey)}
				</span>

				{isPaid && data.validUntil && (
					<span className="text-xs text-muted">
						{t('plan_valid_until', {
							date: new Date(data.validUntil).toLocaleDateString(locale),
							days: left ?? 0,
						})}
					</span>
				)}

				<span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
					<Coins size={13} aria-hidden="true" className="text-draw" />
					{t('credits_balance', { count: data.credits ?? 0 })}
				</span>
			</div>

			{expiringSoon && (
				<p className="mt-2 flex items-start gap-2 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs leading-relaxed text-text">
					<TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-draw" />
					<span>
						{t('plan_expiring_soon', { days: left })}{' '}
						<Link href={extendHref} className="footer-link underline">
							{t('plan_extend')}
						</Link>
					</span>
				</p>
			)}

			{isPass && !expiringSoon && (
				<p className="mt-2 text-xs leading-relaxed text-muted">
					<Link href={extendHref} className="footer-link underline">
						{b('panel_upgrade')}
					</Link>
				</p>
			)}

			<ul className="mt-3 flex flex-col gap-2.5">
				{KINDS.map(([kind, labelKey]) => {
					const row = data.usage?.[kind];
					if (!row) return null;
					return <UsageRow key={kind} label={t(labelKey)} limit={row.limit} used={row.used} />;
				})}
			</ul>

			{/*
			 * Dwa zdania, nie akapit. „Czytanie cudzych analiz" to jedyna pozycja tej listy,
			 * której nazwa sama z siebie nic nie mówi — użytkownik nie wie, skąd biorą się
			 * cudze analizy ani dlaczego mają osobny licznik. Wyjaśnienie idzie pierwsze,
			 * bo bez niego pozostała część przypisu dotyczy czegoś nieznanego.
			 */}
			<p className="mt-3 text-xs leading-relaxed text-muted">
				{t('quota_shared_note')} {t('quota_reset_note', planMessageParams(locale).quota_reset_note)}{' '}
				<Link href="/cennik" className="footer-link underline">
					{t('see_plans')}
				</Link>
			</p>
		</div>
	);
}
