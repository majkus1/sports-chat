import { useEffect, useRef, useState, useContext } from 'react';
import { UserContext } from '@/context/UserContext';
import { useTranslations } from 'next-intl';
import { useAlert } from '@/context/AlertContext';
import { useTheme } from '@/context/ThemeContext';
import { CONSENT_EVENT, hasConsent, writeConsent } from '@/lib/consent';

export default function GoogleAuthButton({ onSuccessClose }) {
  const { refreshUser } = useContext(UserContext);
  const t = useTranslations('common');
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const googleDivRef = useRef(null);

  /*
   * Skrypt Google ładujemy dopiero po zgodzie na ciasteczka zewnętrzne.
   *
   * Wcześniej wstrzykiwał się przy samym otwarciu okna logowania, czyli zanim ktokolwiek
   * o cokolwiek zapytał. Bez zgody pokazujemy przycisk, który tę zgodę udziela — kto woli
   * jej nie dawać, zakłada konto mailem i skrypt nigdy się nie ładuje.
   */
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const sync = () => setAllowed(hasConsent('google'));
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const scriptId = 'google-gis';

    const init = () => {
      if (!window.google || !googleDivRef.current) return;

      // Przy ponownym rysowaniu (zmiana motywu) czyścimy kontener — inaczej przyciski
      // dokładają się jeden pod drugim.
      googleDivRef.current.replaceChildren();

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
            const ok = await refreshUser();
            if (!ok) {
              showAlert(t('login_problem'), 'error');
              return;
            }
            onSuccessClose?.();
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          } catch (e) {
            if (process.env.NODE_ENV === 'development') {
              console.error(e);
            }
            showAlert('Google login error', 'error');
          }
        },
        ux_mode: 'popup',
      });

      /*
       * Motyw przycisku dobieramy do motywu aplikacji.
       *
       * `outline` to biały przycisk na białym podkładzie własnego kontenera Google.
       * W ciemnym motywie zostawiał pod sobą biały prostokąt szerszy od samego przycisku —
       * bo kontener jest kwadratowy, a przycisk zaokrąglony. `filled_black` maluje jedno
       * i drugie na ciemno, więc podkład znika zamiast rzucać się w oczy.
       */
      window.google.accounts.id.renderButton(googleDivRef.current, {
        theme: theme === 'dark' ? 'filled_black' : 'outline',
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
    // `theme` w zależnościach: po przełączeniu motywu przycisk trzeba narysować od nowa,
    // inaczej zostaje w kolorach poprzedniego.
  }, [allowed, theme, refreshUser, t, onSuccessClose]);

  if (!allowed) {
    return (
      <button
        type="button"
        onClick={() => writeConsent({ google: true })}
        className="mt-2.5 w-full rounded-full border border-border-strong bg-transparent px-4 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-2"
      >
        {t('google_consent_enable')}
      </button>
    );
  }

  /*
   * Kontener przycięty do pigułki i zwężony do szerokości przycisku.
   *
   * Google renderuje przycisk we własnym, prostokątnym kontenerze o stałej szerokości.
   * Bez przycięcia jego rogi wystają zza zaokrąglonego przycisku jako jaśniejszy prostokąt.
   */
  return (
    <div className="mt-2.5 flex justify-center">
      <div ref={googleDivRef} className="overflow-hidden rounded-full" />
    </div>
  );
}
