'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

export default function FootballMenu({ onResultsClick }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const [isMenuExpanded, setIsMenuExpanded] = useState(false);

  const menuItems = [
    { href: '/pilka-nozna/przedmeczowe', label: t('match'), key: 'przedmeczowe' },
    { href: '/pilka-nozna/live', label: t('onlive'), key: 'live' },
    { 
      href: '/pilka-nozna/ai-agent', 
      label: t('ai_agent_title'), 
      key: 'ai-agent',
      isNew: true 
    },
    { 
      onClick: onResultsClick, 
      label: t('results'), 
      key: 'results',
      isButton: true 
    },
  ];

  const isActive = (item) => {
    if (item.isButton) return false;
    return pathname === item.href;
  };

  const visibleItems = menuItems.slice(0, 3);
  const hiddenItems = menuItems.slice(3);

  return (
    <>
      <div className="choose-time football-menu-wrapper" style={{ marginBottom: '20px', position: 'relative' }}>
        {/* Widoczne elementy (zawsze pierwsze 3) */}
        {visibleItems.map((item) => (
          <span key={item.key} className="football-menu-item">
            {item.isButton ? (
              <button
                onClick={item.onClick}
                className="pre-match-p"
                style={{
                  background: 'none',
                  border: 'none',
                  textTransform: 'uppercase'
                }}
              >
                {item.label}
              </button>
            ) : (
              <Link 
                href={item.href} 
                className={`pre-match-p ${isActive(item) ? 'active-section' : ''}`}
                style={{ position: 'relative', display: 'inline-block' }}
              >
                {item.label}
                {item.isNew && (
                  <span 
                    className="menu-new-badge"
                    style={{
                      fontSize: '10px',
                      color: 'rgb(34, 197, 94)',
                      marginLeft: '5px',
                      fontWeight: 'normal',
                      textTransform: 'lowercase',
                      position: 'relative',
                      top: '-8px'
                    }}
                  >
                    {t('new')}
                  </span>
                )}
              </Link>
            )}
          </span>
        ))}

        {/* Ikona z kropkami na mobile */}
        {hiddenItems.length > 0 && (
          <>
            <button
              onClick={() => setIsMenuExpanded(!isMenuExpanded)}
              className="pre-match-p menu-dots-button"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '20px',
                padding: '0 5px',
                marginTop: '15px'
              }}
            >
              ⋯
            </button>

            {/* Rozwinięte menu (na mobile) */}
            {isMenuExpanded && (
              <div className="menu-expanded">
                {hiddenItems.map((item) => (
                  <div key={item.key}>
                    {item.isButton ? (
                      <button
                        onClick={() => {
                          item.onClick();
                          setIsMenuExpanded(false);
                        }}
                        className="pre-match-p"
                        style={{
                          background: 'none',
                          border: 'none',
                          textTransform: 'uppercase',
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '10px 0'
                        }}
                      >
                        {item.label}
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        className={`pre-match-p ${isActive(item) ? 'active-section' : ''}`}
                        onClick={() => setIsMenuExpanded(false)}
                        style={{
                          display: 'block',
                          padding: '10px 0'
                        }}
                      >
                        {item.label}
                        {item.isNew && (
                          <span 
                            className="menu-new-badge"
                            style={{
                              fontSize: '10px',
                              color: 'rgb(34, 197, 94)',
                              marginLeft: '5px',
                              fontWeight: 'normal',
                              textTransform: 'lowercase'
                            }}
                          >
                            {t('new')}
                          </span>
                        )}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Wszystkie elementy na desktop (ukryte na mobile) */}
        <span className="menu-desktop-items">
          {hiddenItems.map((item) => (
            <span key={item.key} className="football-menu-item">
              {item.isButton ? (
                <button
                  onClick={item.onClick}
                  className="pre-match-p"
                  style={{
                    background: 'none',
                    border: 'none',
                    textTransform: 'uppercase'
                  }}
                >
                  {item.label}
                </button>
              ) : (
                <Link 
                  href={item.href} 
                  className={`pre-match-p ${isActive(item) ? 'active-section' : ''}`}
                >
                  {item.label}
                  {item.isNew && (
                    <span 
                      className="menu-new-badge"
                      style={{
                        fontSize: '10px',
                        color: 'rgb(34, 197, 94)',
                        marginLeft: '5px',
                        fontWeight: 'normal',
                        textTransform: 'lowercase'
                      }}
                    >
                      {t('new')}
                    </span>
                  )}
                </Link>
              )}
            </span>
          ))}
        </span>
      </div>

      <style>{`
        .football-menu-wrapper {
          display: flex;
          gap: 20px;
          flex-wrap: wrap;
          align-items: center;
        }

        .football-menu-item {
          display: inline-block;
        }

        .menu-dots-button {
          display: none !important;
        }

        .menu-expanded {
          display: none;
        }

        .menu-desktop-items {
          display: inline-flex;
          gap: 20px;
        }

        @media (max-width: 768px) {
          .menu-dots-button {
            display: inline-block !important;
          }

          .menu-desktop-items {
            display: none !important;
          }

          .menu-expanded {
            display: block;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #f1f1f1;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            padding: 10px 20px;
            margin-top: 10px;
            z-index: 100;
            animation: slideDown 0.3s ease-out;
            margin-right: 15px;
          }

          @keyframes slideDown {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        }
      `}</style>
    </>
  );
}

