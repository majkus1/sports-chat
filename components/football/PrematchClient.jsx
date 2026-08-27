'use client';

import axios from 'axios';
import BallIcon from '@/components/icons/BallIcon';
import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import FootballMenu from '@/components/FootballMenu';
import { FaSearch } from 'react-icons/fa';
import { useTranslations, useLocale } from 'next-intl';
import FixtureRow from '@/components/football/FixtureRow';
import LeagueHeading from '@/components/football/LeagueHeading';
import { useGameDetailsModal } from '@/components/football/useGameDetailsModal';
import FullScreenModal from '@/components/FullScreenModal';
import Footer from '@/components/layout/Footer';
import BeatLoader from 'react-spinners/BeatLoader';

export default function PrematchClient() {
  const locale = useLocale();
  const [fixtures, setFixtures] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);
  const [isH2HModalOpen, setIsH2HModalOpen] = useState(false);
  const [isTeamStatsModalOpen, setIsTeamStatsModalOpen] = useState(false);
  const [isStandingsModalOpen, setIsStandingsModalOpen] = useState(false);
  const [selectedH2HTeamIds, setSelectedH2HTeamIds] = useState(null);
  const { gameId: detailsGameId, close: closeGameDetails } = useGameDetailsModal();
  const [selectedStandings, setSelectedStandings] = useState({ leagueId: null, season: '2025' });
  const [selectedTeamStats, setSelectedTeamStats] = useState({ 
    homeTeamId: null, 
    awayTeamId: null,
    homeTeamName: null,
    awayTeamName: null
  });
  const t = useTranslations('common');

  // Wybór dnia: dziś + 4 kolejne. Kursy i prognozy dostawca publikuje do ~2 tygodni
  // przed meczem, więc 5 dni to bezpieczny zakres z pełnymi danymi.
  const getDateOptions = () => {
    const today = new Date();
    const dates = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push({
        date: date,
        formatted: `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`,
        display: i === 0 ? t('today') || 'Dziś' : `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`,
        isToday: i === 0
      });
    }
    return dates;
  };

  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
  });
  const [isLoadingFixtures, setIsLoadingFixtures] = useState(false);

  // Stronicowanie liczy serwer — tu trzymamy tylko bieżącą stronę i metadane z odpowiedzi.
  const [currentPage, setCurrentPage] = useState(1);
  const [paging, setPaging] = useState({ total: 0, totalPages: 1, pageSize: 50 });

  /*
   * Wyszukiwanie idzie do serwera, więc nie może strzelać przy każdej literze.
   * Odbijamy wpisywanie o 400 ms i dopiero ustabilizowaną frazę wysyłamy w zapytaniu.
   */
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Zmiana dnia albo frazy zaczyna od pierwszej strony.
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedDate, debouncedSearch]);

  // Auto-update selected date at midnight
  useEffect(() => {
    const updateDateAtMidnight = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      
      const msUntilMidnight = tomorrow.getTime() - now.getTime();
      
      const timeoutId = setTimeout(() => {
        const today = new Date();
        const newDate = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;
        setSelectedDate(newDate);
        
        // Set up next midnight update
        updateDateAtMidnight();
      }, msUntilMidnight);
      
      return () => clearTimeout(timeoutId);
    };
    
    const cleanup = updateDateAtMidnight();
    return cleanup;
  }, []);


  /*
   * Serwer oddaje gotową stronę: przefiltrowaną (fraza + tylko nierozpoczęte) i przyciętą
   * do 50 pozycji. Wcześniej przeglądarka dostawała cały dzień (~2 MB przy pełnej sobocie)
   * i sama go filtrowała.
   */
  useEffect(() => {
    const loadFixtures = async () => {
      setIsLoadingFixtures(true);
      try {
        const params = new URLSearchParams({
          date: selectedDate,
          page: String(currentPage),
          upcoming: '1',
        });
        if (debouncedSearch) params.set('search', debouncedSearch);

        const response = await axios.get(`/api/football/fixtures?${params.toString()}`);
        setFixtures(response.data.response || []);
        setPaging(response.data.paging || { total: 0, totalPages: 1 });
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
        console.error('Fixtures load error:', e);
        }
        setFixtures([]);
        setPaging({ total: 0, totalPages: 1 });
      } finally {
        setIsLoadingFixtures(false);
      }
    };
    loadFixtures();
  }, [selectedDate, currentPage, debouncedSearch]);

  const totalPages = paging.totalPages;

  // Group fixtures by league
  const groupedFixtures = fixtures.reduce((acc, fixture) => {
    const leagueKey = `${fixture.league.name} (${fixture.league.country})`;
    if (!acc[leagueKey]) acc[leagueKey] = [];
    acc[leagueKey].push(fixture);
    return acc;
  }, {});

  return (
    <>
      <NavBar />

      <div className="content-league">
        <h1 className='h1-football'>
          <BallIcon className="icon-sport" />
          {t('footbal')}
        </h1>

        <FootballMenu onResultsClick={() => setIsResultsModalOpen(true)} />

        {/* Wybór dnia — ten sam segmented control co zakładki w pokoju meczowym,
            żeby przełączniki w całej aplikacji wyglądały tak samo. */}
        <div className="mb-4 inline-flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-surface-2 p-1">
          {getDateOptions().map((dateOption) => {
            const isSelected = selectedDate === dateOption.formatted;
            return (
              <button
                key={dateOption.formatted}
                type="button"
                onClick={() => setSelectedDate(dateOption.formatted)}
                aria-pressed={isSelected}
                className={`inline-flex whitespace-nowrap rounded-full border-0 px-3.5 py-1.5 text-[13px] font-semibold uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  isSelected
                    ? 'bg-brand text-brand-fg shadow-sm'
                    : 'bg-transparent text-muted hover:bg-surface-3 hover:text-text'
                }`}
              >
                {dateOption.display}
              </button>
            );
          })}
        </div>

        <div className="search-container" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <FaSearch size={20} style={{ color: 'var(--text)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t('searcha')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
            style={{ flex: 1 }}
          />
        </div>

        {isLoadingFixtures && (
          <div style={{ 
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '20px',
            padding: '60px 20px',
            marginTop: '20px'
          }}>
            <BeatLoader 
              color="var(--brand)" 
              size={15}
              margin={5}
              speedMultiplier={0.8}
            />
            <p style={{ 
              fontFamily: 'Roboto Condensed, sans-serif',
              color: 'var(--brand)',
              fontSize: '16px',
              fontWeight: 400
            }}>{t('loading')}</p>
          </div>
        )}

        {!isLoadingFixtures && Object.keys(groupedFixtures).length === 0 && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px', 
            color: 'var(--muted)',
            fontFamily: 'Roboto Condensed, sans-serif',
            fontSize: '16px',
            background: 'var(--surface)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-soft)',
            marginTop: '20px'
          }}>
            {t('no_matches')}
          </div>
        )}

        {!isLoadingFixtures && Object.keys(groupedFixtures).length > 0 &&
          Object.keys(groupedFixtures).map((leagueKey, leagueIndex) => {
            // Get league info from first fixture in the group
            const firstFixture = groupedFixtures[leagueKey][0];
            const leagueId = firstFixture?.league?.id;
            const season = firstFixture?.league?.season || '2025';

            return (
            <div key={leagueIndex}>
              <LeagueHeading
                name={leagueKey}
                leagueId={leagueId}
                onStandings={() => {
                  setSelectedStandings({ leagueId, season });
                  setIsStandingsModalOpen(true);
                }}
              />
              {groupedFixtures[leagueKey].map((fixture) => (
                <FixtureRow
                  key={fixture.fixture.id}
                  fixture={fixture}
                  locale={locale}
                  onH2H={(f) => {
                    setSelectedH2HTeamIds(`${f.teams.home.id}-${f.teams.away.id}`);
                    setIsH2HModalOpen(true);
                  }}
                  onTeamStats={(f) => {
                    setSelectedTeamStats({
                      homeTeamId: f.teams.home.id,
                      awayTeamId: f.teams.away.id,
                      homeTeamName: f.teams.home.name,
                      awayTeamName: f.teams.away.name,
                    });
                    setIsTeamStatsModalOpen(true);
                  }}
                />
              ))}
            </div>
            );
          })}

        {/* Pagination Info — zakres liczony z metadanych serwera */}
        {!isLoadingFixtures && paging.total > 0 && (
          <div style={{
            textAlign: 'center',
            marginTop: '20px',
            marginBottom: '10px',
            color: 'var(--muted)',
            fontFamily: 'Roboto Condensed, sans-serif',
            fontSize: '14px'
          }}>
            {t('showing')} {(currentPage - 1) * paging.pageSize + 1}-{Math.min(currentPage * paging.pageSize, paging.total)} {t('of')} {paging.total} {t('matches')}
          </div>
        )}

        {/* Pagination Controls */}
        {!isLoadingFixtures && totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '15px',
            marginTop: '20px',
            marginBottom: '30px',
            flexWrap: 'wrap'
          }}>
            {/* Previous Button */}
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              style={{
                padding: '10px 20px',
                border: '2px solid var(--brand)',
                background: currentPage === 1 ? 'var(--surface-2)' : 'var(--brand)',
                color: currentPage === 1 ? 'var(--muted)' : 'var(--brand-fg)',
                borderRadius: '6px',
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                fontFamily: 'Roboto Condensed, sans-serif',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                opacity: currentPage === 1 ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = 'var(--brand-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== 1) {
                  e.currentTarget.style.background = 'var(--brand)';
                }
              }}
            >
              {t('prev_page')}
            </button>

            {/* Page Numbers */}
            <div style={{
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    style={{
                      padding: '10px 16px',
                      border: currentPage === pageNum ? '2px solid var(--brand)' : '2px solid var(--border)',
                      background: currentPage === pageNum ? 'var(--brand)' : 'var(--surface)',
                      color: currentPage === pageNum ? 'var(--brand-fg)' : 'var(--text)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontFamily: 'Roboto Condensed, sans-serif',
                      fontSize: '14px',
                      fontWeight: currentPage === pageNum ? '700' : '400',
                      transition: 'all 0.2s ease',
                      minWidth: '44px'
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== pageNum) {
                        e.currentTarget.style.background = 'var(--surface-2)';
                        e.currentTarget.style.borderColor = 'var(--brand)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== pageNum) {
                        e.currentTarget.style.background = 'var(--surface)';
                        e.currentTarget.style.borderColor = 'var(--border)';
                      }
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            {/* Next Button */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              style={{
                padding: '10px 20px',
                border: '2px solid var(--brand)',
                background: currentPage === totalPages ? 'var(--surface-2)' : 'var(--brand)',
                color: currentPage === totalPages ? 'var(--muted)' : 'var(--brand-fg)',
                borderRadius: '6px',
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                fontFamily: 'Roboto Condensed, sans-serif',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                opacity: currentPage === totalPages ? 0.5 : 1
              }}
              onMouseEnter={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = 'var(--brand-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPage !== totalPages) {
                  e.currentTarget.style.background = 'var(--brand)';
                }
              }}
            >
              {t('next_page')}
            </button>
          </div>
        )}
      </div>

      {/* Ta strona nie przechodzi jeszcze przez AppShell, więc stopkę dokładamy tutaj —
          klauzula o odpowiedzialnej grze ma być widoczna także przy liście meczów. */}
      <Footer className="mx-5" />

      {isResultsModalOpen && (
        <FullScreenModal
          onClose={() => setIsResultsModalOpen(false)}
          src={`/api/widgets/games?locale=${locale}`}
        />
      )}
      {detailsGameId && (
        <FullScreenModal
          onClose={closeGameDetails}
          src={`/api/widgets/game?gameId=${detailsGameId}&locale=${locale}`}
        />
      )}
      {isH2HModalOpen && selectedH2HTeamIds && (
        <FullScreenModal
          onClose={() => {
            setIsH2HModalOpen(false);
            setSelectedH2HTeamIds(null);
          }}
          src={`/api/football-h2h?teamIds=${selectedH2HTeamIds}&locale=${locale}`}
        />
      )}
      {isTeamStatsModalOpen && selectedTeamStats.homeTeamId && selectedTeamStats.awayTeamId && (
        <FullScreenModal
          onClose={() => {
            setIsTeamStatsModalOpen(false);
            setSelectedTeamStats({ homeTeamId: null, awayTeamId: null, homeTeamName: null, awayTeamName: null });
          }}
          src={`/api/football-team-stats?homeTeamId=${selectedTeamStats.homeTeamId}&awayTeamId=${selectedTeamStats.awayTeamId}${selectedTeamStats.homeTeamName ? `&homeTeamName=${encodeURIComponent(selectedTeamStats.homeTeamName)}` : ''}${selectedTeamStats.awayTeamName ? `&awayTeamName=${encodeURIComponent(selectedTeamStats.awayTeamName)}` : ''}&locale=${locale}`}
        />
      )}
      {isStandingsModalOpen && selectedStandings.leagueId && (
        <FullScreenModal
          onClose={() => {
            setIsStandingsModalOpen(false);
            setSelectedStandings({ leagueId: null, season: '2025' });
          }}
          src={`/api/football-standings?leagueId=${selectedStandings.leagueId}&season=${selectedStandings.season}&locale=${locale}`}
        />
      )}
    </>
  );
}

