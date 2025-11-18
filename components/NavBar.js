'use client';

import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import LoginModal from './LoginModal';
import RegisterModal from './RegisterModal';
import { UserContext } from '@/context/UserContext';
import UserPanel from './UserPanel';
import { GiPlayButton } from 'react-icons/gi';
import { useTranslations, useLocale } from 'next-intl';
import ForgotPasswordModal from './ForgotPasswordModal';
import LanguageSwitcher from './LanguageSwitcher';
import { Link } from '@/i18n/routing';

export default function NavBar({ onLanguageChange }) {
  const [isRegisterModalOpen, setRegisterModalOpen] = useState(false);
  const [isLoginModalOpen, setLoginModalOpen] = useState(false);
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileLinksMenuOpen, setMobileLinksMenuOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [isSportsOpen, setIsSportsOpen] = useState(false);
  const [isForgotOpen, setForgotOpen] = useState(false);

  const t = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const { user, isAuthed, setUser, setIsAuthed, refreshUser } = useContext(UserContext);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if login modal should be opened from query param (e.g., after email verification)
  useEffect(() => {
    if (typeof window === 'undefined' || !isClient) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const shouldOpenLogin = urlParams.get('login');
    
    if (shouldOpenLogin === 'true' && !isAuthed) {
      setLoginModalOpen(true);
      // Remove query param from URL without page reload
      urlParams.delete('login');
      const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
      router.replace(newUrl, { scroll: false });
    }
  }, [isClient, isAuthed, router]);

  const handleLogin = async () => {
    await refreshUser();
    setLoginModalOpen(false);
    setMobileMenuOpen(false);
  };

  const handleRegister = async () => {
    await refreshUser();
    setRegisterModalOpen(false);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setUser(null);
        setIsAuthed(false);
        setMobileMenuOpen(false);
      } else {
        if (process.env.NODE_ENV === 'development') {
        console.error('Nie udało się wylogować');
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
      console.error('Błąd podczas wylogowywania:', error);
      }
    }
  };

  return (
    <>
      <LanguageSwitcher onLanguageChange={onLanguageChange} />
      <div className="menu">
        <div
          className={`logo-and-menubutton ${isMobileLinksMenuOpen ? 'active-bg' : ''} || ${
            isMobileMenuOpen ? 'active-bg' : ''
          }`}>
          <div className="menubutton">
            <div className="mobile-menu">
              <Link href="/" className="logo">
                <img
                  src={locale === 'en' ? '/img/sports-chat-logo.png' : '/img/logo-czat-sportowy-pl.png'}
                  alt={locale === 'en' ? 'Sports Chat' : 'Czat Sportowy'}
                />
              </Link>

              <div className="elementsinmenu">
                {isMobileMenuOpen ? (
                  <img
                    src="/img/cross.png"
                    className="menu-icon"
                    alt="close"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setRegisterModalOpen(false);
                      setLoginModalOpen(false);
                      setForgotOpen(false);
                    }}
                  />
                ) : (
                  <img
                    src="/img/user.png"
                    className="menu-icon"
                    alt="user menu"
                    onClick={() => {
                      setMobileMenuOpen(true);
                      setLoginModalOpen(!isAuthed);
                      setMobileLinksMenuOpen(false);
                    }}
                  />
                )}

                {isMobileLinksMenuOpen ? (
                  <img
                    src="/img/cross.png"
                    className="menu-icon"
                    alt="close links"
                    onClick={() => setMobileLinksMenuOpen(false)}
                  />
                ) : (
                  <img
                    src="/img/menu-bar.png"
                    className="menu-icon"
                    alt="links"
                    onClick={() => {
                      setMobileLinksMenuOpen(true);
                      setMobileMenuOpen(false);
                    }}
                  />
                )}
              </div>
            </div>

            {isMobileMenuOpen && (
              <div className="mobile-dropdown">
                {isAuthed ? (
                  <>
                    <UserPanel />
                    <button onClick={handleLogout} className="log-out-btn">
                      <GiPlayButton /> {t('out')}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="elements-in-account-menu">
                      {isForgotOpen ? (
                        <ForgotPasswordModal
                          isOpen={isForgotOpen}
                          onRequestClose={() => {
                            setForgotOpen(false);
                            setLoginModalOpen(true);
                          }}
                        />
                      ) : (
                        <>
                          <LoginModal isOpen={isLoginModalOpen} onLogin={handleLogin} />

                          <div className="to-register-now" style={{ marginTop: '15px' }}>
                            <button
                              onClick={() => {
                                setForgotOpen(true);
                                setLoginModalOpen(false);
                                setRegisterModalOpen(false);
                              }}
                              className="btn-reg">
                              <GiPlayButton /> {t('forgot_link')}
                            </button>
                          </div>

                          <div className="to-register-now">
                            <button
                              onClick={() => {
                                setRegisterModalOpen(true);
                                setLoginModalOpen(false);
                                setForgotOpen(false);
                              }}
                              className="btn-reg">
                              <GiPlayButton /> {t('registernow')}
                            </button>
                          </div>

                          <RegisterModal
                            isOpen={isRegisterModalOpen}
                            onRequestClose={() => {
                              setRegisterModalOpen(false);
                              setLoginModalOpen(true);
                            }}
                            onRegister={handleRegister}
                          />
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {isMobileLinksMenuOpen && (
              <div className="mobile-dropdown" id="mobile-links-menu">
                <div className="real-links">
                  <Link href="/" className="mobile-item">
                    {t('mainpage')}
                  </Link>

                  <button
                    className="mobile-item collapse-trigger"
                    onClick={() => setIsSportsOpen(v => !v)}
                    aria-expanded={isSportsOpen}
                    aria-controls="sports-submenu">
                    {t('sportscategory')}
                    <span className={`chev ${isSportsOpen ? 'open' : ''}`}>▾</span>
                  </button>

                  {isSportsOpen && (
                    <div id="sports-submenu" className="mobile-submenu">
                      <Link href="/pilka-nozna/przedmeczowe" className="mobile-subitem">
                        <img src="/img/football.png" width="20" alt="Football" /> {t('footbalitemmenu')}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
