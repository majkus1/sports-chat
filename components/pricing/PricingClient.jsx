'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useB2 } from '@/components/billing2/useB2';
import { Check, CheckCircle2, Clock, Loader2, Minus, Sparkles } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import BackLink from '@/components/layout/BackLink';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PRO_WEEK, QUOTA_PERIODS, TRIAL } from '@/lib/billing/plans';
import { FEATURE_ROWS, QUOTA_ROWS, planMessageParams } from '@/lib/billing/planTexts';
import { PRICING_OFFERS, formatZl, monthVsWeekSaving } from '@/lib/billing/offers';
import { OPERATOR } from '@/lib/legal/operator';
import { isPlacement } from '@/lib/upsell/placements';
import { useAuthKey } from '@/context/UserContext';
import CreditPacks from '@/components/billing/CreditPacks';
import PurchaseConsentDialog from '@/components/billing/PurchaseConsentDialog';
import PaymentMethods from '@/components/billing2/PaymentMethods';
import CheckoutError from '@/components/billing2/CheckoutError';
import { clearPending, readPending, startCheckout } from '@/components/billing2/checkout';
import { cn } from '@/lib/utils';

/*
 * Cennik — od 21.11.2026 cztery karty: plan darmowy, przepustka Pro na 7 dni, Pro i VIP na 30 dni.
 *
 * CO SIĘ ZMIENIŁO PO PRZEJŚCIU ŚCIEŻKI ZAKUPU (etap C):
 *  - gość widział wyłączony przycisk „Zaloguj się, aby kupić" i nie miał czego kliknąć — teraz
 *    przycisk otwiera rejestrację w nawigacji (`czat:auth`), a po zalogowaniu stan odświeża się sam;
 *  - przy cenie stało „/ mies.", choć to bilet na 30 dni, a metody płatności były tylko w drobnym
 *    druku — teraz „za 30 dni", cena za dzień i BLIK / Przelewy24 / karta nad kartami;
 *  - po powrocie ze Stripe'a plan dostawał komunikat o kredytach — teraz cennik czeka na webhook
 *    i mówi konkretnie: „Pro działa do 28.11" albo „masz 15 kredytów";
 *  - każdy błąd startu płatności ma własne zdanie i wyjście (`components/billing2/CheckoutError`).
 *
 * Pozycje cennika (`QUOTA_ROWS`, `FEATURE_ROWS`) — te same w karcie i w słowniczku pod kartami;
 * zero jako kreska, nie fajka. Lista i liczby do zdań: `lib/billing/planTexts.js`.
 */

/** Limit: liczba z okresem, `null` jako „bez limitu", zero jako kreska — nie fajka przy zerze. */
function LimitRow({ label, value, period }) {
	const t = useTranslations('common');
	const none = value === 0;
	return (
		<li className="flex items-center gap-2 text-sm">
			{none ? (
				<Minus size={14} className="shrink-0 text-muted" aria-hidden="true" />
			) : (
				<Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
			)}
			<span className={none ? 'text-muted' : 'text-text'}>{label}</span>
			<span className={cn('ml-auto shrink-0 text-right font-semibold', none ? 'text-muted' : 'text-text')}>
				{none ? (
					t('pricing_none')
				) : value === null ? (
					t('pricing_unlimited')
				) : (
					<>
						{value}
						<span className="font-normal text-muted"> {period}</span>
					</>
				)}
			</span>
		</li>
	);
}

function FeatureRow({ label, on }) {
	return (
		<li className="flex items-center gap-2 text-sm">
			{on ? (
				<Check size={14} className="shrink-0 text-accent" aria-hidden="true" />
			) : (
				<Minus size={14} className="shrink-0 text-muted" aria-hidden="true" />
			)}
			<span className={on ? 'text-text' : 'text-muted'}>{label}</span>
		</li>
	);
}

/** Bilet, na którym jest konto, w języku kart: `free`, `pro_week`, `pro`, `vip`. */
const currentOfferId = (ent) => (!ent?.isLoggedIn ? null : ent.pass || (ent.plan === 'free' ? 'free' : ent.plan));

