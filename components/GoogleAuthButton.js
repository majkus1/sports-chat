import { useEffect, useRef, useState, useContext } from 'react';
import { UserContext } from '@/context/UserContext';
import { useLocale, useTranslations } from 'next-intl';
import { useAlert } from '@/context/AlertContext';
import { useTheme } from '@/context/ThemeContext';
import { CONSENT_EVENT, hasConsent, writeConsent } from '@/lib/consent';
import { getFirstTouch } from '@/lib/growth/firstTouch';

/*
 * Znane kody błędów z `/api/auth/google` — każdy ma własny komunikat (pl/en).
 * Nieznany kod albo awaria sieci to ogólne „nie udało się".
 */
const GOOGLE_ERRORS = new Set(['google_terms_required', 'google_account_conflict', 'google_email_not_verified']);

/**
 * @param {object} props
 * @param {boolean} [props.acceptedTerms] zgoda na regulamin zaznaczona w oknie rejestracji —
 *   bez niej serwer nie założy nowego konta, tylko zaloguje do istniejącego
 * @param {boolean} [props.morningEmail] osobne, niezaznaczone pole „poranny mail" z okna rejestracji —
 *   serwer bierze je pod uwagę tylko przy zakładaniu nowego konta
 * @param {() => void} [props.onNeedRegister] nowa osoba kliknęła Google w oknie logowania —
 *   przełącz na okno rejestracji
 * @param {string} [props.disabledHint] gdy podane, przycisk jest widoczny, ale nieaktywny,
 *   a pod nim stoi ta podpowiedź (okno rejestracji przed zaznaczeniem regulaminu)
 */
export default function GoogleAuthButton({ onSuccessClose, acceptedTerms = false, morningEmail = false, onNeedRegister, disabledHint }) {
  const { refreshUser } = useContext(UserContext);
  const t = useTranslations('common');
  const tx = useTranslations('ux_p5');
  const disabled = Boolean(disabledHint);
  const locale = useLocale();
  const { showAlert } = useAlert();
  const { theme } = useTheme();
  const googleDivRef = useRef(null);

  // Najświeższe wartości dla wywołania zwrotnego Google — bez ponownego rysowania przycisku.
  const latest = useRef({ acceptedTerms, morningEmail, onNeedRegister });
  latest.current = { acceptedTerms, morningEmail, onNeedRegister };

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
    if (!allowed || disabled) return;
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
              body: JSON.stringify({
                credential: resp.credential,
                acceptedTerms: latest.current.acceptedTerms === true,
                morningEmail: latest.current.morningEmail === true,
                locale,
                // Źródło rejestracji — serwer bierze je pod uwagę tylko przy zakładaniu nowego konta.
                signupSource: getFirstTouch(),
              }),
            });

            if (!r.ok) {
              const { error } = await r.json().catch(() => ({}));
              if (error === 'google_terms_required' && latest.current.onNeedRegister) {
                showAlert(t('google_terms_required'), 'info', 7000);
                latest.current.onNeedRegister();
                return;
              }
              showAlert(t(GOOGLE_ERRORS.has(error) ? error : 'google_failed'), 'error', 7000);
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
            showAlert(t('google_failed'), 'error');
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
  }, [allowed, disabled, theme, refreshUser, t, onSuccessClose]);

  /*
   * Nieaktywny zamiennik przycisku Google.
   *
   * Do 22.11.2026 okno rejestracji chowało Google w ogóle, dopóki ktoś nie zaznaczył
   * regulaminu — na jego miejscu stał szary napis, a najszybsza droga do konta była
   * niewidoczna. Teraz przycisk stoi od razu, tylko wyłączony, z podpowiedzią, co zrobić.
   * Własny, a nie Google'a: prawdziwego przycisku z GIS nie da się wyłączyć, a skrypt nie
   * powinien się ładować bez zgody na ciasteczka.
   */
  if (disabled) {
    return (
      <div className="mt-2.5">
        <button
          type="button"
          disabled
          aria-describedby="google-disabled-hint"
          className="flex w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-full border border-border-strong bg-transparent px-4 py-2 text-sm font-semibold text-text opacity-50"
        >
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {tx('google_continue')}
        </button>
        <p id="google-disabled-hint" className="mt-1.5 text-center text-xs text-muted">
          {disabledHint}
        </p>
      </div>
    );
  }

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
