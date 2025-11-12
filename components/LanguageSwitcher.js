'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';

export default function LanguageSwitcher({ onLanguageChange }) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const switchLanguage = (newLocale) => {
    router.replace(pathname, { locale: newLocale });
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
