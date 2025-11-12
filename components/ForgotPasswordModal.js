
import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { GiPlayButton } from 'react-icons/gi'

export default function ForgotPasswordModal({ isOpen, onRequestClose }) {
  const t = useTranslations('common')
  const locale = useLocale()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const onSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSending(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, locale }),
      })
      setSent(true)
    } catch (err) {
      setError(t('something_wrong') || 'Coś poszło nie tak')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="modalOverlay"
      onClick={() => {
        setEmail('')
        setSent(false)
        setError('')
        onRequestClose?.()
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 20, marginBottom: 15 }}>
          {t('forgot_title')}
        </h2>

        {sent ? (
          <p>
            {t('forgot_sent')}
          </p>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="mb-3">
              <label>{t('mail')}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
              />
            </div>

            {error && <p style={{ color: 'crimson', marginTop: 8 }}>{error}</p>}

            <button type="submit" className="btn-to-login" disabled={sending}>
              <GiPlayButton style={{ marginRight: '5px' }} />
              {sending ? (t('sending') || 'Wysyłanie...') : (t('send_reset_link') || 'Wyślij link resetujący')}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
