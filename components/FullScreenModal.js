'use client';

import { useEffect, useState } from 'react';
import BeatLoader from 'react-spinners/BeatLoader';
import { useTranslations } from 'next-intl';

const FullScreenModal = ({ onClose, src }) => {
  const t = useTranslations('common');
  const [isLoading, setIsLoading] = useState(true);

  // Reset loading state when src changes
  useEffect(() => {
    setIsLoading(true);
  }, [src]);

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
        backgroundColor: '#f1f1f1',
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
            background: '#fff',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            fontSize: '24px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
            color: '#333',
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
            backgroundColor: '#f1f1f1',
            zIndex: 100003,
          }}
        >
          <BeatLoader 
            color="#173b45" 
            size={15}
            margin={5}
            speedMultiplier={0.8}
          />
          <p style={{ 
            fontFamily: 'Roboto Condensed, sans-serif',
            color: '#173b45',
            fontSize: '16px',
            fontWeight: 400
          }}>{t('loading')}</p>
        </div>
      )}
      <iframe
        src={src}
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

