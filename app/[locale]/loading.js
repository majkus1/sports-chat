'use client';

import BeatLoader from 'react-spinners/BeatLoader';
import { useLocale } from 'next-intl';

export default function Loading() {
  const locale = useLocale();
  
  // Fallback jeśli useLocale nie działa
  const loadingText = locale === 'pl' ? 'Ładowanie...' : 'Loading...';
  
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '100vh',
      gap: '20px',
      backgroundColor: '#f1f1f1'
    }}>
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
        marginTop: '10px',
        fontWeight: 400
      }}>{loadingText}</p>
    </div>
  );
}
