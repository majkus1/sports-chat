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
import { getFirstTouch } from '@/lib/growth/firstTouch';
import { TRIAL } from '@/lib/billing/plans';

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
	/*
	 * Poranny mail — OSOBNE pole, też niezaznaczone. To zgoda marketingowa (RODO, art. 6 ust. 1
	 * lit. a), więc nie może być ani warunkiem założenia konta, ani zaznaczona z góry. Do 21.11.2026
	 * dało się go włączyć dopiero po rejestracji i zrobiły to dwa konta z dziesięciu.
	 */
	const [morningEmail, setMorningEmail] = useState(false);
	const t = useTranslations('common');
	const tx = useTranslations('ux_p5');
	const locale = useLocale();
	const { refreshUser } = useContext(UserContext) || {};
	const t2 = useTranslations('auth2');
	const { showAlert } = useAlert();

	if (!isOpen) return null;

	const handleSubmit = async (e) => {
		e.preventDefault();
		setIsRegistering(true);

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				// `signupSource` — pierwsze wejście (skąd ktoś przyszedł); serwer waliduje każde pole sam.
				body: JSON.stringify({ email, password, username: usernameInput, locale, acceptedTerms, morningEmail, signupSource: getFirstTouch() }),
				credentials: 'include',
			});

			const data = await response.json().catch(() => ({}));

			if (!response.ok) {
				showAlert(t(data?.error || 'server_error'), 'error');
				setIsRegistering(false);
				return;
			}

			/*
			 * Od 22.11.2026 rejestracja od razu loguje (próba bez czekania na link z maila): odświeżamy
			 * sesję, zamykamy okno i mówimy jednym zdaniem, że wszystko działa, a link jest w skrzynce.
			 */
			if (data.loggedIn) {
				await refreshUser?.();
				showAlert(t2('register_done'), 'success', 7000);
				setEmail('');
				setPassword('');
				setUsernameInput('');
				setAcceptedTerms(false);
				setMorningEmail(false);
				onRequestClose?.();
				return;
			}

			if (data.emailSent) {
				// Własny tekst zamiast `data.message` z serwera: krótszy i w języku okna, nie trasy.
				showAlert(t('register_success_verify'), 'success');
				setEmail('');
				setPassword('');
				setUsernameInput('');
				setAcceptedTerms(false);
				setMorningEmail(false);
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
				{/*
				 * Pod tytułem konkret, a nie lista funkcji: ile dni i co za darmo. Liczba z `TRIAL`,
				 * więc zmiana długości próby w planach zmienia też ten napis.
				 */}
				<AuthCard title={t('register')} description={tx('register_hint_trial', { days: TRIAL.days })}>
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
								{/* Biernik („akceptuję Politykę"), a nie tytuł dokumentu w mianowniku. */}
								{tx('register_privacy_link')}
							</Link>
							. {t('register_accept_age')}
						</span>
					</label>

					<label className="mt-2 flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-muted">
						<input
							type="checkbox"
							checked={morningEmail}
							onChange={(e) => setMorningEmail(e.target.checked)}
							className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
						/>
						<span>{t('register_morning_optin')}</span>
					</label>

					{/* Google widoczny od razu; bez zaznaczonego regulaminu jest nieaktywny, z podpowiedzią. */}
					<GoogleAuthButton
						onSuccessClose={onRequestClose}
						acceptedTerms={acceptedTerms}
						morningEmail={morningEmail}
						disabledHint={acceptedTerms ? undefined : t('register_accept_hint')}
					/>

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
