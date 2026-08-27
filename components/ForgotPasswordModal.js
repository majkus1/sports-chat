import { useState } from 'react';
import { MailCheck, Send } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import AuthCard from '@/components/auth/AuthCard';
import AuthField from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';

export default function ForgotPasswordModal({ isOpen, onRequestClose }) {
	const t = useTranslations('common');
	const locale = useLocale();
	const [email, setEmail] = useState('');
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState('');

	if (!isOpen) return null;

	const onSubmit = async (e) => {
		e.preventDefault();
		setError('');
		setSending(true);
		try {
			const res = await fetch('/api/auth/forgot-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ email, locale }),
			});

			/*
			 * Wynik trzeba sprawdzić. Wcześniej potwierdzenie pokazywało się zawsze — także
			 * po odrzuceniu przez limit lub błędzie serwera — więc użytkownik czekał na maila,
			 * który nigdy nie wyszedł.
			 *
			 * Kod 200 nie zdradza, czy adres istnieje: trasa zwraca go w obu przypadkach,
			 * żeby nie dało się sprawdzać, kto ma konto.
			 */
			if (res.ok) {
				setSent(true);
			} else if (res.status === 429) {
				setError(t('rate_limited'));
			} else {
				setError(t('something_wrong'));
			}
		} catch {
			setError(t('something_wrong'));
		} finally {
			setSending(false);
		}
	};

	const close = () => {
		setEmail('');
		setSent(false);
		setError('');
		onRequestClose?.();
	};

	return (
		<div className="modalOverlay" onClick={close}>
			<div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm px-4">
				<AuthCard
					title={t('forgot_title')}
					description={sent ? undefined : t('forgot_hint')}
					footer={
						<Button variant="ghost" block onClick={close}>
							{t('back_to_login')}
						</Button>
					}
				>
					{sent ? (
						/* Potwierdzenie dostaje własną kompozycję — samo zdanie w miejscu
						   formularza wygląda, jakby coś się nie doczytało. */
						<div className="flex flex-col items-center gap-3 py-2 text-center">
							<span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
								<MailCheck size={20} aria-hidden="true" />
							</span>
							<p className="text-sm leading-relaxed text-muted">{t('forgot_sent')}</p>
						</div>
					) : (
						<form onSubmit={onSubmit} className="flex flex-col gap-4">
							<AuthField
								label={t('mail')}
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="email"
								required
							/>

							{error && <p className="text-sm text-loss">{error}</p>}

							<Button type="submit" variant="accent" block disabled={sending} className="mt-1">
								<Send size={16} aria-hidden="true" />
								{sending ? t('sending') : t('send_reset_link')}
							</Button>
						</form>
					)}
				</AuthCard>
			</div>
		</div>
	);
}
