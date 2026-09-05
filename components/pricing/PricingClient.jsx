'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2, Minus } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PLAN_PASS_DAYS, PUBLIC_PLANS } from '@/lib/billing/plans';
import CreditPacks from '@/components/billing/CreditPacks';
import PurchaseConsentDialog from '@/components/billing/PurchaseConsentDialog';
import { cn } from '@/lib/utils';

/** Limity są liczbami albo `null` (bez ograniczeń) — jedno i drugie trzeba pokazać. */
function LimitRow({ label, value, unlimitedLabel }) {
	return (
		<li className="flex items-center gap-2 text-sm">
			<Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
			<span className="text-muted">{label}:</span>
			<span className="font-semibold text-text">{value === null ? unlimitedLabel : value}</span>
		</li>
	);
}

export default function PricingClient() {
	const t = useTranslations('common');
	const locale = useLocale();
	const [entitlements, setEntitlements] = useState(null);

	/*
	 * Komunikat po powrocie ze Stripe'a.
	 *
	 * Świadomie mówi „kredyty pojawią się po potwierdzeniu", a nie „kupiono" — powrót na tę
	 * stronę NIE jest dowodem zapłaty. Przy BLIK-u potwierdzenie przychodzi chwilę później,
	 * osobnym zdarzeniem, i dopiero ono dolicza kredyty.
	 */
	const paymentResult = useSearchParams().get('platnosc');

	/** Który plan jest właśnie kupowany — blokuje przyciski na czas przekierowania. */
	const [busyPlan, setBusyPlan] = useState(null);
	const [planError, setPlanError] = useState(null);

	const isLoggedIn = Boolean(entitlements?.isLoggedIn);
	const paymentsReady = Boolean(entitlements?.payments?.credits);

	/** Plan czekający na oświadczenie konsumenta — dopiero po nim ruszamy płatność. */
	const [pendingPlan, setPendingPlan] = useState(null);

	const confirmPlan = async (consent) => {
		const plan = pendingPlan;
		if (!plan) return;

		setBusyPlan(plan.id);
		setPlanError(null);
		try {
			const res = await fetch('/api/billing/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ planId: plan.id, locale, ...consent }),
			});
			const data = await res.json().catch(() => ({}));

			if (res.ok && data.url) {
				// Pełne przekierowanie — cel jest poza aplikacją.
				window.location.href = data.url;
				return;
			}
			setPlanError(
				res.status === 503
					? t('credits_unavailable')
					: res.status === 409
						? t('consent_outdated')
						: t('credits_error')
			);
			setPendingPlan(null);
		} catch {
			setPlanError(t('credits_error'));
			setPendingPlan(null);
		} finally {
			setBusyPlan(null);
		}
	};

	// Bieżący plan podświetlamy, żeby zalogowany widział, gdzie stoi.
	useEffect(() => {
		let cancelled = false;
		fetch('/api/me/entitlements', { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!cancelled) setEntitlements(data);
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<AppShell contentClassName="mx-auto w-full max-w-5xl">
			<BackLink label={t('back_home')} />
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">
				{t('pricing_title')}
			</h1>
			<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('pricing_intro')}</p>
			{/* Pula powitalna to główny argument za założeniem konta — musi być widoczna
			    obok cen, a nie schowana w regulaminie. */}
			<p className="mt-3 inline-flex rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
				{t('pricing_trial')}
			</p>

			{paymentResult && (
				<p
					role="status"
					className={cn(
						'mt-4 rounded-[var(--radius-ui)] px-4 py-3 text-sm',
						paymentResult === 'sukces' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted'
					)}
				>
					{paymentResult === 'sukces'
						? t('credits_payment_success')
						: t('credits_payment_cancelled')}
				</p>
			)}

			{entitlements?.isLoggedIn && (
				<p className="mt-4 text-sm text-muted">
					{t('pricing_current_usage', {
						used: entitlements.usage?.analysis?.used ?? 0,
						limit:
							entitlements.usage?.analysis?.limit === null
								? '∞'
								: (entitlements.usage?.analysis?.limit ?? 0),
					})}
				</p>
			)}

			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{PUBLIC_PLANS.map((plan) => {
					const isCurrent = entitlements?.plan === plan.id;
					return (
						<Card
							key={plan.id}
							className={cn(
								'flex flex-col',
								isCurrent && 'border-accent ring-1 ring-accent'
							)}
						>
							<CardHeader className="gap-2">
								<div className="flex items-center justify-between gap-2">
									<CardTitle>{t(plan.nameKey)}</CardTitle>
									{isCurrent && <Badge variant="accent">{t('pricing_current')}</Badge>}
								</div>
								<p className="text-2xl font-bold text-text">
									{plan.priceMonthlyPln === 0 ? (
										t('pricing_free')
									) : (
										<>
											{plan.priceMonthlyPln} zł
											<span className="text-sm font-normal text-muted"> / {t('pricing_month')}</span>
										</>
									)}
								</p>
							</CardHeader>

							<CardContent className="flex flex-1 flex-col gap-4">
								<ul className="[&>li+li]:mt-2">
									<LimitRow
										label={t('pricing_analyses')}
										value={plan.limits.analysis}
										unlimitedLabel={t('pricing_unlimited')}
									/>
									{/*
									 * Czytanie cudzych analiz było jedyną pozycją widoczną w panelu konta,
									 * a nieobecną w cenniku — więc użytkownik spotykał ten limit dopiero,
									 * gdy go wyczerpał, i nie miał gdzie sprawdzić, czym się różnią plany.
									 * To realna różnica: darmowy ma dzienny sufit, płatne nie mają żadnego.
									 */}
									<LimitRow
										label={t('pricing_analysis_view')}
										value={plan.limits.analysisView}
										unlimitedLabel={t('pricing_unlimited')}
									/>
									<LimitRow
										label={t('pricing_ai_chat')}
										value={plan.limits.aiChat}
										unlimitedLabel={t('pricing_unlimited')}
									/>
									<LimitRow
										label={t('pricing_reports')}
										value={plan.limits.report}
										unlimitedLabel={t('pricing_unlimited')}
									/>
									<li className="flex items-center gap-2 text-sm">
										{plan.features.includes('live_analysis') ? (
											<Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
										) : (
											<Minus size={14} className="shrink-0 text-muted" aria-hidden="true" />
										)}
										<span
											className={
												plan.features.includes('live_analysis') ? 'text-text' : 'text-muted'
											}
										>
											{t('pricing_live_analysis')}
										</span>
									</li>
								</ul>

								<div className="mt-auto pt-2">
									{plan.priceMonthlyPln === 0 ? (
										<Button variant="outline" block disabled>
											{t('pricing_default_plan')}
										</Button>
									) : (
										/*
										 * Zakup dostępu na 30 dni, nie subskrypcja.
										 *
										 * Przycisk jest czynny tylko wtedy, gdy płatności są skonfigurowane —
										 * czynny przycisk prowadzący do komunikatu o błędzie jest gorszy niż
										 * wyłączony z uczciwą etykietą.
										 */
										<Button
											variant="accent"
											block
											disabled={!isLoggedIn || !paymentsReady || busyPlan !== null}
											title={!paymentsReady ? t('pricing_soon_hint') : undefined}
											onClick={() => setPendingPlan(plan)}
										>
											{busyPlan === plan.id && (
												<Loader2 size={15} aria-hidden="true" className="animate-spin" />
											)}
											{!paymentsReady
												? t('pricing_soon')
												: isLoggedIn
													? t('pricing_buy_days', { days: PLAN_PASS_DAYS })
													: t('credits_login_first')}
										</Button>
									)}
								</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			{/*
			 * Skąd biorą się „cudze analizy" — jedno zdanie, bo bez niego cała pozycja jest
			 * zagadką. Analiza meczu powstaje raz i widzą ją wszyscy; kto wchodzi później,
			 * czyta gotową, nie zużywając własnej puli. Bez tego zdania wygląda to na drugi,
			 * niezrozumiały limit, a jest odwrotnie: to sposób, żeby limitu nie ruszać.
			 */}
			<p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted">
				{t('quota_shared_note')}
			</p>

			<p className="mt-3 max-w-2xl text-xs leading-relaxed text-muted">
				{t('pricing_one_off_note')}
			</p>

			{planError && <p className="mt-4 text-sm text-loss">{planError}</p>}

			<PurchaseConsentDialog
				item={
					pendingPlan && {
						id: pendingPlan.id,
						label: `${t(pendingPlan.nameKey)} — ${PLAN_PASS_DAYS} ${t('pricing_days')}`,
						priceGrosze: pendingPlan.priceMonthlyPln * 100,
					}
				}
				busy={busyPlan !== null}
				onConfirm={confirmPlan}
				onClose={() => setPendingPlan(null)}
			/>

			<CreditPacks
				credits={entitlements?.credits ?? 0}
				isLoggedIn={Boolean(entitlements?.isLoggedIn)}
				available={Boolean(entitlements?.payments?.credits)}
			/>

			<p className="mt-10 text-xs leading-relaxed text-muted">{t('analysis_disclaimer')}</p>
		</AppShell>
	);
}
