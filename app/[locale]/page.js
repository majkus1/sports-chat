'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import NavBar from '@/components/NavBar';

export default function HomePage() {
  const [expandedSport, setExpandedSport] = useState(null);
  const t = useTranslations('common');

  return (
    <div className='all'>
      <NavBar />
      <div className='content'>
        <h2 style={{ fontSize: '18px' }}>{t('sports')}</h2>

        <Link 
          href='/pilka-nozna/przedmeczowe'
          className='sport-category'
          onClick={() => setExpandedSport(expandedSport !== 'pilka-nozna' ? 'pilka-nozna' : null)}
        >
          <div className='sport-name'>
            <p>
              <img src='/img/football.png' className='icon-sport' alt='Football' />
              {t('footbal')}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

