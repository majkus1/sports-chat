import { useEffect, useRef, useContext } from 'react';
import { UserContext } from '@/context/UserContext';
import { useTranslations } from 'next-intl';
import { useAlert } from '@/context/AlertContext';

export default function GoogleAuthButton({ onSuccessClose }) {
  const { refreshUser } = useContext(UserContext);
  const t = useTranslations('common');
  const { showAlert } = useAlert();
  const googleDivRef = useRef(null);

  useEffect(() => {
    const scriptId = 'google-gis';

    const init = () => {
      if (!window.google || !googleDivRef.current) return;

      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: async (resp) => {
          try {
            const r = await fetch('/api/auth/google', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ credential: resp.credential }),
            });

            if (!r.ok) {
              const msg = await r.text().catch(() => 'Google login failed');
              showAlert(msg || 'Google login failed', 'error');
              return;
            }
            await refreshUser();
            showAlert(t('login_success'), 'success');
            onSuccessClose?.();
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.error(e);
            }
            showAlert('Google login error', 'error');
          }
        },
        ux_mode: 'popup',
      });

      window.google.accounts.id.renderButton(googleDivRef.current, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        logo_alignment: 'left',
      });
    };

    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script');
      s.id = scriptId;
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = init;
      document.body.appendChild(s);
    } else {
      init();
    }
  }, [refreshUser, t, onSuccessClose]);

  return <div ref={googleDivRef} style={{ paddingTop: 10 }} />;
}
