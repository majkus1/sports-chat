'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { CONSENT_VERSION, consentFor } from '@/lib/legal/purchaseConsent';

/**
 * Oświadczenie konsumenta odbierane przed przejściem do płatności.
 *
 * Osobny krok, a nie checkbox przy każdym przycisku „Kup": pakiety kredytów i plany są w dwóch
 * różnych komponentach, a oświadczenie musi być identyczne w obu. Jedno okno oznacza jedną
 * treść i jedną ścieżkę — nie da się kupić z pominięciem zgody, bo płatność startuje wyłącznie
 * stąd.
 *
 * Pole jest NIEzaznaczone domyślnie i pozostaje takie po każdym otwarciu. Zaznaczony z góry
 * checkbox nie jest oświadczeniem woli, tylko jego pozorem — a przy sporze liczy się właśnie to.
 *
 * Etykiety pochodzą z `lib/legal/purchaseConsent`, nie z plików tłumaczeń interfejsu: ten sam
 * moduł czyta serwer, zapisując dosłowne brzmienie do bazy. Dwie kopie rozjechałyby się przy
 * pierwszej korekcie i zapis przestałby odpowiadać temu, co użytkownik zobaczył.
 */
export default function PurchaseConsentDialog({ item, onConfirm, onClose, busy = false }) {
	const locale = useLocale();
	const copy = consentFor(locale);
	const [accepted, setAccepted] = useState(false);

	// Każde otwarcie zaczyna od pustego pola — również gdy okno wraca dla innego pakietu.
	useEffect(() => {
		setAccepted(false);
	}, [item?.id]);

	const open = Boolean(item);

	return (
		<Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
			<DialogContent showClose={!busy}>
				<DialogHeader>
					<DialogTitle>{copy.heading}</DialogTitle>
					<DialogDescription>{copy.lead}</DialogDescription>
				</DialogHeader>

				{item && (
					<p className="rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-sm text-text">
						<span className="text-muted">{item.label}</span>
						<span className="ml-2 font-bold tabular-nums">{(item.priceGrosze / 100).toFixed(2).replace('.', ',')} zł</span>
					</p>
				)}

				<label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-text">
					<input
						type="checkbox"
						checked={accepted}
						onChange={(event) => setAccepted(event.target.checked)}
						className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
					/>
					<span>{copy.statement}</span>
				</label>

				<p className="mt-3 text-xs leading-relaxed text-muted">{copy.footnote}</p>

				<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<Button variant="outline" onClick={onClose} disabled={busy}>
						{copy.cancel}
					</Button>
					<Button
						variant="accent"
						disabled={!accepted || busy}
						title={!accepted ? copy.required : undefined}
						onClick={() => onConfirm({ acceptedImmediateDelivery: true, consentVersion: CONSENT_VERSION })}
					>
						{busy && <Loader2 size={15} aria-hidden="true" className="animate-spin" />}
						{copy.confirm}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
