'use client';

import { useEffect, useMemo, useState } from 'react';
import BeatLoader from 'react-spinners/BeatLoader';
import { useTranslations } from 'next-intl';
import { useTheme } from '@/context/ThemeContext';

/**
 * Pełnoekranowe okno z widgetem API-Sports.
 *
 * Motyw dokładamy tutaj, a nie w każdym miejscu wywołania: okno służy wyłącznie stronom
 * widgetów, a wywołań jest jedenaście w trzech plikach. Bez tego widget zostawał biały
 * w ciemnej aplikacji.
 */
const FullScreenModal = ({ onClose, src }) => {
  const t = useTranslations('common');
  const { theme } = useTheme();
  const [isLoading, setIsLoading] = useState(true);

  const themedSrc = useMemo(() => {
    if (!src) return src;
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}theme=${theme === 'dark' ? 'dark' : 'light'}`;
  }, [src, theme]);

  // Reset loading state when src changes
  useEffect(() => {
    setIsLoading(true);
  }, [themedSrc]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg)',
        zIndex: 100002,
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: '1100px',
          width: '100%',
          margin: '0 auto',
          position: 'relative',
          padding: '0 20px',
          zIndex: 100003,
        }}
      >
        <button
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'var(--surface)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            fontSize: '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-soft)',
            color: 'var(--text)',
            fontWeight: 'bold',
            zIndex: 100004,
          }}
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            backgroundColor: 'var(--bg)',
            zIndex: 100003,
          }}
        >
          <BeatLoader 
            color="var(--brand)" 
            size={15}
            margin={5}
            speedMultiplier={0.8}
          />
          <p style={{ 
            fontFamily: 'Roboto Condensed, sans-serif',
            color: 'var(--brand)',
            fontSize: '16px',
            fontWeight: 400
          }}>{t('loading')}</p>
        </div>
      )}
      <iframe
        src={themedSrc}
        onLoad={handleIframeLoad}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          flex: 1,
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.3s ease',
        }}
        onClick={(e) => e.stopPropagation()}
        title="API Sports Widget"
      />
    </div>
  );
};

export default FullScreenModal;

