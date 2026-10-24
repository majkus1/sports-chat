'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';

export default function LanguageSwitcher({ onLanguageChange }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale) => {
    // Z parametrami adresu (zakładka, okres, dzień) — zmiana języka nie może cofać widoku do domyślnego.
    const search = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(`${pathname}${search}`, { locale: newLocale });
    if (onLanguageChange) {
      onLanguageChange();
    }
  };

  return (
    <div className="language-switch">
      <button
        onClick={() => switchLanguage('pl')}
        title="Polski"
      >
        <img 
          src="/img/poland.png" 
          alt="Polski" 
          style={{ 
            width: '20px', 
            objectFit: 'cover'
          }} 
        />
      </button>
      <button
        onClick={() => switchLanguage('en')}
        title="English"
      >
        <img 
          src="/img/united-kingdom.png" 
          alt="English" 
          style={{ 
            width: '20px', 
            objectFit: 'cover'
          }} 
        />
      </button>
    </div>
  );
}
