'use client';

import { useState, useEffect, useContext } from 'react';
import { useRouter } from 'next/navigation';
import LoginModal from './LoginModal';
import RegisterModal from './RegisterModal';
import { UserContext } from '@/context/UserContext';
import { useUnread } from '@/context/UnreadContext';
import UserPanel from './UserPanel';
import { GiPlayButton } from 'react-icons/gi';
import { useTranslations, useLocale } from 'next-intl';
import ForgotPasswordModal from './ForgotPasswordModal';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './theme/ThemeToggle';
import Logo from './Logo';
import BallIcon from './icons/BallIcon';
import { ChevronDown, CreditCard, Home, LayoutGrid, Menu, User, X } from 'lucide-react';
import { Link } from '@/i18n/routing';
import { SITE_LINKS, SPORT_CATEGORIES } from '@/lib/navigation';

/** Ikony trzymane przy widoku, żeby lib/navigation.js pozostał czystymi danymi. */
const SITE_LINK_ICONS = {
  '/': Home,
  '/cennik': CreditCard,
};

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
  const { totalUnread } = useUnread();

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

  /** Wybór pozycji zamyka menu — inaczej po przejściu zostaje otwarte na nowej stronie. */
  const closeLinksMenu = () => setMobileLinksMenuOpen(false);

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
                <Logo locale={locale} />
              </Link>

              <div className="elementsinmenu">
                <ThemeToggle />

                {/* Ikony wektorowe zamiast PNG: dziedziczą kolor tekstu, więc nie trzeba
                    już odwracać ich filtrem, a klikalne są teraz <button>, nie <img>. */}
                <button
                  type="button"
                  className="menu-icon relative"
                  aria-label={
                    isMobileMenuOpen
                      ? t('close')
                      : totalUnread > 0
                        ? `${t('account')} — ${t('unread_badge_label', { count: totalUnread })}`
                        : t('account')
                  }
                  aria-expanded={isMobileMenuOpen}
                  onClick={() => {
                    if (isMobileMenuOpen) {
                      setMobileMenuOpen(false);
                      setRegisterModalOpen(false);
                      setLoginModalOpen(false);
                      setForgotOpen(false);
                      return;
                    }
                    setMobileMenuOpen(true);
                    setLoginModalOpen(!isAuthed);
                    setMobileLinksMenuOpen(false);
                  }}
                >
                  {isMobileMenuOpen ? <X size={24} /> : <User size={24} />}

                  {/* Plakietka nieprzeczytanych — jedyny sygnał widoczny bez otwierania
                      panelu, więc siedzi na ikonie konta obecnej na każdej stronie. */}
                  {!isMobileMenuOpen && totalUnread > 0 && (
                    <span className="unread-dot" aria-hidden="true">
                      {totalUnread > 9 ? '9+' : totalUnread}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="menu-icon"
                  aria-label={isMobileLinksMenuOpen ? t('close') : t('menu')}
                  aria-expanded={isMobileLinksMenuOpen}
                  onClick={() => {
                    if (isMobileLinksMenuOpen) {
                      setMobileLinksMenuOpen(false);
                      return;
                    }
                    setMobileLinksMenuOpen(true);
                    setMobileMenuOpen(false);
                  }}
                >
                  {isMobileLinksMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>

            {(isMobileMenuOpen || isMobileLinksMenuOpen) && (
              <>
                {/* Overlay - przykrywa całą stronę */}
                <div 
                  className="mobile-dropdown-overlay"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setMobileLinksMenuOpen(false);
                    setRegisterModalOpen(false);
                    setLoginModalOpen(false);
                    setForgotOpen(false);
                  }}
                />
                
                {/* Menu dropdown - zaczyna się poniżej górnego menu */}
                <div className="mobile-dropdown">
                  {isMobileMenuOpen && (
                    <>
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

                                {/* Akcje poboczne jako odnośniki, nie kafle: dwa pełne
                                    przyciski pod formularzem konkurowały z „Zaloguj się"
                                    i nie było widać, co jest główną czynnością.

                                    Przy otwartej rejestracji chowamy cały wiersz: „Rejestracja"
                                    prowadziłaby tam, gdzie użytkownik już jest, a wiersz wisiałby
                                    nad formularzem bez związku z nim. */}
                                {!isRegisterModalOpen && (
                                <div className="mt-4 flex w-full max-w-sm items-center justify-between gap-3 text-sm">
                                  <button
                                    type="button"
                                    className="auth-link"
                                    onClick={() => {
                                      setForgotOpen(true);
                                      setLoginModalOpen(false);
                                      setRegisterModalOpen(false);
                                    }}
                                  >
                                    {t('forgot_link')}
                                  </button>

                                  <button
                                    type="button"
                                    className="auth-link auth-link-strong"
                                    onClick={() => {
                                      setRegisterModalOpen(true);
                                      setLoginModalOpen(false);
                                      setForgotOpen(false);
                                    }}
                                  >
                                    {t('registernow')}
                                  </button>
                                </div>
                                )}

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
                    </>
                  )}

                  {isMobileLinksMenuOpen && (
                    <nav
                      className="real-links w-full max-w-sm"
                      id="mobile-links-menu"
                      aria-label={t('menu')}
                    >
                      {/* Odnośniki ogólne z lib/navigation.js — te same, które stopka
                          pokazuje w kolumnie „Serwis". */}
                      {SITE_LINKS.map((link) => {
                        const Icon = SITE_LINK_ICONS[link.href] ?? Home;
                        return (
                          <Link
                            key={link.href}
                            href={link.href}
                            className="nav-row"
                            onClick={closeLinksMenu}
                          >
                            <Icon size={17} aria-hidden="true" className="text-muted" />
                            {t(link.labelKey)}
                          </Link>
                        );
                      })}

                      <button
                        type="button"
                        className="nav-row"
                        onClick={() => setIsSportsOpen((v) => !v)}
                        aria-expanded={isSportsOpen}
                        aria-controls="sports-submenu"
                      >
                        <LayoutGrid size={17} aria-hidden="true" className="text-muted" />
                        {t('sportscategory')}
                        <ChevronDown
                          size={16}
                          aria-hidden="true"
                          className={`ml-auto text-muted transition-transform duration-150 ${
                            isSportsOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {/*
                       * Dwa poziomy: kategoria to dyscyplina, a pod nią jej działy.
                       * Wcześniej „Raport AI" stał obok „Piłki nożnej" jako osobna kategoria,
                       * choć jest jej częścią — stąd mylące sąsiedztwo.
                       */}
                      {isSportsOpen && (
                        <div id="sports-submenu" className="mt-1 flex flex-col gap-3">
                          {SPORT_CATEGORIES.map((sport) => (
                            <div key={sport.key}>
                              <p className="flex items-center gap-2 px-3 py-1.5 text-[13px] font-bold uppercase tracking-wide text-text">
                                <BallIcon className="h-4 w-4 text-accent" />
                                {t(sport.labelKey)}
                              </p>
                              <div className="ml-3 border-l border-border pl-2">
                                {sport.sections.map((section) => (
                                  <Link
                                    key={section.href}
                                    href={section.href}
                                    className="nav-subrow"
                                    onClick={closeLinksMenu}
                                  >
                                    {t(section.labelKey)}
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </nav>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
