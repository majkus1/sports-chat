import { useState, useContext } from 'react';
import { UserPlus } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { UserContext } from '@/context/UserContext';
import GoogleAuthButton from '@/components/GoogleAuthButton';
import AuthCard, { AuthDivider } from '@/components/auth/AuthCard';
import AuthField from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Link } from '@/i18n/routing';
import { useAlert } from '@/context/AlertContext';

export default function RegisterModal({ isOpen, onRequestClose, onRegister }) {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [usernameInput, setUsernameInput] = useState('');
	const [isRegistering, setIsRegistering] = useState(false);
	/*
	 * Zgoda na regulamin — jedno pole, NIEzaznaczone domyślnie.
	 *
	 * Zaznaczony z góry checkbox nie jest zgodą, tylko jej pozorem. Jedno pole zamiast
	 * trzech, bo regulamin i polityka prywatności to warunek korzystania z serwisu,
	 * a nie osobne zgody marketingowe, których zresztą nie zbieramy.
	 */
	const [acceptedTerms, setAcceptedTerms] = useState(false);
	const t = useTranslations('common');
	const locale = useLocale();
	useContext(UserContext);
	const { showAlert } = useAlert();

	if (!isOpen) return null;

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsRegistering(true);

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, username: usernameInput, locale, acceptedTerms }),
				credentials: 'include',
			});

			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				showAlert(t(data?.error || 'server_error'), 'error');
				setIsRegistering(false);
				return;
			}

			if (data.emailSent) {
				showAlert(data.message || t('register_success_verify'), 'success');
				setEmail('');
				setPassword('');
				setUsernameInput('');
				setAcceptedTerms(false);
				setTimeout(() => onRequestClose?.(), 2000);
			} else {
				showAlert(t('register_success'), 'success');
				onRequestClose?.();
			}
		} catch (err) {
			if (process.env.NODE_ENV === 'development') {
				console.error('Registration error:', err);
			}
			showAlert(t('server_error'), 'error');
		} finally {
			setIsRegistering(false);
		}
	};

	return (
		<div className="modalOverlay" onClick={onRequestClose}>
			<div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm px-4">
				<AuthCard title={t('register')} description={t('register_hint')}>
					{/*
					 * Zgoda stoi nad obiema metodami zakładania konta, bo dotyczy obu.
					 * Gdyby siedziała w formularzu, konto przez Google powstawałoby bez niej.
					 */}
					<label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
						<input
							type="checkbox"
							checked={acceptedTerms}
							onChange={(e) => setAcceptedTerms(e.target.checked)}
							className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
						/>
						<span>
							{t('register_accept_prefix')}{' '}
							<Link href="/regulamin" target="_blank" className="footer-link underline">
								{t('terms_title')}
							</Link>{' '}
							{t('register_accept_and')}{' '}
							<Link href="/polityka-prywatnosci" target="_blank" className="footer-link underline">
								{t('privacy_title')}
							</Link>
							. {t('register_accept_age')}
						</span>
					</label>

					{acceptedTerms ? (
						<GoogleAuthButton onSuccessClose={onRequestClose} onLogin={onRegister} />
					) : (
						<p className="mt-3 rounded-[var(--radius-ui)] bg-surface-2 px-3 py-2 text-xs text-muted">
							{t('register_accept_hint')}
						</p>
					)}

					<AuthDivider label={t('or')} />

					<form onSubmit={handleSubmit} className="flex flex-col gap-4">
						<AuthField
							label={t('usern')}
							value={usernameInput}
							onChange={(e) => setUsernameInput(e.target.value)}
							autoComplete="username"
							required
						/>
						<AuthField
							label={t('mail')}
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							autoComplete="email"
							required
						/>
						<AuthField
							label={t('passw')}
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							// `new-password` mówi menedżerowi haseł, że ma zaproponować nowe,
							// a nie podstawić istniejące.
							autoComplete="new-password"
							revealLabel={t('password_show')}
							hideLabel={t('password_hide')}
							required
						/>

						<Button
							type="submit"
							variant="accent"
							block
							disabled={isRegistering || !acceptedTerms}
							className="mt-1"
						>
							<UserPlus size={17} aria-hidden="true" />
							{isRegistering ? t('registering') : t('regi')}
						</Button>
					</form>
				</AuthCard>
			</div>
		</div>
	);
}