/** Ile razy i co ile pytać o stan konta po powrocie ze Stripe'a: 15 × 2 s = 30 s. */
const POLL_TRIES = 15;
const POLL_MS = 2000;

export default function PricingClient() {
	const t = useTranslations('common');
	const b = useB2();
	const locale = useLocale();
	const authKey = useAuthKey();
	const params = useSearchParams();
	const [entitlements, setEntitlements] = useState(null);
	// Liczby do zdań cennika (okres próbny, 30 dni, przedział kuponów) — z planów, nie z tłumaczeń.
	const liczby = planMessageParams(locale);

	const paymentResult = params.get('platnosc');
	/** Karta do podświetlenia (`?oferta=pro_week` z okna zakupu) i źródło do pomiaru (`?z=`). */
	const highlightId = params.get('oferta');
	const source = isPlacement(params.get('z')) ? params.get('z') : null;

	const [busyId, setBusyId] = useState(null);
	const [error, setError] = useState(null);
	/** Oferta czekająca na oświadczenie konsumenta — dopiero po nim ruszamy płatność. */
	const [pendingOffer, setPendingOffer] = useState(null);
	/** Stan po powrocie: `waiting` | `plan` | `credits` | `slow` | `cancelled`. */
	const [ret, setRet] = useState(null);
	const cardRefs = useRef({});

	const isLoggedIn = Boolean(entitlements?.isLoggedIn);
	const paymentsReady = Boolean(entitlements?.payments?.credits);
	const current = currentOfferId(entitlements);
	const isPaid = Boolean(entitlements?.pass);

	const loadEntitlements = useCallback(
		() =>
			fetch('/api/me/entitlements', { credentials: 'include' })
				.then((res) => (res.ok ? res.json() : null))
				.catch(() => null),
		[]
	);

	// Po zalogowaniu w oknie nawigacji klucz sesji się zmienia — cennik od razu wie, że można kupić.
	useEffect(() => {
		if (!authKey) return undefined;
		let cancelled = false;
		loadEntitlements().then((data) => {
			if (!cancelled && data) setEntitlements(data);
		});
		return () => {
			cancelled = true;
		};
	}, [authKey, loadEntitlements]);

	/*
	 * Powrót ze Stripe'a. Adres powrotu NIE jest dowodem zapłaty — dostęp przyznaje dopiero webhook,
	 * przy BLIK-u chwilę po powrocie. Czekamy więc na zmianę konta względem stanu sprzed płatności
	 * (`components/billing2/checkout.js`) i dopiero wtedy mówimy „gotowe".
	 */
	useEffect(() => {
		if (paymentResult === 'anulowana') {
			clearPending();
			setRet({ state: 'cancelled' });
			return undefined;
		}
		if (paymentResult !== 'sukces') return undefined;

		const pending = readPending();
		setRet({ state: 'waiting' });
		let cancelled = false;
		let proby = 0;

		const gotowe = (data) => {
			if (!data || !pending) return false;
			if (pending.kind === 'plan') {
				const przed = pending.validUntil ? new Date(pending.validUntil).getTime() : 0;
				return Boolean(data.validUntil) && new Date(data.validUntil).getTime() > przed;
			}
			return (data.credits ?? 0) > (pending.credits ?? 0);
		};

		const sprawdz = async () => {
			if (cancelled) return;
			proby += 1;
			const data = await loadEntitlements();
			if (cancelled) return;
			if (data) setEntitlements(data);
			if (gotowe(data)) {
				clearPending();
				setRet({ state: pending.kind === 'plan' ? 'plan' : 'credits', data });
				return;
			}
			// Bez zapisanego zakupu (inna karta, wyczyszczona pamięć) nie da się stwierdzić „gotowe" —
			// zostaje neutralne „czekamy", bez alarmu.
			if (!pending) return;
			if (proby >= POLL_TRIES) {
				setRet({ state: 'slow' });
				return;
			}
			setTimeout(sprawdz, POLL_MS);
		};
		sprawdz();
		return () => {
			cancelled = true;
		};
	}, [paymentResult, loadEntitlements]);

	// Przewinięcie do karty wskazanej przez okno zakupu, gdy już wiadomo, jak wygląda strona.
	useEffect(() => {
		if (!highlightId || !entitlements) return;
		cardRefs.current[highlightId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}, [highlightId, entitlements]);

	const openRegister = () => window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'register' }));

	const confirmOffer = async (consent) => {
		const offer = pendingOffer;
		if (!offer) return;
		setBusyId(offer.id);
		setError(null);
		const wynik = await startCheckout({
			body: { planId: offer.passId, locale, source, ...consent },
			before: { validUntil: entitlements?.validUntil || null, credits: entitlements?.credits ?? 0 },
		});
		if (!wynik.ok) {
			setError(wynik.error);
			setPendingOffer(null);
			setBusyId(null);
		}
		// Przy sukcesie zostaje kręcące się kółko — strona właśnie przechodzi do Stripe'a.
	};

	const title = (offer) => (offer.id === 'free' ? t('plan_free') : b(offer.titleKey));
	const weekOffer = PRICING_OFFERS.find((o) => o.id === PRO_WEEK.id);
	const monthOffer = PRICING_OFFERS.find((o) => o.id === 'pro');
	// Nowy = bez planu płatnego (gość, okres próbny, plan darmowy). Płacący rekomendacji nie widzą.
	const showRecommendation = !isPaid;
	const data = (iso) => new Date(iso).toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL');

	const buyButton = (offer) => {
		if (offer.priceGrosze === 0) {
			return (
				<Button variant="outline" block disabled>
					{t('pricing_default_plan')}
				</Button>
			);
		}
		if (!paymentsReady) {
			return (
				<Button variant="outline" block disabled title={t('pricing_soon_hint')}>
					{t('pricing_soon')}
				</Button>
			);
		}
		if (!isLoggedIn) {
			return (
				<Button variant={offer.recommendedForNew ? 'accent' : 'outline'} block onClick={openRegister}>
					{b('guest_buy')}
				</Button>
			);
		}
		// Przepustka przy aktywnym planie 30-dniowym nic nie daje — trasa i tak by jej nie sprzedała.
		const blokada = offer.id === PRO_WEEK.id && (current === 'pro' || current === 'vip');
		const wyrozniony = isPaid ? offer.id === 'pro' : offer.recommendedForNew;
		return (
			<>
				<Button
					variant={wyrozniony ? 'accent' : 'outline'}
					block
					disabled={blokada || busyId !== null}
					onClick={() => setPendingOffer(offer)}
				>
					{busyId === offer.id && <Loader2 size={15} aria-hidden="true" className="animate-spin" />}
					{offer.id === PRO_WEEK.id
						? b('buy_week', { price: formatZl(offer.priceGrosze, locale) })
						: b('buy_days', { days: offer.days, price: formatZl(offer.priceGrosze, locale) })}
				</Button>
				{blokada && <p className="mt-2 text-xs leading-relaxed text-muted">{b('downgrade_hint')}</p>}
			</>
		);
	};

	return (
		<AppShell contentClassName="mx-auto w-full max-w-6xl">
			<BackLink label={t('back_home')} />
			<h1 className="font-display text-2xl font-bold uppercase tracking-wide text-text">{t('pricing_title')}</h1>
			<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('pricing_intro')}</p>
			{/* Pula powitalna to główny argument za założeniem konta — musi być widoczna obok cen. */}
			<p className="mt-3 inline-flex rounded-full border border-accent bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent">
				{t('pricing_trial', liczby.pricing_trial)}
			</p>

			{ret && <ReturnStatus ret={ret} locale={locale} />}

			{entitlements?.isLoggedIn && (
				<p className="mt-4 text-sm text-muted">
					{entitlements.usage?.analysis?.limit === null
						? t('pricing_current_usage_unlimited', { used: entitlements.usage?.analysis?.used ?? 0 })
						: t('pricing_current_usage', {
								used: entitlements.usage?.analysis?.used ?? 0,
								limit: entitlements.usage?.analysis?.limit ?? 0,
							})}
				</p>
			)}

			{/*
			 * Rekomendacja dla nowych: przepustka 7 dni. Jedno zdanie o tym, co daje, i jedno o tym,
			 * że nic się nie odnawia — to dwa pytania, które padają przed pierwszym zakupem.
			 */}
			{showRecommendation && (
				<section
					aria-labelledby="pricing-start"
					className="mt-6 flex flex-col gap-3 rounded-[var(--radius-ui)] border border-accent/50 bg-accent-soft px-5 py-4 sm:flex-row sm:items-center sm:gap-6"
				>
					<div className="flex-1">
						<h2 id="pricing-start" className="flex items-center gap-2 text-base font-bold text-text">
							<Sparkles size={16} aria-hidden="true" className="text-accent" />
							{b('recommend_title')}
						</h2>
						<p className="mt-1 text-sm leading-relaxed text-muted">
							{b('recommend_body', { price: formatZl(PRO_WEEK.priceGrosze, locale) })}
						</p>
					</div>
					{paymentsReady && (
						<Button
							variant="accent"
							className="shrink-0"
							disabled={busyId !== null}
							onClick={() => (isLoggedIn ? setPendingOffer(weekOffer) : openRegister())}
						>
							{isLoggedIn ? b('recommend_cta') : b('guest_buy')}
						</Button>
					)}
				</section>
			)}

			{current === PRO_WEEK.id && entitlements?.validUntil && (
				<p className="mt-4 rounded-[var(--radius-ui)] bg-surface-2 px-4 py-3 text-sm text-text">
					{b('upgrade_hint', { date: data(entitlements.validUntil) })}
				</p>
			)}

			<PaymentMethods className="mt-6" />

			<div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{PRICING_OFFERS.map((offer) => {
					const isCurrent = current === offer.id;
					const highlighted = highlightId === offer.id || (offer.recommendedForNew && showRecommendation);
					return (
						<Card
							key={offer.id}
							ref={(el) => {
								cardRefs.current[offer.id] = el;
							}}
							className={cn('flex scroll-mt-28 flex-col', (isCurrent || highlighted) && 'border-accent ring-1 ring-accent')}
						>
							<CardHeader className="gap-2">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<CardTitle>{title(offer)}</CardTitle>
									{isCurrent ? (
										<Badge variant="accent">{t('pricing_current')}</Badge>
									) : (
										offer.badgeKey && (
											<Badge variant={offer.recommendedForNew ? 'accent' : 'outline'}>{b(offer.badgeKey)}</Badge>
										)
									)}
								</div>
								<div>
									<p className="text-2xl font-bold text-text">
										{offer.priceGrosze === 0 ? (
											t('pricing_free')
										) : (
											<>
												{formatZl(offer.priceGrosze, locale)} zł
												<span className="text-sm font-normal text-muted"> {b('price_for_days', { days: offer.days })}</span>
											</>
										)}
									</p>
									{offer.priceGrosze > 0 && (
										<p className="mt-0.5 text-xs text-muted">
											{b('price_per_day', { price: formatZl(offer.perDayGrosze, locale) })}
										</p>
									)}
								</div>
							</CardHeader>

							<CardContent className="flex flex-1 flex-col gap-4">
								<ul className="[&>li+li]:mt-2">
									{QUOTA_ROWS.map(([kind, labelKey]) => (
										<LimitRow
											key={kind}
											label={t(labelKey)}
											value={offer.limits[kind]}
											period={
												QUOTA_PERIODS[kind] === 'day'
													? t('pricing_per_day')
													: offer.days
														? b('limit_per_days', { days: offer.days })
														: t('pricing_per_month')
											}
										/>
									))}
									{FEATURE_ROWS.map(([feature, labelKey]) => (
										<FeatureRow key={labelKey} label={t(labelKey)} on={offer.features.includes(feature)} />
									))}
								</ul>
								<div className="mt-auto pt-2">{buyButton(offer)}</div>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<p className="mt-4 text-sm text-muted">
				{b('compare', {
					saving: monthVsWeekSaving(),
					month: formatZl(monthOffer.perDayGrosze, locale),
					week: formatZl(weekOffer.perDayGrosze, locale),
				})}
			</p>

			<CheckoutError error={error} />

			{entitlements && !isLoggedIn && (
				<p className="mt-3 text-xs leading-relaxed text-muted">{b('guest_hint', { days: TRIAL.days })}</p>
			)}

			{/*
			 * Słowniczek: każda pozycja z kart jednym zdaniem — co to jest, gdzie to działa
			 * i co się liczy do limitu. Tu, nie w kartach, bo w kartach byłoby cztery razy.
			 */}
			<section className="mt-8" aria-labelledby="pricing-glossary">
				<h2 id="pricing-glossary" className="font-display text-lg font-bold uppercase tracking-wide text-text">
					{t('pricing_glossary_title')}
				</h2>
				<dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
					{[...QUOTA_ROWS, ...FEATURE_ROWS].map(([, labelKey, whatKey]) => (
						<div key={labelKey}>
							<dt className="text-sm font-semibold text-text">{t(labelKey)}</dt>
							<dd className="mt-0.5 text-sm leading-relaxed text-muted">{t(whatKey, liczby[whatKey])}</dd>
						</div>
					))}
				</dl>
			</section>

			<p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted">
				{t('pricing_one_off_note', liczby.pricing_one_off_note)}
			</p>

			<PurchaseConsentDialog
				item={
					pendingOffer && {
						id: pendingOffer.id,
						label: title(pendingOffer),
						priceGrosze: pendingOffer.priceGrosze,
						days: pendingOffer.days,
					}
				}
				busy={busyId !== null}
				onConfirm={confirmOffer}
				onClose={() => setPendingOffer(null)}
			/>

			<CreditPacks
				credits={entitlements?.credits ?? 0}
				isLoggedIn={isLoggedIn}
				available={paymentsReady}
				source={source}
			/>

			<p className="mt-10 text-xs leading-relaxed text-muted">{t('analysis_disclaimer')}</p>
		</AppShell>
	);
}

/** Komunikat po powrocie ze Stripe'a — konkretny, gdy webhook już zadziałał. */
function ReturnStatus({ ret, locale }) {
	const t = useTranslations('common');
	const b = useB2();
	const data = ret.data;
	const date = data?.validUntil ? new Date(data.validUntil).toLocaleDateString(locale === 'en' ? 'en-GB' : 'pl-PL') : '';
	const plan = data ? (data.pass === PRO_WEEK.id ? b('pass_week') : t(data.nameKey || 'plan_pro')) : '';

	const tresc = {
		waiting: { Ikona: Loader2, ton: 'bg-surface-2 text-text', text: b('return_waiting'), spin: true },
		plan: { Ikona: CheckCircle2, ton: 'bg-accent-soft text-accent', text: b('return_plan', { plan, date }) },
		credits: { Ikona: CheckCircle2, ton: 'bg-accent-soft text-accent', text: b('return_credits', { count: data?.credits ?? 0 }) },
		slow: { Ikona: Clock, ton: 'bg-surface-2 text-text', text: b('return_slow', { email: OPERATOR.email }) },
		cancelled: { Ikona: Clock, ton: 'bg-surface-2 text-muted', text: b('return_cancelled') },
	}[ret.state];
	if (!tresc) return null;
	const { Ikona } = tresc;

	return (
		<p role="status" className={cn('mt-4 flex items-start gap-2 rounded-[var(--radius-ui)] px-4 py-3 text-sm', tresc.ton)}>
			<Ikona size={16} aria-hidden="true" className={cn('mt-0.5 shrink-0', tresc.spin && 'motion-safe:animate-spin')} />
			<span>{tresc.text}</span>
		</p>
	);
}
