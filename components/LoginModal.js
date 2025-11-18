import React, { useState, useContext } from 'react'
import { UserContext } from '@/context/UserContext'
import { GiPlayButton } from 'react-icons/gi'
import { useTranslations } from 'next-intl'
import GoogleAuthButton from '@/components/GoogleAuthButton'
import { useAlert } from '@/context/AlertContext'

export default function LoginModal({ isOpen, onRequestClose, onLogin }) {
	const [usernameInput, setUsernames] = useState('')
	const [password, setPassword] = useState('')
	const { setUser, setIsAuthed, refreshUser } = useContext(UserContext)
	const t = useTranslations('common')
	const { showAlert } = useAlert()

	if (!isOpen) return null

	const handleSubmit = async e => {
		e.preventDefault()
		const response = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ username: usernameInput, password }),
			credentials: 'include',
		})

		if (response.ok) {
			const ok = await refreshUser()
			if (ok) {
				onLogin?.()
				showAlert(t('login_success'), 'success')
				onRequestClose?.()
			} else {
				showAlert(t('login_problem'), 'error')
			}
		} 

		const data = await response.json().catch(() => ({}))
		if (!response.ok) {
			if (data?.error === 'email_not_verified') {
				showAlert(t('email_not_verified_desc'), 'error')
			} else {
				const key = data?.error || 'server_error'
				showAlert(t(key), 'error')
			}
			return
		}
	}

	return (
		<div>
			<div className="overlay">
				<div className="modal" onClick={e => e.stopPropagation()}>
					<h2>{t('logging')}</h2>

					<div className="mb-3">
						<GoogleAuthButton onSuccessClose={onRequestClose} onLogin={onLogin} />
					</div>

					<div className="or-div">
						<span>— {t('or')} —</span>
					</div>

					<form onSubmit={handleSubmit}>
						<div>
							<label>{t('usern')}</label>
							<input type="text" value={usernameInput} onChange={e => setUsernames(e.target.value)} required />
						</div>
						<div>
							<label>{t('passw')}</label>
							<input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
						</div>
						<button type="submit" className="btn-to-login">
							<GiPlayButton style={{ marginRight: '5px' }} /> {t('logi')}
						</button>
					</form>
				</div>
			</div>
		</div>
	)
}
