'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import FullScreenModal from '@/components/FullScreenModal';
import BeatLoader from 'react-spinners/BeatLoader';

export default function AIAgentPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'
  const [status, setStatus] = useState(''); // 'analyzing', 'sending', 'done'
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const t = useTranslations('common');
  const locale = useLocale();

  // Efekt do zmiany statusów podczas przetwarzania
  useEffect(() => {
    if (!isLoading) {
      setStatus('');
      return;
    }

    // Status 1: Analizuję mecze (0-5 sekund)
    setStatus('analyzing');
    
    const timer1 = setTimeout(() => {
      if (isLoading) {
        // Status 2: Wysyłam na email (po 5 sekundach)
        setStatus('sending');
      }
    }, 5000);

    return () => {
      clearTimeout(timer1);
    };
  }, [isLoading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!email || !email.includes('@')) {
      setMessage(t('ai_agent_invalid_email'));
      setMessageType('error');
      return;
    }

    setIsLoading(true);
    setMessage('');
    setMessageType('');
    setStatus('analyzing');

    try {
      const response = await fetch('/api/run-agent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, language: locale }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatus('done');
        // Krótkie opóźnienie przed pokazaniem komunikatu sukcesu
        setTimeout(() => {
          setMessage(t('ai_agent_success'));
          setMessageType('success');
          setEmail('');
          setIsLoading(false);
        }, 500);
      } else {
        setMessage(data.message || t('ai_agent_error'));
        setMessageType('error');
        setIsLoading(false);
      }
    } catch (error) {
      setMessage(t('ai_agent_error'));
      setMessageType('error');
      setIsLoading(false);
    }
  };

  const getStatusText = () => {
    if (!isLoading) return '';
    
    switch (status) {
      case 'analyzing':
        return t('ai_agent_status_analyzing');
      case 'sending':
        return t('ai_agent_status_sending');
      case 'done':
        return t('ai_agent_status_done');
      default:
        return t('ai_agent_processing');
    }
  };

  return (
    <>
      <NavBar />
      <div className="content-league">
        <h1 className='h1-football'>
          <img src="/img/football.png" className="icon-sport" alt="Football" />
          {t('footbal')}
        </h1>

        <FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

        {/* Container dla formularza i obrazka */}
        <div className="ai-agent-container">
          {/* Formularz */}
          <div className="ai-agent-form">
          <h2 style={{ 
            marginBottom: '20px', 
            fontSize: '24px',
            color: '#333'
          }}>
            {t('ai_agent_title')}
          </h2>
          
          <p style={{ 
            marginBottom: '30px', 
            color: 'black',
            lineHeight: '1.6'
          }}>
            {t('ai_agent_description')}
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label 
                htmlFor="email" 
                style={{ 
                  display: 'block', 
                  marginBottom: '8px',
                  fontWeight: '500',
                  color: '#333'
                }}
              >
                {t('mail')}
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('ai_agent_email_placeholder')}
                required
                disabled={isLoading}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '16px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#fff',
                background: isLoading ? '#ccc' : 'rgb(34, 197, 94)',
                border: 'none',
                borderRadius: '4px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              {isLoading ? (
                <>
                  <BeatLoader color="#fff" size={8} />
                  <span>{getStatusText()}</span>
                </>
              ) : (
                t('ai_agent_run_button')
              )}
            </button>
          </form>

          {message && (
            <div style={{
              marginTop: '20px',
              padding: '12px',
              borderRadius: '4px',
              background: messageType === 'success' ? '#d4edda' : '#f8d7da',
              color: messageType === 'success' ? '#155724' : '#721c24',
              border: `1px solid ${messageType === 'success' ? '#c3e6cb' : '#f5c6cb'}`
            }}>
              {message}
            </div>
          )}
          </div>

          {/* Obrazek bota */}
          <div className="ai-agent-bot">
            <img 
              src="/img/bot.png" 
              alt="AI Bot" 
              className="ai-agent-bot-image"
            />
          </div>
        </div>
      </div>

      {/* Style dla layoutu i animacji */}
      <style>{`
        .ai-agent-container {
          display: flex;
          flex-direction: row;
          gap: 30px;
          align-items: flex-start;
          position: relative;
          margin-top: 10px;
          margin-bottom: 40px;
        }

        .ai-agent-form {
          max-width: 600px;
          width: 100%;
          padding: 30px;
          background: rgba(241, 241, 241, 0.85);
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          position: relative;
          z-index: 2;
        }

        .ai-agent-bot {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          max-width: 300px;
          width: 100%;
        }

        .ai-agent-bot-image {
          width: 100%;
          height: auto;
          animation: float 3s ease-in-out infinite;
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @media (max-width: 768px) {
          .ai-agent-container {
            flex-direction: column;
            align-items: center;
            padding-right: 20px; 
          }

          .ai-agent-form {
            width: 100%;
            max-width: 100%;
          }

          .ai-agent-bot {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            max-width: 90%;
            z-index: 1;
          }

          .ai-agent-bot-image {
            animation: floatMobile 3s ease-in-out infinite;
            margin-top: 20px;
          }

          @keyframes floatMobile {
            0%, 100% {
              transform: translateY(0px);
            }
            50% {
              transform: translateY(-10px);
            }
          }
        }
        .content-league {
        margin-right: 0px !important;
        }

        @media (max-width: 520px) {
       .ai-agent-bot-image {
        margin-left: -150px;
      }
      }

      @media (min-width: 630px) and (max-width: 768px) {
      .ai-agent-bot-image {
       margin-left: 100px !important;
       margin-top: -80px !important;
      }
        }
      `}</style>
      {isResultsModalOpen && (
        <FullScreenModal
          onClose={() => setIsResultsModalOpen(false)}
          src={`/api-sports-football-widget.html?locale=${locale}`}
        />
      )}
    </>
  );
}


