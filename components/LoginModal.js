import { useState, useContext } from 'react';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { UserContext } from '@/context/UserContext';
import GoogleAuthButton from '@/components/GoogleAuthButton';
import AuthCard, { AuthDivider } from '@/components/auth/AuthCard';
import AuthField from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { useAlert } from '@/context/AlertContext';

export default function LoginModal({ isOpen, onRequestClose, onLogin }) {
	const [usernameInput, setUsernames] = useState('');
	const [password, setPassword] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const { refreshUser } = useContext(UserContext);
	const t = useTranslations('common');
	const { showAlert } = useAlert();

	if (!isOpen) return null;

	const handleSubmit = async (e) => {
		e.preventDefault();
		if (isSubmitting) return;
		setIsSubmitting(true);

		try {
			const response = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ username: usernameInput, password }),
				credentials: 'include',
			});

			if (response.ok) {
				const ok = await refreshUser();
				if (ok) {
					onLogin?.();
					if (typeof window !== 'undefined') {
						window.location.reload();
					}
					return;
				}
				showAlert(t('login_problem'), 'error');
				return;
			}

			const data = await response.json().catch(() => ({}));
			if (data?.error === 'email_not_verified') {
				showAlert(t('email_not_verified_desc'), 'error');
			} else {
				showAlert(t(data?.error || 'server_error'), 'error');
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="overlay">
			<AuthCard title={t('logging')}>
				<GoogleAuthButton onSuccessClose={onRequestClose} onLogin={onLogin} />

				<AuthDivider label={t('or')} />

				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<AuthField
						label={t('usern')}
						value={usernameInput}
						onChange={(e) => setUsernames(e.target.value)}
						autoComplete="username"
						required
					/>
					<AuthField
						label={t('passw')}
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="current-password"
						revealLabel={t('password_show')}
						hideLabel={t('password_hide')}
						required
					/>

					<Button type="submit" variant="accent" block disabled={isSubmitting} className="mt-1">
						<LogIn size={17} aria-hidden="true" />
						{isSubmitting ? t('logging_in') : t('logi')}
					</Button>
				</form>
			</AuthCard>
		</div>
	);
}
