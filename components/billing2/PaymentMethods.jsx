'use client';

import { useLocale } from 'next-intl';
import { useB2 } from '@/components/billing2/useB2';
import { CreditCard, Landmark, ShieldCheck, Smartphone } from 'lucide-react';
import { PAYMENT_METHODS } from '@/lib/billing/paymentMethods';
import { cn } from '@/lib/utils';

/**
 * „Zapłacisz: BLIK · Przelewy24 · Karta" — przed kliknięciem „Kup", nie dopiero na stronie Stripe'a.
 *
 * Lista ze stałej konfiguracji (`lib/billing/paymentMethods.js`), która musi odpowiadać metodom
 * włączonym w panelu Stripe. Ikony są ogólne (telefon, bank, karta), bez logotypów marek — te
 * wymagałyby zgody właścicieli znaków, a nazwa wystarcza, żeby wiedzieć, czym się zapłaci.
 */
const IKONY = { blik: Smartphone, p24: Landmark, card: CreditCard };

export default function PaymentMethods({ className, withNote = true }) {
	const t = useB2();
	const locale = useLocale() === 'en' ? 'en' : 'pl';

	return (
		<div className={cn('flex flex-col gap-1.5', className)}>
			<div className="flex flex-wrap items-center gap-2 text-sm">
				<span className="text-muted">{t('methods_label')}</span>
				{PAYMENT_METHODS.map((m) => {
					const Ikona = IKONY[m.id] || CreditCard;
					return (
						<span
							key={m.id}
							className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-semibold text-text"
						>
							<Ikona size={13} aria-hidden="true" className="text-accent" />
							{m.label[locale]}
						</span>
					);
				})}
			</div>
			{withNote && (
				<p className="flex items-start gap-1.5 text-xs leading-relaxed text-muted">
					<ShieldCheck size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-accent" />
					{t('methods_note')}
				</p>
			)}
		</div>
	);
}
