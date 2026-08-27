import React, { useEffect } from 'react';

const Modal = ({ onClose, children }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} style={closeButtonStyle} aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
};

const backdropStyle = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  // Bez tła nakładka była niewidoczna i treść pod modalem prześwitywała.
  backgroundColor: 'var(--overlay)',
};

const modalStyle = {
  backgroundColor: 'var(--surface)',
  position: 'relative',
  // Rozmowa czyta się lepiej w węższej kolumnie niż na całej szerokości ekranu.
  width: 'min(520px, 95vw)',
  borderRadius: '14px',
  // Padding zdjęty: treść (czat) sama trzyma nagłówek, listę i pole pisania
  // w pełnej wysokości — obramowanie robi teraz `overflow: hidden`.
  overflow: 'hidden',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-soft)',
  marginTop: '40px',
};

const closeButtonStyle = {
  position: 'absolute',
  top: '10px',
  right: '10px',
  // Nad treścią, inaczej chowa się pod nagłówkiem rozmowy.
  zIndex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '30px',
  height: '30px',
  borderRadius: '999px',
  background: 'var(--surface-2)',
  border: 'none',
  fontSize: '20px',
  color: 'var(--muted)',
  cursor: 'pointer',
  lineHeight: 1,
};

export default Modal;
