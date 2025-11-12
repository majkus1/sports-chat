'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

const Alert = ({ message, type = 'info', isOpen, onClose, duration = 4000 }) => {
  useEffect(() => {
    if (isOpen && duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, duration, onClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const alertStyles = {
    success: {
      backgroundColor: '#22c55e',
      borderColor: '#16a34a',
    },
    error: {
      backgroundColor: '#ef4444',
      borderColor: '#dc2626',
    },
    warning: {
      backgroundColor: '#f59e0b',
      borderColor: '#d97706',
    },
    info: {
      backgroundColor: '#173b45',
      borderColor: '#1e4a56',
    },
  };

  const style = alertStyles[type] || alertStyles.info;

  const alertContent = (
    <div
      className="custom-alert"
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 100010,
        minWidth: '300px',
        maxWidth: '90%',
        backgroundColor: style.backgroundColor,
        color: '#fff',
        padding: '16px 20px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        border: `2px solid ${style.borderColor}`,
        fontFamily: 'Roboto Condensed, sans-serif',
        fontSize: '16px',
        fontWeight: 400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '15px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#fff',
          fontSize: '24px',
          cursor: 'pointer',
          padding: '0',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'background-color 0.2s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
        aria-label="Close"
      >
        ×
      </button>
    </div>
  );

  if (typeof window !== 'undefined') {
    return createPortal(alertContent, document.body);
  }
  return null;
};

export default Alert;

