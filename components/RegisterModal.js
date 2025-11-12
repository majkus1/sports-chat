import React, { useState, useContext } from 'react'
import { GiPlayButton } from 'react-icons/gi'
import { useTranslations } from 'next-intl'
import { UserContext } from '@/context/UserContext'
import GoogleAuthButton from '@/components/GoogleAuthButton'
import { useAlert } from '@/context/AlertContext'

export default function RegisterModal({ isOpen, onRequestClose, onRegister }) {
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [usernameInput, setUsernameInput] = useState('')
	const [isRegistering, setIsRegistering] = useState(false)
	const t = useTranslations('common')
	const { refreshUser } = useContext(UserContext)
	const { showAlert } = useAlert()

	if (!isOpen) return null

	const handleSubmit = async e => {
		e.preventDefault()
		setIsRegistering(true)

		try {
			const response = await fetch('/api/auth/register', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ email, password, username: usernameInput }),
				credentials: 'include',
			})

			const data = await response.json().catch(() => ({}))

			if (!response.ok) {
				const key = data?.error || 'server_error'
				showAlert(t(key), 'error')
				setIsRegistering(false)
				return
			}

			const ok = await refreshUser()
			if (ok) {
				showAlert(t('register_success'), 'success')
				onRegister?.()
				onRequestClose?.()
			} else {
				showAlert(t('profile_fetch_failed'), 'error')
			}
		} catch (err) {
			console.error('Registration error:', err)
			showAlert(t('server_error'), 'error')
		} finally {
			setIsRegistering(false)
		}
	}

	return (
		<div className="modalOverlay" onClick={onRequestClose}>
			<div className="modal-register" onClick={e => e.stopPropagation()}>
				<h2>{t('register')}</h2>

				<div className="mb-3">
					<GoogleAuthButton onSuccessClose={onRequestClose} onLogin={onRegister} />
				</div>

				<div className="or-div">
					<span>— {t('or')} —</span>
				</div>

				<form onSubmit={handleSubmit}>
					<div>
						<label>{t('usern')}</label>
						<input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} required />
					</div>
					<div>
						<label>{t('mail')}</label>
						<input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
					</div>
					<div>
						<label>{t('passw')}</label>
						<input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
					</div>
					<button type="submit" className="btn-to-reg" disabled={isRegistering}>
						<GiPlayButton style={{ marginRight: '5px' }} />
						{isRegistering ? t('registering') : t('regi')}
					</button>
				</form>
			</div>
		</div>
	)
}
