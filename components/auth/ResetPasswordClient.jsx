'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { GiPlayButton } from 'react-icons/gi';
import { ShieldCheck } from 'lucide-react';
import NavBar from '@/components/NavBar';
import BackLink from '@/components/layout/BackLink';
import AuthCard from '@/components/auth/AuthCard';
import AuthField from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';

export default function ResetPasswordClient() {
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
        {/* Ta sama oprawa co logowanie i rejestracja — użytkownik trafia tu z maila
            i powinien poznać, że jest wciąż w tym samym serwisie. */}
        <div className="w-full max-w-sm">
          <BackLink label={t('back_home')} />
        </div>
        <AuthCard title={t('set_new_pwd')}>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <AuthField
              label={t('new_password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              revealLabel={t('password_show')}
              hideLabel={t('password_hide')}
              required
            />
            <AuthField
              label={t('repeat_password')}
              type="password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              autoComplete="new-password"
              revealLabel={t('password_show')}
              hideLabel={t('password_hide')}
              required
            />

            {error && <p className="text-sm text-loss">{error}</p>}

            <Button type="submit" variant="accent" block disabled={saving} className="mt-1">
              <ShieldCheck size={17} aria-hidden="true" />
              {saving ? t('saving') : t('save')}
            </Button>
          </form>
        </AuthCard>
      </div>
    </>
  );
}

