'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useB2 } from '@/components/billing2/useB2';
import { Coins, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import PurchaseConsentDialog from '@/components/billing/PurchaseConsentDialog';
import CheckoutError from '@/components/billing2/CheckoutError';
import { startCheckout } from '@/components/billing2/checkout';
import { CREDIT_COSTS, CREDIT_PACKS } from '@/lib/billing/plans';
import { cn } from '@/lib/utils';

/**
 * Pakiety doładowań.
 *
 * Powód istnienia jest sprzedażowy: między planem darmowym a Pro za 49 zł jest przepaść,
 * której nikt nie przeskoczy dla jednego meczu w sobotę. Kredyty kupuje się raz, bez konta
 * na stałe i bez odnowień.
 *
 * Cena za sztukę jest tu celowo wyższa niż w abonamencie i pokazujemy ją wprost — to nie
 * wstyd, tylko sedno oferty: kto kupuje regularnie, sam zobaczy, że abonament się opłaca.
 */
export default function CreditPacks({ credits = 0, isLoggedIn = false, available = false, source = null }) {
	const t = useTranslations('common');
	const b = useB2();
	const locale = useLocale();
	const [pending, setPending] = useState(null);
	const [busyPack, setBusyPack] = useState(null);
	const [error, setError] = useState(null);

	/*
	 * Kliknięcie „Kup" otwiera oświadczenie, nie płatność.
	 *
	 * Trasa checkoutu odrzuca żądanie bez zgody, więc pominięcie tego kroku i tak nie
	 * doprowadziłoby do zakupu — okno jest tu po to, żeby użytkownik wiedział, na co się godzi.
	 * Start płatności i komunikaty błędów — wspólne z planami (`components/billing2/checkout.js`).
	 */
	const confirm = async (consent) => {
		const pack = pending;
		if (!pack) return;

		setBusyPack(pack.id);
		setError(null);
		const wynik = await startCheckout({
			body: { packId: pack.id, locale, source, ...consent },
			before: { credits },
		});
		if (!wynik.ok) {
			setError(wynik.error);
			setPending(null);
			setBusyPack(null);
		}
	};

	return (
		<section className="mt-12">
			<div className="flex flex-wrap items-center gap-3">
				<h2 className="font-display text-xl font-bold uppercase tracking-wide text-text">
					{t('credits_title')}
				</h2>
				{isLoggedIn && (
					<Badge variant="outline">
						<Coins size={12} aria-hidden="true" />
						{t('credits_balance', { count: credits })}
					</Badge>
				)}
			</div>

			<p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
				{t('credits_intro', { analysis: CREDIT_COSTS.analysis, report: CREDIT_COSTS.report })}
			</p>

			<div className="mt-5 grid gap-4 sm:grid-cols-3">
				{CREDIT_PACKS.map((pack) => {
					const price = pack.priceGrosze / 100;
					// Cena jednostkowa liczona z pakietu, nie wpisana ręcznie — inaczej rozjedzie
					// się z cennikiem przy pierwszej zmianie kwoty.
					const perCredit = (price / pack.credits).toFixed(2).replace('.', ',');

					return (
						<Card key={pack.id} className={cn('flex flex-col', pack.highlight && 'border-accent')}>
							<CardContent className="flex flex-1 flex-col gap-3 px-5 py-5">
								<div className="flex items-start justify-between gap-2">
									<p className="font-display text-3xl font-bold tabular-nums text-text">
										{pack.credits}
									</p>
									{pack.highlight && <Badge variant="accent">{t('credits_popular')}</Badge>}
								</div>
								<p className="text-sm text-muted">{t('credits_unit', { count: pack.credits })}</p>

								<p className="mt-auto text-2xl font-bold text-text">
									{price} zł
									<span className="ml-2 text-xs font-normal text-muted">
										{t('credits_per_unit', { price: perCredit })}
									</span>
								</p>

								{/*
								 * Przycisk odzwierciedla stan faktyczny, a nie zamiar.
								 *
								 * Bez sprawdzenia `available` „Kup" wygląda na czynne również wtedy, gdy
								 * klucze Stripe'a nie są ustawione — a kliknięcie kończy się komunikatem
								 * o błędzie. Wyłączony przycisk z uczciwą etykietą jest lepszy.
								 */}
								{/* Gość dostaje czynny przycisk do rejestracji, nie wyłączony napis bez wyjścia. */}
								<Button
									variant={pack.highlight ? 'accent' : 'outline'}
									block
									disabled={!available || busyPack !== null}
									title={!available ? t('pricing_soon_hint') : undefined}
									onClick={() =>
										isLoggedIn
											? setPending(pack)
											: window.dispatchEvent(new CustomEvent('czat:auth', { detail: 'register' }))
									}
								>
									{busyPack === pack.id && (
										<Loader2 size={15} aria-hidden="true" className="animate-spin" />
									)}
									{!available ? t('pricing_soon') : isLoggedIn ? t('credits_buy') : b('guest_buy')}
								</Button>
							</CardContent>
						</Card>
					);
				})}
			</div>

			<CheckoutError error={error} />
			<p className="mt-4 text-xs leading-relaxed text-muted">{t('credits_note')}</p>

			<PurchaseConsentDialog
				item={
					pending && {
						id: pending.id,
						label: t('credits_unit', { count: pending.credits }),
						priceGrosze: pending.priceGrosze,
					}
				}
				busy={busyPack !== null}
				onConfirm={confirm}
				onClose={() => setPending(null)}
			/>
		</section>
	);
}
