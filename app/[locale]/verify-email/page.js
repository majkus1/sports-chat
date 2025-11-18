'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { GiPlayButton } from 'react-icons/gi';
import NavBar from '@/components/NavBar';
import LoginModal from '@/components/LoginModal';
import { UserContext } from '@/context/UserContext';
import { useContext } from 'react';

export default function VerifyEmailPage() {
  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const [username, setUsername] = useState('');
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const hasVerified = useRef(false); // Prevent double verification
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('common');
  const { refreshUser } = useContext(UserContext);

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage(t('verify_email_link_invalid'));
      return;
    }

    // Prevent double verification (React Strict Mode in dev)
    if (hasVerified.current) {
      return;
    }

    const verifyEmail = async () => {
      hasVerified.current = true; // Mark as started
      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          // If response is not JSON, treat as error
          setStatus('error');
          setMessage(t('verify_email_error'));
          return;
        }

        if (response.ok && data.ok) {
          // Only update if not already in success state
          if (status !== 'success') {
            setStatus('success');
            setUsername(data.username || '');
            
            // Redirect to home page with login modal open after short delay
            setTimeout(() => {
              router.push(`/${locale}?login=true`);
            }, 2000);
          }
        } else {
          // Only set error if we haven't already succeeded
          if (status !== 'success') {
            setStatus('error');
            const errorMsg = data?.error || '';
            if (errorMsg.includes('Invalid') || errorMsg.includes('expired') || errorMsg.includes('Token')) {
              setMessage(t('verify_email_link_expired'));
            } else {
              setMessage(t('verify_email_error'));
            }
          }
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Verify email error:', error);
        }
        // Only set error if we haven't already succeeded
        if (status !== 'success') {
          setStatus('error');
          setMessage(t('verify_email_error'));
        }
      }
    };

    verifyEmail();
  }, [token, t]);

  const handleLoginSuccess = async () => {
    await refreshUser();
    setIsLoginModalOpen(false);
    router.push(`/${locale}`);
  };

  const containerStyle = {
    minHeight: 'calc(100vh - 80px)',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
    marginTop: '80px',
  };

  const formContainerStyle = {
    maxWidth: '450px',
    width: '100%',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    backgroundColor: '#fff',
    textAlign: 'center',
  };

  return (
    <>
      <NavBar />
      <div style={containerStyle}>
        <div style={formContainerStyle}>
          {status === 'verifying' && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  border: '4px solid #e0e0e0',
                  borderTop: '4px solid #173b45',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto',
                }}></div>
                <style>{`
                  @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                  }
                `}</style>
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>{t('verify_email_verifying')}</h2>
              <p style={{ margin: 0, color: '#555' }}>{t('verify_email_please_wait')}</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                backgroundColor: '#2ecc58', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: '30px',
                color: '#fff'
              }}>
                ✓
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>{t('verify_email_success_title')}</h2>
              <p style={{ margin: 0, color: '#555', marginBottom: '20px' }}>
                {username && (
                  <>
                    {t('verify_email_success_greeting')} <strong>{username}</strong>!<br />
                  </>
                )}
                {t('verify_email_success_message')}
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <div style={{ 
                width: '60px', 
                height: '60px', 
                borderRadius: '50%', 
                backgroundColor: '#e74c3c', 
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
                fontSize: '30px',
                color: '#fff'
              }}>
                ✗
              </div>
              <h2 style={{ marginTop: 0, marginBottom: '15px', color: '#333' }}>{t('verify_email_error_title')}</h2>
              <p style={{ margin: 0, color: '#555', marginBottom: '20px' }}>
                {message || t('verify_email_error')}
              </p>
              <button
                onClick={() => router.push(`/${locale}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  padding: '10px 20px',
                  backgroundColor: '#173b45',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: 400,
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e4a56';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#173b45';
                  e.currentTarget.style.transform = 'scale(1)';
                }}>
                <GiPlayButton style={{ marginRight: '5px' }} /> {t('mainpage')}
              </button>
            </>
          )}
        </div>
      </div>

      {isLoginModalOpen && status === 'success' && (
        <LoginModal 
          isOpen={isLoginModalOpen} 
          onLogin={handleLoginSuccess}
          onRequestClose={() => setIsLoginModalOpen(false)}
        />
      )}
    </>
  );
}

