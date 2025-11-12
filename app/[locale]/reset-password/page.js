'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { GiPlayButton } from 'react-icons/gi';
import NavBar from '@/components/NavBar';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const t = useTranslations('common');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('pwd_too_short'));
      return;
    }

    if (password !== repeatPassword) {
      setError(t('pwd_mismatch'));
      return;
    }

    if (!token) {
      setError(t('link_invalid'));
      return;
    }

    setSaving(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || t('link_invalid'));
      }
    } catch (err) {
      setError(t('something_wrong'));
    } finally {
      setSaving(false);
    }
  };

  const containerStyle = {
    minHeight: 'calc(100vh - 80px)', // Subtract approximate NavBar height
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    marginTop: '80px', // Space for NavBar
  };

  const formContainerStyle = {
    maxWidth: '400px',
    width: '100%',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  if (!token) {
    return (
      <>
        <NavBar />
        <div style={containerStyle}>
          <div style={formContainerStyle}>
            <p style={{ textAlign: 'center', margin: 0 }}>{t('link_invalid')}</p>
          </div>
        </div>
      </>
    );
  }

  if (success) {
    return (
      <>
        <NavBar />
        <div style={containerStyle}>
          <div style={formContainerStyle}>
            <h2 style={{ textAlign: 'center', marginTop: 0, marginBottom: '15px' }}>{t('pwd_changed')}</h2>
            <p style={{ textAlign: 'center', margin: 0 }}>{t('pwd_changed_desc')}</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <div style={containerStyle}>
        <div style={formContainerStyle}>
          <h2 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>{t('set_new_pwd')}</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <label style={{ margin: 0 }}>{t('new_password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ flex: 1, padding: '8px', margin: 0, borderRadius: '5px', border: 'none' }}
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <label style={{ margin: 0 }}>{t('repeat_password')}</label>
            <input
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              style={{ flex: 1, padding: '8px', margin: 0, borderRadius: '5px', border: 'none' }}
              required
            />
          </div>
          {error && <p style={{ color: 'red', marginBottom: '15px' }}>{error}</p>}
          <button
            type="submit"
            disabled={saving}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 20px',
              backgroundColor: '#173b45',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '16px',
              fontWeight: 400,
              opacity: saving ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!saving) {
                e.currentTarget.style.backgroundColor = '#1e4a56';
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!saving) {
                e.currentTarget.style.backgroundColor = '#173b45';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}>
            <GiPlayButton style={{ marginRight: '5px' }} /> {saving ? t('saving') : t('save')}
          </button>
        </form>
        </div>
      </div>
    </>
  );
}

